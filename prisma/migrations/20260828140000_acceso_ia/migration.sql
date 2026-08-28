-- CreateTable
CREATE TABLE "TokenIa" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "ultimoUsoEn" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenIa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenIa_tokenHash_key" ON "TokenIa"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenIa_businessId_idx" ON "TokenIa"("businessId");

-- AddForeignKey
ALTER TABLE "TokenIa" ADD CONSTRAINT "TokenIa_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenIa" ADD CONSTRAINT "TokenIa_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

