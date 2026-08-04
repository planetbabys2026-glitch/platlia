import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Despliegue en VPS propio detrás de Nginx.
  output: "standalone",
  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
  },

  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },

  // @node-rs/argon2 es un binario nativo y el tracing de `standalone` no siempre
  // lo detecta: el login funciona en local y se rompe en producción. Con pnpm el
  // binario vive dentro de .pnpm/, no en node_modules/@node-rs/ directamente.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/.pnpm/@node-rs+argon2*/**",
      "./node_modules/@node-rs/**",
    ],
  },

  async headers() {
    return [
      {
        // Nginx bufferea SSE por defecto y deja congeladas las pantallas en vivo
        // (cocina y turnero, fase 2). Esto lo desactiva desde la app.
        source: "/api/stream/:path*",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
