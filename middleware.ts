import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, COOKIE_SUPERADMIN, verifySessionToken } from "@/lib/auth/token";

/**
 * Chequeo optimista de sesión. NO toca la base de datos.
 *
 * Esto es comodidad, no seguridad: evita pintar media aplicación para después
 * mandar al login. La frontera real está en `lib/auth/dal.ts`, que cada página y
 * cada Server Action llaman por su cuenta. Un token con firma válida pero cuya
 * sesión fue revocada pasa por acá y lo frena el DAL, que es donde corresponde.
 *
 * Corre en el runtime edge, así que solo puede importar `lib/auth/token.ts`:
 * ahí no hay Prisma ni sockets.
 */

const PUBLICAS = new Set([
  "/",
  "/ingresar",
  "/registro",
  "/recuperar",
  "/restablecer-contrasena",
  "/verificar-correo",
  "/terminos",
  "/privacidad",
  "/pqr",
  "/habeas-data",
  /**
   * Los archivos que lee un buscador ANTES de indexar.
   *
   * Sin esto el middleware los mandaba al login y devolvían un 307: Google y los
   * asistentes no leían ni el `robots.txt` ni el mapa del sitio, así que el
   * trabajo de posicionamiento no existía para nadie. Es la misma clase de
   * defecto que ya había obligado a exceptuar `sw.js` y el ejecutable del
   * agente: un archivo que no es una pantalla, pedido por algo que no es un
   * navegador con sesión.
   */
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/pl-bootstrap",
  // Sin esto, toda ruta /superadmin sin cookie se manda a /superadmin/ingresar,
  // que tampoco sería pública y se redirigiría a sí misma para siempre.
  "/superadmin/ingresar",
]);

function esPublica(pathname: string): boolean {
  if (PUBLICAS.has(pathname)) return true;
  // Menú Digital QR público para clientes (mesas y domicilios)
  if (pathname.startsWith("/m/")) return true;
  /**
   * La imagen que se ve al compartir el enlace.
   *
   * Va por prefijo y no por nombre exacto porque Next le agrega un hash de
   * contenido: la ruta real es `/opengraph-image-pwu6ef`, no `/opengraph-image`.
   * Con la coincidencia exacta el middleware la mandaba al login, y quien pegara
   * el enlace en WhatsApp recibía un 307 en vez de la imagen: enlace sin
   * miniatura, que es el que nadie abre.
   */
  if (pathname.startsWith("/opengraph-image") || pathname.startsWith("/twitter-image")) return true;
  // Pantalla del televisor del salón (Turnero TV)
  if (pathname === "/turnero" || pathname.startsWith("/turnero/")) return true;
  // El health check lo consulta el monitoreo externo, sin cookie.
  if (pathname === "/api/health") return true;
  // Los webhooks los llama un servidor ajeno, que no tiene sesión ni la va a
  // tener. Se autentican con su firma, no con una cookie: si el middleware los
  // mandara al login, MercadoPago recibiría un 307 y el pago nunca se aplicaría.
  if (pathname.startsWith("/api/webhooks/")) return true;
  // Streams SSE para actualización en tiempo real de domicilios y turnero
  if (pathname.startsWith("/api/domicilios/stream") || pathname.startsWith("/api/turnero/stream")) return true;
  // El rastreo del comensal: no tiene sesión ni la va a tener. Se autoriza con el
  // id del pedido, que es un cuid, y el handler lo verifica por su cuenta —estar
  // en esta lista no autentica nada—.
  if (pathname.startsWith("/api/qr/")) return true;
  /**
   * La IA del negocio, que consulta por MCP.
   *
   * No es un navegador y nunca va a tener cookie: presenta su token en cada
   * llamada y el handler lo verifica por su cuenta. Estar en esta lista no
   * autentica nada —igual que el webhook y el agente de impresión—, solo evita
   * que el middleware conteste un 307 al login que el cliente de IA leería como
   * "el servidor está caído".
   */
  if (pathname.startsWith("/api/mcp")) return true;

  /**
   * El descubrimiento y el canje de OAuth del servidor MCP.
   *
   * Son las rutas que un cliente de IA visita ANTES de tener ninguna credencial:
   * si el middleware las manda a `/ingresar`, el cliente recibe un HTML de login
   * donde esperaba JSON y el descubrimiento muere ahí. `/authorize` NO va en esta
   * lista a propósito: es la única del flujo que necesita una persona con sesión,
   * y es la que decide.
   */
  if (pathname.startsWith("/.well-known/oauth-")) return true;
  if (pathname.startsWith("/api/oauth/")) return true;
  // El agente de impresión corre en una PC del local y tampoco es un navegador:
  // se autentica con su token en cada llamada, como el webhook de MercadoPago.
  if (pathname.startsWith("/api/impresion/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const esSuperadmin = pathname.startsWith("/superadmin");
  const cookie = request.cookies.get(esSuperadmin ? COOKIE_SUPERADMIN : COOKIE_SESION);

  if (esPublica(pathname)) {
    return NextResponse.next();
  }

  if (!cookie?.value) return aIngresar(request, pathname + search, esSuperadmin);

  const claims = await verifySessionToken(cookie.value);
  if (!claims || claims.kind !== (esSuperadmin ? "SUPERADMIN" : "APP")) {
    // Token vencido o adulterado: se limpia para no repetir el viaje en cada request.
    const respuesta = aIngresar(request, pathname + search, esSuperadmin);
    respuesta.cookies.delete(esSuperadmin ? COOKIE_SUPERADMIN : COOKIE_SESION);
    return respuesta;
  }

  return NextResponse.next();
}

function aIngresar(request: NextRequest, destino: string, esSuperadmin: boolean) {
  const url = new URL(esSuperadmin ? "/superadmin/ingresar" : "/ingresar", request.url);
  if (destino !== "/" && destino !== "/ingresar" && destino !== "/superadmin/ingresar") {
    url.searchParams.set("desde", destino);
  }
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Todo menos los estáticos, los archivos de marca y los de la PWA (manifest,
     * service worker, iconos, respaldo offline). El negativo se escribe acá y no
     * con `if`s adentro porque así el middleware ni siquiera se invoca para una
     * imagen. `sw.js` es el más delicado de la lista: si pasara por acá, un
     * dispositivo sin sesión recibiría un 307 en vez del script y el navegador
     * jamás llegaría a registrar el service worker.
     *
     * `descargas/` es el ejecutable del agente de impresión. Se baja desde la PC
     * del local, que no tiene por qué tener sesión abierta, y el archivo es el
     * mismo para todos: lo secreto es el token, que va aparte. Sin esta excepción
     * el navegador recibía un 307 al login y bajaba un HTML llamado `.exe`.
     */
    "/((?!_next/static|_next/image|marca/|icons/|descargas/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2)$).*)",
  ],
};
