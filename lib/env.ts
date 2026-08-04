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
  APP_URL: z.url(),

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
  MP_ACCESS_TOKEN: opcional(z.string().min(1)),
  MP_WEBHOOK_SECRET: opcional(z.string().min(1)),
  MP_BACK_URL: opcional(z.url()),
  // Solo se apaga en staging, para capturar un payload real y escribir el test
  // de firma. En producción va siempre en true.
  MP_SIGNATURE_ENFORCE: booleanDeEntorno("true"),

  // ─── Bootstrap del superadministrador ─────────────────────────────────────
  // Se define únicamente durante el primer despliegue y se borra después. Sin
  // ella, /__pl/bootstrap responde 404 y es indistinguible de una ruta inexistente.
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
