import { z } from "zod";

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
  motivo,
});

// ─── Precios de la plataforma ────────────────────────────────────────────────

const pesos = (max: number) =>
  z.preprocess((v) => Number(v), z.number().int().min(0).max(max));

/** Meses de regalo: 0 es válido (sin descuento) y más de 11 vaciaría el plan. */
const mesesGratis = z.preprocess((v) => Number(v) || 0, z.number().int().min(0).max(11));

/**
 * Una fecha de un `<input type="date">`, que llega vacía cuando no se puso.
 * Vacía significa "sin límite", no "hoy".
 */
const fechaOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() !== "" ? new Date(v) : null),
  z.date().nullable(),
);

export const guardarListaBaseSchema = z.object({
  precioSedePrincipalCop: pesos(10_000_000),
  precioSedeAdicionalCop: pesos(10_000_000),
  mesesGratisSemestral: mesesGratis,
  mesesGratisAnual: mesesGratis,
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
  desde: fechaOpcional,
  hasta: fechaOpcional,
  activa: z.preprocess((v) => v === "true" || v === true || v === "on", z.boolean()),
  motivo,
});

/** El precio pactado con UNA empresa, que es lo que se le respeta al renovar. */
export const cambiarPrecioEmpresaSchema = sobreEmpresa.extend({
  priceCop: pesos(10_000_000),
  motivo,
});
