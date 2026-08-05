import "server-only";
import { cache } from "react";
import { tenantDb } from "@/lib/db/tenant";

/**
 * Los parámetros de operación de la empresa.
 *
 * Casi toda acción los necesita —si el precio incluye impuesto, a qué múltiplo
 * se redondea el efectivo, si hace falta caja abierta— y son una fila sola, así
 * que se memoiza por request: pedirlos cinco veces en el mismo render cuesta una
 * consulta.
 */
export const getSettings = cache(async (businessId: string) => {
  const settings = await tenantDb(businessId).businessSettings.findFirst();

  if (!settings) {
    // Toda empresa nace con su fila de settings; que falte significa que alguien
    // la creó a mano salteándose el alta.
    throw new Error(
      `El negocio ${businessId} no tiene BusinessSettings. Se crea junto con la empresa.`,
    );
  }

  return settings;
});

/** Los dos parámetros que consume lib/time.ts, con la forma que espera. */
export const getTimeSettings = cache(async (businessId: string) => {
  const { timeZone, businessDayStartMinutes } = await getSettings(businessId);
  return { timeZone, businessDayStartMinutes };
});
