-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "shortDescription" TEXT;

-- Inicializar productos existentes con 'descripcion corta'
UPDATE "Product" SET "shortDescription" = 'descripcion corta' WHERE "shortDescription" IS NULL;
