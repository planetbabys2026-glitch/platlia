/**
 * La letra de los títulos del menú QR.
 *
 * Hasta acá un negocio solo podía cambiar el COLOR de su carta —seis temas— y
 * seguía viéndose igual que la de todos, porque lo que hace genérica a una
 * pantalla no es la paleta sino la estructura y la letra. Estas cuatro son
 * deliberadamente distintas entre sí: si dos opciones se parecen, elegir no
 * cambia nada.
 */
export type FuenteMenuQr = "CONDENSADA" | "LIMPIA" | "SERIF" | "MAQUINA";

/** Cómo se ven los platos. Un bar con cuarenta tragos y sin fotos no quiere lo
 *  mismo que un restaurante que fotografió cada plato. */
export type CartaMenuQr = "LISTA" | "REJILLA";

/** El carácter de los bordes. Cambia el tono de la pantalla entera. */
export type BordesMenuQr = "REDONDEADO" | "RECTO";

export type ExtraSettings = {
  scheduleEnabled: boolean;
  scheduleOpeningTime: string;
  scheduleClosingTime: string;
  scheduleStatus: "AUTOMATICO" | "ABIERTO" | "CERRADO";
  deliveryPaused: boolean;
  estimatedPrepTimeText: string;
  qrMenuFuente: FuenteMenuQr;
  qrMenuCarta: CartaMenuQr;
  qrMenuBordes: BordesMenuQr;
};

export const DEFAULT_EXTRA_SETTINGS: ExtraSettings = {
  scheduleEnabled: false,
  scheduleOpeningTime: "08:00",
  scheduleClosingTime: "23:00",
  scheduleStatus: "AUTOMATICO",
  deliveryPaused: false,
  estimatedPrepTimeText: "20-30 min",
  qrMenuFuente: "CONDENSADA",
  qrMenuCarta: "LISTA",
  qrMenuBordes: "REDONDEADO",
};

/** Un valor guardado que ya no está en la lista vuelve al de fábrica en vez de
 *  llegar crudo a la pantalla. */
function unaDe<T extends string>(valor: unknown, validos: readonly T[], porDefecto: T): T {
  return typeof valor === "string" && (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : porDefecto;
}

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
        qrMenuFuente: unaDe(parsed._extra.qrMenuFuente, ["CONDENSADA", "LIMPIA", "SERIF", "MAQUINA"], "CONDENSADA"),
        qrMenuCarta: unaDe(parsed._extra.qrMenuCarta, ["LISTA", "REJILLA"], "LISTA"),
        qrMenuBordes: unaDe(parsed._extra.qrMenuBordes, ["REDONDEADO", "RECTO"], "REDONDEADO"),
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
