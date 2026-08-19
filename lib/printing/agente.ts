import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
// El agente no tiene sesión: llega con un token y de ahí sale el businessId con el que después se acota todo.
import { rootDb } from "@/lib/db/root";

/**
 * Cómo entra el agente de impresión.
 *
 * No es un navegador: no tiene cookie ni la va a tener. Es el mismo caso que el
 * webhook de MercadoPago —una ruta pública que se autentica por su cuenta— y se
 * resuelve igual: un secreto que el otro lado presenta en cada llamada.
 *
 * Del token se guarda **solo el hash**, como en `VerificationToken`: una copia de
 * la base no le regala a nadie la cola de impresión de un local. Se muestra una
 * sola vez, al crearlo, y si se pierde se genera otro.
 *
 * SHA-256 y no argon2 a propósito: esto no es una contraseña que alguien elige y
 * repite en otro lado, son 32 bytes aleatorios. No hay diccionario que lo
 * adivine, y el hash se verifica en cada pedido del agente —varias veces por
 * minuto—, así que un hash lento acá sería un costo sin contrapartida.
 */

export type AgenteAutenticado = {
  agenteId: string;
  businessId: string;
  nombre: string;
};

function hashear(crudo: string): string {
  return createHash("sha256").update(crudo).digest("hex");
}

/** Cuánto vale un código de emparejamiento. Suficiente para bajar el archivo y abrirlo. */
export const MINUTOS_DE_EMPAREJAMIENTO = 60;

/**
 * El alfabeto del código: sin las letras que se confunden al leerlas.
 *
 * Nada de 0/O ni 1/I/L. El código viaja en el nombre del archivo y casi nunca hay
 * que escribirlo, pero cuando hay que hacerlo —porque Windows renombró la
 * descarga— es alguien mirando una pantalla y tecleando en otra.
 */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generarCodigo(): string {
  const bytes = randomBytes(12);
  let codigo = "";
  for (let i = 0; i < 12; i++) {
    codigo += ALFABETO[bytes[i] % ALFABETO.length];
  }
  // En grupos de cuatro: si hay que leerlo en voz alta por teléfono, se puede.
  return `${codigo.slice(0, 4)}-${codigo.slice(4, 8)}-${codigo.slice(8, 12)}`;
}

/** Normaliza lo que escribió una persona: sin guiones, sin espacios, en mayúsculas. */
export function limpiarCodigo(codigo: string): string {
  return codigo.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/**
 * Registra un equipo y devuelve su código de emparejamiento.
 *
 * **No genera token todavía.** El token nace cuando el programa se empareja, así
 * que entre el registro y la primera ejecución no hay ningún secreto de larga vida
 * dando vueltas por un chat o un correo.
 */
export async function registrarEquipo(
  businessId: string,
  nombre: string,
): Promise<{ id: string; codigo: string }> {
  const codigo = generarCodigo();

  const agente = await rootDb.printAgent.create({
    data: {
      businessId,
      nombre,
      codigoHash: hashear(limpiarCodigo(codigo)),
      codigoExpiraEn: new Date(Date.now() + MINUTOS_DE_EMPAREJAMIENTO * 60_000),
    },
    select: { id: true },
  });

  return { id: agente.id, codigo };
}

/** Un código nuevo para un equipo que ya existe: se perdió, se venció, se reinstala. */
export async function regenerarCodigo(agenteId: string): Promise<string> {
  const codigo = generarCodigo();
  await rootDb.printAgent.update({
    where: { id: agenteId },
    data: {
      codigoHash: hashear(limpiarCodigo(codigo)),
      codigoExpiraEn: new Date(Date.now() + MINUTOS_DE_EMPAREJAMIENTO * 60_000),
      // El token viejo muere: si alguien pide un código nuevo es porque el equipo
      // anterior ya no es el que tiene que imprimir.
      tokenHash: null,
      emparejadoEn: null,
    },
  });
  return codigo;
}

/**
 * Emite el token de un equipo para configurarlo a mano.
 *
 * Es el camino para cuando el programa NO se baja desde esta pantalla: quien
 * instala llega al local con el ejecutable ya compilado y lo único que necesita
 * del servidor es el archivo de configuración. El código de emparejamiento no le
 * sirve, porque ese viaja en el nombre de una descarga que no va a hacer.
 *
 * Mata el código, no lo deja convivir: un código existe para PARIR un token, así
 * que con uno ya emitido sería una segunda llave para la misma puerta, viva una
 * hora y sin que nadie sepa que quedó abierta.
 *
 * Se devuelve una sola vez —de la base solo queda el hash— y por eso la pantalla
 * lo muestra con su botón de copiar en vez de dejarlo para después.
 */
export async function emitirToken(agenteId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  await rootDb.printAgent.update({
    where: { id: agenteId },
    data: {
      tokenHash: hashear(token),
      codigoHash: null,
      codigoExpiraEn: null,
      emparejadoEn: new Date(),
    },
  });

  return token;
}

/**
 * El `agente.json` listo para pegar, tal como lo lee el programa.
 *
 * Lo arma el servidor y no la pantalla para que la URL sea exactamente la que el
 * servidor cree que es: escrita a mano en un componente cliente, un `localhost`
 * o una barra final de más son un agente que no conecta y un error que solo se
 * ve en la PC del local.
 */
export function archivoDeConfiguracion(datos: {
  url: string;
  token: string;
  nombre: string;
}): string {
  return `${JSON.stringify({ url: datos.url, token: datos.token, nombre: datos.nombre }, null, 2)}\n`;
}

/**
 * El canje: un código válido a cambio del token de verdad.
 *
 * Es de un solo uso —el código se borra al canjearlo— y vencible. Esas dos cosas
 * son las que permiten que sea corto: doce caracteres no resistirían un ataque de
 * fuerza bruta de días, pero sí una ventana de una hora contra un índice único.
 */
export async function emparejar(
  codigo: string,
): Promise<{ token: string; nombre: string } | null> {
  const limpio = limpiarCodigo(codigo);
  if (limpio.length < 8) return null;

  const agente = await rootDb.printAgent.findUnique({
    where: { codigoHash: hashear(limpio) },
    select: { id: true, nombre: true, codigoExpiraEn: true },
  });
  if (!agente) return null;

  if (!agente.codigoExpiraEn || agente.codigoExpiraEn < new Date()) return null;

  const token = randomBytes(32).toString("base64url");

  await rootDb.printAgent.update({
    where: { id: agente.id },
    data: {
      tokenHash: hashear(token),
      // Se quema: un código que sirve dos veces es un token que se puede robar
      // mirando por encima del hombro una vez.
      codigoHash: null,
      codigoExpiraEn: null,
      emparejadoEn: new Date(),
    },
  });

  return { token, nombre: agente.nombre };
}

/**
 * Quién es el que llama, o null.
 *
 * La comparación del hash va en tiempo constante por prolijidad, aunque la
 * búsqueda sea por índice único: el patrón del proyecto es ese y no cuesta nada.
 */
export async function autenticarAgente(
  cabecera: string | null,
): Promise<AgenteAutenticado | null> {
  if (!cabecera) return null;

  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : cabecera.trim();
  if (!token) return null;

  const esperado = hashear(token);
  const agente = await rootDb.printAgent.findFirst({
    where: { tokenHash: esperado },
    select: { id: true, businessId: true, nombre: true, tokenHash: true },
  });
  if (!agente?.tokenHash) return null;

  const a = Buffer.from(agente.tokenHash, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // Sirve para que la pantalla de configuración pueda decir "conectado hace 3
  // segundos" en vez de dejar al dueño adivinando si el programa está andando.
  void rootDb.printAgent
    .update({ where: { id: agente.id }, data: { ultimoContactoEn: new Date() } })
    .catch(() => {});

  return { agenteId: agente.id, businessId: agente.businessId, nombre: agente.nombre };
}
