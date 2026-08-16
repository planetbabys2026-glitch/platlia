import "server-only";
import { cache } from "react";
import { rootDb } from "@/lib/db/root";
import { listaVigente, type ListaDePrecios } from "@/lib/billing/precios";

/**
 * La lista de precios que rige ahora, leída de la base.
 *
 * Separada de `precios.ts` para que ese módulo siga siendo puro y con tests: acá
 * está lo único que necesita servidor —la consulta— y allá toda la aritmética.
 *
 * `cache()` de React: una pantalla que muestre las tres opciones para una y dos
 * sedes no tiene por qué leer la tabla seis veces en el mismo request.
 */
export const listaVigenteDeLaBase = cache(async (ahora: Date = new Date()): Promise<ListaDePrecios> => {
  const filas = await rootDb.listaDePrecios.findMany({ where: { activa: true } });
  return listaVigente(filas, ahora);
});
