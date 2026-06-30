import { ActionItemPriority, ActionItemSource, ActionStatus, TenantRole, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ensureProjectScopeAccess } from "./accessScopeService";
import { ensureTenantRole, type TenantAuthUser } from "./tenantAccessService";
import {
  notifyActionItemDueDateChanged,
  notifyActionItemPriorityChanged,
  notifyActionItemReassigned,
  notifyActionItemStatusChanged
} from "./actionItemNotificationService";

type ListActionItemsInput = {
  page: number;
  pageSize: number;
  projectId?: string;
  projectIds?: string[];
  meetingId?: string;
  ownerUserId?: string;
  status?: ActionStatus;
  overdueOnly?: boolean;
  dueFrom?: Date;
  dueTo?: Date;
};

type CreateActionItemInput = {
  projectId: string;
  title: string;
  description?: string;
  dueDate: Date;
  priority?: ActionItemPriority;
  ownerUserId?: string;
};

type UpdateActionItemInput = {
  detail?: string;
  dueDate?: Date;
  priority?: ActionItemPriority;
  ownerDisplayName?: string;
};

const MUTABLE_BY_MEMBER_ERROR = "MEMBER_FORBIDDEN";
const ACTION_ITEM_NOT_FOUND_ERROR = "ACTION_ITEM_NOT_FOUND";
const FORBIDDEN_SCOPE_ERROR = "FORBIDDEN_SCOPE";
const TARGET_OWNER_NOT_FOUND_ERROR = "TARGET_OWNER_NOT_FOUND";

function isClosedStatus(status: ActionStatus): boolean {
  return status === ActionStatus.DONE || status === ActionStatus.CANCELLED;
}

function isAllowedTransition(from: ActionStatus, to: ActionStatus): boolean {
  if (from === to) {
    return true;
  }

  const allowed = new Map<ActionStatus, ActionStatus[]>([
    [ActionStatus.OPEN, [ActionStatus.IN_PROGRESS, ActionStatus.BLOCKED, ActionStatus.DONE, ActionStatus.CANCELLED, ActionStatus.TODO]],
    [ActionStatus.TODO, [ActionStatus.OPEN, ActionStatus.IN_PROGRESS, ActionStatus.BLOCKED, ActionStatus.DONE, ActionStatus.CANCELLED]],
    [ActionStatus.IN_PROGRESS, [ActionStatus.DONE, ActionStatus.BLOCKED, ActionStatus.OPEN, ActionStatus.TODO, ActionStatus.CANCELLED]],
    [ActionStatus.BLOCKED, [ActionStatus.IN_PROGRESS, ActionStatus.OPEN, ActionStatus.TODO, ActionStatus.DONE, ActionStatus.CANCELLED]],
    [ActionStatus.DONE, [ActionStatus.OPEN, ActionStatus.TODO]],
    [ActionStatus.CANCELLED, [ActionStatus.OPEN, ActionStatus.TODO]]
  ]);

  return allowed.get(from)?.includes(to) ?? false;
}

async function assertCanMutate(actionItemId: string, user: { id: string; role: UserRole }) {
  const item = await prisma.actionItem.findUnique({ where: { id: actionItemId } });
  if (!item) {
    throw new Error(ACTION_ITEM_NOT_FOUND_ERROR);
  }

  if (user.role === UserRole.MEMBER && item.assigneeId !== user.id) {
    throw new Error(MUTABLE_BY_MEMBER_ERROR);
  }

  return item;
}

async function loadActorName(userId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true }
  });
  return actor?.name ?? "Someone";
}

type ActionItemWithRelations = {
  id: string;
  task: string;
  detail: string | null;
  assigneeId: string;
  ownerDisplayName: string | null;
  dueDate: Date;
  priority: ActionItemPriority;
  status: ActionStatus;
  createdAt: Date;
  project: {
    id: string;
    code: string;
    name: string;
  };
  assignee: {
    id: string;
    name: string;
    email: string;
  };
  meeting: {
    id: string;
    title: string;
    sessionAt: Date;
  } | null;
  minuteVersion: {
    id: string;
    versionNo: number;
    approvedAt: Date | null;
  } | null;
};

function mapActionItemListRow(item: ActionItemWithRelations, now: Date) {
  return {
    id: item.id,
    title: item.task,
    description: item.detail,
    ownerUserId: item.assigneeId,
    ownerDisplayName: item.ownerDisplayName ?? item.assignee.name,
    dueDate: item.dueDate,
    priority: item.priority,
    status: item.status,
    createdAt: item.createdAt,
    meeting: item.meeting
      ? {
        id: item.meeting.id,
        title: item.meeting.title,
        meetingDate: item.meeting.sessionAt
      }
      : null,
    project: item.project,
    minuteVersion: item.minuteVersion,
    overdue: item.dueDate < now && !isClosedStatus(item.status)
  };
}

const actionItemInclude = {
  assignee: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  project: {
    select: {
      id: true,
      code: true,
      name: true
    }
  },
  meeting: {
    select: {
      id: true,
      title: true,
      sessionAt: true
    }
  },
  minuteVersion: {
    select: {
      id: true,
      versionNo: true,
      approvedAt: true
    }
  }
} as const;

async function assertAssigneeInProject(projectId: string, assigneeId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true }
  });

  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, name: true }
  });

  if (!assignee) {
    throw new Error(TARGET_OWNER_NOT_FOUND_ERROR);
  }

  if (!project.tenantId) {
    return assignee;
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: project.tenantId,
        userId: assigneeId
      }
    },
    select: { isActive: true }
  });

  if (!membership?.isActive) {
    throw new Error(TARGET_OWNER_NOT_FOUND_ERROR);
  }

  return assignee;
}

export async function canAssignActionItemsToOthers(
  user: TenantAuthUser,
  projectId: string
): Promise<boolean> {
  if (user.role === UserRole.ADMIN || user.role === UserRole.PM) {
    return true;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true }
  });

  if (!project?.tenantId) {
    return false;
  }

  return ensureTenantRole(user, project.tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
}

export async function createActionItem(
  payload: CreateActionItemInput,
  user: TenantAuthUser
) {
  const projectScope = await ensureProjectScopeAccess(user, payload.projectId);
  if (!projectScope.allowed) {
    throw new Error(FORBIDDEN_SCOPE_ERROR);
  }

  const canAssignOthers = await canAssignActionItemsToOthers(user, payload.projectId);
  const assigneeId = canAssignOthers
    ? (payload.ownerUserId ?? user.id)
    : user.id;

  const assignee = await assertAssigneeInProject(payload.projectId, assigneeId);

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.actionItem.create({
      data: {
        projectId: payload.projectId,
        task: payload.title.trim(),
        detail: payload.description?.trim() || null,
        assigneeId: assignee.id,
        ownerDisplayName: assignee.name,
        dueDate: payload.dueDate,
        priority: payload.priority ?? ActionItemPriority.MEDIUM,
        status: ActionStatus.TODO,
        source: ActionItemSource.MANUAL
      },
      include: actionItemInclude
    });

    await tx.actionItemStatusHistory.create({
      data: {
        actionItemId: item.id,
        fromStatus: null,
        toStatus: ActionStatus.TODO,
        changedById: user.id,
        note: "Created from project task list"
      }
    });

    return item;
  });

  return mapActionItemListRow(created, new Date());
}

export async function listActionItems(input: ListActionItemsInput) {
  const now = new Date();
  const where: {
    projectId?: string | { in: string[] };
    meetingId?: string;
    assigneeId?: string;
    status?: ActionStatus;
    dueDate?: { gte?: Date; lte?: Date; lt?: Date };
    NOT?: { status: { in: ActionStatus[] } };
  } = {};

  if (input.meetingId) {
    where.meetingId = input.meetingId;
  }

  if (input.ownerUserId) {
    where.assigneeId = input.ownerUserId;
  }

  if (input.status) {
    where.status = input.status;
  }

  if (input.projectId) {
    where.projectId = input.projectId;
  } else if (input.projectIds?.length) {
    where.projectId = { in: input.projectIds };
  }

  if (input.overdueOnly) {
    where.dueDate = { lt: now };
    where.NOT = { status: { in: [ActionStatus.DONE, ActionStatus.CANCELLED] } };
  } else if (input.dueFrom || input.dueTo) {
    where.dueDate = {
      gte: input.dueFrom,
      lte: input.dueTo
    };
  }

  const [total, items] = await Promise.all([
    prisma.actionItem.count({ where }),
    prisma.actionItem.findMany({
      where,
      include: actionItemInclude,
      orderBy: [
        { dueDate: "asc" },
        { updatedAt: "desc" }
      ],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize
    })
  ]);

  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    items: items.map((item) => mapActionItemListRow(item, now))
  };
}

export async function getActionItemDetail(id: string) {
  const now = new Date();
  const item = await prisma.actionItem.findUnique({
    where: { id },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      project: {
        select: {
          id: true,
          code: true,
          name: true
        }
      },
      meeting: {
        select: {
          id: true,
          title: true,
          sessionAt: true
        }
      },
      minuteVersion: {
        select: {
          id: true,
          versionNo: true,
          approvedAt: true,
          approvedById: true
        }
      },
      statusHistory: {
        include: {
          changedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { changedAt: "desc" }
      },
      notifications: {
        orderBy: { sentAt: "desc" },
        take: 5
      }
    }
  });

  if (!item) {
    return null;
  }

  return {
    id: item.id,
    title: item.task,
    description: item.detail,
    ownerUserId: item.assigneeId,
    ownerDisplayName: item.ownerDisplayName ?? item.assignee.name,
    dueDate: item.dueDate,
    priority: item.priority,
    status: item.status,
    sourceType: item.source,
    sourceDraftItemRef: item.sourceDraftItemRef,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    overdue: item.dueDate < now && !isClosedStatus(item.status),
    meeting: item.meeting
      ? {
        id: item.meeting.id,
        title: item.meeting.title,
        meetingDate: item.meeting.sessionAt
      }
      : null,
    project: item.project,
    minuteVersion: item.minuteVersion,
    statusHistory: item.statusHistory,
    latestReminders: item.notifications
  };
}

export async function updateActionItem(
  id: string,
  payload: UpdateActionItemInput,
  user: { id: string; role: UserRole }
) {
  const current = await assertCanMutate(id, user);

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.actionItem.update({
      where: { id },
      data: {
        detail: payload.detail,
        dueDate: payload.dueDate,
        priority: payload.priority,
        ownerDisplayName: payload.ownerDisplayName
      }
    });

    if (payload.priority && payload.priority !== current.priority) {
      await tx.actionItemStatusHistory.create({
        data: {
          actionItemId: id,
          fromStatus: current.status,
          toStatus: current.status,
          changedById: user.id,
          note: `Priority changed from ${current.priority} to ${payload.priority}`
        }
      });
    }

    return item;
  });

  const actorName = await loadActorName(user.id);

  if (payload.dueDate && payload.dueDate.getTime() !== current.dueDate.getTime()) {
    void notifyActionItemDueDateChanged({
      actionItemId: id,
      assigneeUserId: current.assigneeId,
      actorUserId: user.id,
      actorName,
      task: current.task,
      previousDueDate: current.dueDate,
      nextDueDate: payload.dueDate
    }).catch((error) => {
      console.error("[action-item-notification] due date", error);
    });
  }

  if (payload.priority && payload.priority !== current.priority) {
    void notifyActionItemPriorityChanged({
      actionItemId: id,
      assigneeUserId: current.assigneeId,
      actorUserId: user.id,
      actorName,
      task: current.task,
      fromPriority: current.priority,
      toPriority: payload.priority
    }).catch((error) => {
      console.error("[action-item-notification] priority", error);
    });
  }

  return updated;
}

export async function reassignActionItem(
  id: string,
  payload: { ownerUserId: string; note?: string },
  user: { id: string; role: UserRole }
) {
  const current = await assertCanMutate(id, user);

  const target = await prisma.user.findUnique({
    where: { id: payload.ownerUserId },
    select: { id: true, name: true }
  });

  if (!target) {
    throw new Error("TARGET_OWNER_NOT_FOUND");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.actionItem.update({
      where: { id },
      data: {
        assigneeId: target.id,
        ownerDisplayName: target.name
      }
    });

    await tx.actionItemStatusHistory.create({
      data: {
        actionItemId: id,
        fromStatus: current.status,
        toStatus: current.status,
        changedById: user.id,
        note: payload.note ?? `Reassigned owner to ${target.name}`
      }
    });

    return item;
  });

  const actorName = await loadActorName(user.id);
  void notifyActionItemReassigned({
    actionItemId: id,
    newAssigneeUserId: target.id,
    previousAssigneeUserId: current.assigneeId,
    actorUserId: user.id,
    actorName,
    task: current.task,
    newAssigneeName: target.name
  }).catch((error) => {
    console.error("[action-item-notification] reassign", error);
  });

  return updated;
}

export async function changeActionItemStatus(
  id: string,
  payload: { status: ActionStatus; note?: string },
  user: { id: string; role: UserRole }
) {
  const current = await assertCanMutate(id, user);

  if (!isAllowedTransition(current.status, payload.status)) {
    throw new Error("INVALID_STATUS_TRANSITION");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.actionItem.update({
      where: { id },
      data: {
        status: payload.status,
        completedAt: payload.status === ActionStatus.DONE ? new Date() : null
      }
    });

    await tx.actionItemStatusHistory.create({
      data: {
        actionItemId: id,
        fromStatus: current.status,
        toStatus: payload.status,
        changedById: user.id,
        note: payload.note
      }
    });

    return item;
  });

  if (payload.status !== current.status) {
    const actorName = await loadActorName(user.id);
    void notifyActionItemStatusChanged({
      actionItemId: id,
      assigneeUserId: current.assigneeId,
      actorUserId: user.id,
      actorName,
      task: current.task,
      fromStatus: current.status,
      toStatus: payload.status
    }).catch((error) => {
      console.error("[action-item-notification] status", error);
    });
  }

  return updated;
}

export const actionItemErrors = {
  MUTABLE_BY_MEMBER_ERROR,
  ACTION_ITEM_NOT_FOUND_ERROR,
  FORBIDDEN_SCOPE_ERROR,
  TARGET_OWNER_NOT_FOUND_ERROR
};
