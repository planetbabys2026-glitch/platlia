/*
  Warnings:

  - You are about to drop the column `factusClientId` on the `BusinessSettings` table. All the data in the column will be lost.
  - You are about to drop the column `factusClientSecret` on the `BusinessSettings` table. All the data in the column will be lost.
  - You are about to drop the column `factusPassword` on the `BusinessSettings` table. All the data in the column will be lost.
  - You are about to drop the column `factusUsername` on the `BusinessSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BusinessSettings" DROP COLUMN "factusClientId",
DROP COLUMN "factusClientSecret",
DROP COLUMN "factusPassword",
DROP COLUMN "factusUsername";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "notaCreditoCufe" TEXT,
ADD COLUMN     "notaCreditoError" TEXT,
ADD COLUMN     "notaCreditoFecha" TIMESTAMPTZ(3),
ADD COLUMN     "notaCreditoNumero" TEXT,
ADD COLUMN     "notaCreditoUrlPdf" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "taxKindSnapshot" "TaxKind" NOT NULL DEFAULT 'IMPOCONSUMO';

-- CreateTable
CREATE TABLE "CompraDocumentosDian" (
    "id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoCop" INTEGER NOT NULL DEFAULT 0,
    "nota" TEXT,
    "compradoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompraDocumentosDian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompraDocumentosDian_compradoEn_idx" ON "CompraDocumentosDian"("compradoEn");
