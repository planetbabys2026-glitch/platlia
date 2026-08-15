import { z } from "zod";
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
