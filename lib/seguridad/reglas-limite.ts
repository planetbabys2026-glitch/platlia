/**
 * La aritmética del freno por procedencia: qué ventana toca y de qué se cuenta.
 *
 * Pura y con tests, separada de la base como `features/caja/reglas.ts` lo está
 * de su consulta: acá se decide, en `limite.ts` se escribe.
 */

export type Cupo = {
  /** Qué se está intentando: "ingresar", "registro", "recuperar". */
  clave: string;
  /** Cuántos intentos se toleran dentro de la ventana. */
  max: number;
  /** Cuánto dura la ventana, en minutos. */
  ventanaMin: number;
};

/**
 * Cuando no se pudo saber la procedencia.
 *
 * Todos los pedidos sin IP comparten esta clave, con lo cual comparten el cupo.
 * Es a propósito: dejar pasar libre lo que no trae IP convierte al limitador en
 * un cartel, porque saltearlo sería tan fácil como no mandar la cabecera.
 */
export const PROCEDENCIA_DESCONOCIDA = "desconocida";

/**
 * De dónde viene el pedido.
 *
 * `cf-connecting-ip` primero: el sitio está detrás de Cloudflare, que la escribe
 * él mismo con la IP real y descarta lo que venga puesto de antes. En
 * `x-forwarded-for` cualquiera puede agregar lo que quiera —solo se confía en el
 * primer tramo, y solo como respaldo para cuando no hay Cloudflare adelante
 * (desarrollo, o un despliegue detrás de otro proxy)—.
 *
 * `lib/auth/session.ts` ya lee la IP así para anotarla en la sesión; acá la
 * lectura decide algo, y por eso el orden importa.
 */
export function procedencia(cabeceras: {
  get(nombre: string): string | null;
}): string {
  const cloudflare = cabeceras.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;

  const reenviada = cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (reenviada) return reenviada;

  return PROCEDENCIA_DESCONOCIDA;
}

/** La clave que se guarda: qué se intentó y desde dónde. */
export function claveDeIntento(clave: string, desde: string): string {
  return `${clave}:ip:${desde}`;
}

/**
 * El comienzo de la ventana que le toca a un instante.
 *
 * Ventana fija —el reloj partido en tramos iguales— y no deslizante: el
 * comienzo forma parte del índice único, así que contar es un solo upsert
 * atómico y el conteo se reinicia solo al cambiar de tramo. Una ventana
 * deslizante obligaría a guardar cada intento por separado y a barrerlos.
 *
 * Lo que se resigna es exactitud en el borde: alguien puede gastar el cupo al
 * final de un tramo y otro tanto al principio del siguiente. Para frenar fuerza
 * bruta alcanza de sobra, y el costo de la alternativa no lo vale.
 */
export function inicioDeVentana(ahora: Date, ventanaMin: number): Date {
  const ms = ventanaMin * 60_000;
  return new Date(Math.floor(ahora.getTime() / ms) * ms);
}

/**
 * Cuándo se libera el cupo, para poder decirlo en el mensaje.
 *
 * "Probá de nuevo en un rato" es la clase de mensaje que hace que alguien
 * reintente cada diez segundos.
 */
export function minutosParaReintentar(
  inicio: Date,
  ventanaMin: number,
  ahora: Date,
): number {
  const fin = inicio.getTime() + ventanaMin * 60_000;
  return Math.max(1, Math.ceil((fin - ahora.getTime()) / 60_000));
}

/** Se pasó del cupo cuando ya lo alcanzó: el intento que lo iguala es el último. */
export function superaElCupo(intentos: number, max: number): boolean {
  return intentos > max;
}
