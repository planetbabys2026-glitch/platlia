import { diasParaElCorte, type PeriodoSuscripcion } from "@/lib/billing/suscripcion";

/**
 * Cuándo avisarle a un negocio que se le acaba la licencia.
 *
 * Hasta acá no se avisaba nunca: el cliente se enteraba cuando dejaba de poder
 * trabajar, en la mitad de un turno. La plantilla de correo estaba escrita hace
 * rato y no la llamaba nadie.
 *
 * Dos avisos, no cinco: uno tres días antes —que es cuando todavía hay margen
 * para hacer algo— y otro el día que el servicio se corta, que explica por qué
 * dejó de funcionar. Más correos que ésos se vuelven ruido y terminan en spam,
 * que es la forma más segura de que el importante tampoco se lea.
 *
 * Módulo puro, con tests.
 */

/** Los días de anticipación con los que se avisa. 0 = el día del corte. */
export const UMBRALES_DE_AVISO = [3, 0] as const;

export type UmbralDeAviso = (typeof UMBRALES_DE_AVISO)[number];

export type AvisoPendiente = {
  umbral: UmbralDeAviso;
  diasRestantes: number;
  /** Lo que se guarda para no repetirlo. */
  clave: string;
};

/**
 * La clave de un aviso: la fecha de corte y el umbral.
 *
 * Lleva la fecha adentro a propósito. Cuando la licencia se renueva, el corte se
 * mueve y la clave cambia sola, así que los avisos del período nuevo vuelven a
 * salir sin que nadie tenga que limpiar una marca. Con un booleano habría que
 * acordarse de apagarlo en cada pago, y el día que alguien se olvide el cliente
 * deja de recibir avisos para siempre sin que nada falle.
 */
export function claveDeAviso(corte: Date, umbral: number): string {
  return `${corte.toISOString()}:${umbral}`;
}

/**
 * Qué aviso corresponde mandar hoy, si es que corresponde alguno.
 *
 * Devuelve null cuando no hay nada que decir: licencia lejos de vencer, o el
 * aviso de este umbral ya salió, o es una suscripción que no avisa.
 */
export function avisoQueCorresponde(
  sub: PeriodoSuscripcion & {
    ultimoAvisoClave: string | null;
    /** Con cobro automático encendido no se avisa: se va a cobrar solo. */
    cobroAutomatico?: string | null;
  },
  ahora: Date = new Date(),
): AvisoPendiente | null {
  // Lo cancelado y lo suspendido no son un vencimiento por llegar: son estados
  // que alguien decidió, y el correo diría algo que no corresponde.
  if (sub.status === "CANCELADA" || sub.status === "SUSPENDIDA") return null;

  // Si el cobro automático está encendido, la licencia se renueva sola. Avisar
  // "te quedan 3 días" a quien ya autorizó el débito es asustarlo sin motivo.
  if (sub.cobroAutomatico) return null;

  const corte = sub.graceUntil ?? sub.currentPeriodEnd ?? sub.trialEndsAt;
  if (!corte) return null;

  const dias = diasParaElCorte(sub, ahora);
  if (dias === null) return null;

  // El umbral que toca es el MÁS CHICO ya alcanzado: faltando 2 días corresponde
  // el de 3, y el día del corte el de 0. Se ordena de menor a mayor antes de
  // buscar —la lista se declara al revés porque así se lee mejor— y así sigue
  // siendo correcto si mañana alguien agrega un umbral de 7.
  const umbral = [...UMBRALES_DE_AVISO].sort((a, b) => a - b).find((u) => dias <= u);
  if (umbral === undefined) return null;

  const clave = claveDeAviso(corte, umbral);
  if (sub.ultimoAvisoClave === clave) return null;

  return { umbral, diasRestantes: dias, clave };
}
