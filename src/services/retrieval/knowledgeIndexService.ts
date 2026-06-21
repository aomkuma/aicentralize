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

function buildChunksFromVersion(version: {
  id: string;
  meetingId: string;
  summary: string;
  keyPointsJson: unknown;
  meeting: {
    title: string;
    agenda: string | null;
    projectId: string;
    sessionAt: Date;
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
          sessionAt: true
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

  const chunks = buildChunksFromVersion(version);
  const provider = getEmbeddingProvider();

  await prisma.$transaction(async (tx) => {
    await tx.meetingKnowledgeChunk.deleteMany({
      where: { minuteVersionId }
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

export async function backfillKnowledgeChunks(limit = 200) {
  const versions = await prisma.minuteVersion.findMany({
    select: { id: true },
    orderBy: { approvedAt: "desc" },
    take: limit
  });

  let indexedVersions = 0;
  let indexedChunks = 0;

  for (const version of versions) {
    const result = await syncKnowledgeChunksForMinuteVersion(version.id);
    indexedVersions += 1;
    indexedChunks += result.indexedCount;
  }

  return {
    indexedVersions,
    indexedChunks
  };
}
