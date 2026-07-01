import crypto from "node:crypto";
import { Router } from "express";
import { SystemRole, TenantEntityType, TenantRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import { env } from "../config/env";
import { sendInvitationEmail } from "../services/emailService";
import { getIndividualPackageOrThrow, getTenantCategoryOrThrow } from "../services/tenantMetadataService";
import { recordTenantPackageChange } from "../services/tenantBillingService";
import { adminBillingRouter } from "./admin-billing";

export const adminRouter = Router();

const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(80).optional(),
  entityType: z.nativeEnum(TenantEntityType).optional(),
  tenantCategoryId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  currentPackageId: z.string().min(1).nullable().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

const packageBaseSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  priceCents: z.number().int().min(0).max(100_000_000).default(0),
  currency: z.string().trim().min(3).max(3).default("THB"),
  billingInterval: z.enum(["MONTHLY", "YEARLY", "ONE_TIME", "CUSTOM"]).default("MONTHLY"),
  discountType: z.enum(["FIXED", "PERCENT"]).nullable().optional(),
  discountValue: z.number().int().min(0).max(100_000_000).default(0),
  maxProjects: z.number().int().min(0).max(100_000).default(1),
  maxUsers: z.number().int().min(0).max(100_000).default(5),
  additionalUserPriceCents: z.number().int().min(0).max(100_000_000).default(0),
  features: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false)
});

function refinePackageDiscount(
  value: { discountType?: "FIXED" | "PERCENT" | null; discountValue?: number },
  ctx: z.RefinementCtx
) {
  if (!value.discountType) {
    return;
  }

  const discountValue = value.discountValue ?? 0;

  if (discountValue <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Discount value must be greater than zero when a discount type is set",
      path: ["discountValue"]
    });
  }

  if (value.discountType === "PERCENT" && discountValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Percentage discount cannot exceed 100",
      path: ["discountValue"]
    });
  }
}

const packageSchema = packageBaseSchema.superRefine(refinePackageDiscount);

const updatePackageSchema = packageBaseSchema.partial().superRefine(refinePackageDiscount).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

const updateMemberSchema = z.object({
  role: z.nativeEnum(TenantRole).optional(),
  nickname: z.string().trim().min(1).max(80).optional().nullable(),
  jobTitle: z.string().trim().min(1).max(120).optional().nullable(),
  department: z.string().trim().min(1).max(120).optional().nullable(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

const updateUserAccountSchema = z.object({
  isActive: z.boolean()
});

const updatePlatformUserSchema = z.object({
  systemRole: z.union([z.literal(SystemRole.USER), z.literal(SystemRole.MODERATOR)]).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

adminRouter.use(requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN, SystemRole.MODERATOR]));

adminRouter.use("/billing", adminBillingRouter);

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildInviteUrl(token: string) {
  return `${env.appPublicUrl.replace(/\/+$/, "")}/accept-invite?token=${encodeURIComponent(token)}`;
}

async function normalizeDefaultPackage(packageId: string, isDefault?: boolean) {
  if (!isDefault) {
    return;
  }

  await prisma.subscriptionPackage.updateMany({
    where: {
      id: {
        not: packageId
      }
    },
    data: {
      isDefault: false
    }
  });
}

adminRouter.get("/packages", requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const packages = await prisma.subscriptionPackage.findMany({
    orderBy: [{ priceCents: "asc" }, { name: "asc" }]
  });

  res.json(packages);
});

adminRouter.post("/packages", requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = packageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const created = await prisma.subscriptionPackage.create({
    data: {
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      currency: parsed.data.currency.toUpperCase(),
      description: parsed.data.description || null,
      features: Array.from(new Set(parsed.data.features.map((feature) => feature.trim()).filter(Boolean)))
    }
  });

  await normalizeDefaultPackage(created.id, created.isDefault);

  res.status(201).json(created);
});

adminRouter.patch("/packages/:packageId", requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = updatePackageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const updated = await prisma.subscriptionPackage.update({
    where: { id: req.params.packageId },
    data: {
      ...parsed.data,
      code: parsed.data.code?.toUpperCase(),
      currency: parsed.data.currency?.toUpperCase(),
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
      features: parsed.data.features
        ? Array.from(new Set(parsed.data.features.map((feature) => feature.trim()).filter(Boolean)))
        : undefined
    }
  });

  await normalizeDefaultPackage(updated.id, updated.isDefault);

  res.json(updated);
});

adminRouter.delete("/packages/:packageId", requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const tenantCount = await prisma.tenant.count({
    where: {
      currentPackageId: req.params.packageId
    }
  });

  if (tenantCount > 0) {
    return res.status(409).json({ message: "Package is assigned to organizations" });
  }

  const deleted = await prisma.subscriptionPackage.delete({
    where: { id: req.params.packageId }
  });

  res.json({ id: deleted.id, deleted: true });
});

adminRouter.get("/tenants", async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    include: {
      currentPackage: true,
      tenantCategory: true,
      activatedBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      _count: {
        select: {
          memberships: true,
          projects: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  res.json(tenants);
});

adminRouter.patch("/tenants/:tenantId", async (req, res) => {
  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { id: req.params.tenantId },
    select: {
      id: true,
      entityType: true,
      tenantCategoryId: true,
      currentPackageId: true
    }
  });

  if (!existingTenant) {
    return res.status(404).json({ message: "Organization not found" });
  }

  const nextEntityType = parsed.data.entityType ?? existingTenant.entityType;
  const nextTenantCategoryId = parsed.data.tenantCategoryId === undefined
    ? existingTenant.tenantCategoryId
    : parsed.data.tenantCategoryId;

  if (!nextTenantCategoryId) {
    return res.status(400).json({ message: "Tenant category is required" });
  }

  try {
    await getTenantCategoryOrThrow(nextTenantCategoryId, nextEntityType);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "Invalid tenant category"
    });
  }

  let nextPackageId = parsed.data.currentPackageId;

  if (nextEntityType === TenantEntityType.INDIVIDUAL) {
    try {
      const individualPackage = await getIndividualPackageOrThrow();
      nextPackageId = individualPackage.id;
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "INDIVIDUAL package is not configured"
      });
    }
  } else if (parsed.data.currentPackageId !== undefined && parsed.data.currentPackageId !== null) {
    const pkg = await prisma.subscriptionPackage.findUnique({
      where: { id: parsed.data.currentPackageId },
      select: { id: true }
    });

    if (!pkg) {
      return res.status(400).json({ message: "Package not found" });
    }
  } else if (
    parsed.data.entityType === TenantEntityType.ORGANIZATION &&
    existingTenant.entityType === TenantEntityType.INDIVIDUAL &&
    parsed.data.currentPackageId === undefined
  ) {
    const defaultPackage = await prisma.subscriptionPackage.findFirst({
      where: { isActive: true, isDefault: true },
      orderBy: { createdAt: "asc" }
    });

    nextPackageId = defaultPackage?.id ?? null;
  }

  const tenant = await prisma.tenant.update({
    where: { id: req.params.tenantId },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      entityType: parsed.data.entityType,
      isActive: parsed.data.isActive,
      tenantCategoryId: parsed.data.tenantCategoryId === undefined ? undefined : nextTenantCategoryId,
      currentPackageId: nextPackageId
    },
    include: {
      tenantCategory: true,
      currentPackage: true,
      activatedBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (
    parsed.data.currentPackageId !== undefined &&
    existingTenant.currentPackageId !== (nextPackageId ?? null)
  ) {
    await recordTenantPackageChange({
      tenantId: existingTenant.id,
      actorUserId: req.user!.id,
      previousPackageId: existingTenant.currentPackageId,
      nextPackageId: nextPackageId ?? null
    });
  }

  res.json(tenant);
});

adminRouter.delete("/tenants/:tenantId", requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.tenantId },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          projects: true,
          memberships: true,
          invitations: true
        }
      }
    }
  });

  if (!tenant) {
    return res.status(404).json({ message: "Organization not found" });
  }

  await prisma.$transaction(async (tx) => {
    // Tenant deletion cascades memberships/invitations. Projects are SetNull on
    // tenant delete, so remove them first for a true organization hard delete.
    await tx.project.deleteMany({
      where: {
        tenantId: tenant.id
      }
    });

    await tx.tenant.delete({
      where: {
        id: tenant.id
      }
    });
  });

  res.json({
    id: tenant.id,
    name: tenant.name,
    deleted: true,
    removedProjects: tenant._count.projects,
    removedMemberships: tenant._count.memberships,
    removedInvitations: tenant._count.invitations
  });
});

adminRouter.get("/tenants/:tenantId/members", async (req, res) => {
  const members = await prisma.tenantMembership.findMany({
    where: {
      tenantId: req.params.tenantId
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          nickname: true,
          phone: true,
          role: true,
          systemRole: true,
          mustChangePassword: true,
          isActive: true
        }
      }
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });

  res.json(members);
});

adminRouter.get("/tenants/:tenantId/invitations", async (req, res) => {
  const invitations = await prisma.userInvitation.findMany({
    where: {
      tenantId: req.params.tenantId,
      acceptedAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      email: true,
      name: true,
      tenantRole: true,
      jobTitle: true,
      expiresAt: true,
      emailLastAttemptAt: true,
      emailSentAt: true,
      emailLastError: true,
      createdAt: true
    }
  });

  res.json(invitations);
});

adminRouter.post("/invitations/:invitationId/resend", async (req, res) => {
  const token = createInviteToken();
  const inviteUrl = buildInviteUrl(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existing = await prisma.userInvitation.findUnique({
    where: { id: req.params.invitationId },
    include: {
      tenant: {
        select: {
          name: true,
          isActive: true
        }
      },
      createdBy: {
        select: {
          name: true
        }
      }
    }
  });

  if (!existing) {
    return res.status(404).json({ message: "Invitation not found" });
  }

  if (existing.acceptedAt) {
    return res.status(409).json({ message: "Invitation already accepted" });
  }

  if (!existing.tenant.isActive) {
    return res.status(403).json({ message: "Organization is inactive" });
  }

  const invitation = await prisma.userInvitation.update({
    where: { id: existing.id },
    data: {
      tokenHash: hashInviteToken(token),
      expiresAt,
      emailLastAttemptAt: new Date(),
      emailLastError: null
    },
    include: {
      tenant: {
        select: {
          name: true,
          isActive: true
        }
      },
      createdBy: {
        select: {
          name: true
        }
      }
    }
  });

  try {
    const sent = await sendInvitationEmail({
      to: invitation.email,
      inviteeName: invitation.name,
      inviterName: invitation.createdBy?.name,
      tenantName: invitation.tenant.name,
      inviteUrl,
      expiresAt
    });

    const updated = await prisma.userInvitation.update({
      where: { id: invitation.id },
      data: {
        emailSentAt: sent ? new Date() : null,
        emailLastError: sent ? null : "SMTP is not configured"
      },
      select: {
        id: true,
        email: true,
        name: true,
        tenantRole: true,
        jobTitle: true,
        expiresAt: true,
        emailLastAttemptAt: true,
        emailSentAt: true,
        emailLastError: true,
        createdAt: true
      }
    });

    return res.json({
      ...updated,
      inviteUrl: sent ? undefined : inviteUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invitation email failed";
    const updated = await prisma.userInvitation.update({
      where: { id: invitation.id },
      data: {
        emailLastError: message
      },
      select: {
        id: true,
        email: true,
        name: true,
        tenantRole: true,
        jobTitle: true,
        expiresAt: true,
        emailLastAttemptAt: true,
        emailSentAt: true,
        emailLastError: true,
        createdAt: true
      }
    });

    return res.status(502).json({
      ...updated,
      message: "Invitation email failed",
      inviteUrl
    });
  }
});

adminRouter.patch("/tenants/:tenantId/members/:userId", async (req, res) => {
  const parsed = updateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const membership = await prisma.tenantMembership.update({
    where: {
      tenantId_userId: {
        tenantId: req.params.tenantId,
        userId: req.params.userId
      }
    },
    data: {
      role: parsed.data.role,
      jobTitle: parsed.data.jobTitle,
      department: parsed.data.department,
      isActive: parsed.data.isActive,
      ...(parsed.data.nickname !== undefined
        ? { nickname: parsed.data.nickname?.trim() || null }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          nickname: true,
          phone: true,
          role: true,
          systemRole: true,
          mustChangePassword: true,
          isActive: true
        }
      }
    }
  });

  res.json(membership);
});

adminRouter.get("/platform-users", requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      phone: true,
      role: true,
      systemRole: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          tenantMemberships: true
        }
      }
    },
    orderBy: [
      { systemRole: "asc" },
      { createdAt: "desc" }
    ]
  });

  res.json(users);
});

adminRouter.patch("/platform-users/:userId", requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = updatePlatformUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (req.params.userId === req.user!.id) {
    return res.status(400).json({ message: "You cannot change your own platform account" });
  }

  const target = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, systemRole: true }
  });

  if (!target) {
    return res.status(404).json({ message: "User not found" });
  }

  if (target.systemRole === SystemRole.SUPER_ADMIN) {
    return res.status(403).json({ message: "Cannot modify a super admin account" });
  }

  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      systemRole: parsed.data.systemRole,
      isActive: parsed.data.isActive
    },
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      phone: true,
      role: true,
      systemRole: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          tenantMemberships: true
        }
      }
    }
  });

  if (parsed.data.isActive === false) {
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  res.json(user);
});

// Platform-wide account suspension: blocks login and all authenticated
// requests regardless of tenant membership.
adminRouter.patch("/users/:userId", async (req, res) => {
  const parsed = updateUserAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (req.params.userId === req.user!.id) {
    return res.status(400).json({ message: "You cannot change your own account status" });
  }

  const target = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { id: true, systemRole: true }
  });

  if (!target) {
    return res.status(404).json({ message: "User not found" });
  }

  if (target.systemRole === SystemRole.SUPER_ADMIN) {
    return res.status(403).json({ message: "Cannot suspend a super admin account" });
  }

  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { isActive: parsed.data.isActive },
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      role: true,
      systemRole: true,
      isActive: true
    }
  });

  // Revoke active refresh tokens so a suspended user cannot mint new access
  // tokens until restored.
  if (!parsed.data.isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  res.json(user);
});
