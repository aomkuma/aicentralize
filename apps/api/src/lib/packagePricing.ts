import type { PackageDiscountType } from "@prisma/client";

type PackagePriceInput = {
  priceCents: number;
  discountType: PackageDiscountType | null;
  discountValue: number;
};

export function effectivePackagePriceCents(pkg: PackagePriceInput): number {
  if (!pkg.discountType || pkg.discountValue <= 0) {
    return pkg.priceCents;
  }

  if (pkg.discountType === "FIXED") {
    return Math.max(0, pkg.priceCents - pkg.discountValue);
  }

  return Math.round((pkg.priceCents * (100 - pkg.discountValue)) / 100);
}
