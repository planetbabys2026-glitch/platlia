import "server-only";
import type { TenantDb } from "@/lib/db/tenant";
import { ErrorDeUsuario } from "@/lib/actions/estado";
import {
  calcularRecargoCop,
  validarSeleccion,
  type GrupoModificador,
} from "@/lib/modificadores";

type TxClient = Omit<TenantDb, "$transaction" | "$connect" | "$disconnect" | "$extends">;

/**
 * Resuelve y valida los modificadores de un renglón contra la base de datos.
 *
 * Lo comparten los tres lugares que escriben un `OrderItem` —la mesa
 * (`agregarItem`), el POS (`procesarVentaPosCompleta`) y el menú QR
 * (`crearPedidoClienteQR`)—, porque las tres son alcanzables por POST directo y
 * las tres tienen que llegar al mismo veredicto. Que el precio del renglón
 * dependiera de qué puerta se usó sería la peor clase de bug: silencioso y en la
 * plata.
 *
 * Del cliente solo se aceptan ids. El nombre, el recargo y qué grupo era se leen
 * acá y se congelan en el renglón.
 */
export async function resolverModificadores(
  tx: TxClient,
  productId: string,
  productName: string,
  modifierOptionIds: string[],
) {
  const asignados = await tx.productModifierGroup.findMany({
    where: { productId, group: { deletedAt: null, active: true } },
    orderBy: { sortOrder: "asc" },
    select: {
      required: true,
      sortOrder: true,
      group: {
        select: {
          id: true,
          name: true,
          minSelect: true,
          maxSelect: true,
          options: {
            where: { deletedAt: null, active: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true, priceDeltaCop: true },
          },
        },
      },
    },
  });

  const grupos: GrupoModificador[] = asignados.map((a) => ({
    id: a.group.id,
    name: a.group.name,
    minSelect: a.group.minSelect,
    maxSelect: a.group.maxSelect,
    required: a.required,
    options: a.group.options,
  }));

  const elegidas = [...new Set(modifierOptionIds)];

  // Mandar modificadores a un producto que no los tiene no es un descuido de la
  // interfaz: es alguien armando el POST a mano.
  if (grupos.length === 0 && elegidas.length > 0) {
    throw new ErrorDeUsuario(`"${productName}" no admite modificadores.`);
  }

  const problema = validarSeleccion(grupos, elegidas);
  if (problema) throw new ErrorDeUsuario(problema);

  const recargoCop = calcularRecargoCop(grupos, elegidas);

  // En el orden en que están los grupos, no en el que llegaron los ids: así la
  // comanda de cocina siempre lee "proteína, término" y no al revés.
  const snapshots: Array<{
    optionId: string;
    groupNameSnapshot: string;
    optionNameSnapshot: string;
    priceDeltaCopSnapshot: number;
    sortOrder: number;
  }> = [];

  let orden = 0;
  for (const grupo of grupos) {
    for (const opcion of grupo.options) {
      if (!elegidas.includes(opcion.id)) continue;
      snapshots.push({
        optionId: opcion.id,
        groupNameSnapshot: grupo.name,
        optionNameSnapshot: opcion.name,
        priceDeltaCopSnapshot: opcion.priceDeltaCop,
        sortOrder: orden++,
      });
    }
  }

  return { recargoCop, snapshots, opcionIds: snapshots.map((s) => s.optionId) };
}

/** Los ids de modificadores que ya tiene un renglón, para poder devolver su stock. */
export async function modificadoresDeRenglon(
  tx: TxClient,
  orderItemId: string,
): Promise<string[]> {
  const filas = await tx.orderItemModifier.findMany({
    where: { orderItemId },
    select: { optionId: true },
  });
  return filas.map((f) => f.optionId).filter((id): id is string => id !== null);
}
