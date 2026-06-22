import { SystemRole, TenantRole, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ensureTenantMembership, ensureTenantRole, isSuperAdmin } from "../services/tenantAccessService";

export const tenantRouter = Router();

const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).optional()
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(TenantRole).default(TenantRole.MEMBER),
  jobTitle: z.string().min(1).max(120).optional(),
  department: z.string().min(1).max(120).optional()
});

const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(TenantRole),
  jobTitle: z.string().min(1).max(120).optional(),
  department: z.string().min(1).max(120).optional()
});

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function canCreateTenant(user: { role: UserRole; systemRole: SystemRole }): boolean {
  return isSuperAdmin(user) || user.role === UserRole.ADMIN;
}

tenantRouter.get("/me", requireAuth, async (req, res) => {
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId: req.user!.id },
    include: {
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          createdAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json({
    userId: req.user!.id,
    systemRole: req.user!.systemRole,
    memberships
  });
});

tenantRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (!canCreateTenant(req.user!)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const slug = (parsed.data.slug ?? slugifyName(parsed.data.name)).trim().toLowerCase();
  if (!slug) {
    return res.status(400).json({ message: "Slug cannot be empty" });
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: parsed.data.name,
      slug,
      createdById: req.user!.id,
      memberships: {
        create: {
          userId: req.user!.id,
          role: TenantRole.TENANT_ADMIN
        }
      }
    }
  });

  res.status(201).json(tenant);
});

tenantRouter.get("/:tenantId/members", requireAuth, async (req, res) => {
  const hasAccess = await ensureTenantMembership(req.user!, req.params.tenantId);
  if (!hasAccess) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const members = await prisma.tenantMembership.findMany({
    where: { tenantId: req.params.tenantId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          systemRole: true
        }
      }
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });

  res.json(members);
});

tenantRouter.post("/:tenantId/members", requireAuth, async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const canManage = await ensureTenantRole(req.user!, req.params.tenantId, [TenantRole.TENANT_ADMIN]);
  if (!canManage) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const membership = await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: req.params.tenantId,
        userId: parsed.data.userId
      }
    },
    create: {
      tenantId: req.params.tenantId,
      userId: parsed.data.userId,
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle,
      department: parsed.data.department
    },
    update: {
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle,
      department: parsed.data.department
    }
  });

  res.status(201).json(membership);
});

tenantRouter.patch("/:tenantId/members/:userId", requireAuth, async (req, res) => {
  const parsed = updateMemberRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const canManage = await ensureTenantRole(req.user!, req.params.tenantId, [TenantRole.TENANT_ADMIN]);
  if (!canManage) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: req.params.tenantId,
        userId: req.params.userId
      }
    },
    select: { id: true }
  });

  if (!membership) {
    return res.status(404).json({ message: "Membership not found" });
  }

  const updated = await prisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle,
      department: parsed.data.department
    }
  });

  res.json(updated);
});
