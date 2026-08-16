-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "deliveryFeeCop" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryFeeCop" INTEGER NOT NULL DEFAULT 0;
