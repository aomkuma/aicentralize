CREATE TABLE "SubscriptionPackage" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'THB',
  "billingInterval" TEXT NOT NULL DEFAULT 'MONTHLY',
  "maxProjects" INTEGER NOT NULL DEFAULT 1,
  "maxUsers" INTEGER NOT NULL DEFAULT 5,
  "additionalUserPriceCents" INTEGER NOT NULL DEFAULT 0,
  "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubscriptionPackage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPackage_code_key" ON "SubscriptionPackage"("code");
CREATE INDEX "SubscriptionPackage_isActive_isDefault_idx" ON "SubscriptionPackage"("isActive", "isDefault");
CREATE INDEX "SubscriptionPackage_createdAt_idx" ON "SubscriptionPackage"("createdAt");

ALTER TABLE "Tenant" ADD COLUMN "currentPackageId" TEXT;
CREATE INDEX "Tenant_currentPackageId_idx" ON "Tenant"("currentPackageId");

INSERT INTO "SubscriptionPackage" (
  "id",
  "code",
  "name",
  "description",
  "priceCents",
  "currency",
  "billingInterval",
  "maxProjects",
  "maxUsers",
  "additionalUserPriceCents",
  "features",
  "isActive",
  "isDefault",
  "updatedAt"
) VALUES (
  'pkg_free_default',
  'FREE',
  'Free',
  'Default starter package for new organizations.',
  0,
  'THB',
  'MONTHLY',
  1,
  5,
  0,
  ARRAY['AI_CHAT_BASIC','CONTINUITY_SUMMARY']::TEXT[],
  true,
  true,
  CURRENT_TIMESTAMP
);

UPDATE "Tenant"
SET "currentPackageId" = 'pkg_free_default'
WHERE "currentPackageId" IS NULL;

ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_currentPackageId_fkey"
  FOREIGN KEY ("currentPackageId") REFERENCES "SubscriptionPackage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
