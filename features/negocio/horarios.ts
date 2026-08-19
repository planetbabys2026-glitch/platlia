import { TZDate } from "@date-fns/tz";
import { assertTimeZone } from "@/lib/time";

export type ScheduleSettings = {
  timeZone: string;
  scheduleEnabled: boolean;
  scheduleOpeningTime: string;
  scheduleClosingTime: string;
  scheduleStatus: string;
};

export type BusinessOpenResult = {
  abierto: boolean;
  razon?: string;
  scheduleStatus: string;
  horaApertura: string;
  horaCierre: string;
};

export function evaluarEstadoNegocio(
  settings: ScheduleSettings,
  now = new Date(),
): BusinessOpenResult {
  const horaApertura = settings.scheduleOpeningTime || "08:00";
  const horaCierre = settings.scheduleClosingTime || "23:00";
  const status = settings.scheduleStatus || "AUTOMATICO";

  if (status === "ABIERTO") {
    return { abierto: true, scheduleStatus: status, horaApertura, horaCierre };
  }

  if (status === "CERRADO") {
    return {
      abierto: false,
      razon: "El establecimiento se encuentra cerrado en este momento por disposición del personal.",
      scheduleStatus: status,
      horaApertura,
      horaCierre,
    };
  }

  // AUTOMATICO
  if (!settings.scheduleEnabled) {
    return { abierto: true, scheduleStatus: status, horaApertura, horaCierre };
  }

  const timeZone = assertTimeZone(settings.timeZone || "America/Bogota");
  const localNow = new TZDate(now, timeZone);
  const minutosActuales = localNow.getHours() * 60 + localNow.getMinutes();

  const [hA, mA] = horaApertura.split(":").map((v) => parseInt(v, 10) || 0);
  const [hC, mC] = horaCierre.split(":").map((v) => parseInt(v, 10) || 0);

  const minutosApertura = hA * 60 + mA;
  const minutosCierre = hC * 60 + mC;

  let dentroDeHorario = false;
  if (minutosCierre > minutosApertura) {
    // Mismo día (ej: 08:00 a 23:00)
    dentroDeHorario = minutosActuales >= minutosApertura && minutosActuales < minutosCierre;
  } else if (minutosCierre < minutosApertura) {
    // Cruza medianoche (ej: 18:00 a 03:00)
    dentroDeHorario = minutosActuales >= minutosApertura || minutosActuales < minutosCierre;
  } else {
    // Abierto 24 horas si aperturas y cierres coinciden
    dentroDeHorario = true;
  }

  if (!dentroDeHorario) {
    return {
      abierto: false,
      razon: `El establecimiento se encuentra fuera de su horario de atención (${horaApertura} a ${horaCierre}).`,
      scheduleStatus: status,
      horaApertura,
      horaCierre,
    };
  }

  return { abierto: true, scheduleStatus: status, horaApertura, horaCierre };
}
