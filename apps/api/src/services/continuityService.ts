import { ActionStatus, ActionItemPriority } from "@prisma/client";
import { prisma } from "../lib/prisma";

const ACTIVE_ACTION_STATUSES: ActionStatus[] = [
  ActionStatus.OPEN,
  ActionStatus.TODO,
  ActionStatus.IN_PROGRESS,
  ActionStatus.BLOCKED
];

function toMapById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

export async function getProjectContinuitySummaries(input: {
  projectId?: string;
  tenantIds?: string[];
  page: number;
  pageSize: number;
  staleAfterDays?: number;
}) {
  const now = new Date();
  const lookAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const staleAfterDays = input.staleAfterDays ?? 30;

  const whereProject = {
    ...(input.projectId ? { id: input.projectId } : {}),
    ...(input.tenantIds ? { tenantId: { in: input.tenantIds } } : {})
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: whereProject,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        code: true,
        name: true,
        createdAt: true
      }
    }),
    prisma.project.count({ where: whereProject })
  ]);

  if (!projects.length) {
    return {
      page: input.page,
      pageSize: input.pageSize,
      total,
      items: []
    };
  }

  const projectIds = projects.map((project) => project.id);

  const [actionItems, meetings, minuteVersions] = await Promise.all([
    prisma.actionItem.findMany({
      where: {
        meeting: {
          projectId: { in: projectIds }
        }
      },
      select: {
        id: true,
        meeting: {
          select: {
            projectId: true
          }
        },
        assigneeId: true,
        dueDate: true,
        status: true
      }
    }),
    prisma.meeting.findMany({
      where: {
        projectId: { in: projectIds }
      },
      select: {
        id: true,
        projectId: true,
        sessionAt: true,
        createdAt: true
      }
    }),
    prisma.minuteVersion.findMany({
      where: {
        meeting: {
          projectId: { in: projectIds }
        }
      },
      select: {
        approvedAt: true,
        _count: {
          select: {
            decisions: true
          }
        },
        meeting: {
          select: {
            projectId: true
          }
        }
      }
    })
  ]);

  const summaryByProject = new Map<string, {
    totalOpenActionItems: number;
    overdueActionItems: number;
    dueSoonActionItems: number;
    blockedActionItems: number;
    unassignedActionItems: number;
    lastApprovedMeetingDate: Date | null;
    lastMeetingDate: Date | null;
    recentDecisionCount: number;
  }>();

  for (const projectId of projectIds) {
    summaryByProject.set(projectId, {
      totalOpenActionItems: 0,
      overdueActionItems: 0,
      dueSoonActionItems: 0,
      blockedActionItems: 0,
      unassignedActionItems: 0,
      lastApprovedMeetingDate: null,
      lastMeetingDate: null,
      recentDecisionCount: 0
    });
  }

  for (const item of actionItems) {
    const target = summaryByProject.get(item.meeting.projectId);
    if (!target) {
      continue;
    }

    if (ACTIVE_ACTION_STATUSES.includes(item.status)) {
      target.totalOpenActionItems += 1;

      if (item.status === ActionStatus.BLOCKED) {
        target.blockedActionItems += 1;
      }

      if (item.dueDate < now) {
        target.overdueActionItems += 1;
      } else if (item.dueDate <= lookAhead) {
        target.dueSoonActionItems += 1;
      }
    }

    if (!item.assigneeId) {
      target.unassignedActionItems += 1;
    }
  }

  for (const meeting of meetings) {
    const target = summaryByProject.get(meeting.projectId);
    if (!target) {
      continue;
    }

    if (!target.lastMeetingDate || target.lastMeetingDate < meeting.sessionAt) {
      target.lastMeetingDate = meeting.sessionAt;
    }
  }

  const recentDecisionCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const version of minuteVersions) {
    const target = summaryByProject.get(version.meeting.projectId);
    if (!target) {
      continue;
    }

    if (!target.lastApprovedMeetingDate || target.lastApprovedMeetingDate < version.approvedAt) {
      target.lastApprovedMeetingDate = version.approvedAt;
    }

    if (version.approvedAt >= recentDecisionCutoff) {
      target.recentDecisionCount += version._count.decisions;
    }
  }

  const items = projects.map((project) => {
    const summary = summaryByProject.get(project.id)!;
    const staleCutoff = new Date(now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000);

    return {
      project,
      summary: {
        ...summary,
        staleProject: summary.lastMeetingDate ? summary.lastMeetingDate < staleCutoff : true
      }
    };
  });

  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    items
  };
}

export async function getOverdueByOwner(input: {
  projectId?: string;
  tenantIds?: string[];
  limit: number;
}) {
  const now = new Date();
  const overdueItems = await prisma.actionItem.findMany({
    where: {
      meeting: input.projectId
        ? { projectId: input.projectId }
        : input.tenantIds ? { project: { tenantId: { in: input.tenantIds } } } : undefined,
      status: { in: ACTIVE_ACTION_STATUSES },
      dueDate: { lt: now }
    },
    select: {
      id: true,
      task: true,
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
          project: {
            select: {
              id: true,
              code: true,
              name: true
            }
          }
        }
      }
    },
    orderBy: { dueDate: "asc" }
  });

  const grouped = new Map<string, {
    owner: { id: string; name: string; email: string };
    overdueCount: number;
    projects: Set<string>;
    items: Array<{
      id: string;
      task: string;
      dueDate: Date;
      status: ActionStatus;
      meeting: { id: string; title: string };
      project: { id: string; code: string; name: string };
    }>;
  }>();

  for (const item of overdueItems) {
    const key = item.assigneeId;
    const existing = grouped.get(key);

    if (existing) {
      existing.overdueCount += 1;
      existing.projects.add(item.meeting.project.id);
      if (existing.items.length < 10) {
        existing.items.push({
          id: item.id,
          task: item.task,
          dueDate: item.dueDate,
          status: item.status,
          meeting: { id: item.meeting.id, title: item.meeting.title },
          project: item.meeting.project
        });
      }
      continue;
    }

    grouped.set(key, {
      owner: {
        id: item.assignee.id,
        name: item.assignee.name,
        email: item.assignee.email
      },
      overdueCount: 1,
      projects: new Set([item.meeting.project.id]),
      items: [{
        id: item.id,
        task: item.task,
        dueDate: item.dueDate,
        status: item.status,
        meeting: { id: item.meeting.id, title: item.meeting.title },
        project: item.meeting.project
      }]
    });
  }

  return Array.from(grouped.values())
    .map((row) => ({
      owner: row.owner,
      overdueCount: row.overdueCount,
      projectCount: row.projects.size,
      items: row.items
    }))
    .sort((a, b) => b.overdueCount - a.overdueCount)
    .slice(0, input.limit);
}

export async function getOverdueByProject(input: {
  tenantIds?: string[];
  limit: number;
}) {
  const now = new Date();
  const overdueItems = await prisma.actionItem.findMany({
    where: {
      meeting: input.tenantIds ? { project: { tenantId: { in: input.tenantIds } } } : undefined,
      status: { in: ACTIVE_ACTION_STATUSES },
      dueDate: { lt: now }
    },
    select: {
      id: true,
      task: true,
      dueDate: true,
      status: true,
      meeting: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              code: true,
              name: true
            }
          }
        }
      }
    },
    orderBy: { dueDate: "asc" }
  });

  const grouped = new Map<string, {
    project: { id: string; code: string; name: string };
    overdueCount: number;
    items: Array<{
      id: string;
      task: string;
      dueDate: Date;
      status: ActionStatus;
      meeting: { id: string; title: string };
    }>;
  }>();

  for (const item of overdueItems) {
    const key = item.meeting.project.id;
    const existing = grouped.get(key);

    if (existing) {
      existing.overdueCount += 1;
      if (existing.items.length < 10) {
        existing.items.push({
          id: item.id,
          task: item.task,
          dueDate: item.dueDate,
          status: item.status,
          meeting: { id: item.meeting.id, title: item.meeting.title }
        });
      }
      continue;
    }

    grouped.set(key, {
      project: item.meeting.project,
      overdueCount: 1,
      items: [{
        id: item.id,
        task: item.task,
        dueDate: item.dueDate,
        status: item.status,
        meeting: { id: item.meeting.id, title: item.meeting.title }
      }]
    });
  }

  return Array.from(grouped.values())
    .sort((a, b) => b.overdueCount - a.overdueCount)
    .slice(0, input.limit);
}

export async function getItemsWithMissingOwnerOrDueDate(input: {
  projectId?: string;
  tenantIds?: string[];
  limit: number;
}) {
  const baseWhere = input.projectId
    ? { meeting: { projectId: input.projectId } }
    : input.tenantIds ? { meeting: { project: { tenantId: { in: input.tenantIds } } } } : undefined;

  const missingOwner = await prisma.actionItem.findMany({
    where: {
      ...baseWhere,
      ownerDisplayName: null
    },
    select: {
      id: true,
      task: true,
      status: true,
      dueDate: true,
      assigneeId: true,
      meeting: {
        select: {
          id: true,
          title: true,
          project: {
            select: {
              id: true,
              code: true,
              name: true
            }
          }
        }
      }
    },
    take: input.limit,
    orderBy: { updatedAt: "desc" }
  });

  return {
    missingOwner,
    missingDueDate: [],
    notes: [
      "Schema currently enforces assigneeId and dueDate as required fields.",
      "missingOwner here reflects missing ownerDisplayName label, not missing assignee relation."
    ]
  };
}

export async function getRecentApprovedMeetingsWithActionCounts(input: {
  projectId?: string;
  tenantIds?: string[];
  days: number;
  limit: number;
}) {
  const now = new Date();
  const from = new Date(now.getTime() - input.days * 24 * 60 * 60 * 1000);

  const versions = await prisma.minuteVersion.findMany({
    where: {
      approvedAt: { gte: from },
      meeting: input.projectId
        ? { projectId: input.projectId }
        : input.tenantIds ? { project: { tenantId: { in: input.tenantIds } } } : undefined
    },
    select: {
      id: true,
      approvedAt: true,
      meetingId: true,
      meeting: {
        select: {
          id: true,
          title: true,
          sessionAt: true,
          project: {
            select: {
              id: true,
              code: true,
              name: true
            }
          }
        }
      },
      _count: {
        select: {
          decisions: true,
          actionItems: true
        }
      }
    },
    orderBy: { approvedAt: "desc" },
    take: input.limit
  });

  const actionItems = await prisma.actionItem.findMany({
    where: {
      minuteVersionId: { in: versions.map((item) => item.id) }
    },
    select: {
      minuteVersionId: true,
      status: true
    }
  });

  const actionByVersion = new Map<string, { open: number; total: number }>();
  for (const item of actionItems) {
    const current = actionByVersion.get(item.minuteVersionId ?? "");
    const isOpen = ACTIVE_ACTION_STATUSES.includes(item.status);
    if (current) {
      current.total += 1;
      if (isOpen) {
        current.open += 1;
      }
      continue;
    }

    actionByVersion.set(item.minuteVersionId ?? "", {
      open: isOpen ? 1 : 0,
      total: 1
    });
  }

  return versions.map((version) => ({
    minuteVersionId: version.id,
    approvedAt: version.approvedAt,
    meeting: version.meeting,
    decisionCount: version._count.decisions,
    actionItemCount: actionByVersion.get(version.id)?.total ?? version._count.actionItems,
    openActionItemCount: actionByVersion.get(version.id)?.open ?? 0
  }));
}

export async function getProjectMemorySnapshot(projectId: string) {
  const now = new Date();

  const [project, versions, decisions, openCriticalActions, overdueItems] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, code: true, name: true }
    }),
    prisma.minuteVersion.findMany({
      where: { meeting: { projectId } },
      orderBy: { approvedAt: "desc" },
      take: 5,
      select: {
        id: true,
        approvedAt: true,
        versionNo: true,
        summary: true,
        meeting: {
          select: {
            id: true,
            title: true,
            sessionAt: true
          }
        }
      }
    }),
    prisma.decision.findMany({
      where: { meeting: { projectId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        detail: true,
        status: true,
        dueDate: true,
        meeting: {
          select: {
            id: true,
            title: true,
            sessionAt: true
          }
        }
      }
    }),
    prisma.actionItem.findMany({
      where: {
        meeting: { projectId },
        priority: ActionItemPriority.CRITICAL,
        status: { in: ACTIVE_ACTION_STATUSES }
      },
      orderBy: { dueDate: "asc" },
      take: 15,
      select: {
        id: true,
        task: true,
        detail: true,
        dueDate: true,
        status: true,
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
            title: true
          }
        }
      }
    }),
    prisma.actionItem.findMany({
      where: {
        meeting: { projectId },
        status: { in: ACTIVE_ACTION_STATUSES },
        dueDate: { lt: now }
      },
      orderBy: { dueDate: "asc" },
      take: 20,
      select: {
        id: true,
        task: true,
        dueDate: true,
        status: true,
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
            title: true
          }
        }
      }
    })
  ]);

  if (!project) {
    return null;
  }

  return {
    project,
    latestApprovedMinuteSummaries: versions,
    recentDecisions: decisions,
    openCriticalActions,
    overdueItems
  };
}
