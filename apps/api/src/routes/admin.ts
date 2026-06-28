import crypto from "node:crypto";
import { Router } from "express";
import { SystemRole, TenantRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import { env } from "../config/env";
import { sendInvitationEmail } from "../services/emailService";

export const adminRouter = Router();

const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(80).optional(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

const updateMemberSchema = z.object({
  role: z.nativeEnum(TenantRole).optional(),
  jobTitle: z.string().trim().min(1).max(120).optional().nullable(),
  department: z.string().trim().min(1).max(120).optional().nullable(),
  isActive: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required"
});

const updateUserAccountSchema = z.object({
  isActive: z.boolean()
});

adminRouter.use(requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN, SystemRole.MODERATOR]));

function createInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function buildInviteUrl(token: string) {
  return `${env.appPublicUrl.replace(/\/+$/, "")}/accept-invite?token=${encodeURIComponent(token)}`;
}

adminRouter.get("/tenants", async (_req, res) => {
  const tenants = await prisma.tenant.findMany({
    include: {
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

  const tenant = await prisma.tenant.update({
    where: { id: req.params.tenantId },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      isActive: parsed.data.isActive
    }
  });

  res.json(tenant);
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
      isActive: parsed.data.isActive
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
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
