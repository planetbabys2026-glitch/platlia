import "server-only";
import { etiquetaDeCuenta } from "@/lib/salon/mesa";
import { tenantDb } from "@/lib/db/tenant";

/**
 * El salón: las áreas con sus mesas y, en cada mesa ocupada, TODAS las cuentas
 * que la ocupan.
 *
 * Es la pantalla que el mesero mira todo el turno. Trae las mesas en una sola
 * consulta —con sus cuentas abiertas— y las agrupa por área acá, en vez de anidar
 * la consulta dentro de cada área: así una mesa que quedó sin área porque el
 * área se borró no desaparece de la pantalla.
 *
 * Antes esto traía `take: 1`. Con una sola cuenta por mesa alcanzaba, pero el
 * menú QR ya abría una cuenta por escaneo y el salón mostraba solo la primera:
 * el pedido que un comensal mandaba desde su celular quedaba invisible acá y
 * aparecía recién en cocina.
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
          select: {
            id: true,
            code: true,
            customerName: true,
            status: true,
            totalCop: true,
            openedAt: true,
            _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
          },
        },
      },
    }),
  ]);

  const conCuentas = mesas.map((mesa) => {
    const cuentas = mesa.orders.map((orden, indice) => ({
      id: orden.id,
      code: orden.code,
      etiqueta: etiquetaDeCuenta(orden.customerName, indice + 1),
      status: orden.status,
      totalCop: orden.totalCop,
      openedAt: orden.openedAt,
      renglones: orden._count.items,
    }));

    return {
      id: mesa.id,
      name: mesa.name,
      capacity: mesa.capacity,
      status: mesa.status,
      areaId: mesa.areaId,
      cuentas,
      // El total de la mesa es la suma de sus cuentas: es lo que el mesero
      // necesita de un vistazo, aunque después se cobre por separado.
      totalCop: cuentas.reduce((suma, cuenta) => suma + cuenta.totalCop, 0),
      // La más vieja marca cuánto lleva sentada la mesa.
      desde: cuentas.length > 0 ? cuentas[0].openedAt : null,
    };
  });

  const grupos = areas.map((area) => ({
    id: area.id,
    name: area.name,
    mesas: conCuentas.filter((mesa) => mesa.areaId === area.id),
  }));

  const huerfanas = conCuentas.filter((mesa) => mesa.areaId === null);
  if (huerfanas.length > 0) {
    grupos.push({ id: "sin-area", name: "Sin área", mesas: huerfanas });
  }

  return grupos.filter((grupo) => grupo.mesas.length > 0);
}

export type AreaConMesas = Awaited<ReturnType<typeof getSalon>>[number];
export type MesaDelSalon = AreaConMesas["mesas"][number];
export type CuentaDeMesa = MesaDelSalon["cuentas"][number];

/**
 * Una mesa con sus cuentas, para la pantalla que las lista.
 *
 * Devuelve `null` cuando la mesa no existe o está archivada: la página lo
 * convierte en 404, igual que un id de otra empresa —que el cliente acotado ya
 * hace invisible—.
 */
export async function getMesa(businessId: string, tableId: string) {
  const mesa = await tenantDb(businessId).table.findFirst({
    where: { id: tableId, deletedAt: null },
    select: {
      id: true,
      name: true,
      capacity: true,
      status: true,
      area: { select: { id: true, name: true } },
      orders: {
        where: { status: { in: ["ABIERTA", "CUENTA_PEDIDA"] } },
        orderBy: { openedAt: "asc" },
        select: {
          id: true,
          code: true,
          customerName: true,
          guestsCount: true,
          status: true,
          totalCop: true,
          openedAt: true,
          openedBy: { select: { name: true } },
          _count: { select: { items: { where: { status: { not: "ANULADO" } } } } },
        },
      },
    },
  });
  if (!mesa) return null;

  const cuentas = mesa.orders.map((orden, indice) => ({
    id: orden.id,
    code: orden.code,
    // El nombre crudo también viaja: el formulario de renombrar tiene que poder
    // mostrar el campo vacío en vez de precargado con "Cuenta 2", que si no se
    // guardaría como si alguien lo hubiera escrito.
    customerName: orden.customerName,
    etiqueta: etiquetaDeCuenta(orden.customerName, indice + 1),
    guestsCount: orden.guestsCount,
    status: orden.status,
    totalCop: orden.totalCop,
    openedAt: orden.openedAt,
    abrioPor: orden.openedBy.name,
    renglones: orden._count.items,
  }));

  return {
    id: mesa.id,
    name: mesa.name,
    capacity: mesa.capacity,
    status: mesa.status,
    area: mesa.area,
    cuentas,
    totalCop: cuentas.reduce((suma, cuenta) => suma + cuenta.totalCop, 0),
    /** Sin ninguna cuenta con consumo, la mesa se puede liberar de una. */
    sinConsumo: cuentas.length > 0 && cuentas.every((cuenta) => cuenta.renglones === 0),
  };
}

export type MesaConCuentas = NonNullable<Awaited<ReturnType<typeof getMesa>>>;
export type CuentaDetallada = MesaConCuentas["cuentas"][number];
