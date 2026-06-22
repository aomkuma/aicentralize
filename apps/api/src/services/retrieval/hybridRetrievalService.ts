import { KnowledgeChunkSourceType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { cosineSimilarity } from "../embeddingService";
import { getEmbeddingProvider } from "./embeddingProvider";

type HybridRetrievalInput = {
  question: string;
  projectId?: string;
  meetingId?: string;
  limit?: number;
};

type NormalizedEvidence = {
  chunkId: string;
  meetingId: string;
  minuteVersionId: string;
  projectId: string;
  sourceType: KnowledgeChunkSourceType;
  sourceRowId?: string | null;
  textContent: string;
  metadataJson?: unknown;
  vectorScore: number;
  lexicalScore: number;
  sourceBoost: number;
  recencyBoost: number;
  hybridScore: number;
};

const VECTOR_WEIGHT = 0.6;
const LEXICAL_WEIGHT = 0.3;

const sourceBoostMap: Record<KnowledgeChunkSourceType, number> = {
  ACTION_ITEM: 0.12,
  DECISION: 0.1,
  KEY_POINT: 0.07,
  MINUTE_SUMMARY: 0.05,
  MEETING_METADATA: 0.03
};

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function lexicalScore(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query);

  if (!t || !q) {
    return 0;
  }

  if (t.includes(q)) {
    return 1;
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return 0;
  }

  const hits = tokens.filter((token) => t.includes(token)).length;
  return hits / tokens.length;
}

function recencyBoost(updatedAt: Date): number {
  const ageDays = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 3) {
    return 0.08;
  }
  if (ageDays <= 14) {
    return 0.04;
  }
  return 0;
}

type VectorRow = {
  id: string;
  projectId: string;
  meetingId: string;
  minuteVersionId: string;
  sourceType: KnowledgeChunkSourceType;
  sourceRowId: string | null;
  textContent: string;
  metadataJson: unknown;
  embeddingJson: unknown;
  updatedAt: Date;
  vectorScore: number;
};

async function searchByVector(input: HybridRetrievalInput, queryEmbedding: number[], limit: number) {
  const where: {
    projectId?: string;
    meetingId?: string;
    embeddingJson: { not: Prisma.NullTypes.JsonNull };
  } = {
    embeddingJson: { not: Prisma.JsonNull }
  };

  if (input.projectId) {
    where.projectId = input.projectId;
  }
  if (input.meetingId) {
    where.meetingId = input.meetingId;
  }

  const rows = await prisma.meetingKnowledgeChunk.findMany({
    where,
    select: {
      id: true,
      projectId: true,
      meetingId: true,
      minuteVersionId: true,
      sourceType: true,
      sourceRowId: true,
      textContent: true,
      metadataJson: true,
      embeddingJson: true,
      updatedAt: true
    },
    take: Math.max(200, limit * 20)
  });

  const scored: VectorRow[] = rows
    .map((row) => {
      const embedding = Array.isArray(row.embeddingJson)
        ? row.embeddingJson.filter((n) => typeof n === "number").map((n) => n as number)
        : [];

      return {
        ...row,
        vectorScore: embedding.length ? Math.max(0, cosineSimilarity(queryEmbedding, embedding)) : 0
      };
    })
    .sort((a, b) => b.vectorScore - a.vectorScore)
    .slice(0, limit);

  return scored;
}

async function searchByLexical(input: HybridRetrievalInput, limit: number) {
  const where: {
    projectId?: string;
    meetingId?: string;
    OR: Array<{ textContent: { contains: string; mode: "insensitive" } }>;
  } = {
    OR: [{ textContent: { contains: input.question, mode: "insensitive" } }]
  };

  if (input.projectId) {
    where.projectId = input.projectId;
  }

  if (input.meetingId) {
    where.meetingId = input.meetingId;
  }

  return prisma.meetingKnowledgeChunk.findMany({
    where,
    take: limit,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      projectId: true,
      meetingId: true,
      minuteVersionId: true,
      sourceType: true,
      sourceRowId: true,
      textContent: true,
      metadataJson: true,
      updatedAt: true
    }
  });
}

export async function hybridRetrieveApprovedKnowledge(input: HybridRetrievalInput) {
  const limit = input.limit ?? 12;
  const provider = getEmbeddingProvider();
  const queryEmbedding = await provider.embed(input.question);

  const [vectorRows, lexicalRows] = await Promise.all([
    searchByVector(input, queryEmbedding, Math.max(20, limit * 2)),
    searchByLexical(input, Math.max(20, limit * 2))
  ]);

  const merged = new Map<string, NormalizedEvidence>();

  for (const row of vectorRows) {
    const boost = sourceBoostMap[row.sourceType] ?? 0;
    const recency = recencyBoost(row.updatedAt);

    merged.set(row.id, {
      chunkId: row.id,
      projectId: row.projectId,
      meetingId: row.meetingId,
      minuteVersionId: row.minuteVersionId,
      sourceType: row.sourceType,
      sourceRowId: row.sourceRowId,
      textContent: row.textContent,
      metadataJson: row.metadataJson,
      vectorScore: Math.max(0, Math.min(1, row.vectorScore)),
      lexicalScore: 0,
      sourceBoost: boost,
      recencyBoost: recency,
      hybridScore: 0
    });
  }

  for (const row of lexicalRows) {
    const lex = lexicalScore(row.textContent, input.question);
    const existing = merged.get(row.id);
    const boost = sourceBoostMap[row.sourceType] ?? 0;
    const recency = recencyBoost(row.updatedAt);

    if (existing) {
      existing.lexicalScore = Math.max(existing.lexicalScore, lex);
      existing.sourceBoost = Math.max(existing.sourceBoost, boost);
      existing.recencyBoost = Math.max(existing.recencyBoost, recency);
    } else {
      merged.set(row.id, {
        chunkId: row.id,
        projectId: row.projectId,
        meetingId: row.meetingId,
        minuteVersionId: row.minuteVersionId,
        sourceType: row.sourceType,
        sourceRowId: row.sourceRowId,
        textContent: row.textContent,
        metadataJson: row.metadataJson,
        vectorScore: 0,
        lexicalScore: lex,
        sourceBoost: boost,
        recencyBoost: recency,
        hybridScore: 0
      });
    }
  }

  const ranked = Array.from(merged.values())
    .map((item) => ({
      ...item,
      hybridScore:
        item.vectorScore * VECTOR_WEIGHT +
        item.lexicalScore * LEXICAL_WEIGHT +
        item.sourceBoost +
        item.recencyBoost
    }))
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, limit);

  return {
    strategy: {
      vectorWeight: VECTOR_WEIGHT,
      lexicalWeight: LEXICAL_WEIGHT,
      sourceBoostMap,
      recencyBoost: "<=3 days +0.08, <=14 days +0.04"
    },
    provider: {
      name: provider.providerName,
      dimensions: provider.dimensions
    },
    evidence: ranked
  };
}
