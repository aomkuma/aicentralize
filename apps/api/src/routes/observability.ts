import { AiRunOperation, AiRunStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { listTenantIdsForUser } from "../services/tenantAccessService";
import { ensureUserPackageFeature, userHasAnyPackageFeature } from "../services/packageAccessService";

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

const askAiQueriesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
  userId: z.string().min(1).optional()
});

observabilityRouter.get("/ai-runs", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = aiRunLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const featureCheck = await userHasAnyPackageFeature(req.user!, ["OBSERVABILITY_BASIC", "OBSERVABILITY_FULL"], {
    projectId: parsed.data.projectId
  });
  if (!featureCheck) {
    return res.status(403).json({ message: "Feature not available on current subscription package" });
  }

  const tenantIds = await listTenantIdsForUser(req.user!);
  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  const where = {
    operation: parsed.data.operation,
    status: parsed.data.status,
    projectId: parsed.data.projectId,
    meetingId: parsed.data.meetingId,
    userId: parsed.data.userId,
    project: tenantIds ? { tenantId: { in: tenantIds } } : undefined
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

observabilityRouter.get("/ai-runs/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const tenantIds = await listTenantIdsForUser(req.user!);
  const item = await prisma.aiRunLog.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, code: true, name: true, tenantId: true } },
      meeting: { select: { id: true, title: true, sessionAt: true } }
    }
  });

  if (!item || (tenantIds && !(item.project && tenantIds.includes(item.project.tenantId ?? "")))) {
    return res.status(404).json({ message: "AI run log not found" });
  }

  const featureCheck = await userHasAnyPackageFeature(req.user!, ["OBSERVABILITY_BASIC", "OBSERVABILITY_FULL"], {
    projectId: item.projectId ?? undefined
  });
  if (!featureCheck) {
    return res.status(403).json({ message: "Feature not available on current subscription package" });
  }

  return res.json(item);
});

observabilityRouter.get("/ask-ai-queries", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = askAiQueriesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "OBSERVABILITY_FULL", {
    projectId: parsed.data.projectId
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const tenantIds = await listTenantIdsForUser(req.user!);
  const skip = (parsed.data.page - 1) * parsed.data.pageSize;
  const where = {
    projectId: parsed.data.projectId,
    meetingId: parsed.data.meetingId,
    userId: parsed.data.userId,
    project: tenantIds ? { tenantId: { in: tenantIds } } : undefined
  };

  const [items, total] = await Promise.all([
    prisma.askAiQueryLog.findMany({
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
    prisma.askAiQueryLog.count({ where })
  ]);

  return res.json({
    items,
    total,
    page: parsed.data.page,
    pageSize: parsed.data.pageSize
  });
});

observabilityRouter.get("/ask-ai-queries/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const tenantIds = await listTenantIdsForUser(req.user!);
  const item = await prisma.askAiQueryLog.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, code: true, name: true, tenantId: true } },
      meeting: { select: { id: true, title: true, sessionAt: true } }
    }
  });

  if (!item || (tenantIds && !(item.project && tenantIds.includes(item.project.tenantId ?? "")))) {
    return res.status(404).json({ message: "Ask-AI query log not found" });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "OBSERVABILITY_FULL", {
    projectId: item.projectId ?? undefined
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  return res.json(item);
});
