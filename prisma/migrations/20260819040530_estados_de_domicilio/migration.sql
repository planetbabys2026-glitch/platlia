-- El recorrido de un domicilio deja de ser un String libre y pasa a ser un enum.
--
-- La columna vieja tenía `@default('PENDIENTE')`, así que TODOS los pedidos del
-- negocio la traían puesta —una mesa incluía— y no servía para filtrar nada. Acá
-- se convierte con un mapa en vez de dejar que Prisma la borre y la recree:
-- perder el estado de los domicilios del día sería perder en qué punto del
-- reparto está cada uno.

CREATE TYPE "DeliveryStatus" AS ENUM (
  'POR_CONFIRMAR',
  'EN_PREPARACION',
  'LISTO',
  'EN_CAMINO',
  'ENTREGADO',
  'CANCELADO'
);

-- La columna era NOT NULL con default: los pedidos que no son domicilio pasan a
-- null, así que la restricción se suelta antes de convertir.
ALTER TABLE "Order" ALTER COLUMN "deliveryStatus" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "deliveryStatus" DROP NOT NULL;

ALTER TABLE "Order"
  ALTER COLUMN "deliveryStatus" TYPE "DeliveryStatus"
  USING (
    CASE
      -- Lo que no es un domicilio no tiene estado de reparto.
      WHEN "type" <> 'DOMICILIO' AND "channel" <> 'DOMICILIO_QR' THEN NULL
      -- 'PENDIENTE' era el default de la columna, no una decisión de nadie: en un
      -- pedido del QR significa que falta confirmarlo, y en uno que cargó el
      -- negocio significa que ya está en la cocina.
      WHEN "deliveryStatus" = 'PENDIENTE' AND "channel" = 'DOMICILIO_QR' THEN 'POR_CONFIRMAR'
      WHEN "deliveryStatus" = 'PENDIENTE' THEN 'EN_PREPARACION'
      WHEN "deliveryStatus" IN ('EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO')
        THEN "deliveryStatus"
      ELSE NULL
    END
  )::"DeliveryStatus";

ALTER TABLE "Order" ADD COLUMN "deliveryConfirmedAt" TIMESTAMPTZ(3);
ALTER TABLE "Order" ADD COLUMN "dispatchedAt"        TIMESTAMPTZ(3);
ALTER TABLE "Order" ADD COLUMN "deliveredAt"         TIMESTAMPTZ(3);

-- Lo entregado ya tiene su marca aproximada: la de cierre de la venta. Es mejor
-- que dejarla en null, porque los informes de tiempos arrancan desde acá.
UPDATE "Order"
   SET "deliveredAt" = COALESCE("closedAt", "updatedAt")
 WHERE "deliveryStatus" = 'ENTREGADO';

CREATE INDEX "Order_businessId_deliveryStatus_idx" ON "Order"("businessId", "deliveryStatus");
