import "server-only";
import { headers } from "next/headers";
// El freno no pertenece a ningún negocio: cuenta intentos de gente que todavía
// no tiene sesión, así que no hay businessId con el cual acotar.
import { rootDb } from "@/lib/db/root";
import {
  claveDeIntento,
  inicioDeVentana,
  minutosParaReintentar,
  procedencia,
  superaElCupo,
  type Cupo,
} from "@/lib/seguridad/reglas-limite";

export type ResultadoDeLimite =
  | { permitido: true }
  | { permitido: false; minutos: number };

/**
 * Cuenta un intento y dice si se pasó del cupo.
 *
 * **El conteo va en el `upsert`, no en un `select` y después un `update`.** Es
 * el mismo patrón del descuento de stock, del reclamo de impresión y de la
 * guarda anti-doble-emisión ante la DIAN: leer primero y escribir después deja
 * pasar los intentos simultáneos, que en un limitador son exactamente los que
 * hay que frenar —quien prueba contraseñas no lo hace de a uno y esperando—.
 *
 * Devuelve el veredicto en vez de lanzar para que el llamador decida el mensaje:
 * el ingreso quiere uno y el menú QR quiere otro.
 */
export async function contarIntento(cupo: Cupo, ahora = new Date()): Promise<ResultadoDeLimite> {
  const desde = procedencia(await headers());
  const clave = claveDeIntento(cupo.clave, desde);
  const ventanaAt = inicioDeVentana(ahora, cupo.ventanaMin);

  const fila = await rootDb.intentoDeAcceso.upsert({
    where: { clave_ventanaAt: { clave, ventanaAt } },
    create: { clave, ventanaAt, intentos: 1 },
    update: { intentos: { increment: 1 } },
    select: { intentos: true },
  });

  if (superaElCupo(fila.intentos, cupo.max)) {
    return { permitido: false, minutos: minutosParaReintentar(ventanaAt, cupo.ventanaMin, ahora) };
  }
  return { permitido: true };
}

/**
 * Borra a quien acertó.
 *
 * Sin esto, quien se equivoca de contraseña tres veces y entra a la cuarta se
 * queda con tres intentos gastados durante el resto de la ventana, y el próximo
 * despiste lo deja afuera. El cupo existe para frenar a quien no acierta nunca.
 */
export async function olvidarIntentos(cupo: Cupo, ahora = new Date()): Promise<void> {
  const desde = procedencia(await headers());
  await rootDb.intentoDeAcceso.deleteMany({
    where: {
      clave: claveDeIntento(cupo.clave, desde),
      ventanaAt: inicioDeVentana(ahora, cupo.ventanaMin),
    },
  });
}

/**
 * Los cupos, todos juntos.
 *
 * Escritos en un solo lugar para poder mirarlos de una: repartidos por las
 * acciones, nadie sabe si el registro es más estricto que el ingreso sin abrir
 * los dos archivos.
 */
export const CUPOS = {
  /** Diez por cuenta ya lo frena el bloqueo de `User`; esto frena el rociado
   *  de una contraseña contra muchas cuentas, que aquel no ve. */
  ingresar: { clave: "ingresar", max: 10, ventanaMin: 15 },
  /**
   * La consola de soporte, que ve TODOS los negocios.
   *
   * Más estricto que el ingreso normal y **sin** bloqueo por cuenta a propósito.
   * Bloquear la cuenta sería regalarle a cualquiera la forma de dejar a soporte
   * afuera: basta con fallar diez veces contra su correo. El freno va por
   * procedencia, que castiga a quien insiste y no a quien tiene que entrar.
   */
  superadmin: { clave: "superadmin", max: 5, ventanaMin: 15 },
  /** Cada registro deja un negocio, una suscripción y una caja: es la puerta
   *  más cara de todas. */
  registro: { clave: "registro", max: 5, ventanaMin: 60 },
  /** Cada intento manda un correo a una dirección que elige quien pide. */
  recuperar: { clave: "recuperar", max: 5, ventanaMin: 60 },
  /** Un formulario público que manda correo a soporte. */
  contacto: { clave: "contacto", max: 5, ventanaMin: 60 },
  /**
   * Holgado a propósito: del otro lado hay una mesa llena de gente pidiendo
   * desde la misma red del local, así que comparten IP. Frena la inundación
   * automática sin estorbarle a una cena de doce.
   */
  pedidoQr: { clave: "pedido-qr", max: 40, ventanaMin: 10 },
} as const satisfies Record<string, Cupo>;
