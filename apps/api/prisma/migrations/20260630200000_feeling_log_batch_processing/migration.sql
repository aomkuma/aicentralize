-- AlterTable
ALTER TABLE "FeelingLog" ADD COLUMN "processedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "FeelingLog_tenantId_processedAt_idx" ON "FeelingLog"("tenantId", "processedAt");

-- Backfill logs that already have analyses from the immediate-processing era.
UPDATE "FeelingLog"
SET "processedAt" = "updatedAt"
WHERE "processedAt" IS NULL
  AND "id" IN (SELECT DISTINCT "feelingLogId" FROM "FeelingLogAnalysis");
