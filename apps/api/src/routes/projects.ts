import { MeetingAttendanceStatus, MeetingParticipantRole, TenantRole, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
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

async function buildProjectListWhere(user: NonNullable<Express.Request["user"]>, tenantId?: string) {
  const filters: object[] = [];

  if (tenantId) {
    filters.push({ tenantId });
  }

  const tenantIds = await listTenantIdsForUser(user);
  if (tenantIds) {
    filters.push({ OR: [{ tenantId: null }, { tenantId: { in: tenantIds } }] });
  }

  if (user.role === UserRole.MEMBER) {
    const [memberProjectIds, managedTenantRows] = await Promise.all([
      listMemberProjectIds(user.id),
      prisma.tenantMembership.findMany({
        where: {
          userId: user.id,
          isActive: true,
          role: { in: [TenantRole.TENANT_ADMIN, TenantRole.MANAGER] },
          tenant: { isActive: true }
        },
        select: { tenantId: true }
      })
    ]);

    const visibility: object[] = [];
    const managedTenantIds = managedTenantRows.map((item) => item.tenantId);

    if (managedTenantIds.length) {
      visibility.push({ tenantId: { in: managedTenantIds } });
    }

    if (memberProjectIds.length) {
      visibility.push({ id: { in: memberProjectIds } });
    }

    filters.push(visibility.length ? { OR: visibility } : { id: { in: [] } });
  }

  return filters.length ? { AND: filters } : undefined;
}

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

  const where = await buildProjectListWhere(req.user!, tenantId);

  const projects = await prisma.project.findMany({
    where,
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

projectRouter.post("/", requireAuth, async (req, res) => {
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

projectRouter.post("/:projectId/meetings", requireAuth, async (req, res) => {
  const parsed = createProjectMeetingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true, tenantId: true }
  });

  if (!project) {
    return res.status(404).json({ message: "Project not found" });
  }

  if (project.tenantId) {
    const canCreateInTenant = await ensureTenantRole(
      req.user!,
      project.tenantId,
      [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]
    );
    if (!canCreateInTenant) {
      return res.status(403).json({ message: "Forbidden tenant scope" });
    }
  } else if (!isSuperAdmin(req.user!)) {
    return res.status(403).json({ message: "Forbidden project scope" });
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
