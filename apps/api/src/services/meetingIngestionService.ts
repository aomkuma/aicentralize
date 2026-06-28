import {
  MeetingArtifactSourceType,
  MeetingArtifactType,
  MeetingAttendanceStatus,
  MeetingParticipantRole
} from "@prisma/client";
import { prisma } from "../lib/prisma";

type CreateMeetingParticipantInput = {
  userId?: string;
  displayName?: string;
  email?: string;
  role?: MeetingParticipantRole;
  roleLabel?: string;
  attendanceStatus?: MeetingAttendanceStatus;
};

type CreateProjectMeetingInput = {
  projectId: string;
  title: string;
  agenda?: string;
  meetingDate: Date;
  createdByUserId: string;
  participants?: CreateMeetingParticipantInput[];
};

type AddMeetingArtifactInput = {
  meetingId: string;
  artifactType: MeetingArtifactType;
  sourceType: MeetingArtifactSourceType;
  textContent?: string;
  fileUrlOrStorageKey?: string;
  mimeType?: string;
  createdByUserId?: string;
};

export async function createProjectMeeting(input: CreateProjectMeetingInput) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true }
  });

  if (!project) {
    return null;
  }

  const meeting = await prisma.meeting.create({
    data: {
      projectId: input.projectId,
      title: input.title,
      agenda: input.agenda,
      sessionAt: input.meetingDate,
      summary: input.agenda ?? "",
      createdById: input.createdByUserId,
      participants: input.participants?.length
        ? {
            create: input.participants.map((participant) => ({
              userId: participant.userId,
              displayName: participant.displayName,
              email: participant.email,
              role: participant.role ?? MeetingParticipantRole.ATTENDEE,
              roleLabel: participant.roleLabel,
              attendanceStatus: participant.attendanceStatus
            }))
          }
        : undefined
    },
    include: {
      project: true,
      participants: true
    }
  });

  return meeting;
}

export async function addMeetingArtifact(input: AddMeetingArtifactInput) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    select: { id: true }
  });

  if (!meeting) {
    return null;
  }

  const artifact = await prisma.meetingArtifact.create({
    data: {
      meetingId: input.meetingId,
      type: input.artifactType,
      sourceType: input.sourceType,
      contentText: input.textContent,
      fileUrl: input.fileUrlOrStorageKey,
      mimeType: input.mimeType,
      createdById: input.createdByUserId
    }
  });

  return artifact;
}

export async function getMeetingDetail(meetingId: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      project: true,
      createdBy: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true
        }
      },
      participants: {
        orderBy: { createdAt: "asc" }
      },
      artifacts: {
        orderBy: { createdAt: "asc" }
      },
      minutes: {
        orderBy: { createdAt: "asc" }
      },
      actionItems: {
        include: {
          assignee: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: "asc" }
      },
      minuteDrafts: {
        select: {
          id: true,
          status: true,
          summary: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { updatedAt: "desc" },
        take: 1
      }
    }
  });

  return meeting;
}
