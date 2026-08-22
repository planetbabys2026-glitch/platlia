-- Inventario: dos regímenes de stock excluyentes, costo propio y costo congelado
-- en la venta.
--
-- Hasta acá una cerveza de reventa se contaba DOS veces: `Product.stockQty` y un
-- `InventoryItem` espejo unido por una receta 1:1. La venta descontaba solo el
-- primero (porque el alta nunca marcaba `hasRecipe`) y la compra subía los dos, así
-- que el insumo espejo trepaba para siempre y la valorización del inventario
-- inflaba el patrimonio del negocio sin techo.
--
-- De acá en adelante un producto es de un régimen o del otro:
--   · sin receta  → `Product.trackStock` / `stockQty` / `costCop` / `stockMin`
--   · con receta  → los insumos de la receta
-- Nunca los dos sobre la misma unidad física.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columnas nuevas
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "BusinessSettings" ADD COLUMN     "permitirVentaSinStock" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Product" ADD COLUMN     "costCop" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockMin" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OrderItem" ADD COLUMN     "lineCostCop" INTEGER,
ADD COLUMN     "unitCostCopSnapshot" INTEGER;

ALTER TABLE "InventoryMovement" ADD COLUMN     "productId" TEXT,
ALTER COLUMN "inventoryItemId" DROP NOT NULL;

CREATE INDEX "InventoryMovement_businessId_productId_createdAt_idx" ON "InventoryMovement"("businessId", "productId", "createdAt");

CREATE INDEX "InventoryMovement_businessId_createdAt_idx" ON "InventoryMovement"("businessId", "createdAt");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sanar los espejos que ya existen
-- ─────────────────────────────────────────────────────────────────────────────

-- Un espejo es un producto de stock directo cuya única línea de receta es un 1:1
-- contra un insumo que no usa nadie más. Las tres condiciones juntas: si el insumo
-- aparece en otra receta o en un modificador es un ingrediente de verdad y no se
-- toca, y si la receta tiene más de una línea el producto no es de reventa.
CREATE TEMPORARY TABLE "_espejos_inventario" AS
SELECT
  p."id"              AS "productId",
  ri."id"             AS "recipeItemId",
  ii."id"             AS "inventoryItemId",
  ii."costCop"        AS "costCop",
  ii."stockMin"       AS "stockMin"
FROM "Product" p
JOIN "ProductRecipeItem" ri ON ri."productId" = p."id"
JOIN "InventoryItem"     ii ON ii."id" = ri."inventoryItemId"
WHERE p."trackStock" = true
  AND ri."quantityRequired" = 1
  AND (SELECT count(*) FROM "ProductRecipeItem" x WHERE x."productId" = p."id") = 1
  AND (SELECT count(*) FROM "ProductRecipeItem" y WHERE y."inventoryItemId" = ii."id") = 1
  AND NOT EXISTS (SELECT 1 FROM "ModifierOptionSupply" s WHERE s."inventoryItemId" = ii."id");

-- El costo y el mínimo se mudan al producto, que es donde van a vivir.
UPDATE "Product" p
SET "costCop"  = e."costCop",
    "stockMin" = e."stockMin"
FROM "_espejos_inventario" e
WHERE p."id" = e."productId";

-- El vínculo 1:1 desaparece: sin él el producto queda limpio en el régimen directo
-- y deja de aparecer en la pestaña de Recetas.
DELETE FROM "ProductRecipeItem" ri
USING "_espejos_inventario" e
WHERE ri."id" = e."recipeItemId";

-- El insumo espejo se ARCHIVA, no se borra. Sus `PurchaseInvoiceItem` e
-- `InventoryMovement` cuelgan con ON DELETE CASCADE: borrarlo se llevaría por
-- delante el historial de compras del negocio. Archivado sale de la valorización
-- y de las alertas, que es todo lo que hacía falta.
UPDATE "InventoryItem" ii
SET "deletedAt" = now()
FROM "_espejos_inventario" e
WHERE ii."id" = e."inventoryItemId"
  AND ii."deletedAt" IS NULL;

-- `Product.stockQty` se deja como está: es el contador que la venta venía moviendo,
-- o sea el único de los dos que refleja lo que de verdad pasó en el local.

DROP TABLE "_espejos_inventario";

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Hacer excluyentes los regímenes en lo que queda
-- ─────────────────────────────────────────────────────────────────────────────

-- Lo que se mide por sus insumos no se mide además por unidades. Manda la receta:
-- es la declaración explícita del dueño, y `stockQty` en un producto con receta
-- nunca se descontaba de todos modos.
UPDATE "Product"
SET "trackStock" = false
WHERE "hasRecipe" = true
  AND "trackStock" = true;
