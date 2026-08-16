import { assertCop, type Cop } from "@/lib/money";

/**
 * Cuánto cuesta Platlia, en un solo lugar.
 *
 * Antes el precio estaba escrito a mano en seis archivos y ya habían divergido:
 * el schema decía 50.000, el alta de la segunda sede 30.000, el prorrateo tenía su
 * propia matriz de ocho números, la portada calculaba con `* 0.9` y `* 0.8`, y la
 * pantalla de licencia vencida mostraba 50.000 fijo incluso a una sede que paga
 * 30.000. Nadie podía cambiar un precio sin buscarlo por todo el repo.
 *
 * Módulo puro —solo importa el validador de pesos—, así que corre igual en el
 * servidor, en el navegador y en los tests. La lista vive en la base
 * (`ListaDePrecios`) y la edita el superadministrador; acá está únicamente la
 * aritmética.
 */

export type Periodicidad = "MENSUAL" | "SEMESTRAL" | "ANUAL";

/** Cuántos meses de servicio entrega cada opción. */
export const MESES_POR_PERIODICIDAD: Record<Periodicidad, number> = {
  MENSUAL: 1,
  SEMESTRAL: 6,
  ANUAL: 12,
};

/** Cómo se le dice a cada opción en pantalla. */
export const NOMBRE_PERIODICIDAD: Record<Periodicidad, string> = {
  MENSUAL: "1 mes",
  SEMESTRAL: "6 meses",
  ANUAL: "12 meses",
};

export function esPeriodicidad(valor: unknown): valor is Periodicidad {
  return valor === "MENSUAL" || valor === "SEMESTRAL" || valor === "ANUAL";
}

/**
 * Una lista de precios. Sin fechas es la lista base, permanente; con fechas es
 * una promoción que vale solo dentro de su ventana.
 */
export type ListaDePrecios = {
  id: string;
  nombre: string;
  /** Lo que cuesta el primer local. */
  precioSedePrincipalCop: Cop;
  /** Lo que suma cada local adicional. */
  precioSedeAdicionalCop: Cop;
  /** Meses de regalo al comprar 6. */
  mesesGratisSemestral: number;
  /** Meses de regalo al comprar 12. */
  mesesGratisAnual: number;
  desde: Date | null;
  hasta: Date | null;
  activa: boolean;
};

/**
 * La lista base de Colombia, que es la que se siembra en la migración.
 *
 * Está acá y no solo en la base para que un entorno sin sembrar —un test, un
 * clon recién bajado— no se quede sin precio y termine cobrando cero.
 */
export const LISTA_POR_DEFECTO: ListaDePrecios = {
  id: "base",
  nombre: "Lista base",
  precioSedePrincipalCop: 50_000,
  precioSedeAdicionalCop: 30_000,
  mesesGratisSemestral: 1,
  mesesGratisAnual: 2,
  desde: null,
  hasta: null,
  activa: true,
};

/**
 * Cuál lista rige ahora mismo.
 *
 * Gana la promoción vigente más reciente; si no hay ninguna, la lista base. Una
 * promoción sin `hasta` no vence nunca, y una sin `desde` empieza siempre —las
 * dos son válidas, y por eso el borde se compara con `<=` de un lado y `<` del
 * otro: el día que termina la promo ya no es promo.
 */
export function listaVigente(
  listas: readonly ListaDePrecios[],
  ahora: Date = new Date(),
): ListaDePrecios {
  const activas = listas.filter((l) => l.activa);

  const promos = activas
    .filter((l) => l.desde !== null || l.hasta !== null)
    .filter((l) => (l.desde === null || l.desde <= ahora) && (l.hasta === null || l.hasta > ahora))
    // La que arrancó más tarde manda: es la que alguien configuró último.
    .sort((a, b) => (b.desde?.getTime() ?? 0) - (a.desde?.getTime() ?? 0));

  if (promos.length > 0) return promos[0];

  const base = activas.find((l) => l.desde === null && l.hasta === null);
  return base ?? LISTA_POR_DEFECTO;
}

/** Una lista con fechas es una promoción; sin fechas es la lista base. */
export function esPromocion(lista: ListaDePrecios): boolean {
  return lista.desde !== null || lista.hasta !== null;
}

/**
 * Con qué precios se le cobra a ESTA empresa.
 *
 * Cada suscripción guarda su propio `priceCop`, que es el precio que se le
 * respeta aunque la lista suba: el que entró pagando 50.000 sigue pagando 50.000.
 * Pero una promoción es justamente lo contrario —una oferta para todos, por un
 * tiempo—, así que mientras esté vigente le gana al precio congelado.
 *
 * Dicho al revés: el precio propio protege de las **subas**, no de los descuentos.
 */
export function listaParaNegocio(
  lista: ListaDePrecios,
  precioPropioCop: number | null | undefined,
): ListaDePrecios {
  if (esPromocion(lista)) return lista;
  if (typeof precioPropioCop !== "number" || !Number.isInteger(precioPropioCop) || precioPropioCop < 0) {
    return lista;
  }
  return { ...lista, precioSedePrincipalCop: precioPropioCop };
}

export type Cotizacion = {
  periodicidad: Periodicidad;
  sedes: number;
  /** Meses de servicio que recibe. */
  mesesOtorgados: number;
  /** Meses que realmente paga. La diferencia son los de regalo. */
  mesesCobrados: number;
  mesesGratis: number;
  /** Lo que cuesta un mes con esta cantidad de sedes. */
  mensualCop: Cop;
  /** Lo que se cobra de una vez. */
  totalCop: Cop;
  /** A cuánto sale el mes con el descuento aplicado. Para mostrar, no para cobrar. */
  mensualEquivalenteCop: Cop;
  /** Cuánto se ahorra contra pagar mes a mes. */
  ahorroCop: Cop;
};

/**
 * Cuánto se le cobra a alguien por N sedes durante N meses.
 *
 * El descuento no es un porcentaje sino **meses de regalo**: seis meses se pagan
 * cinco y doce se pagan diez. Se eligió así porque es lo único que se explica sin
 * calculadora —"un mes va de regalo"— y porque un porcentaje sobre un precio en
 * pesos enteros deja centavos que después hay que redondear en algún lado.
 */
export function cotizar({
  lista,
  sedes,
  periodicidad,
}: {
  lista: ListaDePrecios;
  sedes: number;
  periodicidad: Periodicidad;
}): Cotizacion {
  if (!Number.isInteger(sedes) || sedes < 1) {
    throw new RangeError(`La cantidad de sedes tiene que ser un entero de 1 o más, llegó ${sedes}.`);
  }

  assertCop(lista.precioSedePrincipalCop, "el precio de la sede principal");
  assertCop(lista.precioSedeAdicionalCop, "el precio de la sede adicional");

  const mensualCop = lista.precioSedePrincipalCop + lista.precioSedeAdicionalCop * (sedes - 1);
  const mesesOtorgados = MESES_POR_PERIODICIDAD[periodicidad];

  const mesesGratisCrudo =
    periodicidad === "SEMESTRAL"
      ? lista.mesesGratisSemestral
      : periodicidad === "ANUAL"
        ? lista.mesesGratisAnual
        : 0;

  // Un regalo más grande que el propio plan dejaría el total en cero o negativo:
  // se recorta acá y no en la pantalla, que es donde nadie lo miraría.
  const mesesGratis = Math.max(0, Math.min(mesesGratisCrudo, mesesOtorgados - 1));
  const mesesCobrados = mesesOtorgados - mesesGratis;

  const totalCop = mensualCop * mesesCobrados;
  const sinDescuentoCop = mensualCop * mesesOtorgados;

  return {
    periodicidad,
    sedes,
    mesesOtorgados,
    mesesCobrados,
    mesesGratis,
    mensualCop,
    totalCop,
    mensualEquivalenteCop: Math.round(totalCop / mesesOtorgados),
    ahorroCop: sinDescuentoCop - totalCop,
  };
}

/** Las tres opciones, para pintar la pantalla de compra de una sola pasada. */
export function cotizarTodas(lista: ListaDePrecios, sedes: number): Cotizacion[] {
  return (["MENSUAL", "SEMESTRAL", "ANUAL"] as const).map((periodicidad) =>
    cotizar({ lista, sedes, periodicidad }),
  );
}

/**
 * Cuántos meses corresponden a un monto, cuando hay que reconstruirlo.
 *
 * Es la red del webhook: si el aviso de MercadoPago llegara sin la cantidad de
 * meses en la metadata, esto la deduce del monto en vez de regalar doce. Devuelve
 * null si el monto no cuadra con ningún plan, y entonces se aplica el mínimo.
 */
export function mesesSegunMonto(montoCop: Cop, mensualCop: Cop, lista: ListaDePrecios): number | null {
  if (mensualCop <= 0) return null;
  for (const periodicidad of ["ANUAL", "SEMESTRAL", "MENSUAL"] as const) {
    const c = cotizar({ lista, sedes: 1, periodicidad });
    // Se compara contra los meses cobrados, no contra el total: `mensualCop` ya
    // trae las sedes que correspondan.
    if (montoCop === mensualCop * c.mesesCobrados) return c.mesesOtorgados;
  }
  return null;
}
