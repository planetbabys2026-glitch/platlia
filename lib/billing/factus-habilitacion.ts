/**
 * Quién puede emitir factura electrónica, y qué le falta al que no puede.
 *
 * La facturación electrónica no es de todas las empresas: la mayoría de los bares
 * factura con tiquete y punto. Habilitarla son tres cosas que pasan en lugares
 * distintos —el superadministrador la prende y vende el paquete de documentos, el
 * dueño carga las credenciales de Factus y su rango de numeración de la DIAN, y el
 * paquete se va gastando— y ninguna de las tres, sola, alcanza.
 *
 * Por eso hay UN solo predicado y todo el producto lo consulta: el cobro decide
 * con él si muestra los campos fiscales, y Configuración muestra con él qué falta.
 * Si cada pantalla lo dedujera por su cuenta, tarde o temprano una ofrecería
 * facturar en un negocio que no puede y el cajero se quedaría explicándole a un
 * cliente por qué no le llega la factura.
 *
 * Módulo puro: sin `server-only` para que tenga tests, pero recibe la
 * configuración por parámetro y nunca lee la base.
 *
 * Vive al lado de `lib/billing/factus.ts` —el mapeador y el cliente HTTP— y no en
 * `features/facturacion/`, que a pesar del nombre es la suscripción a Platlia
 * cobrada por MercadoPago, no la factura al comensal.
 */

/**
 * Lo que la DIAN espera cuando la venta no se le factura a nadie en particular.
 * Es el caso normal en un bar: el cliente paga y se va sin dar la cédula.
 */
export const CONSUMIDOR_FINAL = {
  documento: "222222222222",
  nombre: "Consumidor Final",
  /** "13" = cédula de ciudadanía, que es con lo que la DIAN espera este caso. */
  codigoDocumento: "13",
} as const;

/**
 * Los tipos de documento que `mapearDocumentoDian` sabe traducir. La UI ofrece
 * exactamente estos y no un texto libre: un "C.C." escrito a mano cae en el
 * `default` del mapeador y se factura como cédula sin que nadie se entere.
 */
export const TIPOS_DE_DOCUMENTO = [
  { valor: "CC", etiqueta: "Cédula de ciudadanía" },
  { valor: "NIT", etiqueta: "NIT" },
  { valor: "CE", etiqueta: "Cédula de extranjería" },
  { valor: "PASAPORTE", etiqueta: "Pasaporte" },
] as const;

export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number]["valor"];

/** El subconjunto de BusinessSettings que decide si se puede facturar. */
export type ConfigFiscal = {
  facturacionElectronicaHabilitada: boolean;
  paquetesDocumentosDisponibles: number;
  documentosEmitidosConsumidos: number;
  factusClientId: string | null;
  factusClientSecret: string | null;
  factusUsername: string | null;
  factusPassword: string | null;
  factusNumberingRangeId: number | null;
  municipalityCode: string | null;
};

/** Documentos que le quedan al negocio. Nunca negativo. */
export function documentosRestantes(config: ConfigFiscal): number {
  const restantes =
    (config.paquetesDocumentosDisponibles ?? 0) - (config.documentosEmitidosConsumidos ?? 0);
  return Math.max(0, restantes);
}

function vacio(valor: string | null | undefined): boolean {
  return !valor || valor.trim() === "";
}

/**
 * Qué le falta al negocio para poder facturar, en el orden en que hay que
 * resolverlo. Lista vacía = está listo.
 *
 * Devuelve texto para mostrar y no códigos: el único lector es la pantalla de
 * Configuración, y lo que necesita el dueño es saber qué campo llenar, no un
 * enum que después haya que traducir en dos lugares.
 */
export function faltantesParaFacturar(config: ConfigFiscal): string[] {
  if (!config.facturacionElectronicaHabilitada) {
    return ["La facturación electrónica no está habilitada para este negocio."];
  }

  const faltantes: string[] = [];

  if (vacio(config.factusClientId)) faltantes.push("Falta el Client ID de Factus.");
  if (vacio(config.factusClientSecret)) faltantes.push("Falta el Client Secret de Factus.");
  if (vacio(config.factusUsername)) faltantes.push("Falta el usuario de Factus.");
  if (vacio(config.factusPassword)) faltantes.push("Falta la contraseña de Factus.");

  if (!config.factusNumberingRangeId) {
    faltantes.push("Falta el ID del rango de numeración autorizado por la DIAN.");
  }
  if (vacio(config.municipalityCode)) {
    faltantes.push("Falta el código DANE del municipio.");
  }

  if (documentosRestantes(config) === 0) {
    faltantes.push("No quedan documentos disponibles en el paquete.");
  }

  return faltantes;
}

/**
 * El interruptor. Lo consultan el cobro de caja y el del POS para decidir si
 * piden los datos del cliente.
 */
export function puedeFacturarElectronicamente(config: ConfigFiscal): boolean {
  return faltantesParaFacturar(config).length === 0;
}

/**
 * Si la venta va a consumidor final. Sin número de documento no hay a quién
 * facturar, y el nombre de la cuenta —"Andrés", "Cuenta 2"— no es un nombre
 * fiscal: es la etiqueta con la que se identifica quién pidió.
 */
export function esConsumidorFinal(pedido: { docNumber?: string | null }): boolean {
  return vacio(pedido.docNumber);
}
