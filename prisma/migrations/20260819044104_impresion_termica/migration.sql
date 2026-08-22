-- CreateEnum
CREATE TYPE "PrinterRole" AS ENUM ('RECIBO', 'COMANDA');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDIENTE', 'RECLAMADO', 'IMPRESO', 'ERROR');

-- CreateEnum
CREATE TYPE "ComandaDestino" AS ENUM ('KDS', 'IMPRESA', 'AMBAS');

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "comandaDestino" "ComandaDestino" NOT NULL DEFAULT 'KDS';

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rol" "PrinterRole" NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "width" "ReceiptWidth" NOT NULL DEFAULT 'MM80',
    "abreCajon" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintRoute" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrintRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "orderId" TEXT,
    "tipo" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "vistaPrevia" TEXT NOT NULL,
    "estado" "PrintJobStatus" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "reclamadoPor" TEXT,
    "reclamadoHasta" TIMESTAMPTZ(3),
    "impresoEn" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintAgent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ultimoContactoEn" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PrintAgent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Printer_businessId_active_idx" ON "Printer"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_businessId_name_key" ON "Printer"("businessId", "name");

-- CreateIndex
CREATE INDEX "PrintRoute_businessId_idx" ON "PrintRoute"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "PrintRoute_businessId_stationName_key" ON "PrintRoute"("businessId", "stationName");

-- CreateIndex
CREATE INDEX "PrintJob_businessId_estado_createdAt_idx" ON "PrintJob"("businessId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "PrintJob_printerId_estado_idx" ON "PrintJob"("printerId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "PrintAgent_tokenHash_key" ON "PrintAgent"("tokenHash");

-- CreateIndex
CREATE INDEX "PrintAgent_businessId_idx" ON "PrintAgent"("businessId");

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintRoute" ADD CONSTRAINT "PrintRoute_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintRoute" ADD CONSTRAINT "PrintRoute_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintAgent" ADD CONSTRAINT "PrintAgent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

