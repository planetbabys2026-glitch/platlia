/**
 * Qué le exigimos a una contraseña nueva.
 *
 * Lógica pura y con tests porque la usan los dos lados: el esquema de zod que
 * valida en el servidor y la lista que la pantalla pinta mientras alguien
 * escribe. Si cada uno tuviera su copia, tarde o temprano la pantalla marcaría
 * en verde algo que el servidor rechaza —y ese es el peor estado posible de un
 * formulario: el botón habilitado sobre un envío que va a fallar—.
 *
 * Sin imports de runtime a propósito.
 *
 * **Sobre la política elegida.** Acá antes se exigían 8 caracteres y nada más,
 * con un argumento escrito en `features/auth/schemas.ts` que vale la pena
 * conservar aunque la decisión haya sido otra: las reglas de composición
 * empujan a `Bar123!` y a anotarla en un papel al lado de la caja, y la guía
 * vigente del NIST (SP 800-63B) desaconseja exigirlas. La decisión del producto
 * fue pedirlas igual, así que el mínimo subió a 10 para que la exigencia sirva
 * de algo: `Bar123!` cumple las cuatro clases y son ocho caracteres.
 *
 * Lo que NO se hace, y es deliberado: obligar a cambiar las contraseñas que ya
 * existen. Esto rige para las que se crean de acá en adelante.
 */

/** Cuántos caracteres, como mínimo. */
export const LARGO_MINIMO = 10;

/**
 * El mínimo del superadministrador.
 *
 * Más largo que el de cualquier otro porque esa cuenta ve todos los negocios.
 * Lo que NO cambia son las cuatro clases: antes esta cuenta pedía 12 caracteres
 * y ninguna otra cosa, así que la más poderosa del sistema aceptaba doce letras
 * seguidas mientras a un cajero se le exigía símbolo. La longitud sube; los
 * requisitos son los mismos, y salen de la misma función.
 */
export const LARGO_MINIMO_SUPERADMIN = 12;

/**
 * Tope de largo. No es una regla de fuerza: argon2 cuesta tiempo y memoria a
 * propósito, así que una entrada enorme es una forma barata de hacer trabajar al
 * servidor.
 */
export const LARGO_MAXIMO = 200;

export type RequisitoContrasena = {
  id: "largo" | "mayuscula" | "minuscula" | "numero" | "simbolo";
  /** Lo que lee la persona. En segunda persona y sin jerga. */
  etiqueta: string;
  cumple: boolean;
};

/**
 * Un símbolo es cualquier cosa que no sea letra ni número.
 *
 * Se define por descarte —y no con una lista de `!@#$%`— para que el espacio
 * cuente: una frase con espacios es de las contraseñas más fuertes que alguien
 * puede elegir, y sería absurdo que no calificara. Las letras acentuadas y la ñ
 * quedan del lado de las letras, no de los símbolos, porque en un teclado
 * español son letras.
 */
const NO_ALFANUMERICO = /[^\p{L}\p{N}]/u;

/**
 * Los cinco requisitos, siempre los cinco y siempre en el mismo orden.
 *
 * Devuelve la lista completa —no un booleano— justamente para que la pantalla
 * pueda decir QUÉ falta mientras se escribe. Un "la contraseña no es válida" al
 * enviar obliga a adivinar.
 */
export function evaluarContrasena(
  valor: string,
  largoMinimo: number = LARGO_MINIMO,
): RequisitoContrasena[] {
  return [
    {
      id: "largo",
      etiqueta: `Al menos ${largoMinimo} caracteres`,
      cumple: valor.length >= largoMinimo && valor.length <= LARGO_MAXIMO,
    },
    { id: "mayuscula", etiqueta: "Una mayúscula", cumple: /\p{Lu}/u.test(valor) },
    { id: "minuscula", etiqueta: "Una minúscula", cumple: /\p{Ll}/u.test(valor) },
    { id: "numero", etiqueta: "Un número", cumple: /\p{N}/u.test(valor) },
    {
      id: "simbolo",
      etiqueta: "Un símbolo o un espacio",
      cumple: NO_ALFANUMERICO.test(valor),
    },
  ];
}

/** Atajo para el esquema: se cumple cuando se cumplen los cinco. */
export function contrasenaEsValida(valor: string, largoMinimo?: number): boolean {
  return evaluarContrasena(valor, largoMinimo).every((r) => r.cumple);
}

/**
 * Lo que falta, para el mensaje del servidor.
 *
 * El esquema tiene que decir qué faltó aunque quien mandó el formulario no haya
 * pasado por la pantalla —una Server Action es un POST alcanzable con curl—, y
 * repetir "la contraseña no cumple" no le sirve ni a esa persona ni a nadie.
 */
export function mensajeDeContrasena(valor: string, largoMinimo?: number): string | null {
  if (valor.length > LARGO_MAXIMO) return "La contraseña es demasiado larga.";

  const faltan = evaluarContrasena(valor, largoMinimo).filter((r) => !r.cumple);
  if (faltan.length === 0) return null;

  return `A la contraseña le falta: ${faltan.map((r) => r.etiqueta.toLowerCase()).join(", ")}.`;
}
