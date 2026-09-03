import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

/**
 * Levanta una Postgres LOCAL, corre lo que se le pida contra ella, y la apaga.
 *
 * Existe porque los e2e escriben: abren turnos, cobran cuentas y `auth.spec.ts`
 * llega a crear negocios y usuarios que nadie borra. Contra la base del VPS eso
 * es meterle datos de prueba a un negocio real, y `pnpm seed` —que la suite pide
 * antes de correr— directamente la arrasa. `lib/db/base-local.ts` ya no lo
 * permite; esto es la otra mitad: darle a las pruebas una base propia.
 *
 * **No hace falta Docker ni root.** El binario de PostgreSQL 15 —la misma versión
 * mayor que corre en el VPS— viene en `node_modules` y arranca como un proceso
 * más del usuario, con sus datos en `.pg-pruebas/`.
 *
 * **Redis se deja sin configurar a propósito.** `lib/redis.ts` devuelve `null`
 * sin `REDIS_URL` y todos los publicadores se vuelven no-ops, que es exactamente
 * lo que hace falta acá: apuntando al Redis del VPS —inalcanzable desde esta
 * máquina— cada acción que publica un aviso se comía un `connect ETIMEDOUT` de
 * diez segundos, y de ahí salían la mitad de los `Test timeout` de la suite. Sin
 * Redis no hay avisos en vivo; las pruebas navegan y recargan, así que no los
 * necesitan.
 */

const PUERTO = Number(process.env.PG_PRUEBAS_PUERTO ?? 5433);
const BASE = "platlia_pruebas";
const CARPETA = join(process.cwd(), ".pg-pruebas");
const USUARIO = "postgres";
const CLAVE = "pruebas";

const URL_BASE = `postgresql://${USUARIO}:${CLAVE}@127.0.0.1:${PUERTO}/${BASE}`;

/** Los pasos por defecto: esquema, datos de semilla y la suite. */
const POR_DEFECTO = [
  ["pnpm", ["db:deploy"]],
  ["pnpm", ["seed"]],
  ["pnpm", ["exec", "playwright", "test"]],
] as const;

function correr(comando: string, args: string[], entorno: NodeJS.ProcessEnv): boolean {
  console.log(`\n▶ ${comando} ${args.join(" ")}\n`);
  const r = spawnSync(comando, args, { stdio: "inherit", env: entorno });
  return r.status === 0;
}

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: CARPETA,
    user: USUARIO,
    password: CLAVE,
    port: PUERTO,
    persistent: true,
  });

  // `initialise()` revienta sobre una carpeta ya inicializada, así que la
  // primera vez se paga el costo y las siguientes se reutiliza: son ~40 MB de
  // datos que sobreviven entre corridas y hacen que arrancar sea instantáneo.
  const primeraVez = !existsSync(join(CARPETA, "PG_VERSION"));
  if (primeraVez) {
    console.log("Inicializando la base de pruebas por primera vez…");
    await pg.initialise();
  }

  await pg.start();

  // Solo la primera vez: la carpeta de datos es persistente, así que la base
  // sobrevive entre corridas. Llamarlo siempre además deja abierto el cliente que
  // usa `createDatabase`, y al apagar Postgres ese cliente escupe un
  // "Connection terminated unexpectedly" que no significa nada y asusta.
  if (primeraVez) {
    await pg.createDatabase(BASE);
  }

  console.log(`\nPostgres de pruebas en 127.0.0.1:${PUERTO}, base "${BASE}".`);

  /**
   * Las variables van por el ENTORNO del hijo y no por un `.env.pruebas`.
   *
   * Está verificado que una variable ya presente en el entorno le gana a
   * `--env-file` y a `process.loadEnvFile()`, así que el seed, Prisma y el build
   * de Next leen esta base y sacan del `.env` de siempre todo lo demás
   * —`SESSION_SECRET`, `APP_URL`— sin tener que duplicarlo.
   */
  const entorno: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: URL_BASE,
    REDIS_URL: "",
    /**
     * Turnstile se apaga acá, por la misma razón que Redis.
     *
     * `lib/seguridad/turnstile.ts` deja pasar cuando no hay llave y **rechaza
     * cuando hay llave y el token no verifica**. Un navegador manejado por
     * Playwright no resuelve el widget, así que con las llaves puestas en el
     * `.env` —que es lo normal en la máquina de quien desarrolla— TODA la suite
     * se cae en el primer ingreso, y el error dice "no pudimos verificar que no
     * seas un robot", que no se parece en nada a lo que la prueba estaba
     * probando.
     *
     * Se apaga la secreta y la pública: sin la pública el widget ni se pinta, y
     * así el formulario queda igual que en una instalación sin configurar.
     *
     * Lo que NO se apaga es el freno por procedencia ni el campo trampa: esos no
     * dependen de ninguna variable y las pruebas tienen que pasar con ellos
     * puestos, porque es como corre producción.
     */
    TURNSTILE_SECRET_KEY: "",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  };

  const pedidos = process.argv.slice(2);
  const pasos: readonly (readonly [string, readonly string[]])[] =
    pedidos.length > 0 ? [[pedidos[0]!, pedidos.slice(1)]] : POR_DEFECTO;

  let ok = true;
  for (const [comando, args] of pasos) {
    if (!correr(comando, [...args], entorno)) {
      ok = false;
      break;
    }
  }

  await pg.stop();
  console.log("\nPostgres de pruebas apagada.");
  process.exit(ok ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
