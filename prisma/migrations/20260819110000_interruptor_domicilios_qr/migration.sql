-- El interruptor con el que el cajero abre y cierra los domicilios por QR.
--
-- Arranca apagado: hasta que alguien lo encienda, el menú público no acepta un
-- domicilio. Es la diferencia entre "este negocio reparte" (`deliveryEnabled`,
-- que es configuración) y "está recibiendo ahora" (esto, que es del turno).
ALTER TABLE "BusinessSettings" ADD COLUMN     "qrDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false;
