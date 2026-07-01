import { TenantEntityType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { INDIVIDUAL_PACKAGE_CODE } from "./packageAccessService";

export async function getActiveTenantCategories(entityType?: TenantEntityType) {
  return prisma.tenantCategory.findMany({
    where: {
      isActive: true,
      ...(entityType ? { entityType } : {})
    },
    orderBy: [{ entityType: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
  });
}

export async function getTenantCategoryOrThrow(categoryId: string, entityType: TenantEntityType) {
  const category = await prisma.tenantCategory.findFirst({
    where: {
      id: categoryId,
      entityType,
      isActive: true
    }
  });

  if (!category) {
    throw new Error(`Invalid category for ${entityType.toLowerCase()} tenant`);
  }

  return category;
}

export async function getIndividualPackageOrThrow() {
  const pkg = await prisma.subscriptionPackage.findUnique({
    where: { code: INDIVIDUAL_PACKAGE_CODE }
  });

  if (!pkg || !pkg.isActive) {
    throw new Error("INDIVIDUAL package is not configured");
  }

  return pkg;
}
