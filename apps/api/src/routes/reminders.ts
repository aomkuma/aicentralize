import { ReminderLogType, SystemRole, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole, requireSystemRole } from "../middleware/auth";
import { listReminderDigests } from "../services/reminderDigestService";
import { runReminderNow } from "../services/reminderService";

export const reminderRouter = Router();

const listDigestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional()
});

const listReminderLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  reminderType: z.nativeEnum(ReminderLogType).optional(),
  actionItemId: z.string().min(1).optional()
});

reminderRouter.post("/run-now", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const summary = await runReminderNow();
  return res.json(summary);
});

reminderRouter.get("/digests", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = listDigestsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const result = await listReminderDigests(parsed.data);
  return res.json(result);
});

reminderRouter.get("/logs", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = listReminderLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const skip = (parsed.data.page - 1) * parsed.data.pageSize;

  const where = {
    reminderType: parsed.data.reminderType,
    actionItemId: parsed.data.actionItemId,
    actionItem: parsed.data.projectId
      ? {
          meeting: {
            projectId: parsed.data.projectId
          }
        }
      : undefined
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
