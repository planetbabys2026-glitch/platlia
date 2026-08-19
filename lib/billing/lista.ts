import "server-only";
import { cache } from "react";
import { rootDb } from "@/lib/db/root";
import {
  esPromocion,
  listaBaseDe,
  listaVigente,
  type ListaDePrecios,
} from "@/lib/billing/precios";

/**
 * Los precios que rigen ahora, leídos de la base.
 *
 * Separado de `precios.ts` para que ese módulo siga siendo puro y con tests: acá
 * está lo único que necesita servidor —la consulta— y allá toda la aritmética.
 *
 * Devuelve la vigente **y** la base porque las pantallas del cliente necesitan
 * las dos: con una sola, una promoción se ve igual que una tarifa normal y nadie
 * entiende por qué bajó el precio ni que se termina.
 *
 * `cache()` de React: una pantalla que muestre las tres opciones para una y dos
 * sedes no tiene por qué leer la tabla seis veces en el mismo request.
 */
export const preciosVigentes = cache(
  async (
    ahora: Date = new Date(),
  ): Promise<{
    vigente: ListaDePrecios;
    base: ListaDePrecios;
    /** La promoción que está corriendo, o null si rige la lista de siempre. */
    promo: ListaDePrecios | null;
  }> => {
    const filas = await rootDb.listaDePrecios.findMany({
      where: { activa: true },
      // Los tramos vienen con la lista y no aparte: `cotizar` los necesita para
      // saber el precio de tres sedes en adelante, y una lista a medio traer
      // cotizaría con la fórmula sin que nada falle.
      include: { tramos: { orderBy: { desdeSedes: "asc" } } },
    });

    const vigente = listaVigente(filas, ahora);

    return {
      vigente,
      base: listaBaseDe(filas),
      promo: esPromocion(vigente) ? vigente : null,
    };
  },
);

/** Solo la lista que rige. La usan las pantallas a las que no les importa por qué. */
export async function listaVigenteDeLaBase(ahora?: Date): Promise<ListaDePrecios> {
  // Se llama sin argumento cuando no hay fecha: `cache()` indexa por los
  // argumentos recibidos, así que pasarle un `undefined` explícito abriría una
  // segunda entrada y volvería a consultar la tabla en el mismo request.
  const { vigente } = ahora ? await preciosVigentes(ahora) : await preciosVigentes();
  return vigente;
}
