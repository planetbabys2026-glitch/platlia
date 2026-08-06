-- Elimina las presentaciones (ProductVariant): a partir de ahora cada
-- presentación es un producto separado.
--
-- Antes de tirar la tabla, se convierte cada presentación activa en un
-- producto independiente propio, y se archiva el producto padre que las
-- tenía: su rol queda absorbido por el nuevo producto que salió de la
-- presentación. Nada se pierde vendible; lo que se pierde es la relación
-- estructural, que en un renglón de pedido viejo no hace falta —
-- `nameSnapshot` ya trae "Cerveza nacional (Botella)" como texto congelado.

BEGIN;

-- 1. Una presentación activa -> un producto nuevo.
INSERT INTO "Product" (
  id, "businessId", "categoryId", name, description, sku, "imageUrl",
  "priceCop", "taxRateId", "sortOrder", active, "isAvailable",
  "trackStock", "stockQty", "kitchenStation", "preparationMinutes",
  "createdAt", "updatedAt", "deletedAt"
)
SELECT
  pv.id,
  p."businessId",
  p."categoryId",
  p.name || ' ' || pv.name,
  p.description,
  NULL,
  p."imageUrl",
  pv."priceCop",
  p."taxRateId",
  p."sortOrder",
  true,
  true,
  false,
  0,
  p."kitchenStation",
  p."preparationMinutes",
  now(),
  now(),
  NULL
FROM "ProductVariant" pv
JOIN "Product" p ON p.id = pv."productId"
WHERE pv.active = true;

-- 2. El producto padre de esas presentaciones ya no representa nada vendible
--    por su cuenta: su rol lo absorbió la presentación que ahora es su
--    propio producto. Se archiva, no se borra: sigue habiendo pedidos viejos
--    que lo referencian.
UPDATE "Product" p
SET "deletedAt" = now(), active = false, "isAvailable" = false, sku = NULL
WHERE EXISTS (
  SELECT 1 FROM "ProductVariant" pv
  WHERE pv."productId" = p.id AND pv.active = true
);

-- 3. Ya no hace falta el vínculo de un renglón de pedido a una presentación:
--    la presentación como entidad deja de existir.
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_variantId_fkey";
ALTER TABLE "OrderItem" DROP COLUMN "variantId";

-- 4. La tabla de presentaciones ya cumplió su función de origen de datos.
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_businessId_fkey";
ALTER TABLE "ProductVariant" DROP CONSTRAINT "ProductVariant_productId_fkey";
DROP TABLE "ProductVariant";

COMMIT;
