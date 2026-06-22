import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";

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
};

function canBypassByRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.PM;
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

export async function listMemberProjectIds(userId: string): Promise<string[]> {
  const meetings = await prisma.meeting.findMany({
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
  });

  return meetings.map((item) => item.projectId);
}

export async function ensureProjectScopeAccess(user: AuthScopeUser, projectId: string): Promise<ScopeCheckResult> {
  if (canBypassByRole(user.role)) {
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!exists) {
      return { allowed: false, reason: "PROJECT_NOT_FOUND" };
    }
    return { allowed: true, projectId };
  }

  const memberProjectIds = await listMemberProjectIds(user.id);
  if (!memberProjectIds.includes(projectId)) {
    const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    return exists
      ? { allowed: false, reason: "FORBIDDEN_SCOPE" }
      : { allowed: false, reason: "PROJECT_NOT_FOUND" };
  }

  return { allowed: true, projectId };
}

export async function ensureMeetingScopeAccess(user: AuthScopeUser, meetingId: string, projectId?: string): Promise<ScopeCheckResult> {
  if (canBypassByRole(user.role)) {
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
      meetingId: true,
      meeting: {
        select: {
          projectId: true
        }
      }
    }
  });

  if (!item) {
    return { allowed: false, reason: "ACTION_ITEM_NOT_FOUND" };
  }

  const meetingCheck = await ensureMeetingScopeAccess(user, item.meetingId, item.meeting.projectId);
  if (!meetingCheck.allowed) {
    return meetingCheck;
  }

  return { allowed: true, projectId: item.meeting.projectId, meetingId: item.meetingId };
}

export async function ensureAskAiScopeAccess(input: AskAiScopeInput): Promise<AskAiScopeResult> {
  if (!input.projectId && !input.meetingId && !canBypassByRole(input.role)) {
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
