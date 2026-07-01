import {
  MeetingAttendanceStatus,
  MeetingParticipantRole,
  ProjectKnowledgeAuthorityLevel,
  ProjectKnowledgeSourceType,
  ProjectGeneralNoteVisibility,
  TenantRole,
  UserRole
} from "@prisma/client";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { listMemberProjectIds, listManagedProjectIds } from "../services/accessScopeService";
import { createProjectMeeting } from "../services/meetingIngestionService";
import { ensureTenantMembership, ensureTenantRole, isPlatformAdmin, isSuperAdmin, listTenantIdsForUser } from "../services/tenantAccessService";
import {
  approveProjectKnowledgeSource,
  createProjectKnowledgeSource,
  extractProjectKnowledgeSource,
  getProjectKnowledgeBaseline,
  importProjectKnowledgeFromFile,
  listProjectKnowledgeSources,
  listProjectMemoryItems,
  projectKnowledgeErrors
} from "../services/projectKnowledgeService";
import { isSupportedKnowledgeDocument } from "../services/documentTextService";
import {
  createProjectGeneralNote,
  listProjectGeneralNotes
} from "../services/projectGeneralNoteService";

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

const createKnowledgeSourceSchema = z.object({
  sourceType: z.nativeEnum(ProjectKnowledgeSourceType),
  title: z.string().min(2).max(180),
  contentText: z.string().min(20).max(120000),
  documentDate: z.string().datetime().optional(),
  versionLabel: z.string().max(80).optional(),
  authorityLevel: z.nativeEnum(ProjectKnowledgeAuthorityLevel).optional()
});

const createProjectGeneralNoteSchema = z.object({
  title: z.string().min(2).max(180),
  content: z.string().min(10).max(12000),
  visibility: z.nativeEnum(ProjectGeneralNoteVisibility).optional().default(ProjectGeneralNoteVisibility.PUBLIC)
});

function handleProjectKnowledgeError(error: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  if (message === "PROJECT_NOT_FOUND") {
    return res.status(404).json({ message: projectKnowledgeErrors.PROJECT_NOT_FOUND });
  }
  if (message === "SOURCE_NOT_FOUND") {
    return res.status(404).json({ message: projectKnowledgeErrors.SOURCE_NOT_FOUND });
  }
  if (message === "FORBIDDEN_PROJECT_SCOPE") {
    return res.status(403).json({ message: projectKnowledgeErrors.FORBIDDEN_PROJECT_SCOPE });
  }
  if (message === "EXTRACTION_REQUIRED") {
    return res.status(409).json({ message: projectKnowledgeErrors.EXTRACTION_REQUIRED });
  }
  if (message === "FILE_TOO_SHORT") {
    return res.status(400).json({ message: projectKnowledgeErrors.FILE_TOO_SHORT, code: message });
  }
  if (message === "PDF_NO_TEXT") {
    return res.status(400).json({ message: projectKnowledgeErrors.PDF_NO_TEXT, code: message });
  }
  if (message === "UNSUPPORTED_FILE_TYPE") {
    return res.status(400).json({ message: projectKnowledgeErrors.UNSUPPORTED_FILE_TYPE, code: message });
  }
  if (message === "DOCUMENT_READ_FAILED") {
    return res.status(400).json({ message: projectKnowledgeErrors.DOCUMENT_READ_FAILED, code: message });
  }
  if (message === "AI_EXTRACTION_PARSE_FAILED") {
    return res.status(502).json({ message: projectKnowledgeErrors.AI_EXTRACTION_PARSE_FAILED, code: message });
  }
  console.error("[ProjectKnowledge] Error:", error);
  return res.status(500).json({ message: "Project knowledge operation failed" });
}

const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadBytes },
  fileFilter: (_req, file, callback) => {
    if (!isSupportedKnowledgeDocument(file.originalname)) {
      callback(new Error("UNSUPPORTED_FILE_TYPE"));
      return;
    }
    callback(null, true);
  }
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

  if (!isPlatformAdmin(user) && user.role !== UserRole.ADMIN) {
    const [memberProjectIds, managedProjectIds] = await Promise.all([
      listMemberProjectIds(user.id),
      listManagedProjectIds(user.id)
    ]);

    const visibility: object[] = [];

    if (managedProjectIds.length) {
      visibility.push({ id: { in: managedProjectIds } });
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

    const tenantQuota = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        currentPackage: {
          select: {
            maxProjects: true
          }
        },
        _count: {
          select: {
            projects: true
          }
        }
      }
    });

    const maxProjects = tenantQuota?.currentPackage?.maxProjects ?? 0;
    if (maxProjects > 0 && (tenantQuota?._count.projects ?? 0) >= maxProjects) {
      return res.status(403).json({
        message: "Project quota reached for current package",
        code: "PACKAGE_PROJECT_QUOTA_REACHED",
        maxProjects
      });
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

projectRouter.get("/:projectId/knowledge/baseline", requireAuth, async (req, res) => {
  try {
    const baseline = await getProjectKnowledgeBaseline(req.params.projectId, req.user!);
    res.json(baseline);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});

projectRouter.get("/:projectId/knowledge/sources", requireAuth, async (req, res) => {
  try {
    const sources = await listProjectKnowledgeSources(req.params.projectId, req.user!);
    res.json(sources);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});

projectRouter.post("/:projectId/knowledge/sources", requireAuth, async (req, res) => {
  const parsed = createKnowledgeSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const source = await createProjectKnowledgeSource({
      projectId: req.params.projectId,
      sourceType: parsed.data.sourceType,
      title: parsed.data.title.trim(),
      contentText: parsed.data.contentText.trim(),
      documentDate: parsed.data.documentDate ? new Date(parsed.data.documentDate) : undefined,
      versionLabel: parsed.data.versionLabel?.trim() || undefined,
      authorityLevel: parsed.data.authorityLevel,
      user: req.user!
    });
    res.status(201).json(source);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});

const importKnowledgeSourceSchema = z.object({
  sourceType: z.nativeEnum(ProjectKnowledgeSourceType),
  authorityLevel: z.nativeEnum(ProjectKnowledgeAuthorityLevel).optional(),
  versionLabel: z.string().max(80).optional(),
  title: z.string().min(2).max(180).optional(),
  documentDate: z.string().datetime().optional()
});

projectRouter.post(
  "/:projectId/knowledge/sources/import",
  requireAuth,
  (req, res, next) => {
    knowledgeUpload.single("file")(req, res, (error) => {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File is too large for upload." });
      }
      if (error instanceof Error && error.message === "UNSUPPORTED_FILE_TYPE") {
        return res.status(400).json({
          message: projectKnowledgeErrors.UNSUPPORTED_FILE_TYPE,
          code: "UNSUPPORTED_FILE_TYPE"
        });
      }
      if (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : "Upload failed" });
      }
      return next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "Missing file upload." });
    }

    const parsed = importKnowledgeSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
    }

    try {
      const result = await importProjectKnowledgeFromFile({
        projectId: req.params.projectId,
        user: req.user!,
        fileName: req.file.originalname,
        buffer: req.file.buffer,
        sourceType: parsed.data.sourceType,
        authorityLevel: parsed.data.authorityLevel,
        versionLabel: parsed.data.versionLabel?.trim() || undefined,
        title: parsed.data.title?.trim(),
        documentDate: parsed.data.documentDate ? new Date(parsed.data.documentDate) : undefined
      });
      res.status(201).json(result);
    } catch (error) {
      handleProjectKnowledgeError(error, res);
    }
  }
);

projectRouter.post("/:projectId/knowledge/sources/:sourceId/extract", requireAuth, async (req, res) => {
  try {
    const extraction = await extractProjectKnowledgeSource(req.params.sourceId, req.user!);
    res.status(201).json(extraction);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});

projectRouter.post("/:projectId/knowledge/sources/:sourceId/approve", requireAuth, async (req, res) => {
  try {
    const result = await approveProjectKnowledgeSource(req.params.sourceId, req.user!);
    res.json(result);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});

projectRouter.get("/:projectId/knowledge/memory", requireAuth, async (req, res) => {
  try {
    const items = await listProjectMemoryItems(req.params.projectId, req.user!);
    res.json(items);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});

projectRouter.get("/:projectId/notes", requireAuth, async (req, res) => {
  try {
    const notes = await listProjectGeneralNotes(req.params.projectId, req.user!);
    res.json(notes);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});

projectRouter.post("/:projectId/notes", requireAuth, async (req, res) => {
  const parsed = createProjectGeneralNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const note = await createProjectGeneralNote({
      projectId: req.params.projectId,
      title: parsed.data.title.trim(),
      content: parsed.data.content.trim(),
      visibility: parsed.data.visibility,
      user: req.user!
    });
    res.status(201).json(note);
  } catch (error) {
    handleProjectKnowledgeError(error, res);
  }
});
