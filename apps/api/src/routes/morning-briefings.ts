import { MorningBriefingAckMood, SystemRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import {
  acknowledgeMorningBriefing,
  getMorningBriefingSchedulerStatus,
  getLatestMorningBriefingForUser,
  runMorningBriefingsForAllTenants
} from "../services/morningBriefingService";
import { ensureTenantMembership } from "../services/tenantAccessService";

export const morningBriefingRouter = Router();

const latestQuerySchema = z.object({
  tenantId: z.string().optional()
});

const acknowledgeSchema = z.object({
  mood: z.nativeEnum(MorningBriefingAckMood),
  reviewAgain: z.boolean().optional()
});

morningBriefingRouter.get("/me/latest", requireAuth, async (req, res) => {
  const parsed = latestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid query", issues: parsed.error.flatten() });
    return;
  }

  if (parsed.data.tenantId) {
    const allowed = await ensureTenantMembership(req.user!, parsed.data.tenantId);
    if (!allowed) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
  }

  const briefing = await getLatestMorningBriefingForUser({
    userId: req.user!.id,
    tenantId: parsed.data.tenantId
  });

  res.json({ briefing });
});

morningBriefingRouter.post("/:briefingId/acknowledge", requireAuth, async (req, res) => {
  const parsed = acknowledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload", issues: parsed.error.flatten() });
    return;
  }

  const acknowledgement = await acknowledgeMorningBriefing({
    briefingId: req.params.briefingId,
    userId: req.user!.id,
    mood: parsed.data.mood,
    reviewAgain: parsed.data.reviewAgain
  });

  if (!acknowledgement) {
    res.status(404).json({ message: "Morning briefing not found" });
    return;
  }

  res.json({
    acknowledgement: {
      id: acknowledgement.id,
      mood: acknowledgement.mood,
      score: acknowledgement.score,
      reviewAgain: acknowledgement.reviewAgain,
      createdAt: acknowledgement.createdAt
    }
  });
});

morningBriefingRouter.post("/run-now", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const summary = await runMorningBriefingsForAllTenants();
  res.json(summary);
});

morningBriefingRouter.get("/scheduler-status", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const status = await getMorningBriefingSchedulerStatus();
  res.json(status);
});
