import { ActionStatus } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

type DigestSeverity = "DUE_SOON" | "OVERDUE" | "OVERDUE_SHORT" | "OVERDUE_ESCALATE";

function activeStatusesForReminder() {
  return [ActionStatus.OPEN, ActionStatus.TODO, ActionStatus.IN_PROGRESS, ActionStatus.BLOCKED];
}

function classifySeverity(dueDate: Date, now: Date, lookAhead: Date): DigestSeverity | null {
  if (dueDate >= now && dueDate <= lookAhead) {
    return "DUE_SOON";
  }

  if (dueDate >= now) {
    return null;
  }

  const overdueHours = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
  if (overdueHours >= env.reminderOverdueEscalateAfterHours) {
    return "OVERDUE_ESCALATE";
  }

  if (overdueHours >= env.reminderOverdueShortAfterHours) {
    return "OVERDUE_SHORT";
  }

  return "OVERDUE";
}

export async function generateReminderDigests(now = new Date()) {
  const lookAhead = new Date(now.getTime() + env.reminderLookAheadHours * 60 * 60 * 1000);

  const projects = await prisma.project.findMany({
    select: { id: true }
  });

  let generated = 0;

  for (const project of projects) {
    const items = await prisma.actionItem.findMany({
      where: {
        meeting: { projectId: project.id },
        status: { in: activeStatusesForReminder() }
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { dueDate: "asc" }
    });

    const dueSoonItems = items.filter((item) => item.dueDate >= now && item.dueDate <= lookAhead);
    const overdueItems = items.filter((item) => item.dueDate < now);
    const escalatedItems = overdueItems.filter((item) => {
      const overdueHours = (now.getTime() - item.dueDate.getTime()) / (1000 * 60 * 60);
      return overdueHours >= env.reminderOverdueEscalateAfterHours;
    });

    const overdueByOwner = new Map<string, { ownerId: string; ownerName: string; overdueCount: number }>();
    for (const item of overdueItems) {
      const existing = overdueByOwner.get(item.assigneeId);
      if (existing) {
        existing.overdueCount += 1;
      } else {
        overdueByOwner.set(item.assigneeId, {
          ownerId: item.assigneeId,
          ownerName: item.assignee.name,
          overdueCount: 1
        });
      }
    }

    const digestItems = items
      .map((item) => ({
        actionItemId: item.id,
        task: item.task,
        assigneeId: item.assigneeId,
        assigneeName: item.assignee.name,
        dueDate: item.dueDate.toISOString(),
        status: item.status,
        severity: classifySeverity(item.dueDate, now, lookAhead)
      }))
      .filter((item) => item.severity !== null)
      .slice(0, 100);

    await prisma.reminderDigest.create({
      data: {
        projectId: project.id,
        windowStart: new Date(now.getTime() - env.reminderLookAheadHours * 60 * 60 * 1000),
        windowEnd: now,
        totalOpen: items.length,
        totalDueSoon: dueSoonItems.length,
        totalOverdue: overdueItems.length,
        totalEscalated: escalatedItems.length,
        overdueByOwnerJson: Array.from(overdueByOwner.values()),
        itemsJson: digestItems
      }
    });

    generated += 1;
  }

  return {
    generated,
    generatedAt: now.toISOString()
  };
}

export async function listReminderDigests(params: {
  page: number;
  pageSize: number;
  projectId?: string;
  tenantIds?: string[];
  startDate?: Date;
  endDate?: Date;
}) {
  const skip = (params.page - 1) * params.pageSize;
  const where = {
    projectId: params.projectId,
    project: params.tenantIds ? { tenantId: { in: params.tenantIds } } : undefined,
    createdAt: params.startDate || params.endDate
      ? {
          gte: params.startDate,
          lte: params.endDate
        }
      : undefined
  };

  const [items, total] = await Promise.all([
    prisma.reminderDigest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: params.pageSize,
      include: {
        project: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.reminderDigest.count({ where })
  ]);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize
  };
}

export async function getReminderDigestDetail(params: {
  digestId: string;
  tenantIds?: string[];
}) {
  const digest = await prisma.reminderDigest.findFirst({
    where: {
      id: params.digestId,
      project: params.tenantIds ? { tenantId: { in: params.tenantIds } } : undefined
    },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  });

  if (!digest) {
    return null;
  }

  const rawItems = Array.isArray(digest.itemsJson) ? digest.itemsJson : [];
  const actionItemIds = rawItems
    .map((item) => typeof item === "object" && item && "actionItemId" in item ? String(item.actionItemId) : null)
    .filter((id): id is string => Boolean(id));

  const actionItems = actionItemIds.length
    ? await prisma.actionItem.findMany({
        where: { id: { in: actionItemIds } },
        select: {
          id: true,
          task: true,
          detail: true,
          dueDate: true,
          status: true,
          assigneeId: true,
          assignee: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          meeting: {
            select: {
              id: true,
              title: true,
              projectId: true
            }
          }
        }
      })
    : [];

  const actionById = new Map(actionItems.map((item) => [item.id, item]));
  const overdueByOwnerRaw = Array.isArray(digest.overdueByOwnerJson) ? digest.overdueByOwnerJson : [];

  return {
    ...digest,
    overdueByOwner: overdueByOwnerRaw.map((item) => {
      const row = item as { ownerId?: string; ownerName?: string; ownerEmail?: string; overdueCount?: number; count?: number };
      return {
        ownerId: row.ownerId,
        ownerName: row.ownerName,
        ownerEmail: row.ownerEmail,
        count: row.overdueCount ?? row.count ?? 0,
        items: []
      };
    }),
    items: rawItems.map((raw) => {
      const row = raw as {
        actionItemId?: string;
        task?: string;
        assigneeId?: string;
        assigneeName?: string;
        dueDate?: string;
        status?: string;
        severity?: string;
      };
      const action = row.actionItemId ? actionById.get(row.actionItemId) : undefined;
      return {
        id: row.actionItemId ?? action?.id ?? "",
        title: action?.task ?? row.task ?? "Untitled action",
        description: action?.detail,
        dueDate: action?.dueDate ?? row.dueDate,
        status: action?.status ?? row.status ?? "OPEN",
        ownerId: action?.assigneeId ?? row.assigneeId,
        ownerName: action?.assignee.name ?? row.assigneeName,
        ownerEmail: action?.assignee.email,
        projectId: action?.meeting.projectId ?? digest.projectId,
        meetingId: action?.meeting.id,
        meetingTitle: action?.meeting.title,
        severity: row.severity
      };
    })
  };
}
