import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const count = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    reminderDigest: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: (...args: unknown[]) => count(...args)
    }
  }
}));

import { listReminderDigests } from "./reminderDigestService";

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
});

describe("listReminderDigests tenant scoping", () => {
  it("restricts to the caller's tenants when tenantIds is provided", async () => {
    await listReminderDigests({ page: 1, pageSize: 20, tenantIds: ["t1", "t2"] });

    const where = findMany.mock.calls[0][0].where;
    expect(where.project).toEqual({ tenantId: { in: ["t1", "t2"] } });
    expect(count.mock.calls[0][0].where.project).toEqual({ tenantId: { in: ["t1", "t2"] } });
  });

  it("applies no tenant filter for platform admins (tenantIds undefined)", async () => {
    await listReminderDigests({ page: 1, pageSize: 20 });

    expect(findMany.mock.calls[0][0].where.project).toBeUndefined();
  });

  it("scopes to no data for a user with no active tenants (empty array)", async () => {
    await listReminderDigests({ page: 1, pageSize: 20, tenantIds: [] });

    expect(findMany.mock.calls[0][0].where.project).toEqual({ tenantId: { in: [] } });
  });
});
