import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * La capa de autorización del servidor MCP.
 *
 * Existe porque **un cliente de IA moderno no acepta que le peguen un token**. La
 * llave que se copia a mano desde Configuración sirve para lo que deja poner una
 * cabecera propia; Claude.ai, en cambio, hace el descubrimiento del protocolo:
 * pega en el servidor sin credencial, lee de la respuesta a dónde ir a pedirla, da
 * de alta su aplicación solo, manda a la persona a aprobar, y recién entonces
 * canjea un código por el token. Sin estas rutas, adivina `/authorize`, se
 * encuentra un 404 y no hay forma de conectar.
 *
 * Lo de acá es puro a propósito —hashes, comparaciones, validaciones de forma— para
 * poder probar con tests las decisiones que, si salen mal, entregan la información
 * de un negocio a quien no debe.
 */

/** Un código de autorización vive lo justo para viajar de una pestaña a la otra. */
export const VIDA_DEL_CODIGO_MS = 10 * 60 * 1000;

/**
 * La llave de acceso caduca a los 30 días y se renueva sola con el refresco.
 *
 * Las que el dueño crea a mano no caducan, y no es una inconsistencia: del otro
 * lado de una llave manual no hay nadie que sepa renovarla, así que caducarla
 * sería romper la conexión sin que nadie se entere. Acá sí hay un cliente que
 * refresca, así que una llave robada deja de servir sola.
 */
export const VIDA_DE_LA_LLAVE_MS = 30 * 24 * 60 * 60 * 1000;

export function hashOpaco(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function generarSecreto(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * PKCE, y solo en su variante S256.
 *
 * `plain` está en el RFC y no se acepta: manda el verificador tal cual, así que
 * cualquiera que vea pasar la petición de autorización se queda con lo único que
 * hacía falta para canjear el código. El protocolo MCP además lo exige así.
 */
export function verificadorCoincide(verificador: string, desafio: string): boolean {
  if (!verificador || !desafio) return false;
  // Longitudes del RFC 7636: menos de 43 caracteres es un verificador adivinable.
  if (verificador.length < 43 || verificador.length > 128) return false;

  const calculado = createHash("sha256").update(verificador).digest("base64url");
  const a = Buffer.from(calculado);
  const b = Buffer.from(desafio);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * La dirección de retorno se compara ENTERA y contra las registradas.
 *
 * Es la guarda que sostiene todo el flujo: el código de autorización viaja en esa
 * URL, así que aceptar una que el cliente no registró —o parecerse "lo
 * suficiente"— es mandarle el código al servidor de quien lo pidió. Nada de
 * comodines, nada de comparar solo el dominio: `https://claude.ai/x` y
 * `https://claude.ai/x/y` son direcciones distintas.
 */
export function redirectPermitido(pedida: string, registradas: readonly string[]): boolean {
  return registradas.some((r) => r === pedida);
}

/**
 * Qué direcciones de retorno se aceptan al dar de alta una aplicación.
 *
 * `http` solo contra la máquina de quien desarrolla: en la calle, una redirección
 * sin cifrar entrega el código a cualquiera que mire la red. Y nunca un fragmento
 * (`#`), que no llega al servidor y esconde a dónde va a parar de verdad.
 */
export function redirectRegistrableEs(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

export type PeticionDeAutorizacion = {
  responseType: string | null;
  clientId: string | null;
  redirectUri: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  state: string | null;
};

export type ProblemaDeAutorizacion =
  | "response_type"
  | "client_id"
  | "redirect_uri"
  | "code_challenge"
  | "code_challenge_method";

/**
 * Lo que tiene que traer la petición antes de mostrarle nada a nadie.
 *
 * Se valida ANTES de pintar la pantalla de permiso: pedirle a alguien que
 * autorice algo que después va a fallar al canjearse es hacerle perder el tiempo
 * y, peor, enseñarle a aprobar pantallas sin leerlas.
 */
export function revisarPeticion(p: PeticionDeAutorizacion): ProblemaDeAutorizacion | null {
  if (p.responseType !== "code") return "response_type";
  if (!p.clientId) return "client_id";
  if (!p.redirectUri) return "redirect_uri";
  if (!p.codeChallenge) return "code_challenge";
  if (p.codeChallengeMethod !== "S256") return "code_challenge_method";
  return null;
}

/**
 * La vuelta al cliente: el código y el `state` tal cual vino.
 *
 * El `state` es lo que le permite al cliente saber que la respuesta corresponde a
 * la petición que él hizo, así que se devuelve sin tocar, incluso vacío.
 */
export function urlDeRetorno(redirectUri: string, params: Record<string, string | null>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * A dónde va a volver el código, dicho en una palabra.
 *
 * Es lo que se le muestra al dueño antes de que apruebe, y es **la defensa real**
 * de todo esto. El registro previo protege menos de lo que parece: alguien que
 * quiera robar el acceso puede registrar una aplicación llamada "Claude" que
 * apunte a su servidor y mandar el enlace igual. Lo único que separa eso de lo
 * legítimo es que en pantalla diga `evil.com` en vez de `claude.ai`, y que quien
 * aprueba lo vea.
 */
export function hostDeRetorno(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

/** Texto que llega de afuera y se va a mostrar: acotado, nunca crudo. */
export function nombreMostrable(valor: string): string {
  return valor.trim().slice(0, 80) || "Aplicación sin nombre";
}

export type VeredictoCliente = "ATAR" | "SEGUIR" | "RECHAZAR";

/**
 * Qué hacer con la aplicación que está pidiendo, según lo que ya sepamos de ella.
 *
 * Es la decisión de seguridad del flujo entero y por eso vive acá, pura y con
 * tests, en vez de enterrada en la acción: de esto depende que el código de
 * autorización llegue a quien lo pidió y no a otro.
 *
 * - **Sin registrar** → se ata a esta dirección y se sigue. No todos los clientes
 *   usan el alta automática, y cortarles el paso hacía imposible conectar.
 * - **Registrada y coincide** → adelante.
 * - **Registrada y NO coincide** → se rechaza, sin importar cuánto se parezca.
 *
 * Lo peor que consigue alguien tomando un nombre conocido antes que su dueño es
 * dejárselo inservible: molesto, y nunca una filtración, porque a partir de ahí el
 * código va a la dirección atada y no a la suya.
 */
export function decidirSobreCliente(args: {
  registradas: readonly string[] | null;
  redirectUri: string;
}): VeredictoCliente {
  if (!redirectRegistrableEs(args.redirectUri)) return "RECHAZAR";
  if (args.registradas === null) return "ATAR";
  return redirectPermitido(args.redirectUri, args.registradas) ? "SEGUIR" : "RECHAZAR";
}
