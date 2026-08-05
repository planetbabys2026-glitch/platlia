-- DropIndex
DROP INDEX "Order_businessId_businessDate_turnNumber_key";

-- CreateIndex
CREATE INDEX "Order_businessId_businessDate_turnNumber_idx" ON "Order"("businessId", "businessDate", "turnNumber");
