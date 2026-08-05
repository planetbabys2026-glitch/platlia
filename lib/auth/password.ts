import { hash, verify } from "@node-rs/argon2";

/**
 * Hash de contraseñas y de PIN con Argon2id.
 *
 * Los parámetros son los que recomienda OWASP para Argon2id: 19 MiB de memoria,
 * 2 pasadas y un hilo. No se tocan a la ligera —cambiarlos no invalida los hashes
 * viejos, porque el string resultante lleva sus propios parámetros adentro, pero
 * sí cambia el costo de cada inicio de sesión.
 *
 * El algoritmo por defecto de @node-rs/argon2 ya es Argon2id; no se pasa explícito
 * porque su enum es un `const enum` de TypeScript y este proyecto compila con
 * `isolatedModules`, donde importar uno es un error.
 */
const OPCIONES = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(plain: string): Promise<string> {
  if (plain.length === 0) {
    throw new Error("No se puede hashear una contraseña vacía.");
  }
  return hash(plain, OPCIONES);
}

/**
 * Verifica una contraseña contra su hash.
 *
 * Devuelve false —en vez de propagar— si el hash guardado está corrupto o tiene
 * un formato que la librería no entiende: un registro dañado tiene que ser un
 * inicio de sesión fallido, no un error 500 que además delata que ese usuario
 * existe.
 */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, OPCIONES);
  } catch {
    return false;
  }
}

/**
 * Hash señuelo para cuando el correo no existe.
 *
 * Verificar contra él hace que "no hay cuenta" y "contraseña incorrecta" tarden
 * lo mismo, y así no se puede averiguar quién tiene cuenta midiendo el tiempo de
 * respuesta.
 *
 * Se calcula de verdad y no es una constante escrita a mano: un hash inválido
 * haría que verifyPassword devolviera false al instante y la diferencia de
 * tiempo volvería a delatar al usuario. Se paga una sola vez por proceso.
 */
let senuelo: Promise<string> | undefined;

export function hashSenuelo(): Promise<string> {
  senuelo ??= hashPassword("senuelo-que-jamas-coincide-con-nada");
  return senuelo;
}
