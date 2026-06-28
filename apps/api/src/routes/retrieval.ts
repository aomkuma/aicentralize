import { SystemRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import { ensureAskAiScopeAccess } from "../services/accessScopeService";
import { logAiRun } from "../services/aiRunLogService";
import { backfillKnowledgeChunks } from "../services/retrieval/knowledgeIndexService";
import { hybridRetrieveApprovedKnowledge } from "../services/retrieval/hybridRetrievalService";

export const retrievalRouter = Router();

const retrievalSearchSchema = z.object({
  question: z.string().trim().min(3),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional().default(12)
});

const backfillSchema = z.object({
  limit: z.number().int().min(1).max(1000).optional().default(200)
});

retrievalRouter.post("/search", requireAuth, async (req, res) => {
  const runStartMs = Date.now();
  const parsed = retrievalSearchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
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

  try {
    const result = await hybridRetrieveApprovedKnowledge(parsed.data);

    await logAiRun({
      operation: "RETRIEVAL_QUERY",
      status: "SUCCESS",
      userId: req.user?.id,
      projectId: parsed.data.projectId,
      meetingId: parsed.data.meetingId,
      model: result.provider.name,
      promptVersion: "retrieval-hybrid-v1",
      durationMs: Date.now() - runStartMs,
      retrievedIds: result.evidence.map((item) => item.chunkId),
      trace: {
        questionLength: parsed.data.question.length,
        evidenceCount: result.evidence.length,
        provider: result.provider,
        strategy: result.strategy
      }
    });

    return res.json(result);
  } catch (error) {
    await logAiRun({
      operation: "RETRIEVAL_QUERY",
      status: "FAILED",
      userId: req.user?.id,
      projectId: parsed.data.projectId,
      meetingId: parsed.data.meetingId,
      promptVersion: "retrieval-hybrid-v1",
      durationMs: Date.now() - runStartMs,
      errorMessage: error instanceof Error ? error.message : "unknown retrieval error"
    });

    return res.status(500).json({
      message: "Retrieval query failed",
      detail: error instanceof Error ? error.message : "unknown error"
    });
  }
});

retrievalRouter.post("/backfill", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = backfillSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const result = await backfillKnowledgeChunks(parsed.data.limit);
  return res.json(result);
});
