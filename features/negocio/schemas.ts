import { z } from "zod";
import { ReceiptWidth } from "@/generated/prisma/enums";
import { montoCopPositivo, textoOpcional } from "@/lib/validaciones";

/**
 * Datos y parámetros del negocio.
 *
 * Todo lo que un dueño podría querer distinto vive acá: nada de constantes de
 * negocio en el código. Los valores por defecto son los colombianos.
 */

export const datosNegocioSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre del negocio.").max(120),
  legalName: textoOpcional(160),
  taxId: textoOpcional(40),
  address: textoOpcional(200),
  phone: textoOpcional(40),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.email("Escribí un correo válido.").optional(),
  ),
});

/**
 * La hora de corte se escribe como "05:00" y se guarda en minutos. Pedirle
 * minutos desde medianoche a un dueño de bar sería absurdo.
 */
const horaDeCorte = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return Number.NaN;
    const horas = Number(m[1]);
    const minutos = Number(m[2]);
    if (horas > 23 || minutos > 59) return Number.NaN;
    return horas * 60 + minutos;
  },
  z
    .number({ error: "Escribí la hora como HH:MM, por ejemplo 05:00." })
    .int()
    .min(0)
    .max(1439),
);

/** Un porcentaje escrito como "10" o "8,5" y guardado en puntos básicos. */
const porcentajeEnBp = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
  },
  z
    .number({ error: "Escribí un porcentaje, por ejemplo 10." })
    .int()
    .min(0)
    .max(10_000, "El porcentaje no puede pasar de 100."),
);

const casilla = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const operacionSchema = z.object({
  timeZone: z.string().trim().min(1, "Elegí una zona horaria."),
  businessDayStart: horaDeCorte,
  pricesIncludeTax: casilla,
  tipSuggestionEnabled: casilla,
  tipSuggestionRate: porcentajeEnBp,
  cashRoundingCop: montoCopPositivo,
  requireOpenCashSession: casilla,
  turnNumberMax: z.preprocess(
    (v) => (v === "" || v === undefined ? 99 : Number(v)),
    z.number().int().min(9).max(999),
  ),
  receiptWidth: z.enum(ReceiptWidth),
  receiptHeader: textoOpcional(300),
  receiptFooter: textoOpcional(300),
});

const casillaModulo = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const modulosSchema = z.object({
  mesasHabilitado: casillaModulo,
  deliveryEnabled: casillaModulo,
  deliveryFeeCop: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : v),
    montoCopPositivo,
  ).default(0),
  inventoryEnabled: casillaModulo,
  recipesEnabled: casillaModulo,
});

export const turneroSchema = z.object({
  turneroMediaMode: z.enum(["NONE", "IMAGES", "YOUTUBE"]),
  turneroImages: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : ""),
    z.string(),
  ),
  turneroImageIntervalSeconds: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 10 : Number(v)),
    z.number().int().min(3, "Mínimo 3 segundos.").max(300, "Máximo 300 segundos."),
  ),
  turneroYoutubeUrl: textoOpcional(500),
  turneroBadgePosition: z.enum(["TOP_LEFT", "TOP_RIGHT"]),
});

export const qrMenuSchema = z.object({
  qrMenuEnabled: casilla,
  qrMenuBgMode: z.enum(["SOLID", "GRADIENT", "PATTERN_IMAGE"]),
  qrMenuBgColor: z.string().trim().default("#171512"),
  qrMenuBgGradient: z.string().trim().default("linear-gradient(135deg, #171512 0%, #3A3733 100%)"),
  qrMenuBgImageUrl: textoOpcional(500),
  qrMenuLogoUrl: textoOpcional(500),
  qrMenuHeaderTitle: textoOpcional(120),
  qrMenuHeaderSubtitle: textoOpcional(200),
  // Hex de 6 dígitos y nada más: este valor termina dentro de un `style` en
  // una página pública, así que no puede aceptar texto libre.
  qrMenuAccent: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "El acento tiene que ser un color en formato #RRGGBB")
    .default("#FF4E1F"),
});

export const crearSucursalSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre de la sucursal.").max(120),
  address: textoOpcional(200),
  phone: textoOpcional(40),
});

export const permisosRolesSchema = z.object({
  rolePermissions: z.string().trim().default("{}"),
});

/**
 * El esquema de configuración de Factus se fue con su acción: la cuenta es de la
 * plataforma y el rango de numeración lo asigna el superadministrador desde
 * `/superadmin/facturacion`.
 */
