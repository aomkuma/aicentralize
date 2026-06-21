import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { ensureMeetingScopeAccess, ensureProjectScopeAccess } from "../services/accessScopeService";
import {
  getItemsWithMissingOwnerOrDueDate,
  getOverdueByOwner,
  getOverdueByProject,
  getProjectContinuitySummaries,
  getProjectMemorySnapshot,
  getRecentApprovedMeetingsWithActionCounts
} from "../services/continuityService";

export const continuityRouter = Router();

const summaryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  staleAfterDays: z.coerce.number().int().min(1).max(365).optional()
});

const overdueByOwnerQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const overdueByProjectQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const missingOwnerOrDueDateQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const recentMeetingsQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

continuityRouter.get("/summary", requireAuth, async (req, res) => {
  const parsed = summaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (req.user?.role === UserRole.MEMBER && !parsed.data.projectId) {
    return res.status(400).json({ message: "projectId is required for member scope" });
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

  const result = await getProjectContinuitySummaries(parsed.data);
  return res.json(result);
});

continuityRouter.get("/overdue/by-owner", requireAuth, async (req, res) => {
  const parsed = overdueByOwnerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (req.user?.role === UserRole.MEMBER && !parsed.data.projectId) {
    return res.status(400).json({ message: "projectId is required for member scope" });
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

  const result = await getOverdueByOwner(parsed.data);
  return res.json({ items: result });
});

continuityRouter.get("/overdue/by-project", requireAuth, async (req, res) => {
  const parsed = overdueByProjectQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (req.user?.role === UserRole.MEMBER) {
    return res.status(400).json({ message: "projectId-specific endpoint required for member scope" });
  }

  const result = await getOverdueByProject(parsed.data);
  return res.json({ items: result });
});

continuityRouter.get("/action-items/missing-owner-or-due-date", requireAuth, async (req, res) => {
  const parsed = missingOwnerOrDueDateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (req.user?.role === UserRole.MEMBER && !parsed.data.projectId) {
    return res.status(400).json({ message: "projectId is required for member scope" });
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

  const result = await getItemsWithMissingOwnerOrDueDate(parsed.data);
  return res.json(result);
});

continuityRouter.get("/meetings/recent-approved", requireAuth, async (req, res) => {
  const parsed = recentMeetingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  if (req.user?.role === UserRole.MEMBER && !parsed.data.projectId) {
    return res.status(400).json({ message: "projectId is required for member scope" });
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

  const result = await getRecentApprovedMeetingsWithActionCounts(parsed.data);
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

  const snapshot = await getProjectMemorySnapshot(projectId);
  if (!snapshot) {
    return res.status(404).json({ message: "Project not found" });
  }

  return res.json(snapshot);
});
