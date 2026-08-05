import { z } from "zod";

/**
 * Esquemas de autenticación. Los mensajes están en español y escritos para que
 * el dueño de un bar los entienda, no para un desarrollador.
 */

/** El correo se guarda siempre en minúsculas: PostgreSQL distingue mayúsculas y
 *  sin normalizar entrarían dos cuentas para la misma persona. */
const correo = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Escribí un correo válido."));

// Mínimo 8 caracteres y nada más. Las reglas de "una mayúscula y un símbolo"
// empujan a la gente a Bar123! y a anotarla en un papel al lado de la caja.
const contrasena = z
  .string()
  .min(8, "La contraseña necesita al menos 8 caracteres.")
  .max(200, "La contraseña es demasiado larga.");

export const ingresarSchema = z.object({
  email: correo,
  password: z.string().min(1, "Escribí tu contraseña."),
  desde: z.string().optional(),
});

export const registroSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Escribí tu nombre.")
    .max(120, "El nombre es demasiado largo."),
  email: correo,
  password: contrasena,
  nombreNegocio: z
    .string()
    .trim()
    .min(2, "Escribí el nombre de tu negocio.")
    .max(120, "El nombre del negocio es demasiado largo."),
});

export const crearNegocioSchema = registroSchema.pick({ nombreNegocio: true });

export const elegirNegocioSchema = z.object({
  businessId: z.string().min(1, "Elegí un negocio."),
});

export type IngresarInput = z.infer<typeof ingresarSchema>;
export type RegistroInput = z.infer<typeof registroSchema>;
