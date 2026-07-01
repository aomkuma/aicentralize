import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ensureAskAiScopeAccess } from "../services/accessScopeService";
import { logAiRun } from "../services/aiRunLogService";
import { askFromApprovedMinutes } from "../services/approvedAskAiService";
import { ensureUserPackageFeature } from "../services/packageAccessService";
import { listTenantIdsForUser } from "../services/tenantAccessService";

export const askAiRouter = Router();

const askAiSchema = z.object({
  question: z.string().trim().min(3),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  includeRetrievalDebug: z.boolean().optional()
});

const askAiLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
  userId: z.string().min(1).optional()
});

const askAiConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional()
});

askAiRouter.post("/", requireAuth, async (req, res) => {
  const runStartMs = Date.now();
  const parsed = askAiSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const featureCheck = await ensureUserPackageFeature(req.user!, "AI_CHAT_BASIC", {
      projectId: parsed.data.projectId
    });
    if (!featureCheck.allowed) {
      return res.status(403).json({ message: featureCheck.message });
    }

    const scopeCheck = await ensureAskAiScopeAccess({
      userId: req.user!.id,
      role: req.user!.role,
      projectId: parsed.data.projectId,
      meetingId: parsed.data.meetingId
    });

    if (!scopeCheck.allowed) {
      if (scopeCheck.reason === "MEETING_NOT_FOUND") {
        return res.status(404).json({ message: "Meeting not found" });
      }

      if (scopeCheck.reason === "PROJECT_NOT_FOUND") {
        return res.status(404).json({ message: "Project not found" });
      }

      return res.status(403).json({ message: "Forbidden scope" });
    }

    const result = await askFromApprovedMinutes({
      ...parsed.data,
      requesterUserId: req.user!.id,
      requesterRole: req.user!.role,
      includeRetrievalDebug: parsed.data.includeRetrievalDebug === true && req.user?.role === UserRole.ADMIN
    });
    return res.json(result);
  } catch (error) {
    await logAiRun({
      operation: "ASK_AI_ANSWER",
      status: "FAILED",
      userId: req.user?.id,
      projectId: parsed.data.projectId,
      meetingId: parsed.data.meetingId,
      model: parsed.data.model,
      promptVersion: "ask-ai-grounded-v2",
      durationMs: Date.now() - runStartMs,
      errorMessage: error instanceof Error ? error.message : "unknown ask-ai error"
    });

    return res.status(502).json({
      message: "Ask-AI failed",
      detail: error instanceof Error ? error.message : "unknown error"
    });
  }
});

askAiRouter.get("/logs", requireAuth, async (req, res) => {
  if (req.user?.role !== UserRole.ADMIN) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const parsed = askAiLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  const where = {
    projectId: parsed.data.projectId,
    meetingId: parsed.data.meetingId,
    userId: parsed.data.userId
  };

  const [items, total] = await Promise.all([
    prisma.askAiQueryLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: parsed.data.pageSize,
      include: {
        user: { select: { id: true, email: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
        meeting: { select: { id: true, title: true, sessionAt: true } }
      }
    }),
    prisma.askAiQueryLog.count({ where })
  ]);

  return res.json({
    items,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total
  });
});

askAiRouter.get("/conversations", requireAuth, async (req, res) => {
  const parsed = askAiConversationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "AI_CHAT_BASIC", {
    projectId: parsed.data.projectId
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const tenantIds = await listTenantIdsForUser(req.user!);
  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  const where = {
    userId: req.user!.id,
    projectId: parsed.data.projectId,
    meetingId: parsed.data.meetingId,
    ...(tenantIds
      ? {
          AND: [
            {
              OR: [
                { project: { tenantId: { in: tenantIds } } },
                { projectId: null }
              ]
            }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.askAiQueryLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: parsed.data.pageSize,
      include: {
        project: { select: { id: true, code: true, name: true } },
        meeting: { select: { id: true, title: true, sessionAt: true } }
      }
    }),
    prisma.askAiQueryLog.count({ where })
  ]);

  return res.json({
    items,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    total
  });
});

askAiRouter.get("/conversations/:id", requireAuth, async (req, res) => {
  const featureCheck = await ensureUserPackageFeature(req.user!, "AI_CHAT_BASIC");
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const tenantIds = await listTenantIdsForUser(req.user!);
  const item = await prisma.askAiQueryLog.findUnique({
    where: { id: req.params.id },
    include: {
      project: { select: { id: true, code: true, name: true, tenantId: true } },
      meeting: { select: { id: true, title: true, sessionAt: true } }
    }
  });

  if (!item || item.userId !== req.user!.id) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (
    tenantIds &&
    item.projectId &&
    (!item.project?.tenantId || !tenantIds.includes(item.project.tenantId))
  ) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  return res.json(item);
});
