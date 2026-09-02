"use server";

import { revalidatePath } from "next/cache";
import { DeliveryStatus, OrderItemStatus, Role } from "@/generated/prisma/enums";
import {
  abrirDomiciliosQrSchema,
  actualizarEstadoDomicilioSchema,
  anularDomicilioSchema,
  confirmarDomicilioSchema,
} from "@/features/domicilios/schemas";
import { motivoDelRechazo, type EstadoDomicilio } from "@/features/domicilios/reglas";
import { cerrarComandaAlDespachar } from "@/features/domicilios/despacho";
import { anularPedido } from "@/features/pedidos/actions";
import { recalcularTotales } from "@/features/pedidos/totales";
import { avisarAlAgente } from "@/lib/printing/cola";
import { encolarComandas } from "@/lib/printing/emitir";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { describirAviso } from "@/lib/avisos";
import { publicarAviso, publishCajaUpdate,
  publishCocinaUpdate, publishDomiciliosUpdate } from "@/lib/redis";

/** Quiénes atienden el mostrador de domicilios. */
const DESPACHAN = [Role.PROPIETARIO, Role.ADMINISTRADOR, Role.CAJERO, Role.MESERO] as const;

/** La marca de tiempo que le corresponde a cada estado, si tiene alguna. */
const MARCA_DE_TIEMPO: Partial<Record<EstadoDomicilio, "deliveryConfirmedAt" | "dispatchedAt" | "deliveredAt">> = {
  EN_PREPARACION: "deliveryConfirmedAt",
  EN_CAMINO: "dispatchedAt",
  ENTREGADO: "deliveredAt",
};

/** Refresca todo lo que mira un domicilio. Son cuatro pantallas, no una. */
function refrescar(businessId: string, tambienCocina = false) {
  void publishDomiciliosUpdate(businessId);
  // El recorrido de un domicilio lo mueve entre los grupos de la caja —y al
  // despacharlo, lo saca—, así que la caja también tiene que enterarse sola.
  void publishCajaUpdate(businessId);
  if (tambienCocina) void publishCocinaUpdate(businessId);

  revalidatePath("/domicilios");
  revalidatePath("/caja");
  revalidatePath("/pos");
  // Faltaba: confirmar un domicilio manda comida a la cocina y esa pantalla no
  // se enteraba hasta que alguien la recargaba a mano.
  if (tambienCocina) revalidatePath("/cocina");
}

/**
 * Confirmar el domicilio: darlo por bueno y recién ahí mandarlo a la cocina.
 *
 * Es el paso que no existía. Un pedido del menú QR ponía `sentToKitchenAt` en el
 * mismo commit en que el comensal tocaba "enviar", así que la comanda aparecía en
 * la plancha con una dirección que nadie había leído. El botón "Aceptar y pasar a
 * cocina" existía pero solo cambiaba un string.
 *
 * Acá se corrigen los datos que hagan falta, se sella el envío a cocina en los
 * renglones —la misma mecánica de `confirmarPedido`— y se avisa a la cocina.
 */
export const confirmarDomicilio = defineAction({
  schema: confirmarDomicilioSchema,
  roles: DESPACHAN,
  async handler({ input, ctx, db }) {
    const resultado = await db.$transaction(async (tx) => {
      const pedido = await tx.order.findFirst({
        where: { id: input.orderId },
        select: {
          id: true,
          code: true,
          deliveryStatus: true,
          customerName: true,
          turnNumber: true,
          deliveryFeeCop: true,
          _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
        },
      });
      if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
      if (!pedido.deliveryStatus) throw new ErrorDeUsuario("Ese pedido no es un domicilio.");

      const rechazo = motivoDelRechazo(pedido.deliveryStatus, "EN_PREPARACION");
      if (rechazo) throw new ErrorDeUsuario(rechazo);

      await tx.order.update({
        where: { id: pedido.id },
        data: {
          deliveryStatus: DeliveryStatus.EN_PREPARACION,
          deliveryConfirmedAt: new Date(),
          deliveryAddress: input.deliveryAddress,
          ...(input.customerPhone ? { customerPhone: input.customerPhone } : {}),
          deliveryFeeCop: input.deliveryFeeCop,
        },
      });

      // Recién ahora la comida existe para la cocina. Solo los renglones que
      // todavía no se mandaron: confirmar dos veces no reabre lo ya preparado.
      const ahora = new Date();
      await tx.orderItem.updateMany({
        where: {
          orderId: pedido.id,
          status: OrderItemStatus.PENDIENTE,
          sentToKitchenAt: null,
        },
        data: { sentToKitchenAt: ahora },
      });

      // El costo de envío pudo cambiar: el total tiene que seguirlo dentro de la
      // misma transacción, o el cajero cobra un número viejo.
      await recalcularTotales(tx, pedido.id);

      const impresos = await encolarComandas(tx, ctx.business.id, pedido.id, ahora);

      return { ...pedido, impresos };
    });

    // Después del commit: el aviso que antes salía al crear el pedido, cuando
    // todavía no había nada que cocinar.
    void publicarAviso(
      ctx.business.id,
      describirAviso({
        tipo: "COCINA_NUEVA_COMANDA",
        orderId: resultado.id,
        code: resultado.code,
        // Un domicilio no tiene mesa: lo que identifica al pedido es el cliente.
        mesa: null,
        cuenta: resultado.customerName,
        turno: resultado.turnNumber,
        productos: resultado._count.items,
      }),
    );

    if (resultado.impresos > 0) avisarAlAgente(ctx.business.id);

    refrescar(ctx.business.id, true);
    return { ok: true };
  },
});

/**
 * Mueve el domicilio al siguiente estado.
 *
 * Solo avanza de a un paso: las reglas están en `features/domicilios/reglas.ts`,
 * puras y con tests. Antes esta acción escribía el estado que le mandaran, así
 * que un POST directo saltaba de recién llegado a entregado.
 *
 * Confirmar y anular NO pasan por acá: cada uno tiene su acción, porque hacen
 * bastante más que mover un estado.
 */
export const actualizarEstadoDomicilio = defineAction({
  schema: actualizarEstadoDomicilioSchema,
  roles: DESPACHAN,
  async handler({ input, ctx, db }) {
    if (input.deliveryStatus === "CANCELADO") {
      throw new ErrorDeUsuario("Para anular un domicilio usá el botón de anular, que pide el motivo.");
    }
    if (input.deliveryStatus === "EN_PREPARACION") {
      throw new ErrorDeUsuario("Para mandarlo a cocina hay que confirmar la dirección primero.");
    }

    const pedido = await db.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, deliveryStatus: true },
    });
    if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
    if (!pedido.deliveryStatus) throw new ErrorDeUsuario("Ese pedido no es un domicilio.");

    const rechazo = motivoDelRechazo(pedido.deliveryStatus, input.deliveryStatus);
    if (rechazo) throw new ErrorDeUsuario(rechazo);

    const marca = MARCA_DE_TIEMPO[input.deliveryStatus];

    await db.order.update({
      where: { id: pedido.id },
      data: {
        deliveryStatus: input.deliveryStatus as DeliveryStatus,
        ...(marca ? { [marca]: new Date() } : {}),
      },
    });

    // Despachar a mano cierra la comanda igual que despacharla cobrando: en los
    // dos casos la comida ya salió del local.
    const despachado = input.deliveryStatus === "EN_CAMINO";
    if (despachado) await cerrarComandaAlDespachar(db, pedido.id);

    refrescar(ctx.business.id, despachado);
    return { estado: input.deliveryStatus };
  },
});

/**
 * Anular un domicilio.
 *
 * Delega en la anulación de siempre en vez de escribir `status: "ANULADA"` a
 * mano, que es lo que hacía antes: así queda con motivo, con quién lo hizo, con
 * su registro en la bitácora y —lo que más duele— **devolviendo el stock**. Una
 * anulación que no devuelve el inventario descuadra el conteo del día sin que
 * nadie se entere hasta el arqueo.
 */
export const anularDomicilio = defineAction({
  schema: anularDomicilioSchema,
  roles: DESPACHAN,
  async handler({ input, ctx, db }) {
    const pedido = await db.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, deliveryStatus: true },
    });
    if (!pedido) throw new ErrorDeUsuario("Ese pedido no existe.");
    if (!pedido.deliveryStatus) throw new ErrorDeUsuario("Ese pedido no es un domicilio.");

    const rechazo = motivoDelRechazo(pedido.deliveryStatus, "CANCELADO");
    if (rechazo) throw new ErrorDeUsuario(rechazo);

    // Se delega en la anulación de siempre, con su política intacta: un pedido
    // con consumo solo lo anula un administrador. Duplicar la lógica acá sería
    // duplicar también esa regla, y las dos se irían separando.
    const resultado = await anularPedido(undefined, {
      orderId: input.orderId,
      motivo: input.motivo,
    });

    if (!resultado.ok) throw new ErrorDeUsuario(resultado.error);

    await db.order.update({
      where: { id: pedido.id },
      data: { deliveryStatus: DeliveryStatus.CANCELADO },
    });

    refrescar(ctx.business.id, true);
    return { ok: true };
  },
});

/**
 * Abrir o cerrar la recepción de domicilios por QR.
 *
 * Lo mueve el cajero, normalmente al abrir y al cerrar el turno. Es una decisión
 * del momento, no configuración del negocio: `deliveryEnabled` dice si el local
 * reparte —eso lo decide el dueño, en Configuración— y esto dice si está
 * recibiendo AHORA.
 *
 * Vive acá y no en `features/negocio` aunque escriba en `BusinessSettings`,
 * porque quien lo usa es la operación y no la administración: un cajero no tiene
 * permiso para entrar a Configuración, y tener que dárselo para que pueda cerrar
 * los domicilios a la medianoche sería abrirle la puerta a todo lo demás.
 */
export const abrirDomiciliosQr = defineAction({
  schema: abrirDomiciliosQrSchema,
  roles: DESPACHAN,
  async handler({ input, ctx, db }) {
    await db.businessSettings.update({
      where: { businessId: ctx.business.id },
      data: { qrDeliveryEnabled: input.abierto },
    });

    // El menú público lee esto al pintarse, así que hay que tirarle su caché: si
    // no, alguien que ya tenía la carta abierta sigue viendo "abierto" y arma un
    // pedido que la acción después le rechaza.
    revalidatePath("/m/[slug]", "page");
    refrescar(ctx.business.id);

    return { abierto: input.abierto };
  },
});
