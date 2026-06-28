import { SystemRole, TenantRole, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";

export type TenantAuthUser = {
  id: string;
  role: UserRole;
  systemRole: SystemRole;
};

export function isSuperAdmin(user: TenantAuthUser): boolean {
  return user.systemRole === SystemRole.SUPER_ADMIN;
}

export function isPlatformAdmin(user: TenantAuthUser): boolean {
  return user.systemRole === SystemRole.SUPER_ADMIN || user.systemRole === SystemRole.MODERATOR;
}

export async function getTenantMembership(userId: string, tenantId: string) {
  return prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId
      }
    },
    select: {
      role: true,
      isActive: true,
      tenant: {
        select: {
          isActive: true
        }
      }
    }
  });
}

export async function ensureTenantMembership(user: TenantAuthUser, tenantId: string): Promise<boolean> {
  if (isPlatformAdmin(user)) {
    return true;
  }

  const membership = await getTenantMembership(user.id, tenantId);
  return Boolean(membership?.isActive && membership.tenant.isActive);
}

export async function ensureTenantRole(
  user: TenantAuthUser,
  tenantId: string,
  allowed: TenantRole[]
): Promise<boolean> {
  if (isPlatformAdmin(user)) {
    return true;
  }

  const membership = await getTenantMembership(user.id, tenantId);
  if (!membership?.isActive || !membership.tenant.isActive) {
    return false;
  }

  return allowed.includes(membership.role);
}

export async function listTenantIdsForUser(user: TenantAuthUser): Promise<string[] | undefined> {
  if (isPlatformAdmin(user)) {
    return undefined;
  }

  const rows = await prisma.tenantMembership.findMany({
    where: {
      userId: user.id,
      isActive: true,
      tenant: {
        isActive: true
      }
    },
    select: { tenantId: true }
  });

  return rows.map((item) => item.tenantId);
}
