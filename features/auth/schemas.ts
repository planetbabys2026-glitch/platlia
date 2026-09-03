import { z } from "zod";
import { contrasenaFuerte as contrasena, correo } from "@/lib/validaciones";

/**
 * Esquemas de autenticación. Los mensajes están en español y escritos para que
 * el dueño de un bar los entienda, no para un desarrollador.
 *
 * El correo y la contraseña salen de `lib/validaciones.ts`: estaban duplicados
 * acá y en `features/equipo/schemas.ts`, y una regla de identidad escrita dos
 * veces es una que se endurece en un lado y se olvida en el otro.
 *
 * Sobre la contraseña: `contrasenaFuerte` exige composición (mayúscula,
 * minúscula, número, símbolo) y un mínimo de 10. Acá antes se pedían 8
 * caracteres y nada más, con este argumento —que sigue siendo cierto y conviene
 * no perder—: las reglas de composición empujan a `Bar123!` y a anotarla en un
 * papel al lado de la caja, y la guía vigente del NIST (SP 800-63B)
 * desaconseja exigirlas. La decisión del producto fue pedirlas igual; el
 * mínimo subió a 10 para que la exigencia sirva de algo, porque `Bar123!`
 * cumple las cuatro clases y son ocho caracteres. El detalle está en
 * `lib/auth/reglas-contrasena.ts`.
 */

export const ingresarSchema = z.object({
  email: correo,
  // A propósito `min(1)` y no `contrasenaFuerte`: acá la contraseña se verifica
  // contra un hash que ya existe. Aplicarle la política nueva dejaría afuera, de
  // un día para el otro, a todos los que se registraron con la anterior.
  password: z.string().min(1, "Escribí tu contraseña."),
  desde: z.string().optional(),
});

// Objeto base, sin el .refine() de abajo: crearNegocioSchema necesita .pick(),
// que solo existe en un ZodObject y no en el ZodEffects que devuelve .refine().
const registroBase = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Escribí tu nombre.")
    .max(120, "El nombre es demasiado largo."),
  email: correo,
  password: contrasena,
  confirmarPassword: z.string(),
  nombreNegocio: z
    .string()
    .trim()
    .min(2, "Escribí el nombre de tu negocio.")
    .max(120, "El nombre del negocio es demasiado largo."),
});

export const registroSchema = registroBase.refine(
  (v) => v.password === v.confirmarPassword,
  { error: "Las contraseñas no coinciden.", path: ["confirmarPassword"] },
);

export const crearNegocioSchema = registroBase.pick({ nombreNegocio: true });

export const solicitarRecuperacionSchema = z.object({
  email: correo,
});

// Mismo motivo que registroBase: .pick()/.extend() necesitan un ZodObject.
const restablecerBase = z.object({
  token: z.string().min(1, "Ese enlace no es válido."),
  password: contrasena,
  confirmarPassword: z.string(),
});

export const restablecerPasswordSchema = restablecerBase.refine(
  (v) => v.password === v.confirmarPassword,
  { error: "Las contraseñas no coinciden.", path: ["confirmarPassword"] },
);

export const elegirNegocioSchema = z.object({
  businessId: z.string().min(1, "Elegí un negocio."),
});

export type IngresarInput = z.infer<typeof ingresarSchema>;
export type RegistroInput = z.infer<typeof registroSchema>;
