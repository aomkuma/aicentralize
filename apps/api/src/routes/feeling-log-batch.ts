import { SystemRole } from "@prisma/client";
import { Router } from "express";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import {
  getFeelingLogBatchSchedulerStatus,
  processPendingFeelingLogsBatch
} from "../services/feelingLogService";

export const feelingLogBatchRouter = Router();

feelingLogBatchRouter.get("/scheduler-status", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const status = await getFeelingLogBatchSchedulerStatus();
  res.json(status);
});

feelingLogBatchRouter.post("/run-now", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const summary = await processPendingFeelingLogsBatch({ force: true });
  res.json(summary);
});
