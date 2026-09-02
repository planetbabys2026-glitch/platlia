-- El televisor del salón puede mostrar el logo del negocio en vez del de Platlia.
-- Apagado de fábrica: sin logo cargado, el hueco se lee como pantalla rota.
ALTER TABLE "BusinessSettings" ADD COLUMN "turneroMostrarLogo" BOOLEAN NOT NULL DEFAULT false;

-- El logo ya rasterizado para la térmica. Se precalcula al subir porque el recibo
-- se encola DENTRO de la transacción que cierra la venta: una llamada de red ahí
-- sería un lock de base esperando a Cloudinary.
CREATE TABLE "LogoDeTirilla" (
    "businessId" TEXT NOT NULL,
    "anchoPuntos" INTEGER NOT NULL,
    "alto" INTEGER NOT NULL,
    "datos" BYTEA NOT NULL,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogoDeTirilla_pkey" PRIMARY KEY ("businessId","anchoPuntos")
);

ALTER TABLE "LogoDeTirilla" ADD CONSTRAINT "LogoDeTirilla_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
