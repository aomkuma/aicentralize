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

type AppLink = {
  label: string;
  url: string;
  type: "meeting" | "project" | "action" | "knowledge";
  sourceId: string;
  context?: string;
};

function uniqueByUrl(links: AppLink[]): AppLink[] {
  const seen = new Set<string>();
  const result: AppLink[] = [];

  for (const link of links) {
    if (seen.has(link.url)) {
      continue;
    }
    seen.add(link.url);
    result.push(link);
  }

  return result;
}

function buildAppLinks(citations: Citation[]): AppLink[] {
  const links: AppLink[] = [];

  for (const citation of citations) {
    if (citation.sourceType === "PROJECT_GENERAL_NOTE") {
      links.push({
        label: "Open general notes",
        url: `/projects/${citation.projectId}/notes`,
        type: "knowledge",
        sourceId: citation.sourceRowId ?? citation.projectId,
        context: "General notes"
      });

      links.push({
        label: "Open project continuity",
        url: `/continuity/${citation.projectId}`,
        type: "project",
        sourceId: citation.projectId,
        context: "General notes"
      });
      continue;
    }

    if (citation.sourceType === "PROJECT_MEMORY") {
      links.push({
        label: "Open knowledge baseline",
        url: `/projects/${citation.projectId}/knowledge`,
        type: "knowledge",
        sourceId: citation.sourceRowId ?? citation.projectId,
        context: "Project baseline"
      });

      links.push({
        label: "Open project continuity",
        url: `/continuity/${citation.projectId}`,
        type: "project",
        sourceId: citation.projectId,
        context: "Project baseline"
      });
      continue;
    }

    links.push({
      label: "Open meeting minutes",
      url: `/meetings/history/${citation.meetingId}`,
      type: "meeting",
      sourceId: citation.meetingId,
      context: citation.meetingTitle
    });

    links.push({
      label: "Open project continuity",
      url: `/continuity/${citation.projectId}`,
      type: "project",
      sourceId: citation.projectId,
      context: citation.meetingTitle
    });

    if (citation.sourceType === "ACTION_ITEM" && citation.sourceRowId) {
      links.push({
        label: "Review action item",
        url: `/action-items/${encodeURIComponent(citation.sourceRowId)}`,
        type: "action",
        sourceId: citation.sourceRowId,
        context: citation.meetingTitle
      });
    }
  }

  return uniqueByUrl(links).slice(0, 6);
}

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
      item.meetingId ? `meetingId: ${item.meetingId}` : "",
      item.meetingTitle ? `meetingTitle: ${item.meetingTitle}` : "",
      item.meetingDate ? `meetingDate: ${item.meetingDate}` : "",
      item.minuteVersionId ? `minuteVersionId: ${item.minuteVersionId}` : "",
      item.minuteApprovedAt ? `minuteApprovedAt: ${item.minuteApprovedAt}` : "",
      item.sourceRowId ? `sourceRowId: ${item.sourceRowId}` : "",
      `snippet: ${item.snippet}`
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  return [
    "You are Rubjob in English and รับจบ in Thai, a cheerful nerdy female enterprise meeting memory assistant.",
    "Use a warm, upbeat, slightly nerdy tone, but stay concise and evidence-grounded.",
    "You MUST answer only from the provided evidence set.",
    "Distinguish confirmed facts from uncertainty.",
    "Never invent owners, deadlines, commitments, or decisions.",
    "If evidence is missing or conflicting, say it explicitly.",
    "Answer the exact question first. Do not turn every answer into a broad meeting summary.",
    "For narrow questions, keep the answer to 1-3 short sentences unless the user asks for more detail.",
    "If the user asks for a short answer, keep it short and avoid extra sections.",
    "Use bullets only for lists, action items, comparisons, or when the user asks for a summary.",
    "When answering about open actions, prioritize explicit action-item status from evidence over narrative text.",
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

function scoreProjectMemory(text: string, query: string): number {
  const normalizedText = text.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return 0;
  }

  const hits = tokens.filter((token) => normalizedText.includes(token)).length;
  return hits / tokens.length;
}

async function retrieveProjectMemoryEvidence(input: { projectId?: string; question: string; limit: number }): Promise<UsedEvidence[]> {
  if (!input.projectId) {
    return [];
  }

  const rows = await prisma.projectMemoryItem.findMany({
    where: {
      projectId: input.projectId,
      status: "APPROVED"
    },
    include: {
      source: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          authorityLevel: true,
          documentDate: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: 120
  });

  return rows
    .map((item) => {
      const text = [
        item.type,
        item.title,
        item.content,
        item.source?.title ?? "",
        item.source?.sourceType ?? ""
      ].filter(Boolean).join(" | ");
      const lexical = scoreProjectMemory(text, input.question);
      const authorityBoost = item.source?.authorityLevel === "AUTHORITATIVE"
        ? 0.18
        : item.source?.authorityLevel === "SUPPORTING"
          ? 0.1
          : 0.03;

      return {
        chunkId: `project-memory:${item.id}`,
        sourceType: "PROJECT_MEMORY",
        sourceRowId: item.id,
        projectId: item.projectId,
        meetingId: "",
        meetingTitle: "",
        meetingDate: item.effectiveDate ? item.effectiveDate.toISOString() : "",
        minuteVersionId: "",
        minuteApprovedAt: item.approvedAt ? item.approvedAt.toISOString() : "",
        snippet: [
          `[${item.type}] ${item.title}`,
          item.content,
          item.source ? `source: ${item.source.title}` : ""
        ].filter(Boolean).join(" | "),
        vectorScore: 0,
        lexicalScore: lexical,
        sourceBoost: authorityBoost,
        recencyBoost: 0,
        hybridScore: lexical * 0.75 + authorityBoost
      };
    })
    .filter((item) => item.hybridScore > 0.08)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, input.limit);
}

async function retrieveProjectGeneralNoteEvidence(input: { projectId?: string; question: string; limit: number }): Promise<UsedEvidence[]> {
  if (!input.projectId) {
    return [];
  }

  const rows = await prisma.projectGeneralNote.findMany({
    where: {
      projectId: input.projectId
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 120
  });

  return rows
    .map((item) => {
      const text = [
        item.title,
        item.content,
        item.author.name,
        item.author.email
      ].filter(Boolean).join(" | ");
      const lexical = scoreProjectMemory(text, input.question);
      const recencyBoost = 0.08;

      return {
        chunkId: `project-general-note:${item.id}`,
        sourceType: "PROJECT_GENERAL_NOTE",
        sourceRowId: item.id,
        projectId: item.projectId,
        meetingId: "",
        meetingTitle: "",
        meetingDate: item.createdAt.toISOString(),
        minuteVersionId: "",
        minuteApprovedAt: "",
        snippet: [
          `[General note] ${item.title}`,
          `author: ${item.author.name} (${item.author.id})`,
          item.content
        ].join(" | "),
        vectorScore: 0,
        lexicalScore: lexical,
        sourceBoost: 0.09,
        recencyBoost,
        hybridScore: lexical * 0.78 + 0.09 + recencyBoost
      };
    })
    .filter((item) => item.hybridScore > 0.1)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, input.limit);
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

  const [topEvidence, memoryEvidence, generalNoteEvidence] = await Promise.all([
    Promise.resolve(retrieval.evidence),
    retrieveProjectMemoryEvidence({
      projectId: input.projectId,
      question: input.question,
      limit: 6
    }),
    retrieveProjectGeneralNoteEvidence({
      projectId: input.projectId,
      question: input.question,
      limit: 6
    })
  ]);

  if (!topEvidence.length && !memoryEvidence.length && !generalNoteEvidence.length) {
    const emptyResult = {
      answer: "ไม่พบหลักฐานจากข้อมูลที่อนุมัติแล้วซึ่งตรงกับคำถามนี้",
      confidence: "low" as const,
      citations: [] as Citation[],
      appLinks: [] as AppLink[],
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
  usedEvidence.push(...memoryEvidence);
  usedEvidence.push(...generalNoteEvidence);
  usedEvidence.sort((a, b) => b.hybridScore - a.hybridScore);

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
    appLinks: buildAppLinks(citations),
    usedEvidence,
    usedMeetingIds: [...new Set(citations.map((item) => item.meetingId).filter(Boolean))],
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
      appLinks: result.appLinks,
      retrievalProvider: retrieval.provider,
      retrievalStrategy: retrieval.strategy
    }
  });

  return result;
}
