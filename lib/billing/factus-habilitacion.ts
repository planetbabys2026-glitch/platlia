/**
 * Quién puede emitir factura electrónica, y qué le falta al que no puede.
 *
 * La facturación electrónica no es de todas las empresas: la mayoría de los bares
 * factura con tiquete y punto. Habilitarla son cuatro cosas que pasan en lugares
 * distintos —la plataforma tiene su cuenta de Factus configurada, el
 * superadministrador prende el módulo del negocio, le asigna documentos de la
 * bolsa y le carga el rango de numeración que la DIAN le autorizó a ese NIT— y
 * ninguna, sola, alcanza.
 *
 * Las credenciales de Factus NO son de cada negocio: la cuenta es una sola, de
 * Platlia, y vive en el entorno. Por eso este predicado recibe aparte si la
 * plataforma está configurada, en vez de buscarle credenciales a la empresa.
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
export function faltantesParaFacturar(
  config: ConfigFiscal,
  /**
   * Si la cuenta de Factus de la plataforma está configurada. Se pasa por
   * parámetro y no se lee del entorno acá para que el módulo siga siendo puro:
   * en el servidor sale de `plataformaFacturaConfigurada()`.
   */
  plataformaConfigurada: boolean,
): string[] {
  if (!config.facturacionElectronicaHabilitada) {
    return ["La facturación electrónica no está habilitada para este negocio."];
  }

  const faltantes: string[] = [];

  // Esto no lo arregla el negocio: es la cuenta de Factus de Platlia.
  if (!plataformaConfigurada) {
    faltantes.push("La conexión con Factus no está configurada en la plataforma.");
  }

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
 * piden los datos del cliente, y el emisor antes de salir a la API.
 */
export function puedeFacturarElectronicamente(
  config: ConfigFiscal,
  plataformaConfigurada: boolean,
): boolean {
  return faltantesParaFacturar(config, plataformaConfigurada).length === 0;
}

/**
 * Si la venta va a consumidor final. Sin número de documento no hay a quién
 * facturar, y el nombre de la cuenta —"Andrés", "Cuenta 2"— no es un nombre
 * fiscal: es la etiqueta con la que se identifica quién pidió.
 */
export function esConsumidorFinal(pedido: { docNumber?: string | null }): boolean {
  return vacio(pedido.docNumber);
}
