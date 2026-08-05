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
  "/terminos",
  "/privacidad",
  "/pl-bootstrap",
]);

function esPublica(pathname: string): boolean {
  if (PUBLICAS.has(pathname)) return true;
  // El health check lo consulta el monitoreo externo, sin cookie.
  if (pathname === "/api/health") return true;
  // Las rutas de impresión abren en una ventana nueva y las protege el DAL.
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const esSuperadmin = pathname.startsWith("/superadmin");
  const cookie = request.cookies.get(esSuperadmin ? COOKIE_SUPERADMIN : COOKIE_SESION);

  if (esPublica(pathname)) {
    // Quien ya entró no tiene por qué volver a ver el formulario de ingreso.
    if ((pathname === "/ingresar" || pathname === "/registro") && cookie?.value) {
      const claims = await verifySessionToken(cookie.value);
      if (claims) return NextResponse.redirect(new URL("/panel", request.url));
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
     * Todo menos los estáticos y los archivos de marca. El negativo se escribe
     * acá y no con `if`s adentro porque así el middleware ni siquiera se invoca
     * para una imagen.
     */
    "/((?!_next/static|_next/image|marca/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2)$).*)",
  ],
};
