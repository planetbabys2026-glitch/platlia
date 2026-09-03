import { z } from "zod";

// OJO: este módulo NO importa "server-only" a propósito. El paquete `server-only`
// lanza una excepción cuando se resuelve fuera de la condición `react-server`, lo
// que rompería `prisma/seed.ts` y los scripts de cron, que son Node plano y
// también necesitan leer la configuración. La protección equivalente es la guarda
// de abajo, que es lo que realmente importa: que esto nunca se evalúe en el navegador.
if (typeof window !== "undefined") {
  throw new Error(
    "lib/env.ts es solo de servidor y nunca debe llegar al cliente.",
  );
}

/**
 * En un archivo .env, una variable escrita como VAR="" está *presente* pero vacía.
 * Sin esto, `.optional()` no la considera ausente y la validación falla con un
 * mensaje confuso. Tratamos la cadena vacía como "sin configurar".
 */
function opcional<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
}

const booleanDeEntorno = (porDefecto: "true" | "false") =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? porDefecto : v),
    z.enum(["true", "false"]).transform((v) => v === "true"),
  );

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // ─── Requeridos siempre ───────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
      {
        message: "debe ser una cadena de conexión de PostgreSQL",
      },
    ),
  // openssl rand -base64 48
  SESSION_SECRET: z.string().min(32, "debe tener al menos 32 caracteres"),
  // Se le quita la barra final: todo el código compone `${APP_URL}/algo`, y una
  // barra de más produce enlaces con doble barra en los correos y en la URL que
  // se le declara al webhook de MercadoPago. Es demasiado fácil de escribir mal
  // en un panel como para confiar en que nadie lo haga.
  APP_URL: z.url().transform((valor) => valor.replace(/\/+$/, "")),

  // ─── Correo (Resend) ──────────────────────────────────────────────────────
  RESEND_API_KEY: opcional(z.string().min(1)),
  // Acepta el formato "Nombre <correo@dominio.com>", que es lo que espera Resend,
  // así que no puede validarse como email a secas.
  EMAIL_FROM: opcional(z.string().min(3)),
  OPS_ALERT_EMAIL: opcional(z.email()),

  // ─── Imágenes (Cloudinary) ────────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: opcional(z.string().min(1)),
  CLOUDINARY_API_KEY: opcional(z.string().min(1)),
  CLOUDINARY_API_SECRET: opcional(z.string().min(1)),

  // ─── Pagos (MercadoPago) ──────────────────────────────────────────────────
  MP_ACCESS_TOKEN: opcional(z.string().min(1)).default(
    () =>
      process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "",
  ),
  MERCADOPAGO_ACCESS_TOKEN: opcional(z.string().min(1)),
  MP_PUBLIC_KEY: opcional(z.string().min(1)).default(
    () =>
      process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ||
      process.env.MP_PUBLIC_KEY ||
      process.env.MERCADOPAGO_PUBLIC_KEY ||
      "",
  ),
  MERCADOPAGO_PUBLIC_KEY: opcional(z.string().min(1)),
  NEXT_PUBLIC_MP_PUBLIC_KEY: opcional(z.string().min(1)),
  MP_WEBHOOK_SECRET: opcional(z.string().min(1)).default(
    () =>
      process.env.MP_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET_TEST || "",
  ),
  MP_WEBHOOK_SECRET_TEST: opcional(z.string().min(1)),
  MP_BACK_URL: opcional(z.url()),
  // Solo se apaga en staging, para capturar un payload real y escribir el test
  // de firma. En producción va siempre en true.
  MP_SIGNATURE_ENFORCE: booleanDeEntorno("true"),

  // ─── Variables de Usuario de Prueba Mercado Pago ──────────────────────────
  MP_USER_ID: opcional(z.string().min(1)),
  MP_USER: opcional(z.string().min(1)),
  MP_USER_PASSWORD: opcional(z.string().min(1)),
  MP_USER_VERIFICATION_CODE: opcional(z.string().min(1)),

  // ─── Redis (Turnero SSE Pub/Sub) ──────────────────────────────────────────
  REDIS_URL: opcional(z.string().min(1)),

  // ─── Dónde están los ejecutables del agente de impresión ──────────────────
  // Por defecto `public/descargas/`, que es donde los deja `pnpm agente:build`.
  //
  // Se puede mover porque en el VPS esa carpeta no existe: los binarios no se
  // versionan —son ~7 MB por sistema— y la imagen de despliegue no trae Go, así
  // que no hay forma de que aparezcan solos ahí. Apuntando esto a un volumen se
  // suben una vez y se actualizan sin volver a desplegar la aplicación.
  //
  // Es una ruta del servidor, no una URL: nada de esto llega al navegador.
  DESCARGAS_AGENTE_DIR: opcional(z.string().min(1)),

  // ─── …o en un hosting cualquiera, si no hay volumen ───────────────────────
  // Cloudinary, S3, un release de GitHub: da igual, es un archivo estático.
  //
  // El servidor los **retransmite**, no redirige. Parece un rodeo y es la razón
  // de ser de la ruta: el código de emparejamiento viaja en el NOMBRE del
  // archivo, y ese nombre lo pone nuestro `Content-Disposition`. Bajando directo
  // del hosting el archivo llega sin código y el doble clic deja de alcanzar.
  //
  // Efecto secundario útil: el nombre del otro lado no importa. Si el hosting no
  // acepta subir un `.exe`, se sube sin extensión y acá sale con la que va.
  DESCARGAS_AGENTE_URL_WINDOWS: opcional(z.url()),
  DESCARGAS_AGENTE_URL_LINUX: opcional(z.url()),
  DESCARGAS_AGENTE_URL_MAC: opcional(z.url()),

  // ─── Facturación electrónica DIAN (Factus) ────────────────────────────────
  // La cuenta de Factus es UNA, de la plataforma: Factus nos vende una bolsa de
  // documentos y nosotros la repartimos entre los negocios. Antes estas cuatro
  // credenciales vivían por empresa en `BusinessSettings`, en texto plano y
  // editables por el dueño; acá una copia de la base ya no se lleva la llave de
  // la facturación de todos los clientes.
  //
  // Lo que sí es de cada negocio —el rango de numeración que la DIAN le autorizó
  // a SU NIT, el municipio, los códigos fiscales— sigue en `BusinessSettings` y
  // lo asigna el superadministrador.
  FACTUS_URL: opcional(z.url().transform((valor) => valor.replace(/\/+$/, ""))),
  FACTUS_CLIENT_ID: opcional(z.string().min(1)),
  FACTUS_CLIENT_SECRET: opcional(z.string().min(1)),
  FACTUS_USERNAME: opcional(z.string().min(1)),
  FACTUS_PASSWORD: opcional(z.string().min(1)),

  // ─── Verificación de propiedad en buscadores ──────────────────────────────
  // Los códigos que Google Search Console y Bing Webmaster Tools piden poner en
  // una meta del `<head>`. Van por entorno y no escritos en el repo porque son
  // de la cuenta de quien administra el sitio, no del código.
  //
  // **Opcionales, y tienen que seguir siéndolo**: `next build` importa este
  // archivo al recolectar las rutas, así que una variable de SEO obligatoria
  // sería un despliegue que no arranca por algo que no afecta a ningún usuario.
  //
  // Anclar la verificación acá es lo que la hace sobrevivir: verificada solo por
  // TXT de DNS, se pierde el día que alguien mueve el dominio de proveedor, y
  // Search Console deja de reportar sin que nadie lo note.
  GOOGLE_SITE_VERIFICATION: opcional(z.string().min(1)),
  BING_SITE_VERIFICATION: opcional(z.string().min(1)),

  // ─── Protección anti-robots (Cloudflare Turnstile) ────────────────────────
  // El sitio ya está detrás de Cloudflare, así que Turnstile no suma un tercero
  // nuevo. La pública va con el prefijo NEXT_PUBLIC_ porque la necesita el
  // widget en el navegador; la secreta solo la usa la verificación del servidor.
  //
  // **Opcionales, y tienen que seguir siéndolo**, por lo mismo que las de
  // verificación de buscadores: `next build` importa este archivo al recolectar
  // las rutas. Sin ellas la verificación se saltea y quedan la trampa y el freno
  // por procedencia, que es como corren desarrollo y la suite e2e.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: opcional(z.string().min(1)),
  TURNSTILE_SECRET_KEY: opcional(z.string().min(1)),

  // ─── Bootstrap del superadministrador ─────────────────────────────────────
  // Se define únicamente durante el primer despliegue y se borra después. Sin
  // ella, /pl-bootstrap responde 404 y es indistinguible de una ruta inexistente.
  SUPERADMIN_BOOTSTRAP_TOKEN: opcional(z.string().min(32)),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  · ${i.path.join(".") || "(raíz)"}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Configuración de entorno inválida. Revisá tu .env (hay una plantilla en .env.example):\n${detalle}`,
  );
}

export const env = parsed.data;

/**
 * Devuelve una variable opcional garantizando que esté configurada, con un error
 * que dice exactamente qué falta. Se usa en el punto donde la integración se
 * activa, para que un Platlia sin Cloudinary o sin MercadoPago igual arranque.
 */
export function requireEnv<K extends keyof typeof env>(
  key: K,
  paraQue: string,
): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(
      `Falta la variable de entorno ${String(key)}, necesaria para ${paraQue}.`,
    );
  }
  return value as NonNullable<(typeof env)[K]>;
}
