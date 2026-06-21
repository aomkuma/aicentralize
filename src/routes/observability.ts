import { AiRunOperation, AiRunStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const observabilityRouter = Router();

const aiRunLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  operation: z.nativeEnum(AiRunOperation).optional(),
  status: z.nativeEnum(AiRunStatus).optional(),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
  userId: z.string().min(1).optional()
});

observabilityRouter.get("/ai-runs", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = aiRunLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  const where = {
    operation: parsed.data.operation,
    status: parsed.data.status,
    projectId: parsed.data.projectId,
    meetingId: parsed.data.meetingId,
    userId: parsed.data.userId
  };

  const [items, total] = await Promise.all([
    prisma.aiRunLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: parsed.data.pageSize,
      include: {
        user: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, code: true, name: true } },
        meeting: { select: { id: true, title: true, sessionAt: true } }
      }
    }),
    prisma.aiRunLog.count({ where })
  ]);

  return res.json({
    items,
    total,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize
  });
});
