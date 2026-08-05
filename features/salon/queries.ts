import "server-only";
import { tenantDb } from "@/lib/db/tenant";

/**
 * El salón: las áreas con sus mesas y, en cada mesa ocupada, el pedido que la
 * ocupa.
 *
 * Es la pantalla que el mesero mira todo el turno. Trae las mesas en una sola
 * consulta —con su pedido abierto— y las agrupa por área acá, en vez de anidar
 * la consulta dentro de cada área: así una mesa que quedó sin área porque el
 * área se borró no desaparece de la pantalla.
 */
export async function getSalon(businessId: string) {
  const db = tenantDb(businessId);

  const [areas, mesas] = await Promise.all([
    db.area.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    db.table.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        capacity: true,
        status: true,
        areaId: true,
        orders: {
          where: { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
          orderBy: { openedAt: "asc" },
          take: 1,
          select: { id: true, code: true, totalCop: true, openedAt: true },
        },
      },
    }),
  ]);

  const grupos = areas.map((area) => ({
    id: area.id,
    name: area.name,
    mesas: mesas.filter((mesa) => mesa.areaId === area.id),
  }));

  const huerfanas = mesas.filter((mesa) => mesa.areaId === null);
  if (huerfanas.length > 0) {
    grupos.push({ id: "sin-area", name: "Sin área", mesas: huerfanas });
  }

  return grupos.filter((grupo) => grupo.mesas.length > 0);
}

export type AreaConMesas = Awaited<ReturnType<typeof getSalon>>[number];
export type MesaDelSalon = AreaConMesas["mesas"][number];
