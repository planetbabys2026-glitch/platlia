import { env } from "@/lib/env";
import type { ConfigFactus } from "@/lib/billing/factus";

/**
 * La cuenta de Factus de Platlia.
 *
 * Es UNA sola para toda la plataforma: Factus nos vende una bolsa de documentos
 * electrónicos y el superadministrador la reparte entre los negocios. Antes las
 * credenciales estaban por empresa en `BusinessSettings`, en texto plano y
 * editables por el dueño de cada bar; ahora una copia de la base ya no se lleva
 * la llave de la facturación de todos los clientes.
 *
 * Vive aparte de `factus.ts` por una razón concreta: `lib/env.ts` revienta a
 * propósito cuando se evalúa con `window` definido, y los tests unitarios corren
 * en jsdom. Con el mapeador —que es donde estaban los errores de plata— separado
 * del entorno, se puede probar la aritmética de la factura sin levantar nada.
 */

/** Si la cuenta de la plataforma está cargada. Sin esto no se factura nada. */
export function plataformaFacturaConfigurada(): boolean {
  return Boolean(
    env.FACTUS_CLIENT_ID && env.FACTUS_CLIENT_SECRET && env.FACTUS_USERNAME && env.FACTUS_PASSWORD,
  );
}

const SANDBOX = "https://api-sandbox.factus.com.co";

/**
 * Lanza si falta algo: llegar acá sin credenciales significa que alguien se
 * saltó `puedeFacturarElectronicamente`, y es mejor un error del servidor que una
 * llamada a la DIAN a medio armar.
 */
export function configFactusDePlataforma(): ConfigFactus {
  if (!plataformaFacturaConfigurada()) {
    throw new Error(
      "La cuenta de Factus de la plataforma no está configurada (faltan las variables FACTUS_*).",
    );
  }

  return {
    clientId: env.FACTUS_CLIENT_ID!,
    clientSecret: env.FACTUS_CLIENT_SECRET!,
    username: env.FACTUS_USERNAME!,
    password: env.FACTUS_PASSWORD!,
    // Nulo = sandbox. Antes el sandbox estaba clavado en los valores por defecto
    // del cliente HTTP y no había forma de apuntar a producción.
    baseUrl: env.FACTUS_URL ?? SANDBOX,
  };
}
