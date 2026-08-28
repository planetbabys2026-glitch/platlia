import { z } from "zod";
import { finDelDiaEnZona, inicioDelDiaEnZona, ZONA_PLATAFORMA } from "@/lib/time";

/**
 * Esquemas de superadministración.
 *
 * Viven acá y no en actions.ts por una razón dura: en un archivo `"use server"`
 * toda función a nivel de módulo se compila como Server Action, y las flechas de
 * `z.preprocess` lo son. El build falla con "Server Actions must be async
 * functions", que no dice nada de zod.
 */

const correo = z.string().trim().toLowerCase().pipe(z.email("Escribí un correo válido."));

// Más larga que la de un usuario normal: esta cuenta ve todos los negocios.
const contrasenaSuperAdmin = z
  .string()
  .min(12, "Para un superadministrador, mínimo 12 caracteres.");

export const bootstrapSchema = z.object({
  token: z.string().min(1, "Falta el token."),
  name: z.string().trim().min(2, "Escribí el nombre.").max(120),
  email: correo,
  password: contrasenaSuperAdmin,
});

export const ingresoSchema = z.object({
  email: correo,
  password: z.string().min(1, "Escribí la contraseña."),
});

const sobreEmpresa = z.object({ businessId: z.string().min(1) });

const motivo = z
  .string()
  .trim()
  .min(3, "Escribí el motivo.")
  .max(200, "El motivo es demasiado largo.");

export const suspenderSchema = sobreEmpresa.extend({
  suspender: z.preprocess((v) => v === "true" || v === true, z.boolean()),
  motivo,
});

export const extenderSchema = sobreEmpresa.extend({
  dias: z.preprocess((v) => Number(v), z.number().int().min(1).max(365)),
  /**
   * Sacar la cuenta de la prueba sin cobrarle.
   *
   * Extender días no cambia el estado —a propósito: alargar una prueba es
   * alargar una prueba—, así que una cadena en evaluación quedaba encerrada en
   * PRUEBA y la única salida era pagar por MercadoPago. Esto es lo que le
   * permite a soporte convertirla a mano, y por eso pide motivo como todo lo
   * que se hace sobre un cliente.
   */
  activar: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
  motivo,
});

export const agregarSuperAdminSchema = z.object({
  name: z.string().trim().min(2, "Escribí el nombre.").max(120),
  email: correo,
  password: contrasenaSuperAdmin,
});

export const editarSuperAdminSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2, "Escribí el nombre.").max(120),
  email: correo,
});

export const restablecerContrasenaSuperAdminSchema = z.object({
  userId: z.string().min(1),
  password: contrasenaSuperAdmin,
});

export const quitarSuperAdminSchema = z.object({
  userId: z.string().min(1),
});

export const actualizarLimiteSucursalesSchema = sobreEmpresa.extend({
  maxBranches: z.preprocess((v) => Number(v), z.number().int().min(1).max(999)),
  motivo,
});

export const gestionFacturacionElectronicaSchema = sobreEmpresa.extend({
  habilitar: z.preprocess((v) => v === "true" || v === true, z.boolean()),
  sumarDocumentos: z.preprocess((v) => Number(v), z.number().int().min(0).max(100000)),
  /**
   * El rango de numeración que la DIAN le autorizó a ESE NIT. Lo asigna soporte y
   * no el dueño: es un id que nadie se sabe de memoria y un dígito equivocado es
   * una factura rechazada que aparece recién al emitir.
   */
  numberingRangeId: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  /** El de notas crédito, que en Factus es otra resolución distinta. */
  numberingRangeIdNc: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  municipalityCode: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
    z.string().regex(/^\d{5}$/, "El código DANE son cinco dígitos.").nullable(),
  ),
  motivo,
});

/** Una compra de documentos electrónicos a Factus, a nombre de la plataforma. */
export const registrarCompraDocumentosSchema = z.object({
  cantidad: z.preprocess((v) => Number(v), z.number().int().min(1).max(1_000_000)),
  costoCop: z.preprocess((v) => Number(v) || 0, z.number().int().min(0).max(1_000_000_000)),
  nota: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null),
    z.string().max(300).nullable(),
  ),
});

// ─── Precios de la plataforma ────────────────────────────────────────────────

const pesos = (max: number) =>
  z.preprocess((v) => Number(v), z.number().int().min(0).max(max));

/** Meses de regalo: 0 es válido (sin descuento) y más de 11 vaciaría el plan. */
const mesesGratis = z.preprocess((v) => Number(v) || 0, z.number().int().min(0).max(11));

/**
 * Una fecha de un `<input type="date">`, que llega vacía cuando no se puso.
 * Vacía significa "sin límite", no "hoy".
 *
 * `desde` es el arranque de ese día y `hasta` el arranque del siguiente —o sea
 * el día que se escribe cuenta entero—, los dos en la zona de la plataforma.
 * Con `new Date("2026-08-17")` a secas la promoción empezaba a las 7 de la tarde
 * del 16 hora Colombia y moría un día antes de lo prometido: el superadmin
 * escribía "hasta el 31" y el cliente leía "hasta el 30".
 */
function fechaDeFormulario(borde: "inicio" | "fin") {
  return z.preprocess((v) => {
    if (typeof v !== "string" || v.trim() === "") return null;
    const dia = new Date(v);
    if (Number.isNaN(dia.getTime())) return null;
    return borde === "inicio"
      ? inicioDelDiaEnZona(dia, ZONA_PLATAFORMA)
      : finDelDiaEnZona(dia, ZONA_PLATAFORMA);
  }, z.date().nullable());
}

/**
 * Los escalones por cantidad de sedes, que viajan como JSON en un campo oculto.
 *
 * Son una lista de largo variable y un `<form>` no tiene forma natural de
 * mandarla; serializarla en un campo evita inventar nombres tipo `tramo[0][x]`
 * que después hay que volver a parsear a mano.
 */
const tramos = z.preprocess(
  (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v !== "string" || v.trim() === "") return [];
    try {
      const parseado = JSON.parse(v);
      return Array.isArray(parseado) ? parseado : [];
    } catch {
      return [];
    }
  },
  z
    .array(
      z.object({
        desdeSedes: z.coerce.number().int().min(1, "El tramo arranca en 1 sede o más.").max(999),
        precioMensualCop: pesos(100_000_000),
      }),
    )
    .max(20, "Veinte tramos son demasiados: el precio dejaría de explicarse solo.")
    .refine(
      (lista) => new Set(lista.map((t) => t.desdeSedes)).size === lista.length,
      "Hay dos tramos que arrancan en la misma cantidad de sedes.",
    ),
);

export const guardarListaBaseSchema = z.object({
  precioSedePrincipalCop: pesos(10_000_000),
  precioSedeAdicionalCop: pesos(10_000_000),
  mesesGratisSemestral: mesesGratis,
  mesesGratisAnual: mesesGratis,
  tramos,
  motivo,
});

/** Apagar o borrar una promoción. Alcanza con saber cuál y por qué. */
export const sobrePromocionSchema = z.object({
  id: z.string().trim().min(1),
  motivo,
});

export const guardarPromocionSchema = z.object({
  /** Vacío = promoción nueva. */
  id: z.string().trim().optional(),
  nombre: z.string().trim().min(3, "Ponele un nombre a la promoción.").max(80),
  precioSedePrincipalCop: pesos(10_000_000),
  precioSedeAdicionalCop: pesos(10_000_000),
  mesesGratisSemestral: mesesGratis,
  mesesGratisAnual: mesesGratis,
  tramos,
  desde: fechaDeFormulario("inicio"),
  hasta: fechaDeFormulario("fin"),
  activa: z.preprocess((v) => v === "true" || v === true || v === "on", z.boolean()),
  motivo,
});

/** El precio pactado con UNA empresa, que es lo que se le respeta al renovar. */
