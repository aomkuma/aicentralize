import { SystemRole, TenantRole, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    tenantMembership: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      findMany: (...args: unknown[]) => findMany(...args)
    }
  }
}));

import {
  ensureTenantMembership,
  ensureTenantRole,
  isPlatformAdmin,
  isSuperAdmin,
  listTenantIdsForUser
} from "./tenantAccessService";

const TENANT_ID = "tenant-1";

const normalUser = {
  id: "user-1",
  role: UserRole.MEMBER,
  systemRole: SystemRole.USER
};

const moderator = {
  id: "mod-1",
  role: UserRole.MEMBER,
  systemRole: SystemRole.MODERATOR
};

const superAdmin = {
  id: "super-1",
  role: UserRole.MEMBER,
  systemRole: SystemRole.SUPER_ADMIN
};

function membership(overrides: {
  role?: TenantRole;
  isActive?: boolean;
  tenantActive?: boolean;
}) {
  return {
    role: overrides.role ?? TenantRole.MEMBER,
    isActive: overrides.isActive ?? true,
    tenant: { isActive: overrides.tenantActive ?? true }
  };
}

beforeEach(() => {
  findUnique.mockReset();
  findMany.mockReset();
});

describe("isPlatformAdmin / isSuperAdmin", () => {
  it("treats SUPER_ADMIN and MODERATOR as platform admins", () => {
    expect(isPlatformAdmin(superAdmin)).toBe(true);
    expect(isPlatformAdmin(moderator)).toBe(true);
    expect(isPlatformAdmin(normalUser)).toBe(false);
  });

  it("treats only SUPER_ADMIN as super admin", () => {
    expect(isSuperAdmin(superAdmin)).toBe(true);
    expect(isSuperAdmin(moderator)).toBe(false);
  });
});

describe("ensureTenantMembership", () => {
  it("allows platform admins without a membership lookup", async () => {
    await expect(ensureTenantMembership(superAdmin, TENANT_ID)).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows an active member of an active tenant", async () => {
    findUnique.mockResolvedValue(membership({ isActive: true, tenantActive: true }));
    await expect(ensureTenantMembership(normalUser, TENANT_ID)).resolves.toBe(true);
  });

  it("blocks an inactive member", async () => {
    findUnique.mockResolvedValue(membership({ isActive: false, tenantActive: true }));
    await expect(ensureTenantMembership(normalUser, TENANT_ID)).resolves.toBe(false);
  });

  it("blocks a member of an inactive tenant", async () => {
    findUnique.mockResolvedValue(membership({ isActive: true, tenantActive: false }));
    await expect(ensureTenantMembership(normalUser, TENANT_ID)).resolves.toBe(false);
  });

  it("blocks a user with no membership", async () => {
    findUnique.mockResolvedValue(null);
    await expect(ensureTenantMembership(normalUser, TENANT_ID)).resolves.toBe(false);
  });
});

describe("ensureTenantRole", () => {
  it("allows platform admins regardless of role", async () => {
    await expect(
      ensureTenantRole(moderator, TENANT_ID, [TenantRole.TENANT_ADMIN])
    ).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("allows an active member holding an allowed role", async () => {
    findUnique.mockResolvedValue(membership({ role: TenantRole.MANAGER }));
    await expect(
      ensureTenantRole(normalUser, TENANT_ID, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER])
    ).resolves.toBe(true);
  });

  it("blocks an allowed role when the member is inactive", async () => {
    findUnique.mockResolvedValue(membership({ role: TenantRole.MANAGER, isActive: false }));
    await expect(
      ensureTenantRole(normalUser, TENANT_ID, [TenantRole.MANAGER])
    ).resolves.toBe(false);
  });

  it("blocks an allowed role when the tenant is inactive", async () => {
    findUnique.mockResolvedValue(membership({ role: TenantRole.MANAGER, tenantActive: false }));
    await expect(
      ensureTenantRole(normalUser, TENANT_ID, [TenantRole.MANAGER])
    ).resolves.toBe(false);
  });

  it("blocks a member whose role is not allowed", async () => {
    findUnique.mockResolvedValue(membership({ role: TenantRole.VIEWER }));
    await expect(
      ensureTenantRole(normalUser, TENANT_ID, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER])
    ).resolves.toBe(false);
  });
});

describe("listTenantIdsForUser", () => {
  it("returns undefined for platform admins (unrestricted)", async () => {
    await expect(listTenantIdsForUser(superAdmin)).resolves.toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns only active tenant ids for a normal user", async () => {
    findMany.mockResolvedValue([{ tenantId: "t1" }, { tenantId: "t2" }]);
    await expect(listTenantIdsForUser(normalUser)).resolves.toEqual(["t1", "t2"]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: normalUser.id,
          isActive: true,
          tenant: { isActive: true }
        })
      })
    );
  });
});
