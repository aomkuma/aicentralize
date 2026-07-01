import { SystemRole, TenantEntityType, TenantRole, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";
import { sendInvitationEmail } from "../services/emailService";
import { ensureTenantMembership, ensureTenantRole, getTenantMembership, isPlatformAdmin, isSuperAdmin, type TenantAuthUser } from "../services/tenantAccessService";
import { getIndividualPackageOrThrow, getTenantCategoryOrThrow } from "../services/tenantMetadataService";
import { ensureTenantCanAddMember, ensureTenantHasUserCapacity } from "../services/tenantBillingService";

export const tenantRouter = Router();

const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).optional(),
  entityType: z.nativeEnum(TenantEntityType).default(TenantEntityType.ORGANIZATION),
  tenantCategoryId: z.string().min(1),
  currentPackageId: z.string().min(1).optional()
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.nativeEnum(TenantRole).default(TenantRole.MEMBER),
  jobTitle: z.string().min(1).max(120).optional(),
  department: z.string().min(1).max(120).optional()
});

const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(TenantRole).optional(),
  nickname: z.string().trim().min(1).max(80).optional().nullable(),
  jobTitle: z.string().min(1).max(120).optional().nullable(),
  department: z.string().min(1).max(120).optional().nullable()
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: "At least one field is required"
});

const onboardMemberSchema = z.object({
  name: z.string().min(2).max(120),
  nickname: z.string().trim().min(1).max(80).optional(),
  email: z.string().email(),
  phone: z.string().min(7).max(30),
  tenantRole: z.nativeEnum(TenantRole).default(TenantRole.MEMBER),
  userRole: z.nativeEnum(UserRole).optional(),
  jobTitle: z.string().min(1).max(120),
  department: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(72).optional()
});

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `org-${crypto.randomBytes(4).toString("hex")}`;
}

function canCreateTenant(user: TenantAuthUser): boolean {
  return isPlatformAdmin(user);
}

function createTemporaryPassword() {
  return `Temp${crypto.randomBytes(6).toString("base64url")}!`;
}

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildInviteUrl(token: string) {
  return `${env.appPublicUrl.replace(/\/+$/, "")}/accept-invite?token=${encodeURIComponent(token)}`;
}

tenantRouter.get("/me", requireAuth, async (req, res) => {
  const memberships = await prisma.tenantMembership.findMany({
    where: isSuperAdmin(req.user!)
      ? { userId: req.user!.id }
      : {
        userId: req.user!.id,
        isActive: true,
        tenant: {
          isActive: true
        }
      },
    include: {
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          isActive: true,
          entityType: true,
          tenantCategoryId: true,
          tenantCategory: true,
          currentPackage: true,
          billingStatus: true,
          billingStartDate: true,
          billingTimezone: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          activatedAt: true,
          activatedByUserId: true,
          activatedBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          createdAt: true,
          updatedAt: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  res.json(memberships);
});

tenantRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (!canCreateTenant(req.user!)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const slug = (parsed.data.slug ? slugifyName(parsed.data.slug) : slugifyName(parsed.data.name)).trim().toLowerCase();
  if (!slug) {
    return res.status(400).json({ message: "Slug cannot be empty" });
  }

  const shouldCreateCreatorMembership = !isPlatformAdmin(req.user!);
  try {
    await getTenantCategoryOrThrow(parsed.data.tenantCategoryId, parsed.data.entityType);
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "Invalid tenant category"
    });
  }

  let resolvedPackageId: string | undefined;

  if (parsed.data.entityType === TenantEntityType.INDIVIDUAL) {
    try {
      const individualPackage = await getIndividualPackageOrThrow();
      resolvedPackageId = individualPackage.id;
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error ? error.message : "INDIVIDUAL package is not configured"
      });
    }
  } else {
    const defaultPackage = parsed.data.currentPackageId
      ? await prisma.subscriptionPackage.findUnique({ where: { id: parsed.data.currentPackageId } })
      : await prisma.subscriptionPackage.findFirst({
        where: { isActive: true, isDefault: true },
        orderBy: { createdAt: "asc" }
      });

    if (parsed.data.currentPackageId && !defaultPackage) {
      return res.status(400).json({ message: "Package not found" });
    }

    resolvedPackageId = defaultPackage?.id;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: parsed.data.name,
      slug,
      entityType: parsed.data.entityType,
      tenantCategoryId: parsed.data.tenantCategoryId,
      currentPackageId: resolvedPackageId,
      createdById: req.user!.id,
      ...(shouldCreateCreatorMembership
        ? {
          memberships: {
            create: {
              userId: req.user!.id,
              role: TenantRole.TENANT_ADMIN
            }
          }
        }
        : {})
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
          nickname: true,
          phone: true,
          role: true,
          systemRole: true,
          mustChangePassword: true
        }
      }
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });

  res.json(members);
});

tenantRouter.get("/:tenantId/users", requireAuth, async (req, res) => {
  const hasAccess = await ensureTenantMembership(req.user!, req.params.tenantId);
  if (!hasAccess) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const users = await prisma.tenantMembership.findMany({
    where: {
      tenantId: req.params.tenantId,
      isActive: true
    },
    select: {
      nickname: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      user: {
        name: "asc"
      }
    }
  });

  res.json(users.map((membership) => ({
    id: membership.user.id,
    name: membership.user.name,
    email: membership.user.email,
    nickname: membership.nickname
  })));
});

tenantRouter.post("/:tenantId/members", requireAuth, async (req, res) => {
  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const canManage = await ensureTenantRole(req.user!, req.params.tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!canManage) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const capacityCheck = await ensureTenantCanAddMember(req.params.tenantId, parsed.data.userId);
  if (!capacityCheck.allowed) {
    return res.status(403).json({ message: capacityCheck.message });
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

tenantRouter.post("/:tenantId/members/create", requireAuth, async (req, res) => {
  const parsed = onboardMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const canManage = await ensureTenantRole(req.user!, req.params.tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!canManage) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const name = parsed.data.name.trim();
  const nickname = parsed.data.nickname?.trim() || null;
  const phone = parsed.data.phone.trim();
  const department = parsed.data.department?.trim();
  const isTenantManagerRole = parsed.data.tenantRole === TenantRole.TENANT_ADMIN ||
    parsed.data.tenantRole === TenantRole.MANAGER;
  const workflowRole = parsed.data.userRole ?? (
    isTenantManagerRole
      ? UserRole.PM
      : UserRole.MEMBER
  );
  const temporaryPassword = parsed.data.password ? null : createTemporaryPassword();
  const passwordHash = await bcrypt.hash(parsed.data.password ?? temporaryPassword!, 10);
  const inviteToken = createInviteToken();
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      systemRole: true,
      mustChangePassword: true
    }
  });

  const capacityCheck = existingUser
    ? await ensureTenantCanAddMember(req.params.tenantId, existingUser.id)
    : await ensureTenantHasUserCapacity(req.params.tenantId);
  if (!capacityCheck.allowed) {
    return res.status(403).json({ message: capacityCheck.message });
  }

  const user = existingUser
    ? await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name,
        phone,
        mustChangePassword: existingUser ? existingUser.mustChangePassword : !parsed.data.password,
        systemRole: existingUser.systemRole
      },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        phone: true,
        role: true,
        systemRole: true
      }
    })
    : await prisma.user.create({
      data: {
        email,
        name,
        nickname,
        phone,
        role: workflowRole,
        passwordHash,
        mustChangePassword: !parsed.data.password,
        systemRole: SystemRole.USER
      },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        phone: true,
        role: true,
        systemRole: true
      }
    });

  const membership = await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: req.params.tenantId,
        userId: user.id
      }
    },
    create: {
      tenantId: req.params.tenantId,
      userId: user.id,
      role: parsed.data.tenantRole,
      nickname,
      jobTitle: parsed.data.jobTitle,
      department
    },
    update: {
      role: parsed.data.tenantRole,
      nickname,
      jobTitle: parsed.data.jobTitle,
      department
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
          systemRole: true
        }
      }
    }
  });

  let invitationEmailSent = false;
  let invitationEmailError: string | undefined;
  let inviteUrl: string | undefined;

  if (!parsed.data.password) {
    const tokenHash = hashInviteToken(inviteToken);
    const invitation = await prisma.userInvitation.create({
      data: {
        tenantId: req.params.tenantId,
        email,
        name,
        nickname,
        phone,
        tenantRole: parsed.data.tenantRole,
        userRole: workflowRole,
        jobTitle: parsed.data.jobTitle,
        department,
        tokenHash,
        expiresAt: inviteExpiresAt,
        createdById: req.user!.id
      }
    });

    inviteUrl = buildInviteUrl(inviteToken);

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.tenantId },
      select: {
        name: true
      }
    });

    const inviter = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        name: true
      }
    });

    try {
      invitationEmailSent = await sendInvitationEmail({
        to: email,
        inviteeName: name,
        inviterName: inviter?.name,
        tenantName: tenant?.name ?? "Kora",
        inviteUrl,
        expiresAt: inviteExpiresAt
      });
      await prisma.userInvitation.update({
        where: { id: invitation.id },
        data: {
          emailLastAttemptAt: new Date(),
          emailSentAt: invitationEmailSent ? new Date() : null,
          emailLastError: invitationEmailSent ? null : "SMTP is not configured"
        }
      });
    } catch (error) {
      invitationEmailError = error instanceof Error ? error.message : "Invitation email failed";
      await prisma.userInvitation.update({
        where: { id: invitation.id },
        data: {
          emailLastAttemptAt: new Date(),
          emailLastError: invitationEmailError
        }
      });
    }
  }

  return res.status(existingUser ? 200 : 201).json({
    ...membership,
    temporaryPassword,
    invitationEmailSent,
    invitationEmailError,
    inviteUrl: invitationEmailSent ? undefined : inviteUrl
  });
});

tenantRouter.patch("/:tenantId/members/:userId", requireAuth, async (req, res) => {
  const parsed = updateMemberRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const canManage = await ensureTenantRole(req.user!, req.params.tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
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
    select: { id: true, role: true }
  });

  if (!membership) {
    return res.status(404).json({ message: "Membership not found" });
  }

  const requesterMembership = await getTenantMembership(req.user!.id, req.params.tenantId);
  if (
    requesterMembership?.role === TenantRole.MANAGER &&
    membership.role === TenantRole.TENANT_ADMIN &&
    parsed.data.role !== undefined &&
    parsed.data.role !== membership.role
  ) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const updated = await prisma.tenantMembership.update({
    where: { id: membership.id },
    data: {
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.jobTitle !== undefined ? { jobTitle: parsed.data.jobTitle?.trim() || null } : {}),
      ...(parsed.data.department !== undefined ? { department: parsed.data.department?.trim() || null } : {}),
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
          mustChangePassword: true
        }
      }
    }
  });

  res.json(updated);
});

tenantRouter.delete("/:tenantId/members/:userId", requireAuth, async (req, res) => {
  const tenantId = req.params.tenantId;
  const targetUserId = req.params.userId;

  const canManage = await ensureTenantRole(req.user!, tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!canManage) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (targetUserId === req.user!.id) {
    return res.status(400).json({ message: "Cannot remove yourself from the team" });
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId: targetUserId
      }
    },
    select: {
      id: true,
      role: true
    }
  });

  if (!membership) {
    return res.status(404).json({ message: "Membership not found" });
  }

  if (!isPlatformAdmin(req.user!)) {
    const actorMembership = await getTenantMembership(req.user!.id, tenantId);
    if (actorMembership?.role === TenantRole.MANAGER && membership.role === TenantRole.TENANT_ADMIN) {
      return res.status(403).json({ message: "Managers cannot remove tenant admins" });
    }
  }

  if (membership.role === TenantRole.TENANT_ADMIN) {
    const remainingAdmins = await prisma.tenantMembership.count({
      where: {
        tenantId,
        role: TenantRole.TENANT_ADMIN,
        isActive: true,
        userId: {
          not: targetUserId
        }
      }
    });

    if (remainingAdmins === 0) {
      return res.status(400).json({ message: "Cannot remove the last tenant admin" });
    }
  }

  await prisma.tenantMembership.delete({
    where: {
      tenantId_userId: {
        tenantId,
        userId: targetUserId
      }
    }
  });

  res.json({ removed: true });
});
