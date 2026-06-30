import { ActionItemPriority, ActionItemSource, ActionStatus, MinuteDraftStatus, MinuteVersionStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { syncKnowledgeChunksForMinuteVersion } from "./retrieval/knowledgeIndexService";

const draftDecisionSchema = z.object({
  text: z.string().trim().min(1),
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().datetime().optional()
});

const draftActionItemSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().datetime().optional(),
  priority: z.nativeEnum(ActionItemPriority).default(ActionItemPriority.MEDIUM)
});

const draftRiskSchema = z.object({
  text: z.string().trim().min(1)
});

const draftOpenQuestionSchema = z.object({
  text: z.string().trim().min(1)
});

const draftEditablePayloadSchema = z.object({
  summary: z.string().trim().min(1),
  keyPoints: z.array(z.string().trim().min(1)).default([]),
  decisions: z.array(draftDecisionSchema).default([]),
  actionItems: z.array(draftActionItemSchema).default([]),
  risks: z.array(draftRiskSchema).default([]),
  openQuestions: z.array(draftOpenQuestionSchema).default([])
});

type DraftEditablePayload = z.infer<typeof draftEditablePayloadSchema>;

type DraftUpdateInput = {
  summary?: string;
  keyPoints?: string[];
  decisions?: Array<{
    text: string;
    ownerName?: string;
    dueDate?: string;
  }>;
  actionItems?: Array<{
    title: string;
    description?: string;
    ownerName?: string;
    dueDate?: string;
    priority?: ActionItemPriority;
  }>;
  risks?: Array<{ text: string }>;
  openQuestions?: Array<{ text: string }>;
};

function normalizeDraftPayload(raw: {
  summary: string | null;
  keyPointsJson: unknown;
  decisionsJson: unknown;
  actionItemsJson: unknown;
  risksJson: unknown;
  openQuestionsJson: unknown;
}): DraftEditablePayload {
  return draftEditablePayloadSchema.parse({
    summary: raw.summary ?? "",
    keyPoints: raw.keyPointsJson ?? [],
    decisions: raw.decisionsJson ?? [],
    actionItems: raw.actionItemsJson ?? [],
    risks: raw.risksJson ?? [],
    openQuestions: raw.openQuestionsJson ?? []
  });
}

export async function getMinuteDraftDetail(draftId: string) {
  const draft = await prisma.minuteDraft.findUnique({
    where: { id: draftId },
    include: {
      meeting: {
        include: {
          project: true
        }
      },
      sourceArtifact: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!draft) {
    return null;
  }

  const normalized = normalizeDraftPayload({
    summary: draft.summary,
    keyPointsJson: draft.keyPointsJson,
    decisionsJson: draft.decisionsJson,
    actionItemsJson: draft.actionItemsJson,
    risksJson: draft.risksJson,
    openQuestionsJson: draft.openQuestionsJson
  });

  return {
    ...draft,
    summary: normalized.summary,
    keyPoints: normalized.keyPoints,
    decisions: normalized.decisions,
    actionItems: normalized.actionItems,
    risks: normalized.risks,
    openQuestions: normalized.openQuestions
  };
}

export async function updateMinuteDraftEditableFields(
  draftId: string,
  payload: DraftUpdateInput
) {
  const draft = await prisma.minuteDraft.findUnique({ where: { id: draftId } });
  if (!draft) {
    return null;
  }

  const current = normalizeDraftPayload({
    summary: draft.summary,
    keyPointsJson: draft.keyPointsJson,
    decisionsJson: draft.decisionsJson,
    actionItemsJson: draft.actionItemsJson,
    risksJson: draft.risksJson,
    openQuestionsJson: draft.openQuestionsJson
  });

  const merged = draftEditablePayloadSchema.parse({
    summary: payload.summary ?? current.summary,
    keyPoints: payload.keyPoints ?? current.keyPoints,
    decisions: payload.decisions ?? current.decisions,
    actionItems: payload.actionItems ?? current.actionItems,
    risks: payload.risks ?? current.risks,
    openQuestions: payload.openQuestions ?? current.openQuestions
  });

  const updated = await prisma.minuteDraft.update({
    where: { id: draftId },
    data: {
      summary: merged.summary,
      keyPointsJson: merged.keyPoints,
      decisionsJson: merged.decisions,
      actionItemsJson: merged.actionItems,
      risksJson: merged.risks,
      openQuestionsJson: merged.openQuestions,
      status: MinuteDraftStatus.READY_FOR_REVIEW
    }
  });

  return updated;
}

function parseDueDateOrFallback(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed;
}

async function resolveOwnerUserId(ownerName: string | undefined): Promise<string | null> {
  if (!ownerName) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { equals: ownerName, mode: "insensitive" } },
        { email: { equals: ownerName, mode: "insensitive" } }
      ]
    },
    select: { id: true }
  });

  return user?.id ?? null;
}

export async function approveMinuteDraft(draftId: string, approvedByUserId: string) {
  const draft = await prisma.minuteDraft.findUnique({
    where: { id: draftId },
    include: {
      meeting: true
    }
  });

  if (!draft) {
    return null;
  }

  const parsed = normalizeDraftPayload({
    summary: draft.summary,
    keyPointsJson: draft.keyPointsJson,
    decisionsJson: draft.decisionsJson,
    actionItemsJson: draft.actionItemsJson,
    risksJson: draft.risksJson,
    openQuestionsJson: draft.openQuestionsJson
  });

  const fallbackDueDate = new Date(draft.meeting.sessionAt.getTime() + 7 * 24 * 60 * 60 * 1000);

  const decisionOwnerIds = await Promise.all(parsed.decisions.map((item) => resolveOwnerUserId(item.ownerName)));
  const actionOwnerIds = await Promise.all(parsed.actionItems.map((item) => resolveOwnerUserId(item.ownerName)));

  const result = await prisma.$transaction(async (tx) => {
    const latest = await tx.minuteVersion.findFirst({
      where: { meetingId: draft.meetingId },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true }
    });

    const nextVersionNo = (latest?.versionNo ?? 0) + 1;

    const version = await tx.minuteVersion.create({
      data: {
        meetingId: draft.meetingId,
        draftId: draft.id,
        versionNo: nextVersionNo,
        status: MinuteVersionStatus.APPROVED,
        summary: parsed.summary,
        keyPointsJson: parsed.keyPoints,
        decisionsJson: parsed.decisions,
        actionItemsJson: parsed.actionItems,
        risksJson: parsed.risks,
        snapshotJson: {
          summary: parsed.summary,
          keyPoints: parsed.keyPoints,
          decisions: parsed.decisions,
          actionItems: parsed.actionItems,
          risks: parsed.risks,
          openQuestions: parsed.openQuestions,
          sourceDraftId: draft.id
        },
        approvedById: approvedByUserId,
        approvedAt: new Date()
      }
    });

    const decisions = await Promise.all(parsed.decisions.map((decision, index) => tx.decision.create({
      data: {
        meetingId: draft.meetingId,
        minuteVersionId: version.id,
        title: decision.text,
        ownerId: decisionOwnerIds[index],
        dueDate: decision.dueDate ? new Date(decision.dueDate) : null
      }
    })));

    const actionItems = await Promise.all(parsed.actionItems.map((item, index) => tx.actionItem.create({
      data: {
        projectId: draft.meeting.projectId,
        meetingId: draft.meetingId,
        minuteDraftId: draft.id,
        minuteVersionId: version.id,
        task: item.title,
        detail: item.description,
        assigneeId: actionOwnerIds[index] ?? approvedByUserId,
        ownerDisplayName: item.ownerName,
        dueDate: parseDueDateOrFallback(item.dueDate, fallbackDueDate),
        priority: item.priority,
        status: ActionStatus.OPEN,
        source: ActionItemSource.AI_EXTRACTED
      }
    })));

    await Promise.all(actionItems.map((item) => tx.actionItemStatusHistory.create({
      data: {
        actionItemId: item.id,
        fromStatus: null,
        toStatus: ActionStatus.OPEN,
        changedById: approvedByUserId,
        note: "Created from approved minute draft"
      }
    })));

    await tx.minuteDraft.update({
      where: { id: draft.id },
      data: { status: MinuteDraftStatus.SUPERSEDED }
    });

    return {
      version,
      decisionsCreated: decisions.length,
      actionItemsCreated: actionItems.length
    };
  });

  const indexing = await syncKnowledgeChunksForMinuteVersion(result.version.id);

  return {
    ...result,
    knowledgeIndexing: indexing
  };
}
