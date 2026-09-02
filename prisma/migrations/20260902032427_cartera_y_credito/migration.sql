-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CREDITO';

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "creditoEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Deudor" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Deudor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fiado" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "deudorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderPaymentId" TEXT NOT NULL,
    "montoCop" INTEGER NOT NULL,
    "saldoCop" INTEGER NOT NULL,
    "saldadoEn" TIMESTAMPTZ(3),
    "condonadoEn" TIMESTAMPTZ(3),
    "condonadoPorId" TEXT,
    "condonadoMotivo" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Fiado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonoDeCartera" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "deudorId" TEXT NOT NULL,
    "montoCop" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "cashMovementId" TEXT,
    "cashSessionId" TEXT,
    "recibidoPorId" TEXT NOT NULL,
    "nota" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbonoDeCartera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionDeAbono" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "abonoId" TEXT NOT NULL,
    "fiadoId" TEXT NOT NULL,
    "montoCop" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AplicacionDeAbono_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deudor_businessId_deletedAt_idx" ON "Deudor"("businessId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deudor_businessId_telefono_key" ON "Deudor"("businessId", "telefono");

-- CreateIndex
CREATE UNIQUE INDEX "Fiado_orderId_key" ON "Fiado"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Fiado_orderPaymentId_key" ON "Fiado"("orderPaymentId");

-- CreateIndex
CREATE INDEX "Fiado_businessId_deudorId_saldoCop_idx" ON "Fiado"("businessId", "deudorId", "saldoCop");

-- CreateIndex
CREATE INDEX "Fiado_businessId_createdAt_idx" ON "Fiado"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AbonoDeCartera_cashMovementId_key" ON "AbonoDeCartera"("cashMovementId");

-- CreateIndex
CREATE INDEX "AbonoDeCartera_businessId_deudorId_createdAt_idx" ON "AbonoDeCartera"("businessId", "deudorId", "createdAt");

-- CreateIndex
CREATE INDEX "AplicacionDeAbono_businessId_fiadoId_idx" ON "AplicacionDeAbono"("businessId", "fiadoId");

-- AddForeignKey
ALTER TABLE "Deudor" ADD CONSTRAINT "Deudor_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_deudorId_fkey" FOREIGN KEY ("deudorId") REFERENCES "Deudor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_orderPaymentId_fkey" FOREIGN KEY ("orderPaymentId") REFERENCES "OrderPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_condonadoPorId_fkey" FOREIGN KEY ("condonadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fiado" ADD CONSTRAINT "Fiado_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoDeCartera" ADD CONSTRAINT "AbonoDeCartera_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoDeCartera" ADD CONSTRAINT "AbonoDeCartera_deudorId_fkey" FOREIGN KEY ("deudorId") REFERENCES "Deudor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoDeCartera" ADD CONSTRAINT "AbonoDeCartera_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoDeCartera" ADD CONSTRAINT "AbonoDeCartera_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoDeCartera" ADD CONSTRAINT "AbonoDeCartera_recibidoPorId_fkey" FOREIGN KEY ("recibidoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDeAbono" ADD CONSTRAINT "AplicacionDeAbono_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDeAbono" ADD CONSTRAINT "AplicacionDeAbono_abonoId_fkey" FOREIGN KEY ("abonoId") REFERENCES "AbonoDeCartera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionDeAbono" ADD CONSTRAINT "AplicacionDeAbono_fiadoId_fkey" FOREIGN KEY ("fiadoId") REFERENCES "Fiado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
