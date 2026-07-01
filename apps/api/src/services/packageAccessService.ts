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

export async function isMeetingStudioEnabledForTenant(tenantId: string): Promise<boolean> {
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

export async function ensureMeetingStudioAccess(
  user: NonNullable<Express.Request["user"]>,
  opts?: { projectId?: string; tenantId?: string; meetingId?: string }
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  if (isPlatformAdmin(user)) {
    return { allowed: true };
  }

  let tenantId = opts?.tenantId;

  if (!tenantId && opts?.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: opts.projectId },
      select: { tenantId: true }
    });
    tenantId = project?.tenantId ?? undefined;
  }

  if (!tenantId && opts?.meetingId) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: opts.meetingId },
      select: { project: { select: { tenantId: true } } }
    });
    tenantId = meeting?.project?.tenantId ?? undefined;
  }

  if (tenantId) {
    if (!(await isMeetingStudioEnabledForTenant(tenantId))) {
      return {
        allowed: false,
        message: "Meeting Studio is not available on the INDIVIDUAL package"
      };
    }
    return { allowed: true };
  }

  const tenantIds = await listTenantIdsForUser(user);
  if (!tenantIds?.length) {
    return { allowed: true };
  }

  const enabledTenantCount = await prisma.tenant.count({
    where: {
      id: { in: tenantIds },
      OR: [
        { currentPackageId: null },
        { currentPackage: { code: { not: INDIVIDUAL_PACKAGE_CODE } } }
      ]
    }
  });

  if (enabledTenantCount === 0) {
    return {
      allowed: false,
      message: "Meeting Studio is not available on the INDIVIDUAL package"
    };
  }

  return { allowed: true };
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
