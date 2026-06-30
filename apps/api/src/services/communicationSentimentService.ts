import {
  CommunicationMoodState,
  CommunicationSentimentSourceType,
  SentimentProcessingStatus,
  type Prisma
} from "@prisma/client";
import crypto from "node:crypto";
import cron from "node-cron";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { generateWithLocalModel } from "./aiService";

const WINDOW_DAYS = 3;
const MIN_MEMBER_SAMPLES = 3;
const MAX_MESSAGES_PER_SCOPE = 80;

const PROFANITY_PATTERNS = [
  /เชี่ย/i,
  /เหี้ย/i,
  /แม่ง/i,
  /สัส/i,
  /ควย/i,
  /\bf+u+c+k/i,
  /\bs+h+i+t/i
];

const URGENT_PATTERNS = [/ด่วน/i, /เร่ง/i, /รีบ/i, /เดี๋ยวนี้/i, /\basap\b/i, /urgent/i];
const STRESS_PATTERNS = [/เหนื่อย/i, /ล้า/i, /ท้อ/i, /เครียด/i, /กดดัน/i, /burnout/i, /หงุดหงิด/i];
const FRICTION_PATTERNS = [/ทำไม/i, /อีกแล้ว/i, /ช้า/i, /ไม่เข้าใจ/i, /งง/i, /ติด/i, /blocked/i];

type SentimentMessage = {
  id: string;
  userId: string;
  text: string;
  createdAt: Date;
  sourceType: CommunicationSentimentSourceType;
};

export type SentimentAnalysisResult = {
  sampleCount: number;
  moodScore: number;
  stressScore: number;
  frictionScore: number;
  urgencyScore: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  themes: string[];
  signals: string[];
  caveats: string[];
  suggestions: string[];
  moodState: CommunicationMoodState;
  model?: string;
};

function clampScore(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function signedClamp(value: number) {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

function isAfterHours(date: Date) {
  const hour = date.getHours();
  return hour >= 22 || hour < 6;
}

function countPatternMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function extractJsonCandidate(raw: string): string | null {
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return stripped.slice(firstBrace, lastBrace + 1);
}

function deriveMoodState(
  sampleCount: number,
  moodScore: number,
  stressScore: number,
  frictionScore: number,
  urgencyScore: number
): CommunicationMoodState {
  if (sampleCount < MIN_MEMBER_SAMPLES) {
    return CommunicationMoodState.INSUFFICIENT_DATA;
  }
  if (moodScore <= -40 || stressScore >= 75 || urgencyScore >= 75) {
    return CommunicationMoodState.HIGH_PRESSURE;
  }
  if (moodScore <= -15 || frictionScore >= 55 || stressScore >= 55) {
    return CommunicationMoodState.NEEDS_ATTENTION;
  }
  return CommunicationMoodState.CALM;
}

export function analyzeMessagesHeuristically(messages: SentimentMessage[]): SentimentAnalysisResult {
  if (messages.length === 0) {
    return {
      sampleCount: 0,
      moodScore: 0,
      stressScore: 0,
      frictionScore: 0,
      urgencyScore: 0,
      confidence: "LOW",
      summary: "ยังไม่มีข้อความในช่วงเวลานี้สำหรับประเมินแนวโน้มการสื่อสาร",
      themes: [],
      signals: [],
      caveats: [
        "นี่เป็นการประเมินจากข้อความในระบบเท่านั้น ไม่ใช่การวินิจฉัยอารมณ์หรือสุขภาพจิตของบุคคล"
      ],
      suggestions: ["ลองเช็กอินกับทีมอย่างอ่อนโยนเมื่อมีข้อมูลมากขึ้น"],
      moodState: CommunicationMoodState.INSUFFICIENT_DATA
    };
  }

  let moodScore = 0;
  let stressScore = 10;
  let frictionScore = 10;
  let urgencyScore = 10;
  const signals: string[] = [];
  let questionCount = 0;
  let politeCount = 0;
  let afterHoursCount = 0;
  let profanityCount = 0;

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) {
      continue;
    }

    if (text.includes("?") || text.includes("？")) {
      questionCount += 1;
    }
    if (/(ครับ|ค่ะ|คะ|ขอบคุณ|ขอโทษ)/i.test(text)) {
      politeCount += 1;
    }
    if (isAfterHours(message.createdAt)) {
      afterHoursCount += 1;
      urgencyScore += 4;
    }

    const profanityHits = countPatternMatches(text, PROFANITY_PATTERNS);
    if (profanityHits > 0) {
      profanityCount += profanityHits;
      moodScore -= 12 * profanityHits;
      frictionScore += 10 * profanityHits;
      stressScore += 8 * profanityHits;
    }

    const urgentHits = countPatternMatches(text, URGENT_PATTERNS);
    if (urgentHits > 0) {
      urgencyScore += 8 * urgentHits;
      moodScore -= 3 * urgentHits;
    }

    const stressHits = countPatternMatches(text, STRESS_PATTERNS);
    if (stressHits > 0) {
      stressScore += 10 * stressHits;
      moodScore -= 6 * stressHits;
    }

    const frictionHits = countPatternMatches(text, FRICTION_PATTERNS);
    if (frictionHits > 0) {
      frictionScore += 7 * frictionHits;
      moodScore -= 4 * frictionHits;
    }

    if (text.length <= 12 && !/(ครับ|ค่ะ|ขอบคุณ)/i.test(text)) {
      frictionScore += 2;
    }
  }

  const sampleCount = messages.length;
  const questionRatio = questionCount / sampleCount;
  if (questionRatio >= 0.35) {
    frictionScore += 12;
    signals.push("มีคำถามถี่ในช่วงเวลานี้ อาจสะท้อนความไม่ชัดเจนหรือการตามงาน");
  }

  const politeRatio = politeCount / sampleCount;
  if (politeRatio >= 0.45) {
    moodScore += 8;
    signals.push("ยังมีรูปแบบภาษาสุภาพปรากฏอยู่บ่อยในช่วงนี้");
  }

  if (afterHoursCount >= Math.max(2, Math.ceil(sampleCount * 0.2))) {
    urgencyScore += 10;
    signals.push("มีข้อความนอกเวลาทำงานหรือช่วงดึกมากขึ้น");
  }

  if (profanityCount > 0) {
    signals.push("พบคำหยาบหรือภาษาแรงในช่วงเวลานี้ ควรอ่านบริบทก่อนตีความ");
  }

  moodScore = signedClamp(moodScore);
  stressScore = clampScore(stressScore);
  frictionScore = clampScore(frictionScore);
  urgencyScore = clampScore(urgencyScore);

  const confidence = sampleCount >= 12 ? "HIGH" : sampleCount >= MIN_MEMBER_SAMPLES ? "MEDIUM" : "LOW";
  const moodState = deriveMoodState(sampleCount, moodScore, stressScore, frictionScore, urgencyScore);

  const summaryByState: Record<CommunicationMoodState, string> = {
    [CommunicationMoodState.CALM]: "แนวโน้มการสื่อสารในช่วง 3 วันที่ผ่านมาดูค่อนข้างสงบ ยังไม่พบสัญญาณกดดันชัดเจน",
    [CommunicationMoodState.NEEDS_ATTENTION]: "ข้อความช่วงนี้อาจสะท้อนความเร่งรีบหรือแรงเสียดทานมากขึ้น ควรเช็กอินกับทีมอย่างอ่อนโยน",
    [CommunicationMoodState.HIGH_PRESSURE]: "สัญญาณการสื่อสารช่วงนี้อาจอยู่ภายใต้แรงกดดันสูง แนะนำให้ PM/หัวหน้างานช่วยจัดลำดับความสำคัญและรับฟัง",
    [CommunicationMoodState.INSUFFICIENT_DATA]: "ข้อมูลข้อความในช่วง 3 วันยังน้อยเกินไปสำหรับสรุปแนวโน้มที่มั่นใจ"
  };

  return {
    sampleCount,
    moodScore,
    stressScore,
    frictionScore,
    urgencyScore,
    confidence,
    summary: summaryByState[moodState],
    themes: moodState === CommunicationMoodState.CALM ? ["communication-stable"] : ["communication-pressure"],
    signals,
    caveats: [
      "นี่เป็นการประเมินแนวโน้มจากข้อความในระบบเท่านั้น ไม่ใช่การวินิจฉัยอารมณ์หรือสุขภาพจิตของบุคคล",
      "ข้อความเดียวอาจไม่สะท้อนความรู้สึกจริง ควรใช้เป็นจุดเริ่มสนทนา ไม่ใช่การตัดสิน"
    ],
    suggestions: moodState === CommunicationMoodState.HIGH_PRESSURE
      ? ["ช่วยจัดลำดับงานที่เร่งด่วนจริง", "ถามแบบเปิดว่ามีอะไรติดขัดหรือต้องการความช่วยเหลือ", "ลดการสื่อสารนอกเวลาหากเป็นไปได้"]
      : moodState === CommunicationMoodState.NEEDS_ATTENTION
        ? ["เช็กอินสั้นๆ ว่ามีงานหรือข้อมูลใดยังไม่ชัด", "ยืนยันความคาดหวังและเจ้าของงานให้ชัดขึ้น"]
        : ["สังเกตต่อเนื่องและใช้การสนทนาเมื่อเห็นสัญญาณเปลี่ยน"],
    moodState
  };
}

function buildAiPrompt(messages: SentimentMessage[], heuristic: SentimentAnalysisResult) {
  const payload = messages.slice(-MAX_MESSAGES_PER_SCOPE).map((message) => ({
    at: message.createdAt.toISOString(),
    text: message.text.slice(0, 500)
  }));

  return [
    "You are a compassionate workplace communication analyst.",
    "Analyze ONLY the communication tone trend from the messages below.",
    "Do NOT diagnose mental health, personality, or blame anyone.",
    "Respond in Thai for summary, themes, signals, caveats, and suggestions.",
    "Return ONLY valid JSON with this schema:",
    "{",
    '  "summary": "string",',
    '  "moodScore": -100 to 100,',
    '  "stressScore": 0 to 100,',
    '  "frictionScore": 0 to 100,',
    '  "urgencyScore": 0 to 100,',
    '  "confidence": "LOW|MEDIUM|HIGH",',
    '  "themes": ["string"],',
    '  "signals": ["string"],',
    '  "caveats": ["string"],',
    '  "suggestions": ["string"]',
    "}",
    "Use tentative, supportive language. Mention Thai phrasing patterns when relevant.",
    "Heuristic baseline:",
    JSON.stringify(heuristic, null, 2),
    "Messages:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

async function refineWithAi(
  messages: SentimentMessage[],
  heuristic: SentimentAnalysisResult
): Promise<SentimentAnalysisResult> {
  if (messages.length < MIN_MEMBER_SAMPLES) {
    return heuristic;
  }

  try {
    const result = await generateWithLocalModel({
      prompt: buildAiPrompt(messages, heuristic)
    });

    const candidate = extractJsonCandidate(result.output);
    if (!candidate) {
      return { ...heuristic, model: result.model };
    }

    const parsed = JSON.parse(candidate) as {
      summary?: unknown;
      moodScore?: unknown;
      stressScore?: unknown;
      frictionScore?: unknown;
      urgencyScore?: unknown;
      confidence?: unknown;
      themes?: unknown;
      signals?: unknown;
      caveats?: unknown;
      suggestions?: unknown;
    };

    const moodScore = typeof parsed.moodScore === "number" ? signedClamp(parsed.moodScore) : heuristic.moodScore;
    const stressScore = typeof parsed.stressScore === "number" ? clampScore(parsed.stressScore) : heuristic.stressScore;
    const frictionScore = typeof parsed.frictionScore === "number" ? clampScore(parsed.frictionScore) : heuristic.frictionScore;
    const urgencyScore = typeof parsed.urgencyScore === "number" ? clampScore(parsed.urgencyScore) : heuristic.urgencyScore;
    const confidenceRaw = typeof parsed.confidence === "string" ? parsed.confidence.toUpperCase() : heuristic.confidence;
    const confidence = ["LOW", "MEDIUM", "HIGH"].includes(confidenceRaw) ? confidenceRaw as "LOW" | "MEDIUM" | "HIGH" : heuristic.confidence;

    const moodState = deriveMoodState(messages.length, moodScore, stressScore, frictionScore, urgencyScore);

    return {
      sampleCount: messages.length,
      moodScore,
      stressScore,
      frictionScore,
      urgencyScore,
      confidence,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : heuristic.summary,
      themes: Array.isArray(parsed.themes) ? parsed.themes.filter((item): item is string => typeof item === "string").slice(0, 6) : heuristic.themes,
      signals: Array.isArray(parsed.signals) ? parsed.signals.filter((item): item is string => typeof item === "string").slice(0, 8) : heuristic.signals,
      caveats: Array.isArray(parsed.caveats) ? parsed.caveats.filter((item): item is string => typeof item === "string").slice(0, 6) : heuristic.caveats,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item): item is string => typeof item === "string").slice(0, 6) : heuristic.suggestions,
      moodState,
      model: result.model
    };
  } catch {
    return heuristic;
  }
}

async function collectTenantMessages(
  tenantId: string,
  windowStart: Date,
  windowEnd: Date,
  memberUserId?: string
): Promise<SentimentMessage[]> {
  const logs = await prisma.askAiQueryLog.findMany({
    where: {
      createdAt: {
        gte: windowStart,
        lte: windowEnd
      },
      ...(memberUserId ? { userId: memberUserId } : {}),
      OR: [
        {
          project: {
            tenantId
          }
        },
        {
          projectId: null,
          user: {
            tenantMemberships: {
              some: {
                tenantId,
                isActive: true
              }
            }
          }
        }
      ]
    },
    orderBy: { createdAt: "asc" },
    take: MAX_MESSAGES_PER_SCOPE,
    select: {
      id: true,
      userId: true,
      question: true,
      createdAt: true
    }
  });

  return logs.map((log) => ({
    id: log.id,
    userId: log.userId,
    text: log.question,
    createdAt: log.createdAt,
    sourceType: CommunicationSentimentSourceType.ASK_AI_QUERY
  }));
}

async function persistSnapshot(input: {
  tenantId: string;
  memberUserId?: string;
  windowStart: Date;
  windowEnd: Date;
  batchId: string;
  messages: SentimentMessage[];
  analysis: SentimentAnalysisResult;
}) {
  const snapshot = await prisma.communicationSentimentSnapshot.create({
    data: {
      tenantId: input.tenantId,
      memberUserId: input.memberUserId ?? null,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      sampleCount: input.analysis.sampleCount,
      moodScore: input.analysis.moodScore,
      stressScore: input.analysis.stressScore,
      frictionScore: input.analysis.frictionScore,
      urgencyScore: input.analysis.urgencyScore,
      confidence: input.analysis.confidence,
      summary: input.analysis.summary,
      themesJson: input.analysis.themes,
      signalsJson: input.analysis.signals,
      caveatsJson: input.analysis.caveats,
      suggestionsJson: input.analysis.suggestions,
      moodState: input.analysis.moodState,
      batchId: input.batchId,
      model: input.analysis.model ?? null,
      sources: {
        create: input.messages.map((message) => ({
          sourceType: message.sourceType,
          sourceId: message.id,
          messageCreatedAt: message.createdAt
        }))
      }
    }
  });

  if (input.messages.length > 0) {
    await prisma.askAiQueryLog.updateMany({
      where: {
        id: { in: input.messages.map((message) => message.id) }
      },
      data: {
        sentimentProcessedAt: new Date(),
        sentimentBatchId: input.batchId,
        sentimentWindowStart: input.windowStart,
        sentimentWindowEnd: input.windowEnd,
        sentimentProcessingStatus: SentimentProcessingStatus.PROCESSED
      }
    });
  }

  return snapshot;
}

async function analyzeScope(input: {
  tenantId: string;
  memberUserId?: string;
  windowStart: Date;
  windowEnd: Date;
  batchId: string;
}) {
  const messages = await collectTenantMessages(
    input.tenantId,
    input.windowStart,
    input.windowEnd,
    input.memberUserId
  );

  const heuristic = analyzeMessagesHeuristically(messages);
  const analysis = await refineWithAi(messages, heuristic);

  return persistSnapshot({
    tenantId: input.tenantId,
    memberUserId: input.memberUserId,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    batchId: input.batchId,
    messages,
    analysis
  });
}

export async function runCommunicationSentimentBatchForTenant(tenantId: string) {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const batchId = `sentiment-${tenantId}-${crypto.randomUUID()}`;

  const members = await prisma.tenantMembership.findMany({
    where: {
      tenantId,
      isActive: true,
      tenant: { isActive: true }
    },
    select: { userId: true }
  });

  const tenantMessages = await collectTenantMessages(tenantId, windowStart, windowEnd);
  const memberIdsWithMessages = new Set(tenantMessages.map((message) => message.userId));

  const snapshots = [];

  snapshots.push(await analyzeScope({
    tenantId,
    windowStart,
    windowEnd,
    batchId
  }));

  for (const member of members) {
    if (!memberIdsWithMessages.has(member.userId)) {
      continue;
    }

    snapshots.push(await analyzeScope({
      tenantId,
      memberUserId: member.userId,
      windowStart,
      windowEnd,
      batchId
    }));
  }

  return {
    batchId,
    windowStart,
    windowEnd,
    snapshotCount: snapshots.length
  };
}

export async function runCommunicationSentimentBatchForAllTenants() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true }
  });

  const results = [];
  for (const tenant of tenants) {
    try {
      const result = await runCommunicationSentimentBatchForTenant(tenant.id);
      results.push({ tenantId: tenant.id, tenantName: tenant.name, ...result, status: "SUCCESS" as const });
    } catch (error) {
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        status: "FAILED" as const,
        error: error instanceof Error ? error.message : "unknown error"
      });
    }
  }

  return results;
}

export async function getLatestMemberSnapshots(tenantId: string) {
  const members = await prisma.tenantMembership.findMany({
    where: {
      tenantId,
      isActive: true
    },
    select: {
      userId: true,
      user: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  const snapshots = await Promise.all(members.map(async (member) => {
    const snapshot = await prisma.communicationSentimentSnapshot.findFirst({
      where: {
        tenantId,
        memberUserId: member.userId
      },
      orderBy: { createdAt: "desc" }
    });

    return snapshot
      ? {
          userId: member.userId,
          userName: member.user?.name ?? "",
          snapshot: serializeSnapshot(snapshot)
        }
      : null;
  }));

  return snapshots.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function serializeSnapshot(snapshot: {
  id: string;
  tenantId: string;
  memberUserId: string | null;
  windowStart: Date;
  windowEnd: Date;
  sampleCount: number;
  moodScore: number;
  stressScore: number;
  frictionScore: number;
  urgencyScore: number;
  confidence: string;
  summary: string;
  themesJson: Prisma.JsonValue;
  signalsJson: Prisma.JsonValue;
  caveatsJson: Prisma.JsonValue;
  suggestionsJson: Prisma.JsonValue;
  moodState: CommunicationMoodState;
  batchId: string;
  model: string | null;
  createdAt: Date;
}) {
  return {
    id: snapshot.id,
    tenantId: snapshot.tenantId,
    memberUserId: snapshot.memberUserId,
    windowStart: snapshot.windowStart.toISOString(),
    windowEnd: snapshot.windowEnd.toISOString(),
    sampleCount: snapshot.sampleCount,
    moodScore: snapshot.moodScore,
    stressScore: snapshot.stressScore,
    frictionScore: snapshot.frictionScore,
    urgencyScore: snapshot.urgencyScore,
    confidence: snapshot.confidence,
    summary: snapshot.summary,
    themes: Array.isArray(snapshot.themesJson) ? snapshot.themesJson : [],
    signals: Array.isArray(snapshot.signalsJson) ? snapshot.signalsJson : [],
    caveats: Array.isArray(snapshot.caveatsJson) ? snapshot.caveatsJson : [],
    suggestions: Array.isArray(snapshot.suggestionsJson) ? snapshot.suggestionsJson : [],
    moodState: snapshot.moodState,
    batchId: snapshot.batchId,
    createdAt: snapshot.createdAt.toISOString()
  };
}

export async function getLatestTenantSnapshot(tenantId: string, memberUserId?: string) {
  const snapshot = await prisma.communicationSentimentSnapshot.findFirst({
    where: {
      tenantId,
      memberUserId: memberUserId ?? null
    },
    orderBy: { createdAt: "desc" }
  });

  return snapshot ? serializeSnapshot(snapshot) : null;
}

export function startCommunicationSentimentScheduler() {
  cron.schedule(env.sentimentCron, async () => {
    try {
      const results = await runCommunicationSentimentBatchForAllTenants();
      console.log(`[SENTIMENT] Batch completed for ${results.length} tenant(s)`);
    } catch (error) {
      console.error("[SENTIMENT] Scheduler failed", error);
    }
  });

  console.log(`[SENTIMENT] Scheduler started with cron ${env.sentimentCron}`);
}
