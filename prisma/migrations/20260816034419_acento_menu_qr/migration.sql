-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "qrMenuAccent" TEXT NOT NULL DEFAULT '#FF4E1F',
ALTER COLUMN "qrMenuBgColor" SET DEFAULT '#171512',
ALTER COLUMN "qrMenuBgGradient" SET DEFAULT 'linear-gradient(135deg, #171512 0%, #3A3733 100%)';
