import { rootDb } from "@/lib/db/root";
import { GLOBAL_MODELS, ROOT_TENANT_MODEL, TENANT_MODELS } from "@/lib/db/tenant-models";

/** Operaciones que crean registros: hay que sellar el businessId en `data`. */
const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

function withScope(value: unknown, scope: Record<string, string>) {
  return { ...(value as Record<string, unknown> | undefined), ...scope };
}

function createTenantDb(businessId: string) {
  return rootDb.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (GLOBAL_MODELS.has(model)) {
            throw new Error(
              `${model} no pertenece a ninguna empresa: no se puede consultar con tenantDb(). ` +
                `Usá rootDb desde lib/auth, lib/billing o superadministración, o llegá a él ` +
                `por una relación (por ejemplo membership.findMany({ include: { user: true } })).`,
            );
          }

          if (model !== ROOT_TENANT_MODEL && !TENANT_MODELS.has(model)) {
            throw new Error(
              `El modelo ${model} no está clasificado en lib/db/tenant-models.ts. Agregalo a ` +
                `TENANT_MODELS si lleva businessId, o a GLOBAL_MODELS si es global.`,
            );
          }

          const scope: Record<string, string> =
            model === ROOT_TENANT_MODEL ? { id: businessId } : { businessId };

          const next = args as Record<string, unknown>;

          if (CREATE_OPERATIONS.has(operation)) {
            // createMany recibe un arreglo; create, un objeto.
            next.data = Array.isArray(next.data)
              ? next.data.map((fila) => withScope(fila, scope))
              : withScope(next.data, scope);
          } else if (operation === "upsert") {
            next.where = withScope(next.where, scope);
            next.create = withScope(next.create, scope);
          } else {
            // Todo lo demás —lecturas, update, delete, count, aggregate, groupBy—
            // filtra por `where`. Desde Prisma 5 el `where` de findUnique, update y
            // delete acepta filtros no únicos además de la clave, así que agregar
            // businessId no rompe ninguna operación.
            next.where = withScope(next.where, scope);
          }

          return query(next);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantDb>;

// Cada $extends construye un proxy nuevo. Se cachean por empresa para no rehacerlo
// en cada request; el tope evita que un proceso de larga vida acumule un cliente
// por cada negocio que alguna vez consultó.
const MAX_CLIENTES_CACHEADOS = 128;
const cache = new Map<string, TenantDb>();

/**
 * Cliente Prisma acotado a una empresa. Inyecta `businessId` en el `where` de
 * toda lectura y escritura, y lo sella en el `data` de toda creación. Si el
 * llamador pasa otro businessId, gana el de la sesión.
 *
 * Tres cosas que hay que tener presentes al usarlo:
 *
 *  · En un `create` hay que escribir `businessId` igual, porque los tipos de
 *    Prisma lo exigen y no saben de esta extensión. No es redundante: si alguien
 *    pone el de otra empresa, la extensión lo pisa con el de la sesión. El valor
 *    de todo esto está en el `where`, que es donde vive el riesgo de cruzar datos.
 *  · Las escrituras anidadas (`order.create({ data: { items: { create: [...] } } })`)
 *    NO reciben el businessId automáticamente: la extensión solo toca el primer
 *    nivel de los argumentos. Como la columna es obligatoria, el olvido revienta
 *    con un error de Prisma en vez de escribir el dato mal.
 *  · `$queryRaw` y `$executeRaw` pasan de largo: no son operaciones de modelo. Si
 *    hace falta SQL crudo, el businessId va como parámetro y a la vista en el WHERE.
 */
export function tenantDb(businessId: string): TenantDb {
  if (!businessId) {
    throw new Error("tenantDb() requiere un businessId.");
  }

  const cacheado = cache.get(businessId);
  if (cacheado) return cacheado;

  if (cache.size >= MAX_CLIENTES_CACHEADOS) {
    const masViejo = cache.keys().next().value;
    if (masViejo) cache.delete(masViejo);
  }

  const client = createTenantDb(businessId);
  cache.set(businessId, client);
  return client;
}
