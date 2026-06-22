import { ActionItemPriority, ActionStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { ensureActionItemScopeAccess, listMemberProjectIds } from "../services/accessScopeService";
import {
  actionItemErrors,
  changeActionItemStatus,
  getActionItemDetail,
  listActionItems,
  reassignActionItem,
  updateActionItem
} from "../services/actionItemService";

export const actionItemRouter = Router();

const listActionItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
  ownerUserId: z.string().min(1).optional(),
  status: z.nativeEnum(ActionStatus).optional(),
  overdueOnly: z.coerce.boolean().optional().default(false),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional()
});

const updateActionItemSchema = z.object({
  description: z.string().trim().min(1).optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.nativeEnum(ActionItemPriority).optional(),
  ownerDisplayName: z.string().trim().min(1).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required"
});

const reassignActionItemSchema = z.object({
  ownerUserId: z.string().min(1),
  note: z.string().trim().min(1).optional()
});

const updateActionItemStatusSchema = z.object({
  status: z.nativeEnum(ActionStatus),
  note: z.string().trim().min(1).optional()
});

actionItemRouter.get("/", requireAuth, async (req, res) => {
  const parsed = listActionItemsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  let projectId = parsed.data.projectId;
  if (req.user?.role === UserRole.MEMBER) {
    const memberProjectIds = await listMemberProjectIds(req.user.id);
    if (projectId && !memberProjectIds.includes(projectId)) {
      return res.status(403).json({ message: "Forbidden scope" });
    }

    if (!projectId) {
      return res.status(400).json({ message: "projectId is required for member scope" });
    }
  }

  const result = await listActionItems({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    projectId,
    meetingId: parsed.data.meetingId,
    ownerUserId: parsed.data.ownerUserId,
    status: parsed.data.status,
    overdueOnly: parsed.data.overdueOnly,
    dueFrom: parsed.data.dueFrom ? new Date(parsed.data.dueFrom) : undefined,
    dueTo: parsed.data.dueTo ? new Date(parsed.data.dueTo) : undefined
  });

  return res.json(result);
});

actionItemRouter.get("/:id", requireAuth, async (req, res) => {
  const scope = await ensureActionItemScopeAccess(req.user!, req.params.id);
  if (!scope.allowed) {
    if (scope.reason === "ACTION_ITEM_NOT_FOUND") {
      return res.status(404).json({ message: "Action item not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const item = await getActionItemDetail(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Action item not found" });
  }

  return res.json(item);
});

actionItemRouter.patch("/:id", requireAuth, async (req, res) => {
  const scope = await ensureActionItemScopeAccess(req.user!, req.params.id);
  if (!scope.allowed) {
    if (scope.reason === "ACTION_ITEM_NOT_FOUND") {
      return res.status(404).json({ message: "Action item not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const parsed = updateActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const item = await updateActionItem(req.params.id, {
      detail: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      priority: parsed.data.priority,
      ownerDisplayName: parsed.data.ownerDisplayName
    }, req.user!);

    return res.json(item);
  } catch (error) {
    if (error instanceof Error && error.message === actionItemErrors.ACTION_ITEM_NOT_FOUND_ERROR) {
      return res.status(404).json({ message: "Action item not found" });
    }

    if (error instanceof Error && error.message === actionItemErrors.MUTABLE_BY_MEMBER_ERROR) {
      return res.status(403).json({ message: "Members can only update their own tasks" });
    }

    return res.status(500).json({ message: "Unable to update action item" });
  }
});

actionItemRouter.post("/:id/reassign", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const scope = await ensureActionItemScopeAccess(req.user!, req.params.id);
  if (!scope.allowed) {
    if (scope.reason === "ACTION_ITEM_NOT_FOUND") {
      return res.status(404).json({ message: "Action item not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const parsed = reassignActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const item = await reassignActionItem(req.params.id, parsed.data, req.user!);
    return res.json(item);
  } catch (error) {
    if (error instanceof Error && error.message === actionItemErrors.ACTION_ITEM_NOT_FOUND_ERROR) {
      return res.status(404).json({ message: "Action item not found" });
    }

    if (error instanceof Error && error.message === "TARGET_OWNER_NOT_FOUND") {
      return res.status(404).json({ message: "Target owner not found" });
    }

    return res.status(500).json({ message: "Unable to reassign action item" });
  }
});

actionItemRouter.post("/:id/status", requireAuth, async (req, res) => {
  const scope = await ensureActionItemScopeAccess(req.user!, req.params.id);
  if (!scope.allowed) {
    if (scope.reason === "ACTION_ITEM_NOT_FOUND") {
      return res.status(404).json({ message: "Action item not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const parsed = updateActionItemStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const item = await changeActionItemStatus(req.params.id, parsed.data, req.user!);
    return res.json(item);
  } catch (error) {
    if (error instanceof Error && error.message === actionItemErrors.ACTION_ITEM_NOT_FOUND_ERROR) {
      return res.status(404).json({ message: "Action item not found" });
    }

    if (error instanceof Error && error.message === actionItemErrors.MUTABLE_BY_MEMBER_ERROR) {
      return res.status(403).json({ message: "Members can only update their own tasks" });
    }

    if (error instanceof Error && error.message === "INVALID_STATUS_TRANSITION") {
      return res.status(400).json({ message: "Invalid status transition" });
    }

    return res.status(500).json({ message: "Unable to update action status" });
  }
});
