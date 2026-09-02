-- La caja física como entidad, el arqueo de dos saldos, la clave de salidas y la
-- unión de cuentas.
--
-- El paso delicado es `CashSession.cashRegisterId`: la columna es obligatoria y
-- hay turnos escritos desde antes de que existieran las cajas. Se crea nullable,
-- se le da a cada negocio su "Caja 1", se rellena, y recién ahí se marca NOT NULL.
-- Al revés, la migración falla en cualquier base con historial.

-- CreateEnum
CREATE TYPE "CashAccount" AS ENUM ('EFECTIVO', 'BANCO');

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashRegister_businessId_name_key" ON "CashRegister"("businessId", "name");

-- CreateIndex
CREATE INDEX "CashRegister_businessId_active_sortOrder_idx" ON "CashRegister"("businessId", "active", "sortOrder");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN "cashRegisterId" TEXT,
    ADD COLUMN "openingBankCop" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "expectedBankCop" INTEGER,
    ADD COLUMN "countedBankCop" INTEGER,
    ADD COLUMN "differenceBankCop" INTEGER;

-- Backfill: una "Caja 1" para TODO negocio, no solo para los que ya tienen
-- turnos. Un negocio sin caja creada no podría abrir el turno, y quedarse sin
-- poder cobrar por una actualización no es una migración, es una caída.
INSERT INTO "CashRegister" ("id", "businessId", "name", "active", "sortOrder", "createdAt", "updatedAt")
SELECT
    'cr_' || replace(gen_random_uuid()::text, '-', ''),
    b."id",
    'Caja 1',
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Business" b;

-- Backfill: los turnos que ya existían pasan a la caja principal de su negocio.
UPDATE "CashSession" cs
SET "cashRegisterId" = cr."id"
FROM "CashRegister" cr
WHERE cr."businessId" = cs."businessId" AND cs."cashRegisterId" IS NULL;

-- AlterTable
ALTER TABLE "CashSession" ALTER COLUMN "cashRegisterId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "CashSession_businessId_cashRegisterId_status_idx" ON "CashSession"("businessId", "cashRegisterId", "status");

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "CashRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN "account" "CashAccount" NOT NULL DEFAULT 'EFECTIVO';

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN "expensePinHash" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "mergedIntoId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
