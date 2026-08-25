export type ExtraSettings = {
  scheduleEnabled: boolean;
  scheduleOpeningTime: string;
  scheduleClosingTime: string;
  scheduleStatus: "AUTOMATICO" | "ABIERTO" | "CERRADO";
  deliveryPaused: boolean;
  estimatedPrepTimeText: string;
};

export const DEFAULT_EXTRA_SETTINGS: ExtraSettings = {
  scheduleEnabled: false,
  scheduleOpeningTime: "08:00",
  scheduleClosingTime: "23:00",
  scheduleStatus: "AUTOMATICO",
  deliveryPaused: false,
  estimatedPrepTimeText: "20-30 min",
};

export function parseExtraSettings(rawPermissionsJson?: string | null): ExtraSettings {
  if (!rawPermissionsJson) return DEFAULT_EXTRA_SETTINGS;
  try {
    const parsed = JSON.parse(rawPermissionsJson);
    if (parsed && typeof parsed === "object" && parsed._extra) {
      return {
        scheduleEnabled: Boolean(parsed._extra.scheduleEnabled),
        scheduleOpeningTime: typeof parsed._extra.scheduleOpeningTime === "string" ? parsed._extra.scheduleOpeningTime : "08:00",
        scheduleClosingTime: typeof parsed._extra.scheduleClosingTime === "string" ? parsed._extra.scheduleClosingTime : "23:00",
        scheduleStatus: ["AUTOMATICO", "ABIERTO", "CERRADO"].includes(parsed._extra.scheduleStatus)
          ? (parsed._extra.scheduleStatus as ExtraSettings["scheduleStatus"])
          : "AUTOMATICO",
        deliveryPaused: Boolean(parsed._extra.deliveryPaused),
        estimatedPrepTimeText: typeof parsed._extra.estimatedPrepTimeText === "string" ? parsed._extra.estimatedPrepTimeText : "20-30 min",
      };
    }
  } catch {
    // Error de parseo ignorado, se devuelven valores por defecto
  }
  return DEFAULT_EXTRA_SETTINGS;
}

export function mergeExtraSettings(
  rawPermissionsJson: string | null | undefined,
  newExtra: Partial<ExtraSettings>,
): string {
  let existingObj: Record<string, unknown> = {};
  if (rawPermissionsJson) {
    try {
      existingObj = JSON.parse(rawPermissionsJson);
    } catch {
      existingObj = {};
    }
  }
  const currentExtra = parseExtraSettings(rawPermissionsJson);
  const updatedExtra = { ...currentExtra, ...newExtra };
  existingObj._extra = updatedExtra;
  return JSON.stringify(existingObj);
}
