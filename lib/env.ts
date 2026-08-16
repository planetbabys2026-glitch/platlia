import { z } from "zod";

// OJO: este módulo NO importa "server-only" a propósito. El paquete `server-only`
// lanza una excepción cuando se resuelve fuera de la condición `react-server`, lo
// que rompería `prisma/seed.ts` y los scripts de cron, que son Node plano y
// también necesitan leer la configuración. La protección equivalente es la guarda
// de abajo, que es lo que realmente importa: que esto nunca se evalúe en el navegador.
if (typeof window !== "undefined") {
  throw new Error("lib/env.ts es solo de servidor y nunca debe llegar al cliente.");
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
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // ─── Requeridos siempre ───────────────────────────────────────────────────
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
      message: "debe ser una cadena de conexión de PostgreSQL",
    }),
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
    () => process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || "",
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
    () => process.env.MP_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET_TEST || "",
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
    throw new Error(`Falta la variable de entorno ${String(key)}, necesaria para ${paraQue}.`);
  }
  return value as NonNullable<(typeof env)[K]>;
}
