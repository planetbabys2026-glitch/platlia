import { defineConfig } from "prisma/config";

/**
 * Configuración de la CLI de Prisma.
 *
 * En Prisma 7 este archivo reemplaza al bloque `prisma` de package.json y a la
 * carga automática de .env: la CLI ya NO lee .env por su cuenta, así que hay que
 * cargarlo acá a mano. `process.loadEnvFile` es de Node (>=20.12) y no agrega
 * dependencias; falla si el archivo no existe, que es justo lo que pasa en el
 * VPS y en CI, donde las variables vienen del entorno de verdad.
 */
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se asume que DATABASE_URL ya está en el entorno.
}

/**
 * `prisma generate` NO necesita base de datos: solo lee el schema. Pero el
 * ayudante `env()` de Prisma revienta si la variable falta, y en un build de
 * despliegue (nixpacks, Docker) las variables de runtime todavía no existen
 * cuando corre `pnpm install` y su postinstall. Con eso, el despliegue moría en
 * la fase de instalación con un error que no dice nada del build.
 *
 * Con el marcador de abajo, `generate` funciona sin configuración y cualquier
 * comando que SÍ necesite conectarse —migrate, studio— falla nombrando en el
 * host exactamente lo que falta.
 */
const url = process.env.DATABASE_URL ?? "postgresql://falta-DATABASE_URL";

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url,

    /**
     * Sin esto Prisma se crea una base sombra temporal por su cuenta, que es lo
     * que queremos casi siempre. Se declara igual porque `prisma migrate diff
     * --from-migrations` la exige explícita —en Prisma 7 ya no acepta la bandera
     * `--shadow-database-url`— y esa es la única forma de comparar "lo que dicen
     * las migraciones" contra "lo que hay en la base". Cuando la variable no
     * está, el comportamiento es exactamente el de siempre.
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
