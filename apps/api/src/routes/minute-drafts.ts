import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { ensureDraftScopeAccess } from "../services/accessScopeService";
import { approveMinuteDraft, getMinuteDraftDetail, updateMinuteDraftEditableFields } from "../services/minuteDraftService";
import { ActionItemPriority, UserRole } from "@prisma/client";

export const minuteDraftRouter = Router();

const draftDecisionSchema = z.object({
  text: z.string().trim().min(1),
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().datetime().optional()
});

const draftActionItemSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().datetime().optional(),
  priority: z.nativeEnum(ActionItemPriority).optional()
});

const updateMinuteDraftSchema = z.object({
  summary: z.string().trim().min(1).optional(),
  keyPoints: z.array(z.string().trim().min(1)).optional(),
  decisions: z.array(draftDecisionSchema).optional(),
  actionItems: z.array(draftActionItemSchema).optional(),
  risks: z.array(z.object({ text: z.string().trim().min(1) })).optional(),
  openQuestions: z.array(z.object({ text: z.string().trim().min(1) })).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required"
});

minuteDraftRouter.get("/:draftId", requireAuth, async (req, res) => {
  const scope = await ensureDraftScopeAccess(req.user!, req.params.draftId);
  if (!scope.allowed) {
    if (scope.reason === "DRAFT_NOT_FOUND") {
      return res.status(404).json({ message: "Minute draft not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const draft = await getMinuteDraftDetail(req.params.draftId);
  if (!draft) {
    return res.status(404).json({ message: "Minute draft not found" });
  }

  return res.json(draft);
});

minuteDraftRouter.patch("/:draftId", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const scope = await ensureDraftScopeAccess(req.user!, req.params.draftId);
  if (!scope.allowed) {
    if (scope.reason === "DRAFT_NOT_FOUND") {
      return res.status(404).json({ message: "Minute draft not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const parsed = updateMinuteDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const draft = await updateMinuteDraftEditableFields(req.params.draftId, parsed.data);
  if (!draft) {
    return res.status(404).json({ message: "Minute draft not found" });
  }

  return res.json(draft);
});

minuteDraftRouter.post("/:draftId/approve", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const scope = await ensureDraftScopeAccess(req.user!, req.params.draftId);
  if (!scope.allowed) {
    if (scope.reason === "DRAFT_NOT_FOUND") {
      return res.status(404).json({ message: "Minute draft not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const result = await approveMinuteDraft(req.params.draftId, req.user!.id);
  if (!result) {
    return res.status(404).json({ message: "Minute draft not found" });
  }

  return res.status(201).json({
    minuteVersionId: result.version.id,
    versionNumber: result.version.versionNo,
    approvalStatus: result.version.status,
    decisionsCreated: result.decisionsCreated,
    actionItemsCreated: result.actionItemsCreated,
    knowledgeIndexing: result.knowledgeIndexing
  });
});
