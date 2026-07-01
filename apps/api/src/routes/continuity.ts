import { TenantRole } from "@prisma/client";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ensureMeetingScopeAccess, ensureProjectScopeAccess } from "../services/accessScopeService";
import { ensureTenantRole, isPlatformAdmin } from "../services/tenantAccessService";
import {
  getItemsWithMissingOwnerOrDueDate,
  getOverdueByOwner,
  getOverdueByProject,
  getProjectContinuitySummaries,
  getProjectMemorySnapshot,
  getRecentApprovedMeetingsWithActionCounts
} from "../services/continuityService";
import { ensureUserPackageFeature } from "../services/packageAccessService";

export const continuityRouter = Router();

const summaryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  staleAfterDays: z.coerce.number().int().min(1).max(365).optional()
});

const overdueByOwnerQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const overdueByProjectQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const missingOwnerOrDueDateQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const recentMeetingsQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

async function resolveTenantScope(user: NonNullable<Request["user"]>, tenantId?: string) {
  if (tenantId) {
    const canUseTenantContinuity = await ensureTenantRole(user, tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
    if (!canUseTenantContinuity) {
      return { allowed: false as const, tenantIds: [] };
    }
    return { allowed: true as const, tenantIds: [tenantId] };
  }

  if (isPlatformAdmin(user)) {
    return { allowed: true as const, tenantIds: undefined };
  }

  const rows = await prisma.tenantMembership.findMany({
    where: {
      userId: user.id,
      isActive: true,
      role: { in: [TenantRole.TENANT_ADMIN, TenantRole.MANAGER] },
      tenant: { isActive: true }
    },
    select: { tenantId: true }
  });

  return {
    allowed: true as const,
    tenantIds: rows.map((row) => row.tenantId)
  };
}

continuityRouter.get("/summary", requireAuth, async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (parsed.data.projectId) {
    const scope = await ensureProjectScopeAccess(req.user!, parsed.data.projectId);
    if (!scope.allowed) {
      if (scope.reason === "PROJECT_NOT_FOUND") {
        return res.status(404).json({ message: "Project not found" });
      }
      return res.status(403).json({ message: "Forbidden scope" });
    }
  }

  const tenantScope = await resolveTenantScope(req.user!, parsed.data.tenantId);
  if (!tenantScope.allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "CONTINUITY_SUMMARY", {
    projectId: parsed.data.projectId,
    tenantId: parsed.data.tenantId
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const result = await getProjectContinuitySummaries({
    ...parsed.data,
    tenantIds: tenantScope.tenantIds
  });
  return res.json(result);
});

continuityRouter.get("/overdue/by-owner", requireAuth, async (req, res) => {
  const parsed = overdueByOwnerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (parsed.data.projectId) {
    const scope = await ensureProjectScopeAccess(req.user!, parsed.data.projectId);
    if (!scope.allowed) {
      if (scope.reason === "PROJECT_NOT_FOUND") {
        return res.status(404).json({ message: "Project not found" });
      }
      return res.status(403).json({ message: "Forbidden scope" });
    }
  }

  const tenantScope = await resolveTenantScope(req.user!, parsed.data.tenantId);
  if (!tenantScope.allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "CONTINUITY_FULL", {
    projectId: parsed.data.projectId,
    tenantId: parsed.data.tenantId
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const result = await getOverdueByOwner({
    ...parsed.data,
    tenantIds: tenantScope.tenantIds
  });
  return res.json({ items: result });
});

continuityRouter.get("/overdue/by-project", requireAuth, async (req, res) => {
  const parsed = overdueByProjectQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const tenantScope = await resolveTenantScope(req.user!, parsed.data.tenantId);
  if (!tenantScope.allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "CONTINUITY_FULL", {
    tenantId: parsed.data.tenantId
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const result = await getOverdueByProject({
    ...parsed.data,
    tenantIds: tenantScope.tenantIds
  });
  return res.json({ items: result });
});

continuityRouter.get("/action-items/missing-owner-or-due-date", requireAuth, async (req, res) => {
  const parsed = missingOwnerOrDueDateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (parsed.data.projectId) {
    const scope = await ensureProjectScopeAccess(req.user!, parsed.data.projectId);
    if (!scope.allowed) {
      if (scope.reason === "PROJECT_NOT_FOUND") {
        return res.status(404).json({ message: "Project not found" });
      }
      return res.status(403).json({ message: "Forbidden scope" });
    }
  }

  const tenantScope = await resolveTenantScope(req.user!, parsed.data.tenantId);
  if (!tenantScope.allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "CONTINUITY_FULL", {
    projectId: parsed.data.projectId,
    tenantId: parsed.data.tenantId
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const result = await getItemsWithMissingOwnerOrDueDate({
    ...parsed.data,
    tenantIds: tenantScope.tenantIds
  });
  return res.json(result);
});

continuityRouter.get("/meetings/recent-approved", requireAuth, async (req, res) => {
  const parsed = recentMeetingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (parsed.data.projectId) {
    const scope = await ensureProjectScopeAccess(req.user!, parsed.data.projectId);
    if (!scope.allowed) {
      if (scope.reason === "PROJECT_NOT_FOUND") {
        return res.status(404).json({ message: "Project not found" });
      }
      return res.status(403).json({ message: "Forbidden scope" });
    }
  }

  const tenantScope = await resolveTenantScope(req.user!, parsed.data.tenantId);
  if (!tenantScope.allowed) {
    return res.status(403).json({ message: "Forbidden tenant scope" });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "CONTINUITY_FULL", {
    projectId: parsed.data.projectId,
    tenantId: parsed.data.tenantId
  });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const result = await getRecentApprovedMeetingsWithActionCounts({
    ...parsed.data,
    tenantIds: tenantScope.tenantIds
  });
  return res.json({ items: result });
});

continuityRouter.get("/projects/:projectId/memory-snapshot", requireAuth, async (req, res) => {
  const projectId = req.params.projectId;
  if (!projectId) {
    return res.status(400).json({ message: "projectId is required" });
  }

  const scope = await ensureProjectScopeAccess(req.user!, projectId);
  if (!scope.allowed) {
    if (scope.reason === "PROJECT_NOT_FOUND") {
      return res.status(404).json({ message: "Project not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const featureCheck = await ensureUserPackageFeature(req.user!, "CONTINUITY_FULL", { projectId });
  if (!featureCheck.allowed) {
    return res.status(403).json({ message: featureCheck.message });
  }

  const snapshot = await getProjectMemorySnapshot(projectId);
  if (!snapshot) {
    return res.status(404).json({ message: "Project not found" });
  }

  return res.json(snapshot);
});
