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
  "/pl-bootstrap",
  // Sin esto, toda ruta /superadmin sin cookie se manda a /superadmin/ingresar,
  // que tampoco sería pública y se redirigiría a sí misma para siempre.
  "/superadmin/ingresar",
]);

function esPublica(pathname: string): boolean {
  if (PUBLICAS.has(pathname)) return true;
  // Menú Digital QR público para clientes (mesas y domicilios)
  if (pathname.startsWith("/m/")) return true;
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
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const esSuperadmin = pathname.startsWith("/superadmin");
  const cookie = request.cookies.get(esSuperadmin ? COOKIE_SUPERADMIN : COOKIE_SESION);

  if (esPublica(pathname)) {
    // Quien ya entró no tiene por qué volver a ver el formulario de ingreso.
    const formularioDeIngreso =
      pathname === "/ingresar" || pathname === "/registro" || pathname === "/superadmin/ingresar";

    if (formularioDeIngreso && cookie?.value) {
      const claims = await verifySessionToken(cookie.value);
      if (claims?.kind === (esSuperadmin ? "SUPERADMIN" : "APP")) {
        return NextResponse.redirect(new URL(esSuperadmin ? "/superadmin" : "/panel", request.url));
      }
    }
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
  if (!esSuperadmin && destino !== "/") url.searchParams.set("desde", destino);
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
     */
    "/((?!_next/static|_next/image|marca/|icons/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2)$).*)",
  ],
};
