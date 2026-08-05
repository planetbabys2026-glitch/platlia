import { z } from "zod";
import { TableStatus } from "@/generated/prisma/enums";
import { id, textoOpcional } from "@/lib/validaciones";

const nombre = z
  .string()
  .trim()
  .min(1, "Escribí un nombre.")
  .max(60, "El nombre es demasiado largo.");

export const areaSchema = z.object({
  id: id.optional(),
  name: nombre,
  sortOrder: z.preprocess(
    (v) => (v === "" || v === undefined ? 0 : Number(v)),
    z.number().int().min(0).max(999).default(0),
  ),
});

export const mesaSchema = z.object({
  id: id.optional(),
  name: nombre,
  areaId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
  capacity: z.preprocess(
    (v) => (v === "" || v === undefined ? 4 : Number(v)),
    z.number().int().min(1, "La capacidad mínima es 1.").max(50).default(4),
  ),
});

/**
 * Alta en lote: "de la 1 a la 12". Es como se carga un salón de verdad, y evita
 * el error que ya cometimos en el seed —numerar 1..6 en dos áreas distintas—,
 * porque el prefijo hace únicos los nombres.
 */
export const mesasEnLoteSchema = z
  .object({
    areaId: z.preprocess((v) => (v === "" ? undefined : v), id.optional()),
    prefijo: textoOpcional(20),
    desde: z.preprocess((v) => Number(v), z.number().int().min(1).max(998)),
    hasta: z.preprocess((v) => Number(v), z.number().int().min(1).max(999)),
    capacity: z.preprocess(
      (v) => (v === "" || v === undefined ? 4 : Number(v)),
      z.number().int().min(1).max(50).default(4),
    ),
  })
  .refine((v) => v.hasta >= v.desde, {
    error: "El número final tiene que ser mayor o igual al inicial.",
    path: ["hasta"],
  })
  .refine((v) => v.hasta - v.desde < 200, {
    error: "Son demasiadas mesas de una sola vez (máximo 200).",
    path: ["hasta"],
  });

/**
 * Solo los estados que se ponen a mano. OCUPADA y CUENTA_PEDIDA las maneja el
 * flujo de pedidos: ponerlas a dedo dejaría una mesa ocupada sin cuenta.
 */
export const estadoMesaSchema = z.object({
  id,
  status: z.enum([TableStatus.LIBRE, TableStatus.RESERVADA, TableStatus.INACTIVA]),
});

export const archivarSchema = z.object({ id });
