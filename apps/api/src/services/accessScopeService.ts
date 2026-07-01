import { SystemRole, TenantRole, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { isPlatformAdmin } from "./tenantAccessService";

type AskAiScopeInput = {
  userId: string;
  role: UserRole;
  projectId?: string;
  meetingId?: string;
};

type AskAiScopeResult = {
  allowed: boolean;
  reason?: "MEETING_NOT_FOUND" | "PROJECT_NOT_FOUND" | "FORBIDDEN_SCOPE";
};

type ScopeCheckResult = {
  allowed: boolean;
  reason?: "MEETING_NOT_FOUND" | "PROJECT_NOT_FOUND" | "DRAFT_NOT_FOUND" | "ACTION_ITEM_NOT_FOUND" | "FORBIDDEN_SCOPE";
  projectId?: string;
  meetingId?: string;
};

type AuthScopeUser = {
  id: string;
  role: UserRole;
  systemRole?: SystemRole;
};

function canBypassScope(user: AuthScopeUser): boolean {
  return isPlatformAdmin(user) || user.role === UserRole.ADMIN;
}

function canManageTenant(role: TenantRole): boolean {
  return role === TenantRole.TENANT_ADMIN || role === TenantRole.MANAGER;
}

async function isMemberInMeeting(userId: string, meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      projectId: true,
      createdById: true,
      participants: {
        where: { userId },
        select: { id: true },
        take: 1
      }
    }
  });

  if (!meeting) {
    return { exists: false as const };
  }

  const isMeetingMember = meeting.createdById === userId || meeting.participants.length > 0;
  return {
    exists: true as const,
    isMeetingMember,
    projectId: meeting.projectId
  };
}

export async function canManageProjectForUser(userId: string, projectId: string) {
  const result = await canManageProjectByTenant(userId, projectId);
  return result.exists && result.allowed;
}

async function canManageProjectByTenant(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      tenantId: true
    }
  });

  if (!project) {
    return { exists: false as const };
  }

  if (!project.tenantId) {
    return { exists: true as const, allowed: false };
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId: project.tenantId,
        userId
      }
    },
    select: {
      role: true,
      isActive: true,
      tenant: {
        select: {
          isActive: true
        }
      }
    }
  });

  return {
    exists: true as const,
    allowed: Boolean(
      membership?.isActive &&
      membership.tenant.isActive &&
      canManageTenant(membership.role)
    )
  };
}

export async function listMemberProjectIds(userId: string): Promise<string[]> {
  const [meetingProjects, assignedProjects] = await Promise.all([
    prisma.meeting.findMany({
      where: {
        OR: [
          { createdById: userId },
          { participants: { some: { userId } } }
        ]
      },
      select: {
        projectId: true
      },
      distinct: ["projectId"]
    }),
    prisma.actionItem.findMany({
      where: { assigneeId: userId },
      select: { projectId: true },
      distinct: ["projectId"]
    })
  ]);

  return [...new Set([
    ...meetingProjects.map((item) => item.projectId),
    ...assignedProjects.map((item) => item.projectId)
  ])];
}

export async function listManagedProjectIds(userId: string): Promise<string[]> {
  const managedTenantRows = await prisma.tenantMembership.findMany({
    where: {
      userId,
      isActive: true,
      role: { in: [TenantRole.TENANT_ADMIN, TenantRole.MANAGER] },
      tenant: { isActive: true }
    },
    select: { tenantId: true }
  });

  const managedTenantIds = managedTenantRows.map((item) => item.tenantId);
  if (!managedTenantIds.length) {
    return [];
  }

  const managedProjects = await prisma.project.findMany({
    where: { tenantId: { in: managedTenantIds } },
    select: { id: true }
  });

  return managedProjects.map((item) => item.id);
}

export async function listAccessibleProjectIds(user: AuthScopeUser): Promise<string[] | null> {
  if (canBypassScope(user)) {
    return null;
  }

  const [memberProjectIds, managedProjectIds] = await Promise.all([
    listMemberProjectIds(user.id),
    listManagedProjectIds(user.id)
  ]);

  return [...new Set([
    ...memberProjectIds,
    ...managedProjectIds
  ])];
}

export async function ensureProjectScopeAccess(user: AuthScopeUser, projectId: string): Promise<ScopeCheckResult> {
  if (canBypassScope(user)) {
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) {
      return { allowed: false, reason: "PROJECT_NOT_FOUND" };
    }
    return { allowed: true, projectId };
  }

  const tenantAccess = await canManageProjectByTenant(user.id, projectId);
  if (!tenantAccess.exists) {
    return { allowed: false, reason: "PROJECT_NOT_FOUND" };
  }

  if (tenantAccess.allowed) {
    return { allowed: true, projectId };
  }

  const memberProjectIds = await listMemberProjectIds(user.id);
  if (!memberProjectIds.includes(projectId)) {
    return { allowed: false, reason: "FORBIDDEN_SCOPE" };
  }

  return { allowed: true, projectId };
}

export async function ensureMeetingScopeAccess(user: AuthScopeUser, meetingId: string, projectId?: string): Promise<ScopeCheckResult> {
  if (canBypassScope(user)) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, projectId: true }
    });

    if (!meeting) {
      return { allowed: false, reason: "MEETING_NOT_FOUND" };
    }

    if (projectId && meeting.projectId !== projectId) {
      return { allowed: false, reason: "FORBIDDEN_SCOPE" };
    }

    return { allowed: true, projectId: meeting.projectId, meetingId: meeting.id };
  }

  const member = await isMemberInMeeting(user.id, meetingId);
  if (!member.exists) {
    return { allowed: false, reason: "MEETING_NOT_FOUND" };
  }

  const tenantAccess = await canManageProjectByTenant(user.id, member.projectId);
  if (tenantAccess.allowed) {
    return { allowed: true, projectId: member.projectId, meetingId };
  }

  if (!member.isMeetingMember) {
    return { allowed: false, reason: "FORBIDDEN_SCOPE" };
  }

  if (projectId && member.projectId !== projectId) {
    return { allowed: false, reason: "FORBIDDEN_SCOPE" };
  }

  return { allowed: true, projectId: member.projectId, meetingId };
}

export async function ensureDraftScopeAccess(user: AuthScopeUser, draftId: string): Promise<ScopeCheckResult> {
  const draft = await prisma.minuteDraft.findUnique({
    where: { id: draftId },
    select: {
      id: true,
      meetingId: true,
      meeting: {
        select: {
          projectId: true
        }
      }
    }
  });

  if (!draft) {
    return { allowed: false, reason: "DRAFT_NOT_FOUND" };
  }

  const meetingCheck = await ensureMeetingScopeAccess(user, draft.meetingId, draft.meeting.projectId);
  if (!meetingCheck.allowed) {
    return meetingCheck;
  }

  return { allowed: true, projectId: draft.meeting.projectId, meetingId: draft.meetingId };
}

export async function ensureActionItemScopeAccess(user: AuthScopeUser, actionItemId: string): Promise<ScopeCheckResult> {
  const item = await prisma.actionItem.findUnique({
    where: { id: actionItemId },
    select: {
      id: true,
      projectId: true,
      meetingId: true
    }
  });

  if (!item) {
    return { allowed: false, reason: "ACTION_ITEM_NOT_FOUND" };
  }

  if (item.meetingId) {
    const meetingCheck = await ensureMeetingScopeAccess(user, item.meetingId, item.projectId);
    if (!meetingCheck.allowed) {
      return meetingCheck;
    }

    return { allowed: true, projectId: item.projectId, meetingId: item.meetingId };
  }

  const projectCheck = await ensureProjectScopeAccess(user, item.projectId);
  if (!projectCheck.allowed) {
    return projectCheck;
  }

  return { allowed: true, projectId: item.projectId };
}

export async function ensureAskAiScopeAccess(input: AskAiScopeInput): Promise<AskAiScopeResult> {
  if (!input.projectId && !input.meetingId && input.role !== UserRole.ADMIN) {
    return { allowed: false, reason: "FORBIDDEN_SCOPE" };
  }

  if (input.meetingId) {
    const result = await ensureMeetingScopeAccess(
      { id: input.userId, role: input.role },
      input.meetingId,
      input.projectId
    );
    return {
      allowed: result.allowed,
      reason: result.reason as AskAiScopeResult["reason"]
    };
  }

  if (input.projectId) {
    const result = await ensureProjectScopeAccess(
      { id: input.userId, role: input.role },
      input.projectId
    );
    return {
      allowed: result.allowed,
      reason: result.reason as AskAiScopeResult["reason"]
    };
  }

  return { allowed: true };
}
