import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { generateWithLocalModel } from "./aiService";
import { logAiRun } from "./aiRunLogService";
import { hybridRetrieveApprovedKnowledge } from "./retrieval/hybridRetrievalService";

type AskApprovedInput = {
  question: string;
  projectId?: string;
  meetingId?: string;
  model?: string;
  requesterUserId: string;
  requesterRole: UserRole;
  includeRetrievalDebug?: boolean;
};

type Citation = {
  chunkId: string;
  sourceType: string;
  projectId: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  minuteVersionId: string;
  minuteApprovedAt: string;
  sourceRowId?: string | null;
  snippet: string;
  hybridScore: number;
};

type UsedEvidence = Citation & {
  vectorScore: number;
  lexicalScore: number;
  sourceBoost: number;
  recencyBoost: number;
};

const groundedOutputSchema = z.object({
  answer: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  uncertainties: z.array(z.string().trim().min(1)).default([])
});

function buildGroundedPrompt(question: string, evidence: UsedEvidence[]): string {
  const evidenceText = evidence
    .map((item, index) => [
      `Evidence ${index + 1}`,
      `chunkId: ${item.chunkId}`,
      `sourceType: ${item.sourceType}`,
      `meetingId: ${item.meetingId}`,
      `meetingTitle: ${item.meetingTitle}`,
      `meetingDate: ${item.meetingDate}`,
      `minuteVersionId: ${item.minuteVersionId}`,
      `minuteApprovedAt: ${item.minuteApprovedAt}`,
      item.sourceRowId ? `sourceRowId: ${item.sourceRowId}` : "",
      `snippet: ${item.snippet}`
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  return [
    "You are an enterprise meeting memory assistant.",
    "You MUST answer only from the provided evidence set.",
    "Distinguish confirmed facts from uncertainty.",
    "Never invent owners, deadlines, commitments, or decisions.",
    "If evidence is missing or conflicting, say it explicitly.",
    "Respond in Thai.",
    "Return ONLY JSON with this shape:",
    '{"answer":"string","confidence":"low|medium|high","uncertainties":["string"]}',
    "",
    `Question: ${question}`,
    "",
    "Evidence set:",
    evidenceText
  ].join("\n");
}

function toIso(value: Date | null | undefined): string {
  if (!value) {
    return "unknown";
  }
  return value.toISOString();
}

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("LLM_JSON_PARSE_FAILED");
  }
}

function uniqueSingle(values: Array<string | undefined | null>): string | undefined {
  const list = [...new Set(values.filter((x): x is string => Boolean(x)))];
  return list.length === 1 ? list[0] : undefined;
}

async function persistAskAiLog(input: {
  requesterUserId: string;
  question: string;
  answer: string;
  confidence: "low" | "medium" | "high";
  model?: string;
  projectId?: string;
  meetingId?: string;
  citations: Citation[];
  usedEvidence: UsedEvidence[];
  retrievalDebug?: unknown;
}) {
  await prisma.askAiQueryLog.create({
    data: {
      userId: input.requesterUserId,
      projectId: input.projectId,
      meetingId: input.meetingId,
      question: input.question,
      answer: input.answer,
      confidence: input.confidence,
      model: input.model,
      retrievedEvidenceIds: input.citations.map((item) => item.chunkId) as Prisma.InputJsonValue,
      usedEvidenceJson: input.usedEvidence as unknown as Prisma.InputJsonValue,
      retrievalDebugJson: input.retrievalDebug as Prisma.InputJsonValue | undefined
    }
  });
}

export async function askFromApprovedMinutes(input: AskApprovedInput) {
  const runStartMs = Date.now();
  const retrieval = await hybridRetrieveApprovedKnowledge({
    question: input.question,
    projectId: input.projectId,
    meetingId: input.meetingId,
    limit: 12
  });

  const topEvidence = retrieval.evidence;

  if (!topEvidence.length) {
    const emptyResult = {
      answer: "ไม่พบหลักฐานจากข้อมูลที่อนุมัติแล้วซึ่งตรงกับคำถามนี้",
      confidence: "low" as const,
      citations: [] as Citation[],
      usedEvidence: [] as UsedEvidence[],
      usedMeetingIds: [] as string[],
      usedActionItemIds: [] as string[],
      usedDecisionIds: [] as string[],
      retrievalDebug: input.includeRetrievalDebug
        ? {
            strategy: retrieval.strategy,
            provider: retrieval.provider,
            resultCount: 0
          }
        : undefined,
      model: input.model ?? null
    };

    await persistAskAiLog({
      requesterUserId: input.requesterUserId,
      question: input.question,
      answer: emptyResult.answer,
      confidence: emptyResult.confidence,
      model: emptyResult.model ?? undefined,
      projectId: input.projectId,
      meetingId: input.meetingId,
      citations: emptyResult.citations,
      usedEvidence: emptyResult.usedEvidence,
      retrievalDebug: emptyResult.retrievalDebug
    });

    await logAiRun({
      operation: "ASK_AI_ANSWER",
      status: "SUCCESS",
      userId: input.requesterUserId,
      projectId: input.projectId,
      meetingId: input.meetingId,
      model: emptyResult.model ?? undefined,
      promptVersion: "ask-ai-grounded-v2",
      durationMs: Date.now() - runStartMs,
      retrievedIds: [],
      trace: {
        evidenceCount: 0,
        confidence: emptyResult.confidence,
        retrievalProvider: retrieval.provider,
        retrievalStrategy: retrieval.strategy
      }
    });

    return emptyResult;
  }

  const [meetings, minuteVersions] = await Promise.all([
    prisma.meeting.findMany({
      where: { id: { in: [...new Set(topEvidence.map((item) => item.meetingId))] } },
      select: {
        id: true,
        title: true,
        sessionAt: true,
        projectId: true
      }
    }),
    prisma.minuteVersion.findMany({
      where: { id: { in: [...new Set(topEvidence.map((item) => item.minuteVersionId))] } },
      select: {
        id: true,
        approvedAt: true
      }
    })
  ]);

  const meetingById = new Map(meetings.map((item) => [item.id, item]));
  const minuteVersionById = new Map(minuteVersions.map((item) => [item.id, item]));

  const usedEvidence: UsedEvidence[] = topEvidence.map((item) => {
    const meeting = meetingById.get(item.meetingId);
    const minuteVersion = minuteVersionById.get(item.minuteVersionId);

    return {
      chunkId: item.chunkId,
      sourceType: item.sourceType,
      sourceRowId: item.sourceRowId,
      projectId: item.projectId,
      meetingId: item.meetingId,
      meetingTitle: meeting?.title ?? "Unknown meeting",
      meetingDate: toIso(meeting?.sessionAt),
      minuteVersionId: item.minuteVersionId,
      minuteApprovedAt: toIso(minuteVersion?.approvedAt),
      snippet: item.textContent,
      vectorScore: item.vectorScore,
      lexicalScore: item.lexicalScore,
      sourceBoost: item.sourceBoost,
      recencyBoost: item.recencyBoost,
      hybridScore: item.hybridScore
    };
  });

  const citations: Citation[] = usedEvidence.map((item) => ({
    chunkId: item.chunkId,
    sourceType: item.sourceType,
    sourceRowId: item.sourceRowId,
    projectId: item.projectId,
    meetingId: item.meetingId,
    meetingTitle: item.meetingTitle,
    meetingDate: item.meetingDate,
    minuteVersionId: item.minuteVersionId,
    minuteApprovedAt: item.minuteApprovedAt,
    snippet: item.snippet,
    hybridScore: item.hybridScore
  }));

  const prompt = buildGroundedPrompt(input.question, usedEvidence);
  const generated = await generateWithLocalModel({
    model: input.model,
    prompt
  });

  const parsed = groundedOutputSchema.parse(safeParseJson(generated.output));

  const result = {
    answer: parsed.answer,
    confidence: parsed.confidence,
    uncertainties: parsed.uncertainties,
    citations,
    usedEvidence,
    usedMeetingIds: [...new Set(citations.map((item) => item.meetingId))],
    usedActionItemIds: [
      ...new Set(citations
        .filter((item) => item.sourceType === "ACTION_ITEM" && Boolean(item.sourceRowId))
        .map((item) => item.sourceRowId as string))
    ],
    usedDecisionIds: [
      ...new Set(citations
        .filter((item) => item.sourceType === "DECISION" && Boolean(item.sourceRowId))
        .map((item) => item.sourceRowId as string))
    ],
    model: generated.model,
    retrievalDebug: input.includeRetrievalDebug
      ? {
          strategy: retrieval.strategy,
          provider: retrieval.provider,
          evidenceCount: usedEvidence.length,
          topScores: usedEvidence.slice(0, 5).map((item) => ({
            chunkId: item.chunkId,
            hybridScore: item.hybridScore,
            vectorScore: item.vectorScore,
            lexicalScore: item.lexicalScore
          }))
        }
      : undefined
  };

  await persistAskAiLog({
    requesterUserId: input.requesterUserId,
    question: input.question,
    answer: result.answer,
    confidence: result.confidence,
    model: result.model,
    projectId: input.projectId ?? uniqueSingle(citations.map((item) => item.projectId)),
    meetingId: input.meetingId ?? uniqueSingle(citations.map((item) => item.meetingId)),
    citations,
    usedEvidence,
    retrievalDebug: result.retrievalDebug
  });

  await logAiRun({
    operation: "ASK_AI_ANSWER",
    status: "SUCCESS",
    userId: input.requesterUserId,
    projectId: input.projectId ?? uniqueSingle(citations.map((item) => item.projectId)),
    meetingId: input.meetingId ?? uniqueSingle(citations.map((item) => item.meetingId)),
    model: result.model,
    promptVersion: "ask-ai-grounded-v2",
    durationMs: Date.now() - runStartMs,
    retrievedIds: citations.map((item) => item.chunkId),
    trace: {
      evidenceCount: usedEvidence.length,
      confidence: result.confidence,
      retrievalProvider: retrieval.provider,
      retrievalStrategy: retrieval.strategy
    }
  });

  return result;
}
