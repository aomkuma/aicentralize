import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { generateWithLocalModel } from "./aiService";
import { logAiRun } from "./aiRunLogService";
import { hybridRetrieveApprovedKnowledge } from "./retrieval/hybridRetrievalService";
import { retrieveProjectAiSupplementEvidence } from "./projectAiContextService";

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

function extractActionItemTitle(snippet: string): string {
  const match = snippet.match(/\[Action item\]\s*([^|]+)/i);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  const plain = snippet.split("|")[0]?.trim();
  return plain || "Action item";
}

function normalizeMatchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isOpenWorkQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return /งานค้าง|งานที่ค้าง|มีงาน|รายการงาน|งานเปิด|งานที่ต้องทำ|ต้องทำอะไร|ติดอะไร|open task|pending task|overdue|เลยกำหนด|todo|to-do|action item/.test(q);
}

function isSelfTaskQuestion(question: string): boolean {
  return /งานของฉัน|งานผม|งานฉัน|my task|assigned to me/i.test(question);
}

function citationReferencedInAnswer(citation: Citation, answer: string): boolean {
  const answerNorm = normalizeMatchText(answer);
  if (!answerNorm) {
    return false;
  }

  if (citation.sourceType === "ACTION_ITEM") {
    const title = extractActionItemTitle(citation.snippet);
    const titleNorm = normalizeMatchText(title);
    if (titleNorm.length >= 4 && answerNorm.includes(titleNorm)) {
      return true;
    }

    const tokens = titleNorm.split(/\s+/).filter((token) => token.length >= 3);
    const hits = tokens.filter((token) => answerNorm.includes(token)).length;
    return hits >= 2 || (tokens.length === 1 && hits === 1);
  }

  const tokens = normalizeMatchText(citation.snippet)
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  const hits = tokens.filter((token) => answerNorm.includes(token)).length;
  return hits >= 2;
}

function resolveRelatedChunkIds(
  question: string,
  answer: string,
  citations: Citation[],
  aiRelatedChunkIds: string[]
): string[] {
  const ids = new Set(aiRelatedChunkIds);
  const openWork = isOpenWorkQuestion(question);
  const selfTask = isSelfTaskQuestion(question);

  for (const citation of citations) {
    if (citation.sourceType === "ACTION_ITEM" && citation.sourceRowId) {
      if (openWork || selfTask || citationReferencedInAnswer(citation, answer)) {
        ids.add(citation.chunkId);
      }
      continue;
    }

    if (citationReferencedInAnswer(citation, answer)) {
      ids.add(citation.chunkId);
    }
  }

  return [...ids];
}

function buildAppLinks(citations: Citation[], relatedChunkIds: string[]): AppLink[] {
  if (!relatedChunkIds.length) {
    return [];
  }

  const relevant = citations.filter((citation) => relatedChunkIds.includes(citation.chunkId));
  const links: AppLink[] = [];

  for (const citation of relevant) {
    if (citation.sourceType === "ACTION_ITEM" && citation.sourceRowId) {
      links.push({
        label: "Open action item",
        url: `/continuity/${citation.projectId}?tab=actions&actionItemId=${encodeURIComponent(citation.sourceRowId)}`,
        type: "action",
        sourceId: citation.sourceRowId,
        context: extractActionItemTitle(citation.snippet)
      });
      continue;
    }

    if (citation.sourceType === "PROJECT_GENERAL_NOTE") {
      links.push({
        label: "Open general notes",
        url: `/projects/${citation.projectId}/notes`,
        type: "knowledge",
        sourceId: citation.sourceRowId ?? citation.projectId,
        context: citation.snippet.replace(/\s+/g, " ").trim().slice(0, 96)
      });
      continue;
    }

    if (citation.sourceType === "PROJECT_MEMORY") {
      links.push({
        label: "Open knowledge baseline",
        url: `/projects/${citation.projectId}/knowledge`,
        type: "knowledge",
        sourceId: citation.sourceRowId ?? citation.projectId,
        context: citation.snippet.replace(/\s+/g, " ").trim().slice(0, 96) || "Project baseline"
      });
      continue;
    }

    if (citation.meetingId) {
      links.push({
        label: "Open meeting minutes",
        url: `/meetings/history/${citation.meetingId}`,
        type: "meeting",
        sourceId: citation.meetingId,
        context: citation.meetingTitle || "Meeting"
      });
    }
  }

  return uniqueByUrl(links).reduce<AppLink[]>((acc, link) => {
    if (link.type === "action" && link.sourceId) {
      if (acc.some((item) => item.type === "action" && item.sourceId === link.sourceId)) {
        return acc;
      }
    }
    acc.push(link);
    return acc;
  }, []);
}

const groundedOutputSchema = z.object({
  answer: z.string().trim().min(1),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  uncertainties: z.array(z.string().trim().min(1)).default([]),
  relatedChunkIds: z.array(z.string().trim().min(1)).default([])
});

const groundedOutputLooseSchema = z.object({
  answer: z.string().optional(),
  output: z.string().optional(),
  text: z.string().optional(),
  response: z.string().optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  uncertainties: z.array(z.string()).optional(),
  relatedChunkIds: z.array(z.string()).optional()
});

function pickAnswerText(data: z.infer<typeof groundedOutputLooseSchema>): string {
  for (const value of [data.answer, data.output, data.text, data.response]) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function parseGroundedModelOutput(raw: string) {
  const trimmed = raw.trim();
  const fallbackAnswer = "ขออภัยค่ะ รับจบตอบไม่ได้ในขณะนี้ ลองถามใหม่อีกครั้งนะคะ";

  let candidate: unknown;
  try {
    candidate = safeParseJson(trimmed);
  } catch {
    return groundedOutputSchema.parse({
      answer: trimmed || fallbackAnswer,
      confidence: "medium",
      uncertainties: [],
      relatedChunkIds: []
    });
  }

  const loose = groundedOutputLooseSchema.safeParse(candidate);
  if (!loose.success) {
    return groundedOutputSchema.parse({
      answer: trimmed || fallbackAnswer,
      confidence: "medium",
      uncertainties: [],
      relatedChunkIds: []
    });
  }

  const answer = pickAnswerText(loose.data) || fallbackAnswer;
  return groundedOutputSchema.parse({
    answer,
    confidence: loose.data.confidence ?? "medium",
    uncertainties: (loose.data.uncertainties ?? []).map((item) => item.trim()).filter(Boolean),
    relatedChunkIds: (loose.data.relatedChunkIds ?? []).map((item) => item.trim()).filter(Boolean)
  });
}

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
    "Evidence with sourceType PROJECT_GENERAL_NOTE is public project context and can answer factual questions such as leave dates, team agreements, reminders, and shared project facts.",
    "Do not require meeting-minute evidence when PROJECT_GENERAL_NOTE evidence directly answers the question.",
    "Distinguish confirmed facts from uncertainty.",
    "Never invent owners, deadlines, commitments, or decisions.",
    "If evidence is missing or conflicting, say it explicitly.",
    "Answer the exact question first. Do not turn every answer into a broad meeting summary.",
    "For narrow questions, keep the answer to 1-3 short sentences unless the user asks for more detail.",
    "If the user asks for a short answer, keep it short and avoid extra sections.",
    "Use bullets only for lists, action items, comparisons, or when the user asks for a summary.",
    "When answering about open actions, prioritize explicit action-item status from evidence over narrative text.",
    "Evidence with sourceType ACTION_ITEM from live-action-item chunks reflects current app task records, including manual tasks and completed/cancelled items.",
    "Evidence with sourceType TEAM_PULSE_AGGREGATE or COMMUNICATION_MOOD_AGGREGATE is anonymized team mood context only. Never quote raw feeling-log text or reveal who wrote a feeling log.",
    "relatedChunkIds must list chunkId values from the evidence set that directly support your answer.",
    "For greetings or small talk with no project facts, return relatedChunkIds as an empty array.",
    "When the user asks about open tasks, overdue work, or action items, you MUST include every ACTION_ITEM chunkId you used in relatedChunkIds.",
    "When your answer references multiple action items, notes, or meetings, include every supporting chunkId so the UI can link to each one.",
    "Only use chunkIds that appear in the evidence set.",
    "answer must never be empty. For greetings or small talk, reply briefly in Thai and set relatedChunkIds to [].",
    "Respond in Thai.",
    "Return ONLY JSON with this shape:",
    '{"answer":"string","confidence":"low|medium|high","uncertainties":["string"],"relatedChunkIds":["chunkId"]}',
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

function normalizeForTaskMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").trim();
}

function taskMatchesPrompt(task: string, prompt: string): boolean {
  const taskNorm = normalizeForTaskMatch(task);
  const promptNorm = normalizeForTaskMatch(prompt);

  if (!taskNorm || taskNorm.length < 4) {
    return false;
  }

  if (promptNorm.includes(taskNorm)) {
    return true;
  }

  const quotedPhrases = [...prompt.matchAll(/["'「『]([^"'」』]{3,})["'」』]/g)]
    .map((match) => normalizeForTaskMatch(match[1]));

  return quotedPhrases.some((phrase) => phrase && (taskNorm.includes(phrase) || phrase.includes(taskNorm)));
}

async function retrieveLiveProjectActionItemEvidence(input: { projectId?: string; question: string; limit: number }): Promise<UsedEvidence[]> {
  if (!input.projectId) {
    return [];
  }

  const openWorkQuestion = isOpenWorkQuestion(input.question) || isSelfTaskQuestion(input.question);

  const rows = await prisma.actionItem.findMany({
    where: {
      projectId: input.projectId,
      ...(openWorkQuestion ? { status: { notIn: ["DONE", "CANCELLED"] } } : {})
    },
    include: {
      assignee: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    },
    orderBy: openWorkQuestion
      ? [{ dueDate: "asc" }, { updatedAt: "desc" }]
      : [{ updatedAt: "desc" }],
    take: openWorkQuestion ? Math.max(input.limit, 20) : 120
  });

  return rows
    .map((item) => {
      const text = [
        item.task,
        item.detail ?? "",
        item.status,
        item.source,
        item.assignee.name,
        item.assignee.email
      ].filter(Boolean).join(" | ");
      const lexical = scoreProjectMemory(text, input.question);
      const directMatchBoost = taskMatchesPrompt(item.task, input.question) ? 0.42 : 0;
      const statusBoost = item.status === "DONE" || item.status === "CANCELLED" ? 0.04 : 0.1;
      const openWorkBoost = openWorkQuestion ? 0.22 : 0;

      return {
        chunkId: `live-action-item:${item.id}`,
        sourceType: "ACTION_ITEM",
        sourceRowId: item.id,
        projectId: item.projectId,
        meetingId: item.meetingId ?? "",
        meetingTitle: "",
        meetingDate: item.updatedAt.toISOString(),
        minuteVersionId: "",
        minuteApprovedAt: "",
        snippet: [
          `[Action item] ${item.task}`,
          `status: ${item.status}`,
          `source: ${item.source}`,
          `owner: ${item.assignee.name}`,
          item.detail ? `detail: ${item.detail}` : "",
          `due: ${item.dueDate.toISOString()}`
        ].filter(Boolean).join(" | "),
        vectorScore: 0,
        lexicalScore: lexical,
        sourceBoost: 0.14,
        recencyBoost: 0.05,
        hybridScore: lexical * 0.7 + directMatchBoost + statusBoost + openWorkBoost
      };
    })
    .filter((item) => openWorkQuestion || item.hybridScore > 0.12)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, input.limit);
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
          `[General note:${item.visibility}] ${item.title}`,
          `author: ${item.author.name}`,
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

  const [topEvidence, memoryEvidence, generalNoteEvidence, liveActionEvidence, supplementEvidence] = await Promise.all([
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
    }),
    retrieveLiveProjectActionItemEvidence({
      projectId: input.projectId,
      question: input.question,
      limit: isOpenWorkQuestion(input.question) || isSelfTaskQuestion(input.question) ? 20 : 8
    }),
    input.projectId
      ? retrieveProjectAiSupplementEvidence({
        projectId: input.projectId,
        question: input.question,
        limit: 14
      })
      : Promise.resolve([])
  ]);

  if (!topEvidence.length && !memoryEvidence.length && !generalNoteEvidence.length && !liveActionEvidence.length && !supplementEvidence.length) {
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
  usedEvidence.push(...liveActionEvidence);
  usedEvidence.push(...supplementEvidence);
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
    prompt,
    personaScope: { projectId: input.projectId }
  });

  const parsed = parseGroundedModelOutput(generated.output);
  const evidenceChunkIds = new Set(citations.map((item) => item.chunkId));
  const aiRelatedChunkIds = parsed.relatedChunkIds.filter((chunkId) => evidenceChunkIds.has(chunkId));
  const relatedChunkIds = resolveRelatedChunkIds(
    input.question,
    parsed.answer,
    citations,
    aiRelatedChunkIds
  );

  const result = {
    answer: parsed.answer,
    confidence: parsed.confidence,
    uncertainties: parsed.uncertainties,
    citations,
    appLinks: buildAppLinks(citations, relatedChunkIds),
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
