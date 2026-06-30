CREATE TYPE "PackageDiscountType" AS ENUM ('FIXED', 'PERCENT');

ALTER TABLE "SubscriptionPackage"
  ADD COLUMN "discountType" "PackageDiscountType",
  ADD COLUMN "discountValue" INTEGER NOT NULL DEFAULT 0;
