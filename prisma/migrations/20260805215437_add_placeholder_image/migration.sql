-- AlterTable
ALTER TABLE "BusinessSettings" ADD COLUMN     "defaultPlaceholderId" TEXT;

-- CreateTable
CREATE TABLE "PlaceholderImage" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlaceholderImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceholderImage_sortOrder_idx" ON "PlaceholderImage"("sortOrder");

-- AddForeignKey
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_defaultPlaceholderId_fkey" FOREIGN KEY ("defaultPlaceholderId") REFERENCES "PlaceholderImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
