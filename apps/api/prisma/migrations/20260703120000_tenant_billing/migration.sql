-- CreateEnum
CREATE TYPE "TenantBillingStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Tenant"
  ADD COLUMN "billingStatus" "TenantBillingStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
  ADD COLUMN "billingStartDate" TIMESTAMP(3),
  ADD COLUMN "billingTimezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "activatedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Tenant_billingStatus_idx" ON "Tenant"("billingStatus");
CREATE INDEX "Tenant_billingStartDate_idx" ON "Tenant"("billingStartDate");
CREATE INDEX "Tenant_activatedByUserId_idx" ON "Tenant"("activatedByUserId");

-- AddForeignKey
ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_activatedByUserId_fkey"
  FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing tenants as already activated (billing clock started at org creation estimate)
UPDATE "Tenant" AS t
SET
  "billingStatus" = 'ACTIVE',
  "billingStartDate" = t."createdAt",
  "billingTimezone" = 'Asia/Bangkok',
  "currentPeriodStart" = t."createdAt",
  "activatedAt" = t."createdAt",
  "activatedByUserId" = t."createdById",
  "currentPeriodEnd" = CASE
    WHEN p."billingInterval" = 'YEARLY' THEN t."createdAt" + INTERVAL '1 year'
    WHEN p."billingInterval" = 'ONE_TIME' THEN NULL
    WHEN p."billingInterval" = 'CUSTOM' THEN NULL
    ELSE t."createdAt" + INTERVAL '1 month'
  END
FROM "SubscriptionPackage" AS p
WHERE t."currentPackageId" = p."id";

UPDATE "Tenant"
SET
  "billingStatus" = 'ACTIVE',
  "billingStartDate" = "createdAt",
  "billingTimezone" = 'Asia/Bangkok',
  "currentPeriodStart" = "createdAt",
  "activatedAt" = "createdAt",
  "activatedByUserId" = "createdById",
  "currentPeriodEnd" = "createdAt" + INTERVAL '1 month'
WHERE "billingStartDate" IS NULL;
