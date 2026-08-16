-- AlterTable
ALTER TABLE "SubscriptionPayment" ADD COLUMN     "mesesOtorgados" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "periodicidad" TEXT NOT NULL DEFAULT 'MENSUAL',
ADD COLUMN     "sedes" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "ListaDePrecios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precioSedePrincipalCop" INTEGER NOT NULL DEFAULT 50000,
    "precioSedeAdicionalCop" INTEGER NOT NULL DEFAULT 30000,
    "mesesGratisSemestral" INTEGER NOT NULL DEFAULT 1,
    "mesesGratisAnual" INTEGER NOT NULL DEFAULT 2,
    "desde" TIMESTAMPTZ(3),
    "hasta" TIMESTAMPTZ(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ListaDePrecios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListaDePrecios_activa_desde_hasta_idx" ON "ListaDePrecios"("activa", "desde", "hasta");
