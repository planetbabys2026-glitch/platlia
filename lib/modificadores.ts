/**
 * Reglas puras de los modificadores de producto.
 *
 * Sin `server-only` y sin un solo import del proyecto, por la misma razón que
 * lib/auth/reglas.ts: las usa el modal de venta en el navegador —para habilitar
 * el botón "Agregar" y pintar el total en vivo— y las vuelve a usar la Server
 * Action como autoridad. El cliente valida para que la interfaz no mienta; el
 * servidor valida porque las Server Actions son alcanzables por POST directo.
 *
 * La forma del grupo la deciden `minSelect` y `maxSelect`, no un campo "tipo":
 * (1,1) es "elegí uno", (0,1) es "elegí uno o ninguno", (0,N) es "las que
 * quieras". Un campo aparte sería un tercer estado que puede contradecir a los
 * dos números.
 */

export interface OpcionModificador {
  id: string;
  name: string;
  priceDeltaCop: number;
  /** Viene marcada al abrir el modal. */
  isDefault?: boolean;
}

export interface GrupoModificador {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  /** Override del producto: el mismo grupo puede ser obligatorio en un plato y opcional en otro. */
  required: boolean;
  options: OpcionModificador[];
}

/**
 * Cuántas opciones exige de verdad este grupo.
 *
 * `required` y `minSelect` dicen lo mismo desde dos lados y pueden contradecirse:
 * un grupo marcado como opcional en el producto no puede exigir 1 aunque su
 * `minSelect` lo diga. Manda el producto, que es la decisión más específica.
 */
export function minimoEfectivo(grupo: GrupoModificador): number {
  if (!grupo.required) return 0;
  return Math.max(0, grupo.minSelect);
}

/**
 * Verifica una selección contra los grupos del producto.
 *
 * Devuelve el mensaje en español listo para mostrar, o `null` si está completa.
 * Un solo mensaje, no una lista: el modal resalta el primer grupo incompleto y
 * pedirle a alguien que corrija cuatro cosas a la vez no ayuda a nadie.
 */
export function validarSeleccion(
  grupos: GrupoModificador[],
  opcionIdsElegidas: string[],
): string | null {
  const elegidas = new Set(opcionIdsElegidas);

  // Una opción que no pertenece a ningún grupo del producto es un intento de
  // pegarle un modificador ajeno al plato, no un descuido de la interfaz.
  const idsValidos = new Set(grupos.flatMap((g) => g.options.map((o) => o.id)));
  for (const elegida of elegidas) {
    if (!idsValidos.has(elegida)) {
      return "Alguna de las opciones elegidas ya no está disponible. Volvé a elegirlas.";
    }
  }

  for (const grupo of grupos) {
    const cuantas = grupo.options.filter((o) => elegidas.has(o.id)).length;
    const minimo = minimoEfectivo(grupo);
    const maximo = Math.max(minimo, grupo.maxSelect);

    if (cuantas < minimo) {
      return minimo === 1
        ? `Elegí una opción de "${grupo.name}".`
        : `Elegí al menos ${minimo} opciones de "${grupo.name}".`;
    }

    if (cuantas > maximo) {
      return maximo === 1
        ? `En "${grupo.name}" se elige una sola opción.`
        : `En "${grupo.name}" se eligen máximo ${maximo} opciones.`;
    }
  }

  return null;
}

/** Cuánto suman al precio del renglón las opciones elegidas, en pesos enteros. */
export function calcularRecargoCop(
  grupos: GrupoModificador[],
  opcionIdsElegidas: string[],
): number {
  const elegidas = new Set(opcionIdsElegidas);
  let total = 0;
  for (const grupo of grupos) {
    for (const opcion of grupo.options) {
      if (elegidas.has(opcion.id)) total += opcion.priceDeltaCop;
    }
  }
  return total;
}

/**
 * La identidad de un renglón del carrito.
 *
 * Dos "Menú del día" con proteína distinta son dos renglones, no uno de a dos.
 * El carrito del POS y el del menú QR se indexan por esto en vez de por
 * `productId`, que es lo que hacían cuando un producto solo podía ser una cosa.
 *
 * Ordena los ids para que elegir "pollo, sin cebolla" y "sin cebolla, pollo"
 * caiga en el mismo renglón: el orden en que se tocaron los botones no es
 * información.
 */
export function claveDeLinea(productId: string, opcionIdsElegidas: string[]): string {
  if (opcionIdsElegidas.length === 0) return productId;
  return `${productId}::${[...new Set(opcionIdsElegidas)].sort().join("|")}`;
}

/**
 * Las opciones que vienen marcadas al abrir el modal.
 *
 * Solo las `isDefault` que quepan en el `maxSelect` del grupo: un grupo mal
 * cargado con tres opciones por defecto y `maxSelect: 1` abriría el modal ya
 * inválido, y el mesero tendría que adivinar qué destildar.
 */
export function seleccionInicial(grupos: GrupoModificador[]): string[] {
  const elegidas: string[] = [];
  for (const grupo of grupos) {
    const porDefecto = grupo.options.filter((o) => o.isDefault);
    elegidas.push(...porDefecto.slice(0, Math.max(0, grupo.maxSelect)).map((o) => o.id));
  }
  return elegidas;
}

/**
 * Aplica un toque sobre una opción y devuelve la selección resultante.
 *
 * Vive acá y no en el componente porque es la regla que hace que un grupo de
 * `maxSelect: 1` se comporte como botón excluyente: tocar "Carne" con "Pollo"
 * ya elegido reemplaza en vez de sumar. Es la diferencia entre un modal que se
 * siente bien y uno donde hay que destildar antes de tildar.
 */
export function alternarOpcion(
  grupo: GrupoModificador,
  opcionIdsElegidas: string[],
  opcionId: string,
): string[] {
  const idsDelGrupo = new Set(grupo.options.map((o) => o.id));
  const yaEstaba = opcionIdsElegidas.includes(opcionId);

  if (grupo.maxSelect <= 1) {
    const sinEsteGrupo = opcionIdsElegidas.filter((id) => !idsDelGrupo.has(id));
    // Volver a tocar la que ya estaba la saca, pero solo si el grupo es opcional:
    // en uno obligatorio dejaría el renglón sin elegir y sin forma de avanzar.
    if (yaEstaba && minimoEfectivo(grupo) === 0) return sinEsteGrupo;
    return [...sinEsteGrupo, opcionId];
  }

  if (yaEstaba) return opcionIdsElegidas.filter((id) => id !== opcionId);

  const cuantasDelGrupo = opcionIdsElegidas.filter((id) => idsDelGrupo.has(id)).length;
  if (cuantasDelGrupo >= grupo.maxSelect) return opcionIdsElegidas;

  return [...opcionIdsElegidas, opcionId];
}
