-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "priceCop";

-- CreateTable
CREATE TABLE "TramoDePrecios" (
    "id" TEXT NOT NULL,
    "listaId" TEXT NOT NULL,
    "desdeSedes" INTEGER NOT NULL,
    "precioMensualCop" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TramoDePrecios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TramoDePrecios_listaId_desdeSedes_idx" ON "TramoDePrecios"("listaId", "desdeSedes");

-- CreateIndex
CREATE UNIQUE INDEX "TramoDePrecios_listaId_desdeSedes_key" ON "TramoDePrecios"("listaId", "desdeSedes");

-- AddForeignKey
ALTER TABLE "TramoDePrecios" ADD CONSTRAINT "TramoDePrecios_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "ListaDePrecios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

