import { defineConfig, env } from "prisma/config";

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

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: env("DATABASE_URL"),
  },

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
