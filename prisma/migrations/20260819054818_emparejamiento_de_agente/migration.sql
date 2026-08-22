-- AlterTable
ALTER TABLE "PrintAgent" ADD COLUMN     "codigoExpiraEn" TIMESTAMPTZ(3),
ADD COLUMN     "codigoHash" TEXT,
ADD COLUMN     "emparejadoEn" TIMESTAMPTZ(3),
ALTER COLUMN "tokenHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PrintAgent_codigoHash_key" ON "PrintAgent"("codigoHash");

