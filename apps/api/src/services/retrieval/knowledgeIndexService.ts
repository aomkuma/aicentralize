import { KnowledgeChunkSourceType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getEmbeddingProvider } from "./embeddingProvider";

type BuildChunk = {
  chunkKey: string;
  projectId: string;
  meetingId: string;
  minuteVersionId: string;
  sourceType: KnowledgeChunkSourceType;
  sourceRowId?: string;
  textContent: string;
  metadataJson?: Prisma.InputJsonValue;
};

function pushChunk(chunks: BuildChunk[], chunk: BuildChunk) {
  if (!chunk.textContent.trim()) {
    return;
  }
  chunks.push(chunk);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function readOpenQuestionsFromSnapshot(snapshotJson: unknown): string[] {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return [];
  }

  return parseStringArray((snapshotJson as { openQuestions?: unknown }).openQuestions);
}

const TRANSCRIPT_CHUNK_SIZE = 1800;
const MAX_TRANSCRIPT_CHUNKS = 12;

function chunkTranscript(text: string | null | undefined): string[] {
  const normalized = text?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += TRANSCRIPT_CHUNK_SIZE) {
    chunks.push(normalized.slice(index, index + TRANSCRIPT_CHUNK_SIZE));
  }

  return chunks.slice(0, MAX_TRANSCRIPT_CHUNKS);
}

function buildChunksFromVersion(version: {
  id: string;
  meetingId: string;
  summary: string;
  keyPointsJson: unknown;
  risksJson: unknown;
  snapshotJson: unknown;
  meeting: {
    title: string;
    agenda: string | null;
    projectId: string;
    sessionAt: Date;
    transcript: string | null;
  };
  decisions: Array<{
    id: string;
    title: string;
    detail: string | null;
  }>;
  actionItems: Array<{
    id: string;
    task: string;
    detail: string | null;
    ownerDisplayName: string | null;
    dueDate: Date;
    status: string;
  }>;
}): BuildChunk[] {
  const chunks: BuildChunk[] = [];

  pushChunk(chunks, {
    chunkKey: `${version.id}:MINUTE_SUMMARY:summary`,
    projectId: version.meeting.projectId,
    meetingId: version.meetingId,
    minuteVersionId: version.id,
    sourceType: KnowledgeChunkSourceType.MINUTE_SUMMARY,
    textContent: version.summary,
    metadataJson: {
      meetingTitle: version.meeting.title,
      meetingDate: version.meeting.sessionAt.toISOString()
    }
  });

  const keyPoints = Array.isArray(version.keyPointsJson)
    ? version.keyPointsJson.filter((x) => typeof x === "string").map((x) => String(x))
    : [];

  const risks = parseStringArray(version.risksJson);
  const openQuestions = readOpenQuestionsFromSnapshot(version.snapshotJson);

  keyPoints.forEach((point, index) => {
    pushChunk(chunks, {
      chunkKey: `${version.id}:KEY_POINT:${index + 1}`,
      projectId: version.meeting.projectId,
      meetingId: version.meetingId,
      minuteVersionId: version.id,
      sourceType: KnowledgeChunkSourceType.KEY_POINT,
      textContent: point,
      metadataJson: {
        index: index + 1,
        meetingTitle: version.meeting.title
      }
    });
  });

  risks.forEach((risk, index) => {
    pushChunk(chunks, {
      chunkKey: `${version.id}:RISK:${index + 1}`,
      projectId: version.meeting.projectId,
      meetingId: version.meetingId,
      minuteVersionId: version.id,
      sourceType: KnowledgeChunkSourceType.KEY_POINT,
      textContent: `[Risk] ${risk}`,
      metadataJson: {
        subtype: "risk",
        index: index + 1,
        meetingTitle: version.meeting.title
      }
    });
  });

  openQuestions.forEach((question, index) => {
    pushChunk(chunks, {
      chunkKey: `${version.id}:OPEN_QUESTION:${index + 1}`,
      projectId: version.meeting.projectId,
      meetingId: version.meetingId,
      minuteVersionId: version.id,
      sourceType: KnowledgeChunkSourceType.KEY_POINT,
      textContent: `[Open question] ${question}`,
      metadataJson: {
        subtype: "open_question",
        index: index + 1,
        meetingTitle: version.meeting.title
      }
    });
  });

  pushChunk(chunks, {
    chunkKey: `${version.id}:MEETING_METADATA:meta`,
    projectId: version.meeting.projectId,
    meetingId: version.meetingId,
    minuteVersionId: version.id,
    sourceType: KnowledgeChunkSourceType.MEETING_METADATA,
    textContent: [
      `meeting title: ${version.meeting.title}`,
      version.meeting.agenda ? `agenda: ${version.meeting.agenda}` : "",
      `meeting date: ${version.meeting.sessionAt.toISOString()}`
    ].filter(Boolean).join(" | "),
    metadataJson: {
      meetingTitle: version.meeting.title,
      meetingDate: version.meeting.sessionAt.toISOString()
    }
  });

  version.decisions.forEach((decision) => {
    pushChunk(chunks, {
      chunkKey: `${version.id}:DECISION:${decision.id}`,
      projectId: version.meeting.projectId,
      meetingId: version.meetingId,
      minuteVersionId: version.id,
      sourceType: KnowledgeChunkSourceType.DECISION,
      sourceRowId: decision.id,
      textContent: `${decision.title}${decision.detail ? ` | ${decision.detail}` : ""}`,
      metadataJson: {
        decisionId: decision.id
      }
    });
  });

  version.actionItems.forEach((item) => {
    pushChunk(chunks, {
      chunkKey: `${version.id}:ACTION_ITEM:${item.id}`,
      projectId: version.meeting.projectId,
      meetingId: version.meetingId,
      minuteVersionId: version.id,
      sourceType: KnowledgeChunkSourceType.ACTION_ITEM,
      sourceRowId: item.id,
      textContent: [
        item.task,
        item.detail ?? "",
        item.ownerDisplayName ? `owner ${item.ownerDisplayName}` : "",
        `status ${item.status}`,
        `due ${item.dueDate.toISOString()}`
      ].filter(Boolean).join(" | "),
      metadataJson: {
        actionItemId: item.id,
        dueDate: item.dueDate.toISOString(),
        status: item.status
      }
    });
  });

  chunkTranscript(version.meeting.transcript).forEach((excerpt, index) => {
    pushChunk(chunks, {
      chunkKey: `${version.id}:TRANSCRIPT:${index + 1}`,
      projectId: version.meeting.projectId,
      meetingId: version.meetingId,
      minuteVersionId: version.id,
      sourceType: KnowledgeChunkSourceType.KEY_POINT,
      textContent: `[Approved transcript] ${excerpt}`,
      metadataJson: {
        subtype: "transcript",
        index: index + 1,
        meetingTitle: version.meeting.title
      }
    });
  });

  return chunks;
}

export async function syncKnowledgeChunksForMinuteVersion(minuteVersionId: string) {
  const version = await prisma.minuteVersion.findUnique({
    where: { id: minuteVersionId },
    include: {
      meeting: {
        select: {
          title: true,
          agenda: true,
          projectId: true,
          sessionAt: true,
          transcript: true
        }
      },
      decisions: {
        select: {
          id: true,
          title: true,
          detail: true
        }
      },
      actionItems: {
        select: {
          id: true,
          task: true,
          detail: true,
          ownerDisplayName: true,
          dueDate: true,
          status: true
        }
      }
    }
  });

  if (!version) {
    return { indexedCount: 0 };
  }

  const latestVersion = await prisma.minuteVersion.findFirst({
    where: { meetingId: version.meetingId },
    orderBy: { versionNo: "desc" },
    select: { id: true }
  });

  if (latestVersion?.id !== version.id) {
    return { indexedCount: 0, skipped: true };
  }

  const chunks = buildChunksFromVersion(version);
  const provider = getEmbeddingProvider();

  await prisma.$transaction(async (tx) => {
    await tx.meetingKnowledgeChunk.deleteMany({
      where: { meetingId: version.meetingId }
    });

    for (const chunk of chunks) {
      const embedding = await provider.embed(chunk.textContent);
      await tx.meetingKnowledgeChunk.create({
        data: {
          chunkKey: chunk.chunkKey,
          projectId: chunk.projectId,
          meetingId: chunk.meetingId,
          minuteVersionId: chunk.minuteVersionId,
          sourceType: chunk.sourceType,
          sourceRowId: chunk.sourceRowId,
          textContent: chunk.textContent,
          metadataJson: chunk.metadataJson,
          embeddingJson: embedding
        }
      });
    }
  });

  return {
    indexedCount: chunks.length,
    provider: provider.providerName,
    dimensions: provider.dimensions
  };
}

export async function backfillKnowledgeChunks(limit = 500) {
  const meetings = await prisma.meeting.findMany({
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: limit
  });

  let indexedVersions = 0;
  let indexedChunks = 0;
  let skippedVersions = 0;

  for (const meeting of meetings) {
    const latestVersion = await prisma.minuteVersion.findFirst({
      where: { meetingId: meeting.id },
      orderBy: { versionNo: "desc" },
      select: { id: true }
    });

    if (!latestVersion) {
      continue;
    }

    const result = await syncKnowledgeChunksForMinuteVersion(latestVersion.id);
    if (result.skipped) {
      skippedVersions += 1;
      continue;
    }

    indexedVersions += 1;
    indexedChunks += result.indexedCount;
  }

  return {
    meetingsProcessed: meetings.length,
    indexedVersions,
    skippedVersions,
    indexedChunks
  };
}
