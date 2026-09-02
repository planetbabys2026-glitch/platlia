import { z } from "zod";
import { CashAccount, CashMovementType } from "@/generated/prisma/enums";
import { id, montoCop, montoCopOCero, montoCopPositivo, textoOpcional } from "@/lib/validaciones";

export const abrirCajaSchema = z.object({
  /** En qué caja física está parada la persona. */
  cashRegisterId: id,
  /** La base con la que arranca el turno: lo que hay en el cajón para dar vuelto. */
  openingFloatCop: montoCopPositivo,
  /**
   * Lo que hay en la cuenta del banco al empezar. Sin esto, el saldo bancario del
   * cierre arranca en cero y todo lo cobrado por datáfono aparece como sobrante.
   *
   * Vacío vale cero: el negocio que no cuadra su cuenta deja el campo en blanco, y
   * exigirlo hacía fallar la apertura entera con "Escribí un monto en pesos" sin
   * decir de qué campo hablaba.
   */
  openingBankCop: montoCopOCero,
});

export const cerrarCajaSchema = z.object({
  /** Lo que la persona contó de verdad en el cajón. */
  countedCashCop: montoCopPositivo,
  /** Lo que dice la cuenta del banco. */
  countedBankCop: montoCopPositivo,
  notes: textoOpcional(500),
});

export const movimientoSchema = z.object({
  type: z.enum(CashMovementType),
  /** De dónde sale o entra: el cajón o el banco. */
  account: z.enum(CashAccount).default(CashAccount.EFECTIVO),
  // El ajuste puede ser negativo (faltante); el resto son magnitudes positivas y
  // el signo lo pone el tipo de movimiento.
  amountCop: montoCop,
  concept: z
    .string()
    .trim()
    .min(3, "Escribí para qué fue.")
    .max(200, "El concepto es demasiado largo."),
  /**
   * La clave de salidas. Va vacía en las entradas; la acción la exige solo cuando
   * el movimiento saca plata, y la verifica ella —no la pantalla—, porque una
   * Server Action es un POST alcanzable con curl.
   */
  clave: textoOpcional(72),
});

/** Alta y edición de una caja física. */
export const cajaSchema = z.object({
  id: id.optional(),
  name: z
    .string()
    .trim()
    .min(1, "Escribí un nombre.")
    .max(40, "El nombre es demasiado largo."),
  sortOrder: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : Number(v)),
    z.number().int().min(0).max(999).default(0),
  ),
  active: z.preprocess((v) => v === "true" || v === true || v === "on", z.boolean()).default(true),
});

export const archivarCajaSchema = z.object({ id });

/**
 * La clave de salidas de dinero.
 *
 * `claveActual` solo hace falta cuando ya hay una puesta: cambiarla sin conocer la
 * vigente convertiría un descuido —una sesión abierta en el celular del dueño— en
 * la llave de la plata del negocio.
 *
 * Seis dígitos o más, sin tope de forma: se teclea en el mostrador varias veces
 * por noche, así que exigirle mayúsculas y símbolos garantiza que termine escrita
 * en un papel pegado a la caja, que es peor que una clave simple.
 */
export const claveGastosSchema = z.object({
  claveActual: textoOpcional(72),
  clave: z
    .string()
    .trim()
    .min(6, "La clave tiene que tener al menos 6 caracteres.")
    .max(72, "La clave es demasiado larga."),
  claveRepetida: z.string().trim().min(1, "Repetí la clave."),
}).refine((v) => v.clave === v.claveRepetida, {
  error: "Las dos claves no coinciden.",
  path: ["claveRepetida"],
});

export const quitarClaveGastosSchema = z.object({
  claveActual: z.string().trim().min(1, "Escribí la clave actual."),
});
