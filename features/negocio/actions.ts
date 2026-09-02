"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AppModule, Role, SubscriptionStatus, TaxKind } from "@/generated/prisma/enums";
import {
  crearSucursalSchema,
  datosNegocioSchema,
  modulosSchema,
  operacionSchema,
  permisosRolesSchema,
  qrMenuSchema,
  turneroSchema,
} from "@/features/negocio/schemas";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { mergeExtraSettings } from "@/features/negocio/extra-settings";
import { cuentaDelPropietario } from "@/lib/billing/cuenta";
import { puedeCrearSede } from "@/lib/billing/sedes";
import { subirImagen } from "@/lib/images/cloudinary";
import { assertTimeZone } from "@/lib/time";
// eslint-disable-next-line no-restricted-imports -- Crear sucursal adicional requiere crear la fila de Business inicial
import { rootDb } from "@/lib/db/root";

/**
 * Configuración del negocio.
 *
 * Solo el propietario y el administrador entran acá: cambiar la hora de corte o
 * si el precio incluye impuesto altera cómo se factura y cómo cuadra la caja.
 */

const ADMINISTRAN = [Role.ADMINISTRADOR] as const;

export const guardarDatosNegocio = defineAction({
  schema: datosNegocioSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    await db.business.update({
      where: { id: ctx.business.id },
      data: {
        name: input.name,
        legalName: input.legalName ?? null,
        taxId: input.taxId ?? null,
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/panel");
  },
});

export const guardarOperacion = defineAction({
  schema: operacionSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    try {
      assertTimeZone(input.timeZone);
    } catch {
      throw new ErrorDeUsuario(`"${input.timeZone}" no es una zona horaria válida.`);
    }

    // Cambiar el corte de jornada con una caja abierta movería ventas ya cobradas
    // de un día a otro y el corte de esta noche dejaría de cuadrar.
    const cajaAbierta = await db.cashSession.findFirst({
      where: { status: "ABIERTA" },
      select: { id: true },
    });
    const settings = await db.businessSettings.findFirstOrThrow({
      select: { businessDayStartMinutes: true, timeZone: true },
    });
    const cambiaLaJornada =
      settings.businessDayStartMinutes !== input.businessDayStart ||
      settings.timeZone !== input.timeZone;

    if (cajaAbierta && cambiaLaJornada) {
      throw new ErrorDeUsuario(
        "Hay una caja abierta. Cerrá el turno antes de cambiar la zona horaria o la hora de corte.",
      );
    }

    const currentSettings = await db.businessSettings.findFirst({
      where: { businessId: ctx.business.id },
      select: { rolePermissions: true },
    });

    const newRolePermissions = mergeExtraSettings(currentSettings?.rolePermissions, {
      scheduleEnabled: input.scheduleEnabled,
      scheduleOpeningTime: input.scheduleOpeningTime,
      scheduleClosingTime: input.scheduleClosingTime,
      scheduleStatus: input.scheduleStatus,
    });

    await db.businessSettings.updateMany({
      where: { businessId: ctx.business.id },
      data: {
        timeZone: input.timeZone,
        businessDayStartMinutes: input.businessDayStart,
        pricesIncludeTax: input.pricesIncludeTax,
        tipSuggestionEnabled: input.tipSuggestionEnabled,
        tipSuggestionRateBp: input.tipSuggestionRate,
        cashRoundingCop: input.cashRoundingCop,
        requireOpenCashSession: input.requireOpenCashSession,
        turnNumberMax: input.turnNumberMax,
        receiptWidth: input.receiptWidth,
        receiptHeader: input.receiptHeader ?? null,
        receiptFooter: input.receiptFooter ?? null,
        rolePermissions: newRolePermissions,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/panel");
    revalidatePath("/caja");
  },
});

/**
 * Prende o apaga mesas y domicilios.
 *
 * No todo negocio los usa —un local de mostrador no tiene mesas que sentar—, y
 * la interfaz se adapta: sin mesas, "Salón" desaparece del menú y la pantalla de
 * entrada pasa a ser /pos.
 */
export const guardarModulos = defineAction({
  schema: modulosSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    if (!input.mesasHabilitado) {
      // Apagar mesas con una mesa ocupada dejaría ese pedido sin ninguna
      // pantalla desde la cual seguir atendiéndolo: /salon desaparece del menú
      // y /pedido/[id] no se llega a él sin el enlace directo.
      const mesaAbierta = await db.order.findFirst({
        where: { type: "MESA", status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
        select: { id: true },
      });
      if (mesaAbierta) {
        throw new ErrorDeUsuario(
          "Hay una mesa con un pedido abierto. Cobralo o anulalo antes de apagar mesas.",
        );
      }
    }

    await db.businessModule.upsert({
      where: { businessId_module: { businessId: ctx.business.id, module: AppModule.MESAS } },
      update: { enabled: input.mesasHabilitado },
      create: {
        businessId: ctx.business.id,
        module: AppModule.MESAS,
        enabled: input.mesasHabilitado,
      },
    });

    const prevSettings = await db.businessSettings.findFirst({
      where: { businessId: ctx.business.id },
      select: { rolePermissions: true },
    });

    const newRolePermissions = mergeExtraSettings(prevSettings?.rolePermissions, {
      deliveryPaused: input.deliveryPaused,
    });
    await db.businessSettings.updateMany({
      where: { businessId: ctx.business.id },
      data: {
        deliveryEnabled: input.deliveryEnabled,
        deliveryFeeCop: input.deliveryFeeCop,
        inventoryEnabled: input.inventoryEnabled,
        recipesEnabled: input.recipesEnabled,
        rolePermissions: newRolePermissions,
        permitirVentaSinStock: input.permitirVentaSinStock,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/salon");
    revalidatePath("/pos");
    revalidatePath("/inventario");
    revalidatePath("/panel");
  },
});

export const togglePausarDomicilios = defineAction({
  schema: z.object({
    paused: z.boolean(),
  }),
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const prevSettings = await db.businessSettings.findFirst({
      where: { businessId: ctx.business.id },
      select: { rolePermissions: true },
    });

    const newRolePermissions = mergeExtraSettings(prevSettings?.rolePermissions, {
      deliveryPaused: input.paused,
    });

    await db.businessSettings.updateMany({
      where: { businessId: ctx.business.id },
      data: { rolePermissions: newRolePermissions },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/domicilios");
    revalidatePath("/pos");
    revalidatePath("/panel");
  },
});

export const guardarTurneroSettings = defineAction({
  schema: turneroSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    await db.businessSettings.updateMany({
      where: { businessId: ctx.business.id },
      data: {
        turneroMediaMode: input.turneroMediaMode,
        turneroImages: input.turneroImages,
        turneroImageIntervalSeconds: input.turneroImageIntervalSeconds,
        turneroYoutubeUrl: input.turneroYoutubeUrl ?? null,
        turneroBadgePosition: input.turneroBadgePosition,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/turnero");
  },
});

export const guardarQrMenuSettings = defineAction({
  schema: qrMenuSchema,
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    const prevSettings = await db.businessSettings.findFirst({
      where: { businessId: ctx.business.id },
      select: { rolePermissions: true },
    });

    const newRolePermissions = mergeExtraSettings(prevSettings?.rolePermissions, {
      estimatedPrepTimeText: input.estimatedPrepTimeText || "20-30 min",
      qrMenuFuente: input.qrMenuFuente,
      qrMenuCarta: input.qrMenuCarta,
      qrMenuBordes: input.qrMenuBordes,
    });

    await db.businessSettings.updateMany({
      where: { businessId: ctx.business.id },
      data: {
        qrMenuEnabled: input.qrMenuEnabled,
        qrMenuBgMode: input.qrMenuBgMode,
        qrMenuBgColor: input.qrMenuBgColor,
        qrMenuBgGradient: input.qrMenuBgGradient,
        qrMenuBgImageUrl: input.qrMenuBgImageUrl ?? null,
        qrMenuLogoUrl: input.qrMenuLogoUrl ?? null,
        qrMenuHeaderTitle: input.qrMenuHeaderTitle ?? null,
        qrMenuHeaderSubtitle: input.qrMenuHeaderSubtitle ?? null,
        qrMenuAccent: input.qrMenuAccent,
        rolePermissions: newRolePermissions,
      },
    });

    revalidatePath("/administracion/configuracion");
    // La carta pública tiene que reflejar el cambio al instante.
    revalidatePath(`/m/${ctx.business.slug}`);
  },
});

export const subirImagenQrMenu = defineAction({
  schema: z.object({
    tipo: z.enum(["logo", "fondo"]),
    file: z.instanceof(File, { message: "Seleccioná un archivo de imagen." }),
  }),
  roles: ADMINISTRAN,
  async handler({ input, ctx, db }) {
    if (input.file.size > 5 * 1024 * 1024) {
      throw new ErrorDeUsuario("La imagen debe pesar menos de 5 MB.");
    }
    const buffer = Buffer.from(await input.file.arrayBuffer());
    const folder = `platlia/${ctx.business.slug}/qrmenu`;
    const url = await subirImagen(buffer, folder);

    if (input.tipo === "logo") {
      await db.businessSettings.updateMany({
        where: { businessId: ctx.business.id },
        data: { qrMenuLogoUrl: url },
      });
    } else {
      await db.businessSettings.updateMany({
        where: { businessId: ctx.business.id },
        data: { qrMenuBgImageUrl: url, qrMenuBgMode: "PATTERN_IMAGE" },
      });
    }

    revalidatePath("/administracion/configuracion");
    return { url };
  },
});

function aSlug(texto: string): string {
  const limpio = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return limpio || "sucursal";
}

async function slugSucursalLibre(base: string): Promise<string> {
  const candidato = aSlug(base);
  for (let i = 0; i < 50; i++) {
    const intento = i === 0 ? candidato : `${candidato}-${i + 1}`;
    const tomado = await rootDb.business.findUnique({
      where: { slug: intento },
      select: { id: true },
    });
    if (!tomado) return intento;
  }
  return `${candidato}-${Date.now().toString(36)}`;
}

export const crearSucursalAdicional = defineAction({
  schema: crearSucursalSchema,
  roles: [Role.PROPIETARIO],
  async handler({ input, ctx }) {
    /**
     * La cuenta del propietario: sus sedes y la licencia de la principal, que es
     * la que cobra y la que lleva el cupo.
     *
     * Antes esto se resolvía acá con un `subscription.findFirst` ordenado por
     * `subscription.createdAt`, mientras que `cuentaDelPropietario` ordena por
     * `business.createdAt`. Son dos definiciones distintas de "la sede principal"
     * y no siempre coinciden: alcanza con que una suscripción se haya creado
     * fuera de orden para que el cupo se lea de una sede y el cobro de otra.
     */
    const cuenta = await cuentaDelPropietario(ctx.user.id);

    const maxPermitidas = cuenta?.maxBranches ?? 1;

    /**
     * Una sola guarda: el cupo.
     *
     * Había dos, y la primera —un bloqueo tajante sobre `PRUEBA`— cortaba antes
     * de mirar la segunda. Con eso, el cupo que el superadministrador le asignaba
     * a una cadena en evaluación se guardaba y no servía para nada: la cuenta
     * seguía sin poder crear la segunda sede, y como extender días a mano tampoco
     * saca de PRUEBA, la única salida era pagar por MercadoPago.
     *
     * La prueba nace con cupo 1, así que por su cuenta sigue sin poder crear la
     * segunda; lo que cambió es que un cupo asignado a mano ahora vale.
     *
     * La regla vive en `lib/billing/sedes.ts`, pura y con tests: decide si a
     * alguien se le cobra o no.
     */
    const veredicto = puedeCrearSede(
      cuenta && { status: cuenta.status, sedes: cuenta.sedes, maxBranches: maxPermitidas },
    );
    if (!veredicto.permitido) throw new ErrorDeUsuario(veredicto.motivo);
    // A partir de acá `cuenta` existe: sin ella el veredicto sería negativo.
    if (!cuenta) throw new ErrorDeUsuario("Tu cuenta no tiene una licencia activa.");

    // 3. Crear la nueva sucursal independiente
    const slug = await slugSucursalLibre(input.name);

    const sucursal = await rootDb.business.create({
      data: {
        name: input.name,
        slug,
        address: input.address ?? null,
        phone: input.phone ?? null,
        settings: { create: {} },
      // Sin una caja física no se puede abrir turno, y sin turno no se cobra: un
      // negocio recién creado tiene que poder vender antes de pasar por
      // Configuración. Las demás las agrega el dueño cuando tenga más de un
      // punto de cobro.
      cashRegisters: { create: { name: "Caja 1" } },
        memberships: { create: { userId: ctx.user.id, role: Role.PROPIETARIO } },
        modules: { create: Object.values(AppModule).map((module) => ({ module })) },
        taxRates: {
          create: [
            {
              name: "Impuesto al consumo",
              kind: TaxKind.IMPOCONSUMO,
              rateBp: 800,
              isDefault: true,
            },
            { name: "IVA", kind: TaxKind.IVA, rateBp: 1900 },
            { name: "Exento", kind: TaxKind.EXENTO, rateBp: 0 },
          ],
        },
        // La sede nueva hereda las fechas de la cuenta: la licencia es una sola y
        // ya está paga. Antes nacía con siete días de prueba propios —o sea que
        // vencía en otro momento que el resto— y se cobraba aparte, duplicando
        // el cobro.
        subscription: {
          create: {
            status: cuenta.status as SubscriptionStatus,
            maxBranches: maxPermitidas,
            trialEndsAt: cuenta.trialEndsAt,
            currentPeriodStart: cuenta.currentPeriodStart,
            currentPeriodEnd: cuenta.currentPeriodEnd,
            graceUntil: cuenta.graceUntil,
          },
        },
      },
      select: { id: true, name: true, slug: true },
    });

    revalidatePath("/elegir-negocio");
    revalidatePath("/administracion/configuracion");
    revalidatePath("/facturacion");

    return sucursal;
  },
});

export const guardarPermisosRoles = defineAction({
  schema: permisosRolesSchema,
  roles: ADMINISTRAN,
  async handler({ input, db }) {
    let jsonNormalizado = "{}";
    try {
      const parsed = JSON.parse(input.rolePermissions);
      if (parsed && typeof parsed === "object") {
        jsonNormalizado = JSON.stringify(parsed);
      }
    } catch {
      throw new ErrorDeUsuario("El formato de permisos no es válido.");
    }

    await db.businessSettings.updateMany({
      data: {
        rolePermissions: jsonNormalizado,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/panel");
  },
});

/**
 * La configuración fiscal del negocio se dejó de editar acá.
 *
 * La cuenta de Factus es de la plataforma —Factus nos vende una bolsa de
 * documentos y nosotros la repartimos—, así que las credenciales viven en el
 * entorno y el rango de numeración que la DIAN le autorizó a cada NIT lo asigna
 * el superadministrador en `/superadmin/facturacion`. Para el dueño, la pestaña
 * de Facturación DIAN pasó a ser de solo lectura: un rango mal escrito es una
 * factura rechazada por la DIAN y una llamada a soporte.
 *
 * `guardarConfiguracionFactus` y `probarConexionFactus` viven ahora en
 * `features/superadmin/actions.ts`.
 */
