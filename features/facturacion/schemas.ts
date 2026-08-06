import { z } from "zod";

export const solicitarSedeAdicionalSchema = z.object({
  cantidadSedes: z.preprocess((v) => Number(v) || 2, z.number().int().min(2)),
  periodoMeses: z.preprocess((v) => Number(v) || 1, z.number().int().min(1)),
  observaciones: z.string().trim().optional(),
});
