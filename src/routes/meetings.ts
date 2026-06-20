import { ActionStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { buildEmbedding } from "../services/embeddingService";

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
    dueDate: z.string().datetime()
  })).default([])
});

const updateActionStatusSchema = z.object({
  status: z.nativeEnum(ActionStatus)
});

meetingRouter.get("/", requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  const meetings = await prisma.meeting.findMany({
    where: projectId ? { projectId } : undefined,
    include: {
      project: true,
      actionItems: { include: { assignee: true } },
      minutes: true
    },
    orderBy: { sessionAt: "desc" }
  });

  res.json(meetings);
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
          dueDate: new Date(item.dueDate)
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
