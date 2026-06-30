import { TenantRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { ensureTenantRole } from "../services/tenantAccessService";
import {
  getLatestMemberSnapshots,
  getLatestTenantSnapshot,
  runCommunicationSentimentBatchForTenant,
  serializeSnapshot
} from "../services/communicationSentimentService";
import { prisma } from "../lib/prisma";

export const communicationSentimentRouter = Router({ mergeParams: true });

const latestQuerySchema = z.object({
  memberUserId: z.string().min(1).optional()
});

communicationSentimentRouter.get("/latest", requireAuth, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId is required" });
  }

  const allowed = await ensureTenantRole(req.user!, tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const parsed = latestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const snapshot = await getLatestTenantSnapshot(tenantId, parsed.data.memberUserId);
  return res.json({ snapshot });
});

communicationSentimentRouter.get("/members", requireAuth, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId is required" });
  }

  const allowed = await ensureTenantRole(req.user!, tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const members = await getLatestMemberSnapshots(tenantId);
  return res.json({ members });
});

communicationSentimentRouter.post("/run", requireAuth, async (req, res) => {
  const tenantId = req.params.tenantId;
  if (!tenantId) {
    return res.status(400).json({ message: "tenantId is required" });
  }

  const allowed = await ensureTenantRole(req.user!, tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const result = await runCommunicationSentimentBatchForTenant(tenantId);
  const tenantSnapshot = await prisma.communicationSentimentSnapshot.findFirst({
    where: {
      tenantId,
      memberUserId: null,
      batchId: result.batchId
    },
    orderBy: { createdAt: "desc" }
  });

  return res.status(201).json({
    ...result,
    snapshot: tenantSnapshot ? serializeSnapshot(tenantSnapshot) : null
  });
});
