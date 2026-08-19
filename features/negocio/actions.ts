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
import { cuentaDelPropietario } from "@/lib/billing/cuenta";
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
  async handler({ input, db }) {
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

    await db.businessSettings.updateMany({
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
      select: { inventoryEnabled: true },
    });

    if (input.inventoryEnabled && !prevSettings?.inventoryEnabled) {
      // Al activar el inventario, reiniciar stocks a 0 para que arranque limpio
      // y las ventas anteriores sin inventario no dejen saldos negativos.
      await db.inventoryItem.updateMany({
        where: { businessId: ctx.business.id },
        data: { stockCurrent: 0 },
      });

      await db.product.updateMany({
        where: { businessId: ctx.business.id },
        data: { stockQty: 0 },
      });
    }

    await db.businessSettings.updateMany({
      where: { businessId: ctx.business.id },
      data: {
        deliveryEnabled: input.deliveryEnabled,
        deliveryFeeCop: input.deliveryFeeCop,
        inventoryEnabled: input.inventoryEnabled,
        recipesEnabled: input.recipesEnabled,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/salon");
    revalidatePath("/pos");
    revalidatePath("/inventario");
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
      },
    });

    revalidatePath("/administracion/configuracion");
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

    const cantActual = cuenta?.sedes ?? 0;
    const maxPermitidas = cuenta?.maxBranches ?? 1;

    // Bloquear creación de sedes adicionales en el plan de prueba gratuita de 7 días
    if (!cuenta || cuenta.status === SubscriptionStatus.PRUEBA) {
      throw new ErrorDeUsuario(
        "El plan de prueba gratuita (7 días) no permite crear sedes adicionales. Adquiere o renueva una licencia de pago para agregar más sucursales a tu empresa.",
      );
    }

    /**
     * El cupo se compra antes de crear la sede.
     *
     * La condición anterior era `cantActual >= maxPermitidas && maxPermitidas >= 2`:
     * con el `maxBranches` de fábrica en 1, la segunda parte era falsa y **la
     * segunda sede salía gratis**. Ahora se pide cupo siempre, y el cupo lo da un
     * pago (`comprarSedeAdicional`) o el superadministrador para las cadenas.
     */
    if (cantActual >= maxPermitidas) {
      throw new ErrorDeUsuario(
        maxPermitidas >= 2
          ? `Tu plan cubre ${maxPermitidas} sedes. Para sumar otra, escribinos y coordinamos la tarifa de cadena.`
          : "Todavía no tenés una sede adicional habilitada. Compralá desde Licencia y volvé acá para crearla.",
      );
    }

    // 3. Crear la nueva sucursal independiente
    const slug = await slugSucursalLibre(input.name);

    const sucursal = await rootDb.business.create({
      data: {
        name: input.name,
        slug,
        address: input.address ?? null,
        phone: input.phone ?? null,
        settings: { create: {} },
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
