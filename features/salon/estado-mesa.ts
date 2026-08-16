import "server-only";
import { estadoDeMesa } from "@/lib/salon/mesa";
import type { TenantDb } from "@/lib/db/tenant";

/**
 * Deja el estado de la mesa en línea con sus cuentas.
 *
 * Antes cada acción escribía el estado a mano —`abrirPedido` ponía OCUPADA,
 * `registrarPago` ponía LIBRE— y eso funcionaba mientras una mesa tuviera un solo
 * pedido. Con cuentas separadas dejó de ser cierto: cobrarle a una de tres
 * personas liberaba la mesa entera y el salón mostraba libre una mesa con gente
 * sentada. Acá el estado no se decide, se deriva.
 *
 * Va SIEMPRE dentro de la misma transacción que abrió, cerró o cobró la cuenta:
 * si se hiciera después, entre el commit y esta escritura hay un instante en que
 * el salón miente.
 */
export async function sincronizarEstadoMesa(
  tx: Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">,
  tableId: string | null | undefined,
): Promise<void> {
  if (!tableId) return;

  const mesa = await tx.table.findFirst({
    where: { id: tableId },
    select: {
      id: true,
      status: true,
      orders: {
        where: { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
        select: { status: true },
      },
    },
  });
  if (!mesa) return;

  const nuevo = estadoDeMesa(mesa.status, mesa.orders);
  // Escribir lo mismo igual toca `updatedAt` y despierta a quien esté mirando la
  // fila, así que solo se escribe cuando de verdad cambió.
  if (nuevo === mesa.status) return;

  await tx.table.update({ where: { id: mesa.id }, data: { status: nuevo } });
}
