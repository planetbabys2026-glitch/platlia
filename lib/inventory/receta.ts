/**
 * La receta que de verdad se va a descontar.
 *
 * Un producto con modificadores no tiene una receta: tiene una por combinación.
 * El menú del día con pollo consume pechuga y el mismo plato con carne consume
 * res, y hasta que alguien elige no se sabe cuál de las dos descontar. Esto
 * arma la lista definitiva juntando la receta base con los insumos de las
 * opciones elegidas.
 *
 * Puro y sin `server-only`: lo usa el descuento en el servidor y también el
 * cálculo de disponibilidad que el POS pinta en las tarjetas.
 */

/**
 * `costCop` es opcional porque solo hace falta para escribir el Kardex. Las
 * pantallas que apenas pintan disponibilidad —la grilla del POS, las alertas de
 * los informes— no lo consultan, y exigirlo las obligaría a traer una columna
 * que no usan en cada carga de la carta.
 */
export interface InsumoDeReceta {
  id: string;
  name: string;
  unit: string;
  stockCurrent: number;
  costCop?: number;
}

export interface RenglonDeReceta {
  quantityRequired: number;
  inventoryItem: InsumoDeReceta;
}

export interface OpcionConInsumos {
  id: string;
  name: string;
  supplies: RenglonDeReceta[];
}

export interface ProductoConReceta {
  hasRecipe?: boolean;
  recipeItems?: RenglonDeReceta[];
}

/**
 * Junta la receta base con los insumos de las opciones elegidas, sumando por
 * insumo.
 *
 * Sumar es el punto: si la receta base pide 100 g de arroz y la adición "porción
 * extra" pide 50 g más, esto devuelve una línea de 150 g. Devolver dos líneas
 * sueltas haría que la verificación de stock comparase 100 ≤ disponible y
 * 50 ≤ disponible por separado, y con 120 g en bodega las dos pasarían: se
 * vendería un plato que no se puede preparar.
 *
 * Si el producto no tiene `hasRecipe`, la receta base no entra —el dueño no
 * declaró que ese producto lleve escandallo—, pero los insumos de los
 * modificadores sí: una adición con insumo propio descuenta igual.
 */
export function componerRecetaEfectiva(
  producto: ProductoConReceta,
  opcionesElegidas: OpcionConInsumos[] = [],
): RenglonDeReceta[] {
  const porInsumo = new Map<string, RenglonDeReceta>();

  const acumular = (renglon: RenglonDeReceta) => {
    if (!renglon.inventoryItem || renglon.quantityRequired <= 0) return;
    const previo = porInsumo.get(renglon.inventoryItem.id);
    if (previo) {
      previo.quantityRequired += renglon.quantityRequired;
    } else {
      porInsumo.set(renglon.inventoryItem.id, {
        quantityRequired: renglon.quantityRequired,
        inventoryItem: renglon.inventoryItem,
      });
    }
  };

  if (producto.hasRecipe && producto.recipeItems) {
    for (const renglon of producto.recipeItems) acumular(renglon);
  }

  for (const opcion of opcionesElegidas) {
    for (const renglon of opcion.supplies ?? []) acumular(renglon);
  }

  return [...porInsumo.values()];
}

/**
 * Cuántas porciones alcanzan los insumos de una receta ya compuesta.
 *
 * `null` cuando la receta está vacía: no es "cero disponibles", es "este
 * producto no se mide por insumos".
 */
export function porcionesSegunReceta(receta: RenglonDeReceta[]): number | null {
  if (receta.length === 0) return null;

  let minimo = Infinity;
  for (const renglon of receta) {
    if (renglon.quantityRequired <= 0) continue;
    const porciones = Math.floor(renglon.inventoryItem.stockCurrent / renglon.quantityRequired);
    if (porciones < minimo) minimo = porciones;
  }

  return minimo === Infinity ? null : Math.max(0, minimo);
}

/**
 * Qué insumo es el que frena, para poder decirlo.
 *
 * "No hay pechuga" es accionable; "stock insuficiente" manda a alguien a
 * revisar la bodega entera.
 */
export function insumoQueFrena(
  receta: RenglonDeReceta[],
  cantidad: number,
): { insumo: InsumoDeReceta; requerido: number } | null {
  for (const renglon of receta) {
    const requerido = renglon.quantityRequired * cantidad;
    if (renglon.inventoryItem.stockCurrent < requerido) {
      return { insumo: renglon.inventoryItem, requerido };
    }
  }
  return null;
}

/**
 * Lo que le falta a un producto para que su stock signifique algo.
 *
 * Un producto puede estar mal cargado de una manera que no rompe nada y no se
 * ve: se vende, sale la comanda, y el inventario no se mueve. Pasó con un plato
 * que declaraba receta sin renglones y con un grupo de proteínas donde solo una
 * de las tres opciones tenía insumo cargado —vender con carne descontaba, vender
 * con pollo no—. Ninguna pantalla lo decía.
 */
export type FaltanteDeReceta =
  | { tipo: "RECETA_VACIA" }
  | { tipo: "OPCIONES_SIN_INSUMOS"; grupo: string; opciones: string[] };

/**
 * Lo mínimo para diagnosticar: solo se miran cantidades, no contenidos.
 *
 * No extiende `ProductoConReceta` a propósito. La pantalla de la carta trae los
 * renglones y los insumos como `{ id }` —le alcanza para contar y no tiene por
 * qué cargar stock ni costos de media bodega para pintar una lista—, y exigir la
 * receta completa la obligaría a traer columnas que no usa.
 */
export interface ProductoParaDiagnostico {
  hasRecipe?: boolean;
  recipeItems?: readonly unknown[];
  modifierGroups?: ReadonlyArray<{
    required: boolean;
    group: { name: string; options: ReadonlyArray<{ name: string; supplies?: readonly unknown[] }> };
  }>;
}

/**
 * Qué le falta, para poder decirlo en la carta.
 *
 * La segunda regla mira **dentro del grupo**: una opción sin insumos no es un
 * error por sí sola —"término medio" no consume nada—, pero convivir con
 * hermanas que sí los tienen delata una carga a medias. Es el único caso que se
 * puede afirmar sin adivinar la intención del dueño.
 */
export function diagnosticarReceta(prod: ProductoParaDiagnostico): FaltanteDeReceta[] {
  const faltantes: FaltanteDeReceta[] = [];

  if (prod.hasRecipe && (prod.recipeItems?.length ?? 0) === 0) {
    faltantes.push({ tipo: "RECETA_VACIA" });
  }

  for (const asignado of prod.modifierGroups ?? []) {
    const opciones = asignado.group.options ?? [];
    const conInsumos = opciones.filter((o) => (o.supplies?.length ?? 0) > 0);
    const sinInsumos = opciones.filter((o) => (o.supplies?.length ?? 0) === 0);

    if (conInsumos.length > 0 && sinInsumos.length > 0) {
      faltantes.push({
        tipo: "OPCIONES_SIN_INSUMOS",
        grupo: asignado.group.name,
        opciones: sinInsumos.map((o) => o.name),
      });
    }
  }

  return faltantes;
}
