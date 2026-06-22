import { MeetingAttendanceStatus, MeetingParticipantRole, TenantRole, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { listMemberProjectIds } from "../services/accessScopeService";
import { createProjectMeeting } from "../services/meetingIngestionService";
import { ensureTenantMembership, ensureTenantRole, isSuperAdmin, listTenantIdsForUser } from "../services/tenantAccessService";

export const projectRouter = Router();

const createProjectSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  tenantId: z.string().min(1).optional()
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
  const tenantId = typeof req.query.tenantId === "string" && req.query.tenantId.trim()
    ? req.query.tenantId.trim()
    : undefined;

  if (tenantId) {
    const hasTenantAccess = await ensureTenantMembership(req.user!, tenantId);
    if (!hasTenantAccess) {
      return res.status(403).json({ message: "Forbidden tenant scope" });
    }
  }

  const memberProjectIds = req.user?.role === UserRole.MEMBER
    ? await listMemberProjectIds(req.user.id)
    : undefined;

  const tenantIds = await listTenantIdsForUser(req.user!);

  const projects = await prisma.project.findMany({
    where: {
      ...(memberProjectIds ? { id: { in: memberProjectIds } } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(tenantIds ? { OR: [{ tenantId: null }, { tenantId: { in: tenantIds } }] } : {})
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { meetings: true }
      },
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true
        }
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

  const code = parsed.data.code.trim();
  const name = parsed.data.name.trim();

  const tenantId = parsed.data.tenantId;
  if (tenantId) {
    const canCreateInTenant = await ensureTenantRole(
      req.user!,
      tenantId,
      [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]
    );
    if (!canCreateInTenant) {
      return res.status(403).json({ message: "Forbidden tenant scope" });
    }
  } else if (!isSuperAdmin(req.user!)) {
    return res.status(400).json({ message: "tenantId is required unless user is SUPER_ADMIN" });
  }

  const duplicate = await prisma.project.findFirst({
    where: {
      code: {
        equals: code,
        mode: "insensitive"
      }
    },
    select: {
      id: true,
      code: true
    }
  });

  if (duplicate) {
    return res.status(409).json({ message: "Project code already exists" });
  }

  const project = await prisma.project.create({
    data: {
      code,
      name,
      description: parsed.data.description,
      tenantId: parsed.data.tenantId
    },
    include: {
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true
        }
      }
    }
  });
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
