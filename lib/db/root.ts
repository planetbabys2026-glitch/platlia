import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { pool } from "@/lib/db/pool";
import { env } from "@/lib/env";

/**
 * Cliente Prisma sin scoping de inquilino.
 *
 * Solo tres lugares lo usan legítimamente: autenticación (que resuelve al usuario
 * antes de saber en qué empresa está), facturación (que atiende webhooks de
 * MercadoPago sin sesión) y superadministración. En cualquier otro lado se usa
 * tenantDb(businessId), y ESLint bloquea el import desde app/ y features/.
 *
 * Igual que lib/env.ts, este módulo NO importa "server-only": el seed y los
 * scripts de cron son Node plano y también lo necesitan.
 *
 * A partir de Prisma 7 el driver adapter es obligatorio y se monta sobre el pool
 * de lib/db/pool.ts, así que hay un solo pool de conexiones en el proceso, tanto
 * para Prisma como para el health check en SQL crudo.
 */
function createRootDb() {
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// El hot reload de desarrollo reevalúa el módulo en cada guardado; sin singleton
// se acumulan clientes contra el mismo pool.
const globalForDb = globalThis as unknown as {
  platliaRootDb?: ReturnType<typeof createRootDb>;
};

export const rootDb = globalForDb.platliaRootDb ?? createRootDb();

if (env.NODE_ENV !== "production") {
  globalForDb.platliaRootDb = rootDb;
}
