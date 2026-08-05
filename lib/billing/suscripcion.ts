import { addDays, addMonths } from "date-fns";

/**
 * Qué le pasa a la licencia cuando entra un pago, y cuándo se considera vencida.
 *
 * Lógica pura y con tests porque es donde se decide si un negocio puede cobrar
 * mañana. Un error acá no rompe nada visible: simplemente le apaga la caja a
 * alguien que pagó, o le regala meses a alguien que no.
 */

/** Días que el negocio sigue trabajando después de vencer. */
export const DIAS_DE_GRACIA = 3;

/**
 * Los estados posibles, escritos a mano y no importados del cliente generado:
 * este módulo no depende de Prisma para poder probarse solo. Son los mismos
 * valores del enum `SubscriptionStatus`, y el compilador lo verifica en cada
 * `update` que los use.
 */
export type EstadoLicencia = "PRUEBA" | "ACTIVA" | "VENCIDA" | "SUSPENDIDA" | "CANCELADA";

export type PeriodoSuscripcion = {
  status: string;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
};

export type NuevoPeriodo = {
  status: "ACTIVA";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  graceUntil: Date;
};

/**
 * Suma un mes de servicio.
 *
 * Si todavía queda período pagado —o prueba sin usar—, el mes nuevo se encadena
 * al final del anterior: quien paga el día 20 con vencimiento el 30 no puede
 * perder esos diez días. Si ya venció, el mes arranca el día del pago y no en la
 * fecha vieja, o el cliente pagaría por tiempo que no tuvo servicio.
 */
export function aplicarPagoAprobado(
  sub: PeriodoSuscripcion,
  pagadoEn: Date,
  diasDeGracia = DIAS_DE_GRACIA,
): NuevoPeriodo {
  const finVigente = sub.currentPeriodEnd ?? sub.trialEndsAt;
  const desde = finVigente && finVigente > pagadoEn ? finVigente : pagadoEn;

  // addMonths recorta al último día del mes cuando no existe el día equivalente:
  // el 31 de enero más un mes es el 28 de febrero, no el 3 de marzo.
  const hasta = addMonths(desde, 1);

  return {
    status: "ACTIVA",
    currentPeriodStart: desde,
    currentPeriodEnd: hasta,
    graceUntil: addDays(hasta, diasDeGracia),
  };
}

/**
 * El estado que le corresponde a una suscripción según el reloj.
 *
 * Lo usa el cron para poner al día lo que el paso del tiempo cambió. No toca las
 * decisiones tomadas a mano: una suscripción cancelada o suspendida por soporte
 * se queda como está, porque no es un accidente de cobro.
 */
export function estadoSegunFechas(
  sub: PeriodoSuscripcion,
  ahora = new Date(),
): EstadoLicencia {
  if (sub.status === "CANCELADA") return "CANCELADA";
  if (sub.status === "SUSPENDIDA") return "SUSPENDIDA";

  const fin = sub.currentPeriodEnd ?? sub.trialEndsAt;
  if (!fin) return "SUSPENDIDA";

  if (fin > ahora) return sub.status === "PRUEBA" ? "PRUEBA" : "ACTIVA";

  const limite = sub.graceUntil ?? fin;
  // Vencida pero dentro de la gracia: sigue trabajando, con aviso.
  return limite > ahora ? "VENCIDA" : "SUSPENDIDA";
}

/** Días que faltan para que se corte el servicio. Negativo si ya se cortó. */
export function diasParaElCorte(sub: PeriodoSuscripcion, ahora = new Date()): number | null {
  const limite =
    sub.status === "PRUEBA"
      ? (sub.trialEndsAt ?? sub.currentPeriodEnd ?? sub.graceUntil)
      : (sub.graceUntil ?? sub.currentPeriodEnd ?? sub.trialEndsAt);
  if (!limite) return null;
  return Math.ceil((limite.getTime() - ahora.getTime()) / 86_400_000);
}
