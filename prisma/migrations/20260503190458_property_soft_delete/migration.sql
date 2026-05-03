-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Property_tenantId_deletedAt_idx" ON "Property"("tenantId", "deletedAt");
