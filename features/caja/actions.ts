"use server";

import { revalidatePath } from "next/cache";
import { AppModule, CashMovementType, Role } from "@/generated/prisma/enums";
import {
  abrirCajaSchema,
  archivarCajaSchema,
  cajaSchema,
  cerrarCajaSchema,
  claveGastosSchema,
  movimientoSchema,
  quitarClaveGastosSchema,
} from "@/features/caja/schemas";
import { getResumenCaja } from "@/features/caja/queries";
import { esSalidaDeDinero, sesionDeCobro } from "@/features/caja/reglas";
import { getSettings } from "@/features/negocio/queries";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { currentBusinessDate } from "@/lib/time";

/**
 * Turno de caja.
 *
 * **La caja es una entidad, no un singleton.** Hasta acá había una sola sesión
 * abierta por empresa, con el argumento de que dos turnos simultáneos harían que
 * el efectivo de una venta cayera en cualquiera de los dos. Eso es cierto por
 * CAJA, no por negocio: un local con una barra y un mostrador tiene dos cajones y
 * dos personas contando, y obligarlos a compartir un turno es exactamente el
 * arqueo que no cuadra nunca. Ahora la unicidad es por `CashRegister`.
 *
 * Y el turno cuadra DOS saldos: el del cajón y el de la cuenta del banco. Lo que
 * entra por datáfono no se toca ni se cuenta a mano, pero existe, y hasta acá se
 * listaba "por método" sin nada contra qué compararlo.
 */

const OPERAN_CAJA = [Role.CAJERO, Role.ADMINISTRADOR] as const;

export const abrirCaja = defineAction({
  schema: abrirCajaSchema,
  roles: OPERAN_CAJA,
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);
    const businessDate = currentBusinessDate(settings);

    return db.$transaction(async (tx) => {
      const caja = await tx.cashRegister.findFirst({
        where: { id: input.cashRegisterId, deletedAt: null },
        select: { id: true, name: true, active: true },
      });
      if (!caja) throw new ErrorDeUsuario("Esa caja no existe.");
      if (!caja.active) {
        throw new ErrorDeUsuario(`La caja ${caja.name} está desactivada.`);
      }

      const ocupada = await tx.cashSession.findFirst({
        where: { cashRegisterId: caja.id, status: "ABIERTA" },
        select: { openedBy: { select: { name: true } } },
      });
      if (ocupada) {
        throw new ErrorDeUsuario(
          `La caja ${caja.name} ya tiene un turno abierto por ${ocupada.openedBy.name}.`,
        );
      }

      // Una persona, un turno. Si no, el mismo cajero abre dos cajas y ninguna de
      // las dos tiene a nadie parado adelante haciéndose cargo del cajón.
      const propia = await tx.cashSession.findFirst({
        where: { openedById: ctx.user.id, status: "ABIERTA" },
        select: { cashRegister: { select: { name: true } } },
      });
      if (propia) {
        throw new ErrorDeUsuario(
          `Ya tenés abierto el turno de ${propia.cashRegister.name}. Cerralo antes de abrir otro.`,
        );
      }

      // Consecutivo por jornada, no por caja: "caja 3" se entiende como el tercer
      // turno del día. El businessDate llega calculado con la zona de la empresa.
      const ultima = await tx.cashSession.findFirst({
        where: { businessDate },
        orderBy: { code: "desc" },
        select: { code: true },
      });

      const sesion = await tx.cashSession.create({
        data: {
          businessId: ctx.business.id,
          cashRegisterId: caja.id,
          code: (ultima?.code ?? 0) + 1,
          businessDate,
          openingFloatCop: input.openingFloatCop,
          openingBankCop: input.openingBankCop,
          openedById: ctx.user.id,
        },
        select: { id: true, code: true },
      });

      revalidatePath("/caja");
      revalidatePath("/panel");
      revalidatePath("/salon");
      revalidatePath("/pos");
      return sesion;
    });
  },
});

export const cerrarCaja = defineAction({
  schema: cerrarCajaSchema,
  roles: OPERAN_CAJA,
  modulo: AppModule.CAJA,
  // Se permite cerrar la caja con la licencia vencida: si el negocio se quedó sin
  // licencia a mitad del turno, igual hay que poder contar la plata y cerrar.
  permitirSinLicencia: true,
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);
    const businessDate = currentBusinessDate(settings);

    const abiertas = await db.cashSession.findMany({
      where: { status: "ABIERTA" },
      select: {
        id: true,
        openedById: true,
        cashRegister: { select: { name: true } },
      },
    });
    const elegida = sesionDeCobro(
      abiertas.map((s) => ({
        id: s.id,
        openedById: s.openedById,
        cajaNombre: s.cashRegister.name,
      })),
      ctx.user.id,
    );
    if (!elegida.ok) {
      throw new ErrorDeUsuario(
        elegida.motivo === "SIN_CAJA"
          ? "No hay ninguna caja abierta."
          : "Hay varias cajas abiertas y ninguna es tuya. Solo se cierra el turno propio.",
      );
    }
    const mia = elegida.cashSessionId;

    /**
     * Los pedidos sin cobrar bloquean el cierre, pero solo si soy la ÚLTIMA caja.
     *
     * Antes se miraban los pedidos de MI sesión, porque `abrirPedido` los ataba a
     * la única caja que había. Con varias eso deja de significar algo: la cuenta
     * de la mesa 4 no es de una caja hasta que alguien la cobra. Lo que sí importa
     * es que la noche no termine con cuentas vivas, y eso se pregunta cuando se va
     * a apagar la última luz. Si queda otra caja abierta, alguien todavía puede
     * cobrarlas.
     */
    const quedanOtras = abiertas.some((s) => s.id !== mia);
    if (!quedanOtras) {
      const pedidosSinCobrar = await db.order.findMany({
        where: { businessDate, status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
        orderBy: { openedAt: "asc" },
        select: {
          code: true,
          customerName: true,
          table: { select: { name: true } },
          _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
        },
      });
      if (pedidosSinCobrar.length > 0) {
        // Nombrarlos y no solo contarlos: el cajero tiene que salir a buscarlos, y
        // "hay 3 pedidos sin cobrar" no le dice a cuáles mesas ir. Los vacíos se
        // señalan aparte porque se resuelven distinto —con "Cerrar sin consumo"—
        // y son justamente los que antes dejaban la caja trabada sin salida.
        const cuantos = pedidosSinCobrar.length;
        const detalle = pedidosSinCobrar
          .slice(0, 5)
          .map((pedido) => {
            const donde = pedido.table ? `Mesa ${pedido.table.name}` : `Pedido #${pedido.code}`;
            const quien = pedido.customerName?.trim();
            const etiqueta = quien ? `${donde} · ${quien}` : donde;
            return pedido._count.items === 0 ? `${etiqueta} (sin consumo)` : etiqueta;
          })
          .join(", ");
        const resto = cuantos > 5 ? ` y ${cuantos - 5} más` : "";

        throw new ErrorDeUsuario(
          `Hay ${cuantos} ${cuantos === 1 ? "cuenta" : "cuentas"} sin cobrar: ${detalle}${resto}. ` +
            "Cobralas, o cerralas sin consumo si nadie pidió nada.",
        );
      }
    }

    const resumen = await getResumenCaja(db, mia);

    // Las diferencias se guardan calculadas y no se recalculan al leer: lo
    // esperado depende de datos que después se pueden corregir, y el corte de
    // anoche tiene que seguir diciendo lo que decía anoche.
    const cerrada = await db.cashSession.update({
      where: { id: mia },
      data: {
        status: "CERRADA",
        closedAt: new Date(),
        closedById: ctx.user.id,
        expectedCashCop: resumen.efectivo.esperadoCop,
        countedCashCop: input.countedCashCop,
        differenceCop: input.countedCashCop - resumen.efectivo.esperadoCop,
        expectedBankCop: resumen.bancos.esperadoCop,
        countedBankCop: input.countedBankCop,
        differenceBankCop: input.countedBankCop - resumen.bancos.esperadoCop,
        notes: input.notes,
      },
      select: {
        id: true,
        differenceCop: true,
        differenceBankCop: true,
        expectedCashCop: true,
        countedCashCop: true,
        expectedBankCop: true,
        countedBankCop: true,
      },
    });

    revalidatePath("/caja");
    revalidatePath("/panel");
    return cerrada;
  },
});

export const registrarMovimiento = defineAction({
  schema: movimientoSchema,
  roles: OPERAN_CAJA,
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const abiertas = await db.cashSession.findMany({
      where: { status: "ABIERTA" },
      select: { id: true, openedById: true, cashRegister: { select: { name: true } } },
    });
    const elegida = sesionDeCobro(
      abiertas.map((s) => ({
        id: s.id,
        openedById: s.openedById,
        cajaNombre: s.cashRegister.name,
      })),
      ctx.user.id,
    );
    if (!elegida.ok) {
      throw new ErrorDeUsuario(
        elegida.motivo === "SIN_CAJA"
          ? "No hay caja abierta: abrí el turno antes de registrar movimientos."
          : "Hay varias cajas abiertas y ninguna es tuya. Abrí tu turno para registrar movimientos.",
      );
    }

    if (input.type !== CashMovementType.AJUSTE && input.amountCop <= 0) {
      throw new ErrorDeUsuario(
        "El monto tiene que ser mayor a cero. El signo lo pone el tipo de movimiento.",
      );
    }

    /**
     * La clave protege la SALIDA de dinero, y se verifica acá y no en la pantalla.
     *
     * Sin clave configurada las salidas siguen funcionando: frenarlas de entrada
     * dejaría sin registrar gastos a todo negocio que ya venía trabajando, hasta
     * que su dueño entre a poner una clave que nadie le pidió. Configuración lo
     * avisa en su lugar.
     */
    if (esSalidaDeDinero(input.type, input.amountCop)) {
      const settings = await getSettings(ctx.business.id);
      if (settings.expensePinHash) {
        const clave = input.clave ?? "";
        const correcta = clave.length > 0 && (await verifyPassword(settings.expensePinHash, clave));
        if (!correcta) {
          // Queda el intento, como con el token de bootstrap: quien prueba claves
          // en la caja de un bar tiene que dejar rastro.
          await db.auditLog.create({
            data: {
              userId: ctx.user.id,
              action: "caja.salida-clave-incorrecta",
              entity: "CashSession",
              entityId: elegida.cashSessionId,
              metadata: { tipo: input.type, montoCop: input.amountCop },
            },
          });
          throw new ErrorDeUsuario("La clave de salidas no es correcta.", {
            clave: ["La clave de salidas no es correcta."],
          });
        }
      }
    }

    const movimiento = await db.cashMovement.create({
      data: {
        businessId: ctx.business.id,
        cashSessionId: elegida.cashSessionId,
        type: input.type,
        account: input.account,
        amountCop: input.amountCop,
        concept: input.concept,
        createdById: ctx.user.id,
      },
      select: { id: true },
    });

    revalidatePath("/caja");
    return movimiento;
  },
});

/**
 * Las cajas físicas, que las administra el propietario.
 *
 * `PROPIETARIO` y no `ADMINISTRADOR`: crear una caja es decidir dónde puede
 * entrar plata, del mismo orden que la clave de salidas de abajo.
 */
export const guardarCaja = defineAction({
  schema: cajaSchema,
  roles: [Role.PROPIETARIO],
  modulo: AppModule.CAJA,
  async handler({ input, ctx, db }) {
    const repetida = await db.cashRegister.findFirst({
      where: {
        name: input.name,
        deletedAt: null,
        ...(input.id ? { NOT: { id: input.id } } : {}),
      },
      select: { id: true },
    });
    if (repetida) throw new ErrorDeUsuario(`Ya hay una caja llamada "${input.name}".`);

    const caja = input.id
      ? await db.cashRegister.update({
          where: { id: input.id },
          data: { name: input.name, sortOrder: input.sortOrder, active: input.active },
          select: { id: true },
        })
      : await db.cashRegister.create({
          data: {
            businessId: ctx.business.id,
            name: input.name,
            sortOrder: input.sortOrder,
            active: input.active,
          },
          select: { id: true },
        });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/caja");
    return caja;
  },
});

export const archivarCaja = defineAction({
  schema: archivarCajaSchema,
  roles: [Role.PROPIETARIO],
  modulo: AppModule.CAJA,
  async handler({ input, db }) {
    const caja = await db.cashRegister.findFirst({
      where: { id: input.id, deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { sessions: { where: { status: "ABIERTA" } } } },
      },
    });
    if (!caja) throw new ErrorDeUsuario("Esa caja no existe.");
    if (caja._count.sessions > 0) {
      throw new ErrorDeUsuario(`La caja ${caja.name} tiene un turno abierto. Cerralo primero.`);
    }

    const quedan = await db.cashRegister.count({
      where: { deletedAt: null, active: true, NOT: { id: caja.id } },
    });
    if (quedan === 0) {
      throw new ErrorDeUsuario(
        "Es la única caja del negocio: sin ninguna no se puede abrir turno ni cobrar.",
      );
    }

    // No se borra: sus turnos cerrados son el historial del arqueo y tienen que
    // seguir diciendo en qué caja pasaron. Se le cambia el nombre para liberarlo,
    // igual que al archivar una mesa.
    await db.cashRegister.update({
      where: { id: caja.id },
      data: {
        deletedAt: new Date(),
        active: false,
        name: `${caja.name} (archivada ${Date.now().toString(36)})`,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/caja");
  },
});

/**
 * La clave de salidas de dinero.
 *
 * Acción aparte y `roles: [Role.PROPIETARIO]`, nunca dentro del guardado masivo
 * de Configuración: ese formulario lo alcanza un administrador, y un
 * administrador que puede cambiar esta clave es un administrador que puede sacar
 * plata sin que el dueño se entere. El hash nunca vuelve a la pantalla; a la
 * pantalla va un booleano.
 */
export const guardarClaveGastos = defineAction({
  schema: claveGastosSchema,
  roles: [Role.PROPIETARIO],
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);

    if (settings.expensePinHash) {
      const actual = input.claveActual ?? "";
      const correcta =
        actual.length > 0 && (await verifyPassword(settings.expensePinHash, actual));
      if (!correcta) {
        throw new ErrorDeUsuario("La clave actual no es correcta.", {
          claveActual: ["La clave actual no es correcta."],
        });
      }
    }

    await db.businessSettings.update({
      where: { businessId: ctx.business.id },
      data: { expensePinHash: await hashPassword(input.clave) },
    });

    await db.auditLog.create({
      data: {
        userId: ctx.user.id,
        action: settings.expensePinHash ? "caja.clave-salidas-cambiada" : "caja.clave-salidas-puesta",
        entity: "BusinessSettings",
        entityId: settings.id,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/caja");
  },
});

export const quitarClaveGastos = defineAction({
  schema: quitarClaveGastosSchema,
  roles: [Role.PROPIETARIO],
  async handler({ input, ctx, db }) {
    const settings = await getSettings(ctx.business.id);
    if (!settings.expensePinHash) {
      throw new ErrorDeUsuario("Este negocio no tiene clave de salidas configurada.");
    }

    const correcta = await verifyPassword(settings.expensePinHash, input.claveActual);
    if (!correcta) {
      throw new ErrorDeUsuario("La clave actual no es correcta.", {
        claveActual: ["La clave actual no es correcta."],
      });
    }

    await db.businessSettings.update({
      where: { businessId: ctx.business.id },
      data: { expensePinHash: null },
    });

    await db.auditLog.create({
      data: {
        userId: ctx.user.id,
        action: "caja.clave-salidas-quitada",
        entity: "BusinessSettings",
        entityId: settings.id,
      },
    });

    revalidatePath("/administracion/configuracion");
    revalidatePath("/caja");
  },
});
