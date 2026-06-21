import { MeetingAttendanceStatus, MeetingParticipantRole, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { listMemberProjectIds } from "../services/accessScopeService";
import { createProjectMeeting } from "../services/meetingIngestionService";

export const projectRouter = Router();

const createProjectSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional()
});

const createProjectMeetingSchema = z.object({
  title: z.string().min(2),
  agenda: z.string().optional(),
  meetingDate: z.string().datetime(),
  participants: z.array(z.object({
    userId: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: z.nativeEnum(MeetingParticipantRole).optional(),
    roleLabel: z.string().min(1).optional(),
    attendanceStatus: z.nativeEnum(MeetingAttendanceStatus).optional()
  })).optional().default([])
});

projectRouter.get("/", requireAuth, async (req, res) => {
  const memberProjectIds = req.user?.role === UserRole.MEMBER
    ? await listMemberProjectIds(req.user.id)
    : undefined;

  const projects = await prisma.project.findMany({
    where: memberProjectIds ? { id: { in: memberProjectIds } } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { meetings: true }
      }
    }
  });

  res.json(projects);
});

projectRouter.post("/", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const project = await prisma.project.create({ data: parsed.data });
  res.status(201).json(project);
});

projectRouter.post("/:projectId/meetings", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = createProjectMeetingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const meeting = await createProjectMeeting({
    projectId: req.params.projectId,
    title: parsed.data.title,
    agenda: parsed.data.agenda,
    meetingDate: new Date(parsed.data.meetingDate),
    participants: parsed.data.participants,
    createdByUserId: req.user!.id
  });

  if (!meeting) {
    return res.status(404).json({ message: "Project not found" });
  }

  res.status(201).json(meeting);
});
