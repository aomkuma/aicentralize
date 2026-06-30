import { TenantRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { ensureTenantMembership, ensureTenantRole, isPlatformAdmin } from "../services/tenantAccessService";
import { createFeelingLog, getFeelingLogInbox, listMyFeelingLogs } from "../services/feelingLogService";

export const feelingLogRouter = Router({ mergeParams: true });

const createFeelingLogSchema = z.object({
  content: z.string().trim().min(1).max(12000),
  emoji: z.string().trim().max(16).optional().nullable(),
  mentionedUserIds: z.array(z.string().min(1)).optional().default([])
});

function serializeFeelingLog(log: Awaited<ReturnType<typeof listMyFeelingLogs>>[number]) {
  return {
    id: log.id,
    tenantId: log.tenantId,
    authorId: log.authorId,
    content: log.content,
    emoji: log.emoji,
    isPrivate: log.isPrivate,
    processedAt: log.processedAt?.toISOString() ?? null,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
    mentions: log.mentions.map((mention) => ({
      id: mention.id,
      mentionLabel: mention.mentionLabel,
      createdAt: mention.createdAt.toISOString(),
      mentionedUser: mention.mentionedUser
    })),
    analyses: log.analyses.map((analysis) => ({
      id: analysis.id,
      audience: analysis.audience,
      targetUserId: analysis.targetUserId,
      title: analysis.title,
      summary: analysis.summary,
      interpretation: analysis.interpretation,
      recommendation: analysis.recommendation,
      riskLevel: analysis.riskLevel,
      createdAt: analysis.createdAt.toISOString()
    }))
  };
}

feelingLogRouter.get("/me", requireAuth, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId is required" });
  }

  const hasAccess = await ensureTenantMembership(req.user!, tenantId);
  if (!hasAccess) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  try {
    const logs = await listMyFeelingLogs(tenantId, req.user!);
    return res.json({
      logs: logs.map(serializeFeelingLog)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "FORBIDDEN_TENANT_SCOPE") {
      return res.status(403).json({ message: "Forbidden tenant scope" });
    }
    console.error("[feeling-logs] failed to load personal logs", error);
    return res.status(500).json({ message: "Feeling log lookup failed" });
  }
});

feelingLogRouter.get("/inbox", requireAuth, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId is required" });
  }

  const hasAccess = isPlatformAdmin(req.user!)
    ? true
    : await ensureTenantRole(req.user!, tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!hasAccess) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  try {
    const inbox = await getFeelingLogInbox(tenantId, req.user!);
    return res.json(inbox);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "FORBIDDEN_TENANT_SCOPE") {
      return res.status(403).json({ message: "Forbidden tenant scope" });
    }
    console.error("[feeling-logs] failed to load inbox", error);
    return res.status(500).json({ message: "Feeling log inbox failed" });
  }
});

feelingLogRouter.post("/", requireAuth, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId is required" });
  }

  const hasAccess = await ensureTenantMembership(req.user!, tenantId);
  if (!hasAccess) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const parsed = createFeelingLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const log = await createFeelingLog({
      tenantId,
      authorId: req.user!.id,
      content: parsed.data.content,
      emoji: parsed.data.emoji?.trim() || null,
      mentionedUserIds: parsed.data.mentionedUserIds,
      user: req.user!
    });

    const logs = await listMyFeelingLogs(tenantId, req.user!);
    const created = logs.find((item) => item.id === log.id);
    return res.status(201).json({
      log: created ? serializeFeelingLog(created) : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (message === "FORBIDDEN_TENANT_SCOPE") {
      return res.status(403).json({ message: "Forbidden tenant scope" });
    }
    console.error("[feeling-logs] failed to create log", error);
    return res.status(500).json({ message: "Feeling log save failed" });
  }
});
