import {
  ActionItemPriority,
  ActionStatus,
  MeetingArtifactSourceType,
  MeetingArtifactType,
  UserRole
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { ensureMeetingScopeAccess, listMemberProjectIds } from "../services/accessScopeService";
import { buildEmbedding } from "../services/embeddingService";
import { addMeetingArtifact, getMeetingDetail } from "../services/meetingIngestionService";
import { extractMinuteDraft } from "../services/minuteExtractionService";

export const meetingRouter = Router();

const createMeetingSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2),
  sessionAt: z.string().datetime(),
  summary: z.string().min(3),
  transcript: z.string().optional(),
  minutes: z.array(z.object({
    section: z.string().min(1),
    content: z.string().min(1)
  })).default([]),
  actionItems: z.array(z.object({
    task: z.string().min(2),
    detail: z.string().optional(),
    assigneeId: z.string().min(1),
    dueDate: z.string().datetime(),
    priority: z.nativeEnum(ActionItemPriority).default(ActionItemPriority.MEDIUM)
  })).default([])
});

const updateActionStatusSchema = z.object({
  status: z.nativeEnum(ActionStatus)
});

const addMeetingArtifactSchema = z.object({
  artifactType: z.nativeEnum(MeetingArtifactType),
  sourceType: z.nativeEnum(MeetingArtifactSourceType),
  textContent: z.string().trim().min(1).optional(),
  fileUrlOrStorageKey: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).optional()
}).superRefine((data, ctx) => {
  if (!data.textContent && !data.fileUrlOrStorageKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either textContent or fileUrlOrStorageKey is required"
    });
  }

  if ((data.artifactType === MeetingArtifactType.TRANSCRIPT || data.artifactType === MeetingArtifactType.RAW_NOTE) && !data.textContent) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "textContent is required for TRANSCRIPT and RAW_NOTE artifacts"
    });
  }
});

const extractMinuteDraftSchema = z.object({
  artifactIds: z.array(z.string().min(1)).optional(),
  supersedeExistingDrafts: z.boolean().optional().default(false),
  model: z.string().min(1).optional()
});

meetingRouter.get("/", requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const memberProjectIds = req.user?.role === UserRole.MEMBER
    ? await listMemberProjectIds(req.user.id)
    : undefined;

  const meetings = await prisma.meeting.findMany({
    where: req.user?.role === UserRole.MEMBER
      ? {
          projectId: projectId
            ? projectId
            : { in: memberProjectIds },
          OR: [
            { createdById: req.user.id },
            { participants: { some: { userId: req.user.id } } }
          ]
        }
      : (projectId ? { projectId } : undefined),
    include: {
      project: true,
      actionItems: { include: { assignee: true } },
      minutes: true
    },
    orderBy: { sessionAt: "desc" }
  });

  res.json(meetings);
});

meetingRouter.get("/:meetingId", requireAuth, async (req, res) => {
  const scope = await ensureMeetingScopeAccess(req.user!, req.params.meetingId);
  if (!scope.allowed) {
    if (scope.reason === "MEETING_NOT_FOUND") {
      return res.status(404).json({ message: "Meeting not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const meeting = await getMeetingDetail(req.params.meetingId);
  if (!meeting) {
    return res.status(404).json({ message: "Meeting not found" });
  }

  return res.json({
    ...meeting,
    latestDraft: meeting.minuteDrafts[0] ?? null
  });
});

meetingRouter.post("/:meetingId/artifacts", requireAuth, async (req, res) => {
  const scope = await ensureMeetingScopeAccess(req.user!, req.params.meetingId);
  if (!scope.allowed) {
    if (scope.reason === "MEETING_NOT_FOUND") {
      return res.status(404).json({ message: "Meeting not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const parsed = addMeetingArtifactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const artifact = await addMeetingArtifact({
    meetingId: req.params.meetingId,
    artifactType: parsed.data.artifactType,
    sourceType: parsed.data.sourceType,
    textContent: parsed.data.textContent,
    fileUrlOrStorageKey: parsed.data.fileUrlOrStorageKey,
    mimeType: parsed.data.mimeType,
    createdByUserId: req.user?.id
  });

  if (!artifact) {
    return res.status(404).json({ message: "Meeting not found" });
  }

  return res.status(201).json(artifact);
});

meetingRouter.post("/:meetingId/minute-drafts/extract", requireAuth, async (req, res) => {
  const scope = await ensureMeetingScopeAccess(req.user!, req.params.meetingId);
  if (!scope.allowed) {
    if (scope.reason === "MEETING_NOT_FOUND") {
      return res.status(404).json({ message: "Meeting not found" });
    }
    return res.status(403).json({ message: "Forbidden scope" });
  }

  const parsed = extractMinuteDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const result = await extractMinuteDraft({
      meetingId: req.params.meetingId,
      requestedByUserId: req.user!.id,
      artifactIds: parsed.data.artifactIds,
      supersedeExistingDrafts: parsed.data.supersedeExistingDrafts,
      model: parsed.data.model
    });

    return res.status(201).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "MEETING_NOT_FOUND") {
      return res.status(404).json({ message: "Meeting not found" });
    }

    if (error instanceof Error && error.message === "NO_SOURCE_ARTIFACT") {
      return res.status(400).json({
        message: "No transcript/raw note artifacts found for extraction"
      });
    }

    return res.status(500).json({
      message: "Minute extraction failed unexpectedly"
    });
  }
});

meetingRouter.post("/", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = createMeetingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const meeting = await prisma.meeting.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      sessionAt: new Date(parsed.data.sessionAt),
      summary: parsed.data.summary,
      transcript: parsed.data.transcript,
      createdById: req.user!.id,
      minutes: {
        create: parsed.data.minutes
      },
      actionItems: {
        create: parsed.data.actionItems.map((item) => ({
          task: item.task,
          detail: item.detail,
          assigneeId: item.assigneeId,
          dueDate: new Date(item.dueDate),
          priority: item.priority
        }))
      },
      embeddings: {
        create: [
          {
            sourceType: "summary",
            chunkText: parsed.data.summary,
            vector: buildEmbedding(parsed.data.summary)
          },
          ...parsed.data.minutes.map((minute) => ({
            sourceType: `minute:${minute.section}`,
            chunkText: minute.content,
            vector: buildEmbedding(minute.content)
          }))
        ]
      }
    },
    include: {
      minutes: true,
      actionItems: true
    }
  });

  res.status(201).json(meeting);
});

meetingRouter.patch("/action-items/:id/status", requireAuth, async (req, res) => {
  const parsed = updateActionStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const item = await prisma.actionItem.findUnique({ where: { id: req.params.id } });
  if (!item) {
    return res.status(404).json({ message: "Action item not found" });
  }

  if (req.user!.role === UserRole.MEMBER && item.assigneeId !== req.user!.id) {
    return res.status(403).json({ message: "Members can only update their own tasks" });
  }

  const updated = await prisma.actionItem.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      completedAt: parsed.data.status === ActionStatus.DONE ? new Date() : null
    }
  });

  res.json(updated);
});
