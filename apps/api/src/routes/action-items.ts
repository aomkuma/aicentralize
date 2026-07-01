import { ActionItemPriority, ActionStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { ensureActionItemScopeAccess, listAccessibleProjectIds } from "../services/accessScopeService";
import {
  actionItemErrors,
  canAssignActionItemsToOthers,
  changeActionItemStatus,
  createActionItem,
  getActionItemDetail,
  listActionItems,
  reassignActionItem,
  updateActionItem
} from "../services/actionItemService";

export const actionItemRouter = Router();

const listActionItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  mine: z.coerce.boolean().optional().default(false),
  projectId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
  ownerUserId: z.string().min(1).optional(),
  status: z.nativeEnum(ActionStatus).optional(),
  overdueOnly: z.coerce.boolean().optional().default(false),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional()
});

const createActionItemSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional(),
  dueDate: z.string().datetime(),
  priority: z.nativeEnum(ActionItemPriority).optional(),
  ownerUserId: z.string().min(1).optional()
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

  const user = req.user!;
  let projectId = parsed.data.projectId;
  let projectIds: string[] | undefined;
  let ownerUserId = parsed.data.ownerUserId;

  if (parsed.data.mine) {
    ownerUserId = user.id;
    const accessibleProjectIds = await listAccessibleProjectIds(user);

    if (projectId) {
      if (accessibleProjectIds && !accessibleProjectIds.includes(projectId)) {
        return res.status(403).json({ message: "Forbidden scope" });
      }
    } else if (accessibleProjectIds) {
      projectIds = accessibleProjectIds;
      if (!projectIds.length) {
        return res.json({
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          total: 0,
          items: []
        });
      }
    }
  } else if (projectId) {
    const accessibleProjectIds = await listAccessibleProjectIds(user);
    if (accessibleProjectIds && !accessibleProjectIds.includes(projectId)) {
      return res.status(403).json({ message: "Forbidden scope" });
    }
  } else {
    const accessibleProjectIds = await listAccessibleProjectIds(user);
    if (accessibleProjectIds) {
      return res.status(400).json({ message: "projectId is required for scoped list" });
    }
  }

  const result = await listActionItems({
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
    projectId,
    projectIds,
    meetingId: parsed.data.meetingId,
    ownerUserId,
    status: parsed.data.status,
    overdueOnly: parsed.data.overdueOnly,
    dueFrom: parsed.data.dueFrom ? new Date(parsed.data.dueFrom) : undefined,
    dueTo: parsed.data.dueTo ? new Date(parsed.data.dueTo) : undefined
  });

  return res.json(result);
});

actionItemRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createActionItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (parsed.data.ownerUserId && parsed.data.ownerUserId !== req.user!.id) {
    const canAssignOthers = await canAssignActionItemsToOthers(req.user!, parsed.data.projectId);
    if (!canAssignOthers) {
      return res.status(403).json({ message: "Members can only create tasks assigned to themselves" });
    }
  }

  try {
    const item = await createActionItem({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: new Date(parsed.data.dueDate),
      priority: parsed.data.priority,
      ownerUserId: parsed.data.ownerUserId
    }, req.user!);

    return res.status(201).json(item);
  } catch (error) {
    if (error instanceof Error && error.message === actionItemErrors.FORBIDDEN_SCOPE_ERROR) {
      return res.status(403).json({ message: "Forbidden scope" });
    }

    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") {
      return res.status(404).json({ message: "Project not found" });
    }

    if (error instanceof Error && error.message === actionItemErrors.TARGET_OWNER_NOT_FOUND_ERROR) {
      return res.status(404).json({ message: "Target owner not found" });
    }

    return res.status(500).json({ message: "Unable to create action item" });
  }
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

actionItemRouter.post("/:id/reassign", requireAuth, async (req, res) => {
  const scope = await ensureActionItemScopeAccess(req.user!, req.params.id);
  if (!scope.allowed) {
    if (scope.reason === "ACTION_ITEM_NOT_FOUND") {
      return res.status(404).json({ message: "Action item not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  if (!scope.projectId) {
    return res.status(404).json({ message: "Action item not found" });
  }

  const canAssignOthers = await canAssignActionItemsToOthers(req.user!, scope.projectId);
  if (!canAssignOthers) {
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
