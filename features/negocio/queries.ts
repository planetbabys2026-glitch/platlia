import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
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

/**
 * Todo lo que necesita el panel de impresión.
 *
 * Incluye las estaciones que existen HOY —salen de `Product.kitchenStation`, que
 * es texto libre y el KDS ya agrupa por ahí—, para que el mapa de rutas ofrezca
 * lo que el negocio de verdad tiene en la carta en vez de pedirle a alguien que
 * escriba el nombre exacto de memoria.
 */
export async function getConfiguracionDeImpresion(businessId: string) {
  const db = tenantDb(businessId);

  const [impresoras, rutas, agentes, productos, pendientes, fallidos] = await Promise.all([
    db.printer.findMany({
      orderBy: [{ rol: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        rol: true,
        host: true,
        port: true,
        width: true,
        abreCajon: true,
        active: true,
      },
    }),
    db.printRoute.findMany({
      select: { stationName: true, printerId: true },
      orderBy: { stationName: "asc" },
    }),
    db.printAgent.findMany({
      orderBy: { createdAt: "asc" },
      // El token NO sale de acá: de la base solo hay hash, y aunque hubiera, esto
      // viaja a un componente cliente.
      select: { id: true, nombre: true, ultimoContactoEn: true, createdAt: true },
    }),
    db.product.findMany({
      where: { deletedAt: null, active: true },
      select: { kitchenStation: true },
    }),
    db.printJob.count({ where: { estado: { in: ["PENDIENTE", "RECLAMADO"] } } }),
    db.printJob.findMany({
      where: { estado: "ERROR" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        tipo: true,
        ultimoError: true,
        updatedAt: true,
        printer: { select: { name: true } },
      },
    }),
  ]);

  // "Sin estación" es el nombre canónico que ya usa `features/cocina/queries.ts`
  // para lo que no la declara: si no estuviera en la lista, esos platos no
  // tendrían a dónde imprimirse y nadie sabría por qué.
  const estaciones = [
    ...new Set([
      ...productos.map((p) => p.kitchenStation?.trim()).filter((e): e is string => Boolean(e)),
      "Sin estación",
    ]),
  ].sort();

  return { impresoras, rutas, agentes, estaciones, pendientes, fallidos };
}

/**
 * Los ejecutables del agente que están disponibles para descargar.
 *
 * Se compilan con `pnpm agente:build` y quedan en `public/descargas/`, que Next
 * sirve como estático. No se versionan —son ~6 MB por sistema— así que en un clon
 * nuevo no están, y el panel tiene que poder decir eso en vez de ofrecer un enlace
 * que devuelve 404: alguien parado en un bar con la PC lista no puede quedarse
 * mirando una página de error sin saber si es culpa suya.
 */
export function getDescargasDelAgente() {
  const carpeta = path.join(process.cwd(), "public", "descargas");

  const archivos = [
    { so: "windows" as const, etiqueta: "Windows", archivo: "platlia-impresion-windows.exe" },
    { so: "linux" as const, etiqueta: "Linux", archivo: "platlia-impresion-linux" },
    { so: "mac" as const, etiqueta: "macOS", archivo: "platlia-impresion-mac" },
  ];

  return archivos.map((a) => ({
    ...a,
    url: `/descargas/${a.archivo}`,
    disponible: existsSync(path.join(carpeta, a.archivo)),
  }));
}
