import { z } from "zod";

/**
 * Aparte del archivo de acciones: en un `"use server"` toda función a nivel de
 * módulo se compila como Server Action y el build falla con "Server Actions must
 * be async functions", sin mencionar a zod por ningún lado.
 */
export const autorizarSchema = z.object({
  businessId: z.string().min(1),
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(20),
  state: z.string().optional(),
});
