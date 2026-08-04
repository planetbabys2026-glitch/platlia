import { Pool } from "pg";
import { env } from "@/lib/env";

/**
 * Pool de conexiones a PostgreSQL.
 *
 * La base vive en un VPS remoto, así que el pool se afina para dos cosas que
 * muerden en producción: la latencia de red y los NAT/firewall que cortan
 * conexiones ociosas y dejan sockets zombie en el pool.
 *
 * A partir de Prisma 7 el driver adapter es obligatorio, así que este mismo pool
 * es el que consume `lib/db/root.ts` — hay un solo pool en todo el proceso.
 */
function createPool(): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    statement_timeout: 15_000,
  });
}

// En desarrollo el hot reload reevalúa los módulos: sin este singleton se abre
// un pool nuevo por recarga hasta agotar max_connections del servidor.
const globalForPool = globalThis as unknown as { platliaPgPool?: Pool };

export const pool: Pool = globalForPool.platliaPgPool ?? createPool();

if (env.NODE_ENV !== "production") {
  globalForPool.platliaPgPool = pool;
}
