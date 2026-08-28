import { ImageResponse } from "next/og";

/**
 * La imagen que se ve cuando alguien pega el enlace en WhatsApp.
 *
 * En Colombia el enlace se comparte por ahí, y uno sin miniatura ni descripción
 * se lee como spam: no se abre. Se genera acá y no como archivo estático para
 * que no haya que reexportar un PNG cada vez que cambie el nombre o el mensaje.
 *
 * Sin tipografías de marca a propósito: cargarlas obligaría a leer los `.woff2`
 * en cada render del borde y esta imagen tiene que salir siempre, incluso si esa
 * lectura falla. Lo que la identifica es el color y la tirilla, no la letra.
 */
export const runtime = "nodejs";
export const alt = "Platlia — Software para bares y restaurantes en Colombia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#171512",
          padding: 72,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* El isotipo, con su trazo real.
              Va como `<svg>` y no con el truco de bordes para dibujar los
              dientes: Satori —el motor que arma esta imagen— no lo soporta, y el
              resultado era un rectángulo liso, o sea la marca sin lo único que la
              hace reconocible. */}
          <svg width="62" height="72" viewBox="24 16 48 56" fill="none">
            <path
              d="M24 16H72V64L68 72L64 64L60 72L56 64L52 72L48 64L44 72L40 64L36 72L32 64L28 72L24 64Z"
              fill="#EDE7DA"
            />
            <path
              d="M42.2 44V20H47.9Q51.3 20 52.8 21.4Q54.3 22.7 54.4 25.9Q54.4 27.1 54.4 28.2Q54.4 29.3 54.4 30.5Q54.3 33.6 52.8 35Q51.3 36.4 47.9 36.4H46.7V44ZM46.7 32.4H47.9Q48.9 32.4 49.4 32Q49.8 31.6 49.9 30.8Q49.9 30 50 29.1Q50 28.2 50 27.3Q49.9 26.3 49.9 25.6Q49.8 24.8 49.4 24.4Q48.9 24 47.9 24H46.7Z"
              fill="#171512"
            />
            <rect x="36" y="52" width="24" height="5" fill="#FF4E1F" />
          </svg>
          <span style={{ color: "#EDE7DA", fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>
            PLATLIA
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span style={{ color: "#EDE7DA", fontSize: 78, fontWeight: 800, lineHeight: 1.02 }}>
            Tomá el pedido, mandalo a
          </span>
          <span style={{ color: "#FF4E1F", fontSize: 78, fontWeight: 800, lineHeight: 1.02 }}>
            cocina y cobralo facturado
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#C9C2AF", fontSize: 30 }}>
            Bares y restaurantes en Colombia
          </span>
          <span style={{ color: "#C9C2AF", fontSize: 30 }}>·</span>
          <span style={{ color: "#EDE7DA", fontSize: 30, fontWeight: 700 }}>
            7 días gratis, sin tarjeta
          </span>
        </div>
      </div>
    ),
    size,
  );
}
