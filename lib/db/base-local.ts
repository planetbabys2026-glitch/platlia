/**
 * La guarda de los scripts que BORRAN.
 *
 * `prisma/seed.ts` arrasa la base entera —negocios, usuarios, contraseñas— y
 * `scripts/reset-operacion.ts` se lleva pedidos, pagos y turnos de caja. Hasta
 * acá lo único que los frenaba era `NODE_ENV === "production"`, y esa guarda no
 * sirve para lo que existe: en el portátil de quien desarrolla `NODE_ENV` vale
 * "development" SIEMPRE, apunte `DATABASE_URL` a donde apunte. O sea que la
 * protección estaba encendida justo en el único lugar donde no hacía falta —el
 * servidor— y apagada en el único donde el accidente pasa de verdad: una
 * terminal local con la URL de producción en el `.env`.
 *
 * Lo que se pregunta ahora es por la BASE, no por el proceso: si el host no es
 * de esta máquina, no se borra nada. Para el reseteo deliberado de una base
 * remota de pruebas hay que nombrarla en `CONFIRMO_ARRASAR_BASE`, y tiene que
 * coincidir exacto con la de la URL: así una variable que alguien dejó puesta
 * en el `.env` deja de servir en cuanto cambia la base.
 *
 * Sin imports: lo cargan scripts de Node plano, donde `server-only` lanza.
 */

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", ""]);

export type BaseApuntada = {
  host: string;
  puerto: string;
  nombre: string;
  local: boolean;
};

/** Lee host, puerto y nombre de una `DATABASE_URL`, sin la contraseña. */
export function baseApuntada(databaseUrl: string): BaseApuntada {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // Una URL que no se puede leer se trata como remota: ante la duda, no se
    // borra. Fallar cerrado es la única opción defendible acá.
    return { host: "(ilegible)", puerto: "", nombre: "(ilegible)", local: false };
  }

  const host = url.hostname;
  return {
    host,
    puerto: url.port,
    nombre: url.pathname.replace(/^\//, ""),
    local: HOSTS_LOCALES.has(host),
  };
}

/**
 * Corta el proceso si la base no es local y nadie la nombró a propósito.
 *
 * `accion` se usa en el mensaje: quien lo lee tiene que entender qué se iba a
 * llevar por delante, no solo que algo se detuvo.
 */
export function exigirBaseBorrable(databaseUrl: string, accion: string): BaseApuntada {
  const base = baseApuntada(databaseUrl);
  if (base.local) return base;

  const confirmada = process.env.CONFIRMO_ARRASAR_BASE?.trim();
  if (confirmada && confirmada === base.nombre) {
    console.warn(
      `\n⚠  ${accion} sobre una base REMOTA: ${base.nombre} en ${base.host}:${base.puerto}.\n` +
        `   Confirmado con CONFIRMO_ARRASAR_BASE=${confirmada}.\n`,
    );
    return base;
  }

  throw new Error(
    `${accion} está apuntando a una base remota y no se va a ejecutar.\n\n` +
      `  Base:  ${base.nombre}\n` +
      `  Host:  ${base.host}:${base.puerto}\n\n` +
      "Esto borra datos. Si la base es de producción, NO la corras: levantá una\n" +
      "Postgres local y apuntá DATABASE_URL ahí.\n\n" +
      "Si de verdad querés arrasar ESA base, nombrala a propósito:\n" +
      `  CONFIRMO_ARRASAR_BASE=${base.nombre} pnpm <comando>\n`,
  );
}
