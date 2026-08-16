-- Puesta al día: menú QR, facturación electrónica (Factus), turnero, inventario
-- como interruptor, canal del pedido y límite de sucursales.
--
-- Nada de esto es funcionalidad nueva: son columnas que ya estaban en
-- `schema.prisma` y en las bases de desarrollo desde hace semanas, creadas con
-- `db push` sin migración que las respalde. Un clon nuevo quedaba con un esquema
-- distinto al de todos los demás, y el primer `migrate dev` que alguien
-- intentara le proponía resetear la base entera para "arreglar" la diferencia.
--
-- Se generó con `prisma migrate diff --from-migrations prisma/migrations
-- --to-config-datasource` contra la base de desarrollo, y se marcó como aplicada
-- con `prisma migrate resolve` donde las columnas ya existían. Todo es aditivo y
-- con valor por defecto, así que en una base que no las tenga entra sin tocar
-- una sola fila.

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('POS', 'MESERO', 'MESA_QR', 'DOMICILIO_QR');

-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "documentosEmitidosConsumidos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "facturacionElectronicaHabilitada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "factusClientId" TEXT,
ADD COLUMN     "factusClientSecret" TEXT,
ADD COLUMN     "factusNumberingRangeId" INTEGER,
ADD COLUMN     "factusPassword" TEXT,
ADD COLUMN     "factusUsername" TEXT,
ADD COLUMN     "identificationDocumentCode" TEXT DEFAULT '31',
ADD COLUMN     "inventoryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalOrganizationCode" TEXT DEFAULT '1',
ADD COLUMN     "municipalityCode" TEXT DEFAULT '05001',
ADD COLUMN     "paquetesDocumentosDisponibles" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "qrMenuBgColor" TEXT NOT NULL DEFAULT '#101416',
ADD COLUMN     "qrMenuBgGradient" TEXT NOT NULL DEFAULT 'linear-gradient(135deg, #101416 0%, #1D4E51 100%)',
ADD COLUMN     "qrMenuBgImageUrl" TEXT,
ADD COLUMN     "qrMenuBgMode" TEXT NOT NULL DEFAULT 'SOLID',
ADD COLUMN     "qrMenuEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "qrMenuHeaderSubtitle" TEXT,
ADD COLUMN     "qrMenuHeaderTitle" TEXT,
ADD COLUMN     "qrMenuLogoUrl" TEXT,
ADD COLUMN     "recipesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responsibilities" TEXT DEFAULT 'R-99-PN',
ADD COLUMN     "tributeCode" TEXT DEFAULT 'ZZ',
ADD COLUMN     "turneroBadgePosition" TEXT NOT NULL DEFAULT 'TOP_RIGHT',
ADD COLUMN     "turneroImageIntervalSeconds" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "turneroImages" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "turneroMediaMode" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "turneroYoutubeUrl" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'POS',
ADD COLUMN     "deliveryStatus" TEXT NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "docNumber" TEXT,
ADD COLUMN     "docType" TEXT,
ADD COLUMN     "facturaElectronicaCufe" TEXT,
ADD COLUMN     "facturaElectronicaError" TEXT,
ADD COLUMN     "facturaElectronicaEstado" TEXT,
ADD COLUMN     "facturaElectronicaFecha" TIMESTAMPTZ(3),
ADD COLUMN     "facturaElectronicaNumero" TEXT,
ADD COLUMN     "facturaElectronicaUrlPdf" TEXT,
ADD COLUMN     "facturaElectronicaUrlQr" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "maxBranches" INTEGER NOT NULL DEFAULT 1;

