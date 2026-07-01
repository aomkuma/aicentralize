import { prisma } from "../lib/prisma";
import { isPlatformAdmin, listTenantIdsForUser } from "./tenantAccessService";

export const INDIVIDUAL_PACKAGE_CODE = "INDIVIDUAL";

export function isIndividualPackageCode(packageCode: string | null | undefined): boolean {
  return packageCode?.trim().toUpperCase() === INDIVIDUAL_PACKAGE_CODE;
}

export async function isFeelingLogsEnabledForTenant(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      currentPackage: {
        select: { code: true }
      }
    }
  });

  return !isIndividualPackageCode(tenant?.currentPackage?.code);
}

export async function getTenantPackageFeatureCodes(tenantId: string): Promise<string[] | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      currentPackage: {
        select: { features: true }
      }
    }
  });

  if (!tenant?.currentPackage) {
    return null;
  }

  return tenant.currentPackage.features;
}

export async function tenantHasPackageFeature(tenantId: string, featureCode: string): Promise<boolean> {
  const features = await getTenantPackageFeatureCodes(tenantId);
  if (features === null) {
    return true;
  }

  return features.includes(featureCode);
}

export async function tenantHasAnyPackageFeature(tenantId: string, featureCodes: string[]): Promise<boolean> {
  const features = await getTenantPackageFeatureCodes(tenantId);
  if (features === null) {
    return true;
  }

  return featureCodes.some((code) => features.includes(code));
}

async function resolveTenantIdsForFeatureCheck(
  user: NonNullable<Express.Request["user"]>,
  opts?: { projectId?: string; tenantId?: string }
): Promise<string[] | undefined> {
  if (opts?.tenantId) {
    return [opts.tenantId];
  }

  if (opts?.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: opts.projectId },
      select: { tenantId: true }
    });

    if (project?.tenantId) {
      return [project.tenantId];
    }
  }

  return listTenantIdsForUser(user);
}

export async function userHasPackageFeature(
  user: NonNullable<Express.Request["user"]>,
  featureCode: string,
  opts?: { projectId?: string; tenantId?: string }
): Promise<boolean> {
  if (isPlatformAdmin(user)) {
    return true;
  }

  const tenantIds = await resolveTenantIdsForFeatureCheck(user, opts);
  if (!tenantIds) {
    return true;
  }

  for (const tenantId of tenantIds) {
    if (await tenantHasPackageFeature(tenantId, featureCode)) {
      return true;
    }
  }

  return false;
}

export async function userHasAnyPackageFeature(
  user: NonNullable<Express.Request["user"]>,
  featureCodes: string[],
  opts?: { projectId?: string; tenantId?: string }
): Promise<boolean> {
  if (isPlatformAdmin(user)) {
    return true;
  }

  const tenantIds = await resolveTenantIdsForFeatureCheck(user, opts);
  if (!tenantIds) {
    return true;
  }

  for (const tenantId of tenantIds) {
    if (await tenantHasAnyPackageFeature(tenantId, featureCodes)) {
      return true;
    }
  }

  return false;
}

export async function ensureUserPackageFeature(
  user: NonNullable<Express.Request["user"]>,
  featureCode: string,
  opts?: { projectId?: string; tenantId?: string }
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const allowed = await userHasPackageFeature(user, featureCode, opts);
  if (!allowed) {
    return { allowed: false, message: "Feature not available on current subscription package" };
  }

  return { allowed: true };
}
