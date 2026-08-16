import { pool } from "../lib/db/pool";
import { rootDb } from "../lib/db/root";

/**
 * Borra la operación y deja el negocio listo para volver a probar desde cero.
 *
 * Se va lo que pasó: pedidos, renglones, pagos, turnos de caja, movimientos y la
 * bitácora. Se queda lo que el negocio ES: usuarios, membresías, empresa, áreas,
 * mesas, carta, modificadores e insumos. Es el reset que uno corre veinte veces
 * en una tarde de pruebas, y por eso NO toca las cuentas: volver a crear el
 * equipo cada vez es exactamente la fricción que hace que uno deje de resetear.
 *
 * Para el otro caso —dejar la plataforma con los superadministradores y nada
 * más— está `scripts/limpiar-db-superadmin.ts`.
 */

if (process.env.NODE_ENV === "production") {
  throw new Error(
    "Este script borra la operación entera. No corre en producción: para un " +
      "negocio real, lo que se corrige se corrige con una anulación, no con un DELETE.",
  );
}

async function main() {
  console.log("🧹 Borrando la operación (se conservan usuarios, mesas y carta)…");

  // El orden respeta las llaves foráneas. Varias de estas tablas se irían solas
  // por `onDelete: Cascade`, pero se borran explícitas: si mañana alguien cambia
  // una cascada en el schema, este script tiene que seguir haciendo lo mismo y no
  // dejar filas huérfanas en silencio.
  const modificadores = await rootDb.orderItemModifier.deleteMany({});
  const renglones = await rootDb.orderItem.deleteMany({});
  const pagos = await rootDb.orderPayment.deleteMany({});
  const pedidos = await rootDb.order.deleteMany({});
  const movimientos = await rootDb.cashMovement.deleteMany({});
  const cajas = await rootDb.cashSession.deleteMany({});
  const movimientosInventario = await rootDb.inventoryMovement.deleteMany({});
  const bitacora = await rootDb.auditLog.deleteMany({});

  // Sin pedidos abiertos ninguna mesa puede seguir ocupada. Las que están fuera
  // de servicio se quedan como están: eso lo decidió una persona, no un pedido.
  const mesas = await rootDb.table.updateMany({
    where: { status: { not: "INACTIVA" } },
    data: { status: "LIBRE" },
  });

  console.table({
    "Modificadores de renglón": modificadores.count,
    Renglones: renglones.count,
    Pagos: pagos.count,
    Pedidos: pedidos.count,
    "Movimientos de caja": movimientos.count,
    "Turnos de caja": cajas.count,
    "Movimientos de inventario": movimientosInventario.count,
    "Bitácora": bitacora.count,
    "Mesas liberadas": mesas.count,
  });

  const [usuarios, negocios, productos] = await Promise.all([
    rootDb.user.count(),
    rootDb.business.count(),
    rootDb.product.count(),
  ]);
  console.log(
    `\n✅ Intactos: ${usuarios} usuarios · ${negocios} negocios · ${productos} productos.`,
  );

  if (movimientosInventario.count > 0) {
    // No hay línea base a la cual volver: el stock actual es el resultado de
    // sumar y restar movimientos que acabamos de borrar. Decirlo es mejor que
    // dejar que alguien descubra números raros tres pruebas después.
    console.log(
      "\n⚠️  Se borraron movimientos de inventario, pero las existencias " +
        "(InventoryItem.stockCurrent y Product.stockQty) quedaron como estaban: " +
        "no se pueden recalcular sin los movimientos. Si venías probando " +
        "inventario, ajustalas a mano.",
    );
  }
}

main()
  .catch((error) => {
    console.error("❌ El reset falló:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await rootDb.$disconnect();
    // rootDb comparte el pool de lib/db/pool.ts y no lo cierra al desconectarse:
    // sin esto el proceso queda colgado con el socket abierto.
    await pool.end();
  });
