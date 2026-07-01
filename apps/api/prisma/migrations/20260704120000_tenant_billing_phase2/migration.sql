-- CreateEnum
CREATE TYPE "TenantBillingEventType" AS ENUM ('ACTIVATED', 'PERIOD_OPENED', 'PAYMENT_SUBMITTED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'PACKAGE_CHANGED', 'MARKED_PAST_DUE');

-- CreateEnum
CREATE TYPE "TenantBillingPeriodStatus" AS ENUM ('OPEN', 'AWAITING_PAYMENT', 'PAID', 'PAST_DUE', 'VOID');

-- CreateEnum
CREATE TYPE "TenantBillingPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TenantBillingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "type" "TenantBillingEventType" NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantBillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBillingPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "packageId" TEXT,
    "packageCode" TEXT NOT NULL,
    "packageName" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" "TenantBillingPeriodStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "paidAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantBillingPayment" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "TenantBillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "slipFileName" TEXT NOT NULL,
    "slipStoredName" TEXT NOT NULL,
    "slipMimeType" TEXT,
    "slipSizeBytes" INTEGER,
    "submittedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "TenantBillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantBillingEvent_tenantId_createdAt_idx" ON "TenantBillingEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantBillingEvent_type_createdAt_idx" ON "TenantBillingEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "TenantBillingPeriod_tenantId_periodStart_idx" ON "TenantBillingPeriod"("tenantId", "periodStart");

-- CreateIndex
CREATE INDEX "TenantBillingPeriod_status_periodEnd_idx" ON "TenantBillingPeriod"("status", "periodEnd");

-- CreateIndex
CREATE INDEX "TenantBillingPayment_periodId_status_idx" ON "TenantBillingPayment"("periodId", "status");

-- CreateIndex
CREATE INDEX "TenantBillingPayment_tenantId_submittedAt_idx" ON "TenantBillingPayment"("tenantId", "submittedAt");

-- AddForeignKey
ALTER TABLE "TenantBillingEvent" ADD CONSTRAINT "TenantBillingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingEvent" ADD CONSTRAINT "TenantBillingEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingPeriod" ADD CONSTRAINT "TenantBillingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingPeriod" ADD CONSTRAINT "TenantBillingPeriod_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SubscriptionPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingPayment" ADD CONSTRAINT "TenantBillingPayment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TenantBillingPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingPayment" ADD CONSTRAINT "TenantBillingPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingPayment" ADD CONSTRAINT "TenantBillingPayment_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantBillingPayment" ADD CONSTRAINT "TenantBillingPayment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill billing events + periods for already-activated tenants
INSERT INTO "TenantBillingEvent" ("id", "tenantId", "actorUserId", "type", "payloadJson", "createdAt")
SELECT
  'evt_act_' || t."id",
  t."id",
  t."activatedByUserId",
  'ACTIVATED'::"TenantBillingEventType",
  jsonb_build_object(
    'billingStartDate', t."billingStartDate",
    'backfill', true
  ),
  COALESCE(t."activatedAt", t."billingStartDate", t."createdAt")
FROM "Tenant" AS t
WHERE t."billingStartDate" IS NOT NULL;

INSERT INTO "TenantBillingEvent" ("id", "tenantId", "actorUserId", "type", "payloadJson", "createdAt")
SELECT
  'evt_per_' || t."id",
  t."id",
  t."activatedByUserId",
  'PERIOD_OPENED'::"TenantBillingEventType",
  jsonb_build_object(
    'periodStart', t."currentPeriodStart",
    'periodEnd', t."currentPeriodEnd",
    'backfill', true
  ),
  COALESCE(t."currentPeriodStart", t."billingStartDate", t."createdAt")
FROM "Tenant" AS t
WHERE t."billingStartDate" IS NOT NULL;

INSERT INTO "TenantBillingPeriod" (
  "id",
  "tenantId",
  "periodStart",
  "periodEnd",
  "packageId",
  "packageCode",
  "packageName",
  "amountCents",
  "currency",
  "status",
  "paidAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'per_' || t."id",
  t."id",
  COALESCE(t."currentPeriodStart", t."billingStartDate", t."createdAt"),
  t."currentPeriodEnd",
  t."currentPackageId",
  COALESCE(p."code", 'UNKNOWN'),
  p."name",
  COALESCE(p."priceCents", 0),
  COALESCE(p."currency", 'THB'),
  'PAID'::"TenantBillingPeriodStatus",
  COALESCE(t."billingStartDate", t."createdAt"),
  COALESCE(t."billingStartDate", t."createdAt"),
  NOW()
FROM "Tenant" AS t
LEFT JOIN "SubscriptionPackage" AS p ON p."id" = t."currentPackageId"
WHERE t."billingStartDate" IS NOT NULL;
