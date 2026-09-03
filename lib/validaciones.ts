import { z } from "zod";
import {
  contrasenaEsValida,
  LARGO_MAXIMO,
  LARGO_MINIMO_SUPERADMIN,
  mensajeDeContrasena,
} from "@/lib/auth/reglas-contrasena";
import { parseCop } from "@/lib/money";

/**
 * Piezas de validación que se repiten en todo el producto.
 *
 * La más importante es `montoCop`: un formulario manda texto, y en Colombia la
 * gente escribe "18.900" o "$ 18.900". Si cada acción lo parseara por su cuenta,
 * alguna terminaría haciendo `Number("18.900")` y guardando 18 pesos con nueve
 * décimas en una columna de enteros.
 */

/** Un monto en pesos enteros, escrito como lo escribe una persona. */
export const montoCop = z.preprocess(
  (v) => (typeof v === "string" ? (parseCop(v) ?? Number.NaN) : v),
  z
    .number({ error: "Escribí un monto en pesos." })
    .int("El monto va en pesos enteros, sin centavos."),
);

/** Un monto que no puede ser negativo: una base de caja, un pago, un precio. */
export const montoCopPositivo = z.preprocess(
  (v) => (typeof v === "string" ? (parseCop(v) ?? Number.NaN) : v),
  z
    .number({ error: "Escribí un monto en pesos." })
    .int("El monto va en pesos enteros, sin centavos.")
    .min(0, "El monto no puede ser negativo."),
);

/**
 * Un monto que puede venir vacío, y entonces vale cero.
 *
 * Un campo de plata opcional —la base en bancos de quien no la cuadra— llega
 * como `""` desde el formulario, y `montoCopPositivo` lo rechaza con "Escribí un
 * monto en pesos": el formulario entero falla por un campo que la pantalla
 * presenta como opcional, y el mensaje ni siquiera dice cuál era. Pasó con la
 * apertura de caja, y el síntoma —"no se puede abrir el turno"— no se parece en
 * nada a la causa.
 */
export const montoCopOCero = z.preprocess(
  (v) => {
    if (v === "" || v === undefined || v === null) return 0;
    return typeof v === "string" ? (parseCop(v) ?? Number.NaN) : v;
  },
  z
    .number({ error: "Escribí un monto en pesos." })
    .int("El monto va en pesos enteros, sin centavos.")
    .min(0, "El monto no puede ser negativo."),
);

/** Cantidad de unidades de un renglón del pedido. */
export const cantidad = z.preprocess(
  (v) => (typeof v === "string" ? Number.parseInt(v, 10) : v),
  z
    .number({ error: "Escribí una cantidad." })
    .int("La cantidad va en unidades enteras.")
    .min(1, "La cantidad mínima es 1.")
    .max(999, "Esa cantidad es demasiado alta."),
);

/** Texto libre corto y opcional: una nota, un concepto, un motivo. */
export function textoOpcional(max: number) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, `No puede pasar de ${max} caracteres.`).optional(),
  );
}

/** Un correo opcional: el campo vacío de un formulario no es un correo inválido. */
export const correoOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.email("Escribí un correo válido.").max(160).optional(),
);

/**
 * Una casilla de formulario: llega "on" cuando está marcada y no llega cuando no.
 *
 * Un `z.boolean()` pelado la rechaza siempre, porque nunca recibe un booleano de
 * verdad. Está acá y no repetida en cada feature porque el error se ve igual en
 * todas: la casilla parece no guardarse nunca.
 */
export const casilla = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean(),
);

/** Un identificador que vino de un formulario. */
export const id = z.string().min(1, "Falta el identificador.").max(64);

/**
 * Una lista de identificadores que llegó como campos repetidos del formulario.
 *
 * `desdeFormData` (lib/actions/define-action.ts) devuelve un string cuando la
 * clave aparece una sola vez y un array recién a partir de dos. Sin este
 * preprocess, elegir un modificador manda un string y elegir dos manda un array:
 * el schema falla en el primer caso y pasa en el segundo, que es exactamente el
 * tipo de bug que solo aparece en producción con el pedido más simple.
 */
export const listaDeIds = z.preprocess(
  (v) => (v === undefined || v === "" ? [] : Array.isArray(v) ? v : [v]),
  z.array(id).max(50, "Demasiadas opciones elegidas."),
);

// ─────────────────────────────────────────────────────────────────────────────
// Identidad: correo y contraseña
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El correo, normalizado antes de validar.
 *
 * Se guarda siempre en minúsculas: la unicidad de PostgreSQL distingue
 * mayúsculas, así que sin normalizar entrarían dos cuentas para la misma
 * persona —y `User.email` es `@unique` global, o sea que esa segunda cuenta
 * sería una identidad paralela con sus propias membresías—.
 *
 * Vive acá y no en cada feature porque estaba escrito dos veces, en
 * `features/auth/schemas.ts` y en `features/equipo/schemas.ts`. Dos copias de
 * una regla de identidad es una que se actualiza y otra que no.
 */
export const correo = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Escribí un correo válido."));

/**
 * Una contraseña que se está CREANDO.
 *
 * Los requisitos y el porqué de cada uno viven en `lib/auth/reglas-contrasena.ts`,
 * puro y con tests, para que el servidor y la pantalla no puedan discrepar.
 *
 * Ojo con dónde se usa: esto es para crear o cambiar una contraseña. **Al
 * ingresar no va** —ahí se verifica contra un hash que ya existe, y exigirle la
 * política nueva dejaría afuera a todos los usuarios actuales de un día para el
 * otro—.
 */
export const contrasenaFuerte = z
  .string()
  .max(LARGO_MAXIMO, "La contraseña es demasiado larga.")
  .refine(contrasenaEsValida, {
    // El mensaje se arma con el valor recibido para nombrar exactamente lo que
    // falta ("le falta: una mayúscula"). Un "revisá la contraseña" obliga a
    // adivinar cuál de los cinco requisitos no se cumplió.
    error: (issue) => mensajeDeContrasena(String(issue.input)) ?? "Revisá la contraseña.",
  });

/**
 * La contraseña de un superadministrador: los mismos requisitos, más larga.
 *
 * Se arma con las mismas funciones y no con su propia regla, que es como estaba:
 * `min(12)` a secas, sin ninguna de las cuatro clases. O sea que la cuenta que
 * ve TODOS los negocios aceptaba doce letras seguidas mientras a un cajero se le
 * exigía un símbolo.
 */
export const contrasenaFuerteSuperAdmin = z
  .string()
  .max(LARGO_MAXIMO, "La contraseña es demasiado larga.")
  .refine((v) => contrasenaEsValida(v, LARGO_MINIMO_SUPERADMIN), {
    error: (issue) =>
      mensajeDeContrasena(String(issue.input), LARGO_MINIMO_SUPERADMIN) ??
      "Revisá la contraseña.",
  });
