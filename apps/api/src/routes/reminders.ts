import { ReminderLogType, SystemRole, TenantRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import { getReminderDigestDetail, listReminderDigests } from "../services/reminderDigestService";
import { runReminderNow } from "../services/reminderService";
import { isPlatformAdmin } from "../services/tenantAccessService";

export const reminderRouter = Router();

const listDigestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const listReminderLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  reminderType: z.nativeEnum(ReminderLogType).optional(),
  actionItemId: z.string().min(1).optional()
});

async function listManagedTenantIdsForUser(user: NonNullable<Express.Request["user"]>): Promise<string[] | undefined> {
  if (isPlatformAdmin(user)) {
    return undefined;
  }

  const rows = await prisma.tenantMembership.findMany({
    where: {
      userId: user.id,
      isActive: true,
      role: { in: [TenantRole.TENANT_ADMIN, TenantRole.MANAGER] },
      tenant: { isActive: true }
    },
    select: {
      tenantId: true
    }
  });

  return rows.map((row) => row.tenantId);
}

function toDayStart(value?: string) {
  return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
}

function toDayEnd(value?: string) {
  return value ? new Date(`${value}T23:59:59.999Z`) : undefined;
}

reminderRouter.post("/run-now", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const summary = await runReminderNow();
  return res.json(summary);
});

reminderRouter.get("/digests", requireAuth, async (req, res) => {
  const parsed = listDigestsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const tenantIds = await listManagedTenantIdsForUser(req.user!);
  if (tenantIds?.length === 0) {
    return res.json({ items: [], total: 0, page: parsed.data.page, pageSize: parsed.data.pageSize });
  }

  const result = await listReminderDigests({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    projectId: parsed.data.projectId,
    tenantIds,
    startDate: toDayStart(parsed.data.startDate),
    endDate: toDayEnd(parsed.data.endDate)
  });
  return res.json(result);
});

reminderRouter.get("/digests/:digestId", requireAuth, async (req, res) => {
  const tenantIds = await listManagedTenantIdsForUser(req.user!);
  if (tenantIds?.length === 0) {
    return res.status(404).json({ message: "Reminder digest not found" });
  }

  const detail = await getReminderDigestDetail({
    digestId: req.params.digestId,
    tenantIds
  });

  if (!detail) {
    return res.status(404).json({ message: "Reminder digest not found" });
  }

  return res.json(detail);
});

reminderRouter.get("/logs", requireAuth, async (req, res) => {
  const parsed = listReminderLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const tenantIds = await listManagedTenantIdsForUser(req.user!);
  if (tenantIds?.length === 0) {
    return res.json({ items: [], total: 0, page: parsed.data.page, pageSize: parsed.data.pageSize });
  }

  const skip = (parsed.data.page - 1) * parsed.data.pageSize;

  const meetingFilter =
    parsed.data.projectId || tenantIds
      ? {
          meeting: {
            projectId: parsed.data.projectId,
            project: tenantIds ? { tenantId: { in: tenantIds } } : undefined
          }
        }
      : undefined;

  const where = {
    reminderType: parsed.data.reminderType,
    actionItemId: parsed.data.actionItemId,
    actionItem: meetingFilter
  };

  const [items, total] = await Promise.all([
    prisma.reminderLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip,
      take: parsed.data.pageSize,
      include: {
        actionItem: {
          select: {
            id: true,
            task: true,
            dueDate: true,
            status: true,
            assigneeId: true,
            meeting: {
              select: {
                id: true,
                title: true,
                projectId: true
              }
            }
          }
        },
        sentToUser: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    }),
    prisma.reminderLog.count({ where })
  ]);

  return res.json({
    items,
    total,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize
  });
});
