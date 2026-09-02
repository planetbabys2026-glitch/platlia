"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppModule, DeliveryStatus, OrderItemStatus, Role } from "@/generated/prisma/enums";
import { defineAction, ErrorDeUsuario } from "@/lib/actions/define-action";
import { getPreparacionesActivas } from "./queries";
import { currentBusinessDate } from "@/lib/time";
import {
  publishCajaUpdate,
  publishCocinaUpdate,
  publishDomiciliosUpdate,
  publishTurneroUpdate,
} from "@/lib/redis";
import { id } from "@/lib/validaciones";
import {
  FIRMA_AL_LLEGAR,
  MARCA_AL_LLEGAR,
  puedeMarcarListo,
  SIGUIENTE_ESTADO,
  type EstadoRenglon,
} from "./reglas";

/**
 * Se identifica por el código y no importando el namespace `Prisma`: solo
 * `lib/db/` importa el cliente base.
 */
function esFilaNoEncontrada(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

/**
 * La cocina mueve el renglón por sus estados: pendiente → en preparación → listo
 * → entregado.
 *
 * Las reglas —el orden de los estados, qué marca deja cada paso y quién puede
 * darlo— viven en `features/cocina/reglas.ts`, puras y con tests: son la clase de
 * cosa que no falla de forma visible cuando está mal, simplemente deja pasar a
 * quien no debía o guarda un tiempo que no significa nada.
 */

export const avanzarComanda = defineAction({
  schema: z.object({ itemId: id }),
  roles: [Role.COCINA, Role.MESERO, Role.CAJERO, Role.ADMINISTRADOR],
  modulo: AppModule.COCINA,
  async handler({ input, db, ctx }) {
    const item = await db.orderItem.findFirst({
      where: { id: input.itemId },
      select: {
        id: true,
        status: true,
        orderId: true,
        nameSnapshot: true,
        startedById: true,
        startedBy: { select: { name: true } },
        order: { select: { deliveryStatus: true } },
      },
    });
    if (!item) throw new ErrorDeUsuario("Ese renglón no existe.");

    const siguiente = SIGUIENTE_ESTADO[item.status as EstadoRenglon];
    if (!siguiente) {
      throw new ErrorDeUsuario(
        item.status === "ANULADO"
          ? "Ese renglón está anulado."
          : `${item.nameSnapshot} ya fue entregado.`,
      );
    }

    /**
     * Marcar listo lo hace quien lo tomó.
     *
     * Se verifica acá y no solo en la pantalla porque esto es un POST: esconder
     * el botón no impide nada. Y se verifica antes del update para poder dar el
     * mensaje bueno —a quién hay que ir a buscar—, no un "no se pudo".
     */
    if (siguiente === "LISTO") {
      const veredicto = puedeMarcarListo({
        startedById: item.startedById,
        actorId: ctx.user.id,
        actorRole: ctx.role,
        nombreDeQuienLoTomo: item.startedBy?.name ?? null,
      });
      if (!veredicto.permitido) throw new ErrorDeUsuario(veredicto.motivo);
    }

    const marca = MARCA_AL_LLEGAR[siguiente];
    const firma = FIRMA_AL_LLEGAR[siguiente];

    /**
     * El `status` va en el `where`, no en un `if` antes.
     *
     * Dos cocineros tocando el mismo plato desde dos pantallas leen los dos
     * `PENDIENTE`, los dos pasan la guarda de arriba y el segundo pisa la firma
     * del primero: el plato quedaría a nombre de quien no lo tomó, que es
     * exactamente lo que esta pantalla existe para evitar. Es el mismo `update`
     * condicionado con el que se descuenta el stock o se reclama un trabajo de
     * impresión; Prisma contesta P2025 cuando no encuentra la fila.
     */
    try {
      await db.orderItem.update({
        where: { id: item.id, status: item.status },
        data: {
          status: siguiente as OrderItemStatus,
          ...(marca ? { [marca]: new Date() } : {}),
          ...(firma ? { [firma]: ctx.user.id } : {}),
        },
      });
    } catch (error) {
      if (esFilaNoEncontrada(error)) {
        throw new ErrorDeUsuario(`Otra persona ya movió ${item.nameSnapshot}.`);
      }
      throw error;
    }

    /**
     * Cuando la cocina termina, el domicilio sale de la cocina y entra a la caja.
     *
     * Esta acción trabaja por RENGLÓN y nunca tocaba el pedido, así que un
     * domicilio se quedaba en "En cocina" para siempre por más que estuviera
     * empacado. La caja, mientras tanto, lo listaba desde que nacía.
     *
     * El disparador es que no quede ningún renglón por preparar: el pedido está
     * completo, no a medias.
     */
    let despachable = false;
    if (item.order?.deliveryStatus === DeliveryStatus.EN_PREPARACION) {
      const enPreparacion = await db.orderItem.count({
        where: {
          orderId: item.orderId,
          sentToKitchenAt: { not: null },
          status: { in: [OrderItemStatus.PENDIENTE, OrderItemStatus.EN_PREPARACION] },
        },
      });

      if (enPreparacion === 0) {
        await db.order.update({
          where: { id: item.orderId },
          data: { deliveryStatus: DeliveryStatus.LISTO },
        });
        despachable = true;
      }
    }

    revalidatePath("/cocina");
    revalidatePath("/turnero");
    revalidatePath(`/pedido/${item.orderId}`);

    void publishCocinaUpdate(ctx.business.id);
    void publishCajaUpdate(ctx.business.id);
    void publishTurneroUpdate(ctx.business.id);

    if (despachable) {
      revalidatePath("/domicilios");
      revalidatePath("/caja");
      void publishDomiciliosUpdate(ctx.business.id);
    }
    return { status: siguiente, despachable };
  },
});

export const obtenerEstadoPreparaciones = defineAction({
  schema: z.object({}),
  roles: [Role.CAJERO, Role.MESERO, Role.ADMINISTRADOR, Role.PROPIETARIO, Role.COCINA],
  modulo: AppModule.COCINA,
  async handler({ ctx }) {
    const businessDate = currentBusinessDate(ctx.business);
    const items = await getPreparacionesActivas(ctx.business.id, businessDate);
    return items;
  },
});
