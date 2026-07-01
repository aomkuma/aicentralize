import { ActionItemPriority, ActionStatus, SystemRole, TenantRole, UserRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actionItemFindUnique = vi.fn();
const projectFindUnique = vi.fn();
const userFindUnique = vi.fn();
const ensureTenantRole = vi.fn();
const notifyActionItemDueDateChanged = vi.fn();
const notifyActionItemPriorityChanged = vi.fn();
const notifyActionItemReassigned = vi.fn();
const notifyActionItemStatusChanged = vi.fn();
const transactionActionItemUpdate = vi.fn();
const transactionStatusHistoryCreate = vi.fn();

vi.mock("../lib/prisma", () => ({
  prisma: {
    actionItem: {
      findUnique: (...args: unknown[]) => actionItemFindUnique(...args)
    },
    project: {
      findUnique: (...args: unknown[]) => projectFindUnique(...args)
    },
    user: {
      findUnique: (...args: unknown[]) => userFindUnique(...args)
    },
    $transaction: async (callback: (tx: {
      actionItem: { update: (...args: unknown[]) => unknown };
      actionItemStatusHistory: { create: (...args: unknown[]) => unknown };
    }) => unknown) => callback({
      actionItem: {
        update: (...args: unknown[]) => transactionActionItemUpdate(...args)
      },
      actionItemStatusHistory: {
        create: (...args: unknown[]) => transactionStatusHistoryCreate(...args)
      }
    })
  }
}));

vi.mock("./tenantAccessService", () => ({
  ensureTenantRole: (...args: unknown[]) => ensureTenantRole(...args)
}));

vi.mock("./actionItemNotificationService", () => ({
  notifyActionItemDueDateChanged: (...args: unknown[]) => notifyActionItemDueDateChanged(...args),
  notifyActionItemPriorityChanged: (...args: unknown[]) => notifyActionItemPriorityChanged(...args),
  notifyActionItemReassigned: (...args: unknown[]) => notifyActionItemReassigned(...args),
  notifyActionItemStatusChanged: (...args: unknown[]) => notifyActionItemStatusChanged(...args)
}));

import { actionItemErrors, updateActionItem } from "./actionItemService";

const currentItem = {
  id: "action-1",
  projectId: "project-1",
  task: "Follow up",
  detail: "Old detail",
  assigneeId: "owner-1",
  ownerDisplayName: "Owner One",
  dueDate: new Date("2026-07-10T00:00:00.000Z"),
  priority: ActionItemPriority.MEDIUM,
  status: ActionStatus.TODO,
  source: "MANUAL",
  sourceDraftItemRef: null,
  completedAt: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z")
};

beforeEach(() => {
  vi.clearAllMocks();
  actionItemFindUnique.mockResolvedValue(currentItem);
  projectFindUnique.mockResolvedValue({ tenantId: "tenant-1" });
  userFindUnique.mockResolvedValue({ name: "Chief Executive" });
  ensureTenantRole.mockResolvedValue(false);
  transactionActionItemUpdate.mockResolvedValue({
    ...currentItem,
    detail: "Updated detail"
  });
  transactionStatusHistoryCreate.mockResolvedValue(undefined);
  notifyActionItemDueDateChanged.mockResolvedValue(undefined);
  notifyActionItemPriorityChanged.mockResolvedValue(undefined);
  notifyActionItemReassigned.mockResolvedValue(undefined);
  notifyActionItemStatusChanged.mockResolvedValue(undefined);
});

describe("updateActionItem tenant hierarchy", () => {
  it("allows a tenant admin with legacy MEMBER workflow role to edit another user's task", async () => {
    ensureTenantRole.mockResolvedValue(true);

    const result = await updateActionItem(
      "action-1",
      { detail: "Updated detail" },
      {
        id: "tenant-admin-1",
        role: UserRole.MEMBER,
        systemRole: SystemRole.USER
      }
    );

    expect(ensureTenantRole).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tenant-admin-1" }),
      "tenant-1",
      [TenantRole.TENANT_ADMIN]
    );
    expect(result.detail).toBe("Updated detail");
    expect(transactionActionItemUpdate).toHaveBeenCalled();
  });

  it("still blocks a normal member from editing another user's task", async () => {
    await expect(updateActionItem(
      "action-1",
      { detail: "Updated detail" },
      {
        id: "member-1",
        role: UserRole.MEMBER,
        systemRole: SystemRole.USER
      }
    )).rejects.toThrow(actionItemErrors.MUTABLE_BY_MEMBER_ERROR);
  });
});
