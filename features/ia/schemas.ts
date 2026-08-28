import { z } from "zod";
import { id } from "@/lib/validaciones";

export const crearTokenIaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "Ponele un nombre para saber cuál es después.")
    .max(60),
});

export const revocarTokenIaSchema = z.object({ tokenId: id });
