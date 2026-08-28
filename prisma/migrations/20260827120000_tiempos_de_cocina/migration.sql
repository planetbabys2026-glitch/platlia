-- Tiempos de cocina: cuándo se tomó un renglón y quién lo tomó.
--
-- Las tres columnas son NULL para todo lo que ya está vendido, y eso es correcto:
-- nadie tocó "empezar" en un KDS que no registraba el toque. El informe distingue
-- ese NULL de un cero.

ALTER TABLE "OrderItem" ADD COLUMN "startedAt" TIMESTAMPTZ(3);
ALTER TABLE "OrderItem" ADD COLUMN "startedById" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "readyById" TEXT;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_startedById_fkey"
  FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_readyById_fkey"
  FOREIGN KEY ("readyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
