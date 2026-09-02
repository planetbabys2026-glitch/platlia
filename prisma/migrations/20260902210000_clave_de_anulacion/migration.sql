-- Clave opcional para anular un pedido con consumo. Reemplaza la regla
-- "con consumo solo anula un administrador", que dejaba al mesero sin salida.
ALTER TABLE "BusinessSettings" ADD COLUMN "anulacionPinHash" TEXT;
