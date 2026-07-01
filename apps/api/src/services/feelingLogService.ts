import {
  AiRunOperation,
  AiRunStatus,
  FeelingLogAnalysisAudience,
  type Prisma,
  TenantRole
} from "@prisma/client";
import cron from "node-cron";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { generateWithLocalModel } from "./aiService";
import { logAiRun } from "./aiRunLogService";
import { ensureTenantMembership, ensureTenantRole, isPlatformAdmin, type TenantAuthUser } from "./tenantAccessService";

const PROMPT_VERSION = "feeling-log-batch-v2";
const ANALYSIS_LOOKBACK_DAYS = 30;
const BATCH_INTERVAL_MS = env.feelingLogBatchIntervalDays * 24 * 60 * 60 * 1000;

type TenantMember = {
  id: string;
  name: string;
  email: string;
};

type FeelingLogAnalysisResult = {
  personalTitle: string;
  personalSummary: string;
  interpretation: string;
  executiveSummary: string;
  mentionSummary: string;
  recommendation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
};

type FeelingLogCreateInput = {
  tenantId: string;
  authorId: string;
  content: string;
  emoji?: string | null;
  mentionedUserIds?: string[];
  user: TenantAuthUser;
};

type PendingLog = Prisma.FeelingLogGetPayload<{
  include: {
    mentions: {
      include: {
        mentionedUser: {
          select: { id: true; name: true; email: true };
        };
      };
    };
    author: {
      select: { id: true; name: true };
    };
  };
}>;

const pendingLogInclude = {
  mentions: {
    include: {
      mentionedUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  },
  author: {
    select: {
      id: true,
      name: true
    }
  }
} satisfies Prisma.FeelingLogInclude;

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

function normalizeMentions(mentions?: string[]) {
  return Array.from(new Set((mentions ?? []).map((mention) => mention.trim()).filter(Boolean)));
}

function safePreview(content: string, maxLength = 260) {
  return content.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function privacySafeInsightText(value: string, fallback: string) {
  const cleaned = value
    .replace(/สารตั้งต้นจากบันทึก\s*[:：].*/gis, "")
    .replace(/(?:ข้อความ|บันทึก|entry|raw text|source text)(?:ต้นฉบับ|ดิบ)?\s*[:：].*/gis, "")
    .replace(/["“”'‘’][^"“”'‘’]{18,}["“”'‘’]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned || fallback;
}

function serializeEntries(logs: PendingLog[]) {
  return logs.map((log) => ({
    createdAt: log.createdAt.toISOString(),
    emoji: log.emoji,
    content: log.content,
    mentions: log.mentions.map((mention) => mention.mentionLabel)
  }));
}

function buildHeuristicAnalysis(input: {
  entries: Array<{ content: string; emoji?: string | null; mentions: string[] }>;
  mentionNames: string[];
  mode: "author" | "mention" | "leadership";
}): FeelingLogAnalysisResult {
  const combined = input.entries.map((entry) => entry.content).join("\n");
  const preview = safePreview(combined, 240);
  const hasStress = /เครียด|เหนื่อย|กดดัน|ไม่ไหว|ท้อ|เบื่อ|frustrat|stress|anxious/i.test(combined);
  const hasConflict = /โกรธ|หงุดหงิด|ไม่โอเค|ทะเลาะ|ผิดหวัง|upset|annoy/i.test(combined);
  const riskLevel = hasConflict || hasStress ? "MEDIUM" : "LOW";

  return {
    personalTitle: input.entries.length > 1 ? `สรุปรอบ ${input.entries.length} บันทึก` : "สะท้อนจากบันทึก",
    personalSummary: hasStress
      ? "ช่วงนี้มีสัญญาณความตึงเครียดหรือความล้าในหลายบันทึก ควรแยกประเด็นหนักและเบาอย่างเป็นลำดับ"
      : "ช่วงนี้มีบันทึกที่ใช้ทำความเข้าใจแนวโน้มความรู้สึกได้ ยังไม่พบสัญญาณรุนแรงชัดเจน",
    interpretation: [
      `สรุปจาก ${input.entries.length} บันทึก: ${preview || "ไม่มีข้อความชัดเจน"}.`,
      input.mentionNames.length > 0
        ? `มีการ mention ถึง: ${input.mentionNames.join(", ")}`
        : "ไม่มี mention ที่ระบุบุคคล"
    ].join(" "),
    executiveSummary: input.mode === "leadership"
      ? "มีบันทึกส่วนตัวหลายรายการในช่วงนี้ ควรติดตามเชิงสนับสนุนโดยไม่เปิดเผยตัวตนผู้เขียน"
      : input.mentionNames.length > 0
        ? "มีบันทึกที่สะท้อนประเด็นเกี่ยวกับเพื่อนร่วมงาน ควรติดตามอย่างระมัดระวัง"
        : "มีบันทึกส่วนตัวที่สะท้อนสภาวะทีม ควรดูแนวโน้มต่อเนื่อง",
    mentionSummary: input.mentionNames.length > 0
      ? `ประเด็น mention ที่เกี่ยวข้อง: ${input.mentionNames.join(", ")}`
      : "ไม่มี mention target",
    recommendation: hasStress
      ? "ควรเช็กอินแบบอ่อนโยนและถามว่าต้องการความช่วยเหลือด้านใด"
      : "เก็บเป็นข้อมูลต่อเนื่องและดูแพทเทิร์นในรอบถัดไป",
    riskLevel
  };
}

function buildBatchAiPrompt(input: {
  mode: "author" | "mention" | "leadership";
  entries: ReturnType<typeof serializeEntries>;
  mentionNames: string[];
  mentionedPersonName?: string;
  heuristic: FeelingLogAnalysisResult;
}) {
  const modeLabel = input.mode === "author"
    ? "personal journal batch for one recorder"
    : input.mode === "mention"
      ? `mention-target batch for ${input.mentionedPersonName ?? "a teammate"}`
      : "leadership summary batch without author identity";

  return [
    "You are Rubjob, a supportive workplace-aware reflection assistant.",
    `Analyze a ${modeLabel} as a privacy-preserving workplace psychologist.`,
    "Do NOT diagnose mental health, personality, intent, or relationships.",
    "Do NOT write harsh, shaming, or emotionally escalated wording.",
    "Keep the response factual, cautious, and supportive.",
    "Never quote, copy, or closely paraphrase any original entry text.",
    "Never output a field or sentence like 'สารตั้งต้นจากบันทึก', 'ข้อความต้นฉบับ', 'raw text', or 'source text'.",
    "Summarize only higher-level patterns, possible needs, risk signals, and constructive observations.",
    "Protect privacy: preserve the original writer's privacy and avoid details that could identify the writer.",
    "Do not make any teammate look bad. Describe behavior or team dynamics neutrally, without blame, while still reflecting the real signal.",
    "Use careful psychological-observation wording such as 'อาจสะท้อน', 'มีสัญญาณว่า', 'ควรติดตาม', and avoid certainty when evidence is limited.",
    input.mode === "leadership" || input.mode === "mention"
      ? "Never mention or infer the author identity."
      : "This is only for the recorder's private reflection.",
    "Return ONLY valid JSON with this schema:",
    "{",
    '  "personalTitle": "string",',
    '  "personalSummary": "string",',
    '  "interpretation": "string",',
    '  "executiveSummary": "string",',
    '  "mentionSummary": "string",',
    '  "recommendation": "string",',
    '  "riskLevel": "LOW|MEDIUM|HIGH"',
    "}",
    "Use Thai for all text fields.",
    "Heuristic baseline:",
    JSON.stringify(input.heuristic, null, 2),
    "Batch entries:",
    JSON.stringify(input.entries, null, 2)
  ].join("\n");
}

async function analyzeBatchWithAi(input: {
  tenantId: string;
  mode: "author" | "mention" | "leadership";
  logs: PendingLog[];
  mentionNames: string[];
  mentionedPersonName?: string;
}): Promise<{ analysis: FeelingLogAnalysisResult; model?: string }> {
  const entries = serializeEntries(input.logs);
  const heuristic = buildHeuristicAnalysis({
    entries,
    mentionNames: input.mentionNames,
    mode: input.mode
  });

  try {
    const result = await generateWithLocalModel({
      prompt: buildBatchAiPrompt({
        mode: input.mode,
        entries,
        mentionNames: input.mentionNames,
        mentionedPersonName: input.mentionedPersonName,
        heuristic
      }),
      personaScope: { tenantId: input.tenantId }
    });

    const candidate = extractJsonCandidate(result.output);
    if (!candidate) {
      return { analysis: heuristic, model: result.model };
    }

    const parsed = JSON.parse(candidate) as Partial<FeelingLogAnalysisResult>;
    const riskLevel = parsed.riskLevel === "HIGH" || parsed.riskLevel === "MEDIUM" || parsed.riskLevel === "LOW"
      ? parsed.riskLevel
      : heuristic.riskLevel;

    return {
      analysis: {
        personalTitle: typeof parsed.personalTitle === "string" && parsed.personalTitle.trim() ? privacySafeInsightText(parsed.personalTitle.trim(), heuristic.personalTitle) : heuristic.personalTitle,
        personalSummary: typeof parsed.personalSummary === "string" && parsed.personalSummary.trim() ? privacySafeInsightText(parsed.personalSummary.trim(), heuristic.personalSummary) : heuristic.personalSummary,
        interpretation: typeof parsed.interpretation === "string" && parsed.interpretation.trim() ? privacySafeInsightText(parsed.interpretation.trim(), heuristic.interpretation) : heuristic.interpretation,
        executiveSummary: typeof parsed.executiveSummary === "string" && parsed.executiveSummary.trim() ? privacySafeInsightText(parsed.executiveSummary.trim(), heuristic.executiveSummary) : heuristic.executiveSummary,
        mentionSummary: typeof parsed.mentionSummary === "string" && parsed.mentionSummary.trim() ? privacySafeInsightText(parsed.mentionSummary.trim(), heuristic.mentionSummary) : heuristic.mentionSummary,
        recommendation: typeof parsed.recommendation === "string" && parsed.recommendation.trim() ? privacySafeInsightText(parsed.recommendation.trim(), heuristic.recommendation) : heuristic.recommendation,
        riskLevel
      },
      model: result.model
    };
  } catch {
    return { analysis: heuristic };
  }
}

async function validateMentionedMembers(tenantId: string, mentionedUserIds: string[]) {
  if (mentionedUserIds.length === 0) {
    return [];
  }

  const members = await prisma.user.findMany({
    where: {
      id: { in: mentionedUserIds },
      tenantMemberships: {
        some: {
          tenantId,
          isActive: true,
          tenant: { isActive: true }
        }
      }
    },
    select: { id: true, name: true, email: true }
  });

  const byId = new Map(members.map((member) => [member.id, member]));
  return mentionedUserIds
    .map((id) => byId.get(id))
    .filter((member): member is TenantMember => Boolean(member));
}

async function createAnalysisRecords(input: {
  feelingLogIds: string[];
  audience: FeelingLogAnalysisAudience;
  targetUserId?: string | null;
  analysis: FeelingLogAnalysisResult;
  model?: string;
  titleOverride?: string;
  summaryOverride?: string;
}) {
  const title = input.titleOverride
    ?? (input.audience === FeelingLogAnalysisAudience.LEADERSHIP
      ? "สรุปบันทึกความรู้สึกสำหรับหัวหน้าทีม"
      : input.audience === FeelingLogAnalysisAudience.MENTION_TARGET
        ? "บริบท mention จากบันทึกส่วนตัว"
        : input.analysis.personalTitle);

  const summary = input.summaryOverride
    ?? (input.audience === FeelingLogAnalysisAudience.LEADERSHIP
      ? input.analysis.executiveSummary
      : input.audience === FeelingLogAnalysisAudience.MENTION_TARGET
        ? input.analysis.mentionSummary
        : input.analysis.personalSummary);
  const shouldProtectSourceText = input.audience !== FeelingLogAnalysisAudience.PERSONAL;
  const safeSummary = shouldProtectSourceText
    ? privacySafeInsightText(summary, "มีสัญญาณจากบันทึกส่วนตัวที่ควรติดตามอย่างระมัดระวัง โดยไม่เปิดเผยข้อความต้นฉบับ")
    : summary;
  const safeInterpretation = shouldProtectSourceText
    ? privacySafeInsightText(input.analysis.interpretation, "ควรดูแนวโน้มต่อเนื่องในรอบถัดไป และตีความอย่างระมัดระวังโดยไม่ระบุตัวผู้เขียน")
    : input.analysis.interpretation;
  const safeRecommendation = shouldProtectSourceText
    ? privacySafeInsightText(input.analysis.recommendation, "ติดตามด้วยท่าทีสนับสนุน เปิดพื้นที่รับฟัง และหลีกเลี่ยงการระบุตัวบุคคล")
    : input.analysis.recommendation;

  const rows = input.feelingLogIds.map((feelingLogId) => ({
    feelingLogId,
    audience: input.audience,
    targetUserId: input.targetUserId ?? null,
    title,
    summary: safeSummary,
    interpretation: safeInterpretation,
    recommendation: safeRecommendation,
    riskLevel: input.analysis.riskLevel,
    model: input.model ?? null,
    promptVersion: PROMPT_VERSION
  }));

  if (rows.length === 0) {
    return;
  }

  await prisma.feelingLogAnalysis.createMany({ data: rows });
}

async function listPendingLogs() {
  return prisma.feelingLog.findMany({
    where: { processedAt: null },
    orderBy: { createdAt: "asc" },
    include: pendingLogInclude
  });
}

async function getLastBatchRunAt() {
  const row = await prisma.aiRunLog.findFirst({
    where: {
      operation: AiRunOperation.FEELING_LOG_ANALYSIS,
      status: AiRunStatus.SUCCESS
    },
    orderBy: { createdAt: "desc" }
  });

  const trace = row?.traceJson as { batchRun?: boolean } | null | undefined;
  if (!trace?.batchRun) {
    return null;
  }

  return row?.createdAt ?? null;
}

export async function shouldRunFeelingLogBatch(now = new Date()) {
  const pendingCount = await prisma.feelingLog.count({ where: { processedAt: null } });
  if (pendingCount === 0) {
    return false;
  }

  const lastRunAt = await getLastBatchRunAt();
  if (!lastRunAt) {
    return true;
  }

  return now.getTime() - lastRunAt.getTime() >= BATCH_INTERVAL_MS;
}

export async function processPendingFeelingLogsBatch(options?: { force?: boolean; now?: Date }) {
  const startedAt = Date.now();
  const now = options?.now ?? new Date();
  const pendingLogs = await listPendingLogs();

  if (pendingLogs.length === 0) {
    return {
      skipped: true,
      reason: "NO_PENDING_LOGS",
      processedLogs: 0,
      tenants: 0,
      authorGroups: 0,
      mentionGroups: 0
    };
  }

  if (!options?.force && !(await shouldRunFeelingLogBatch(now))) {
    const lastRunAt = await getLastBatchRunAt();
    return {
      skipped: true,
      reason: "INTERVAL_NOT_REACHED",
      pendingLogs: pendingLogs.length,
      nextEligibleAt: lastRunAt
        ? new Date(lastRunAt.getTime() + BATCH_INTERVAL_MS).toISOString()
        : null
    };
  }

  const logsByTenant = new Map<string, PendingLog[]>();
  for (const log of pendingLogs) {
    const bucket = logsByTenant.get(log.tenantId) ?? [];
    bucket.push(log);
    logsByTenant.set(log.tenantId, bucket);
  }

  let authorGroups = 0;
  let mentionGroups = 0;
  let modelsUsed: string[] = [];

  for (const [tenantId, tenantLogs] of logsByTenant) {
    const logsByAuthor = new Map<string, PendingLog[]>();
    for (const log of tenantLogs) {
      const bucket = logsByAuthor.get(log.authorId) ?? [];
      bucket.push(log);
      logsByAuthor.set(log.authorId, bucket);
    }

    for (const authorLogs of logsByAuthor.values()) {
      authorGroups += 1;
      const mentionNames = Array.from(new Set(
        authorLogs.flatMap((log) => log.mentions.map((mention) => mention.mentionLabel))
      ));
      const outcome = await analyzeBatchWithAi({
        tenantId,
        mode: "author",
        logs: authorLogs,
        mentionNames
      });
      if (outcome.model) {
        modelsUsed.push(outcome.model);
      }
      await createAnalysisRecords({
        feelingLogIds: authorLogs.map((log) => log.id),
        audience: FeelingLogAnalysisAudience.PERSONAL,
        analysis: outcome.analysis,
        model: outcome.model
      });
    }

    const logsByMention = new Map<string, { target: TenantMember; logs: PendingLog[] }>();
    for (const log of tenantLogs) {
      for (const mention of log.mentions) {
        const existing = logsByMention.get(mention.mentionedUserId);
        if (existing) {
          if (!existing.logs.some((item) => item.id === log.id)) {
            existing.logs.push(log);
          }
        } else {
          logsByMention.set(mention.mentionedUserId, {
            target: mention.mentionedUser,
            logs: [log]
          });
        }
      }
    }

    for (const { target, logs } of logsByMention.values()) {
      mentionGroups += 1;
      const outcome = await analyzeBatchWithAi({
        tenantId,
        mode: "mention",
        logs,
        mentionNames: [target.name],
        mentionedPersonName: target.name
      });
      if (outcome.model) {
        modelsUsed.push(outcome.model);
      }
      await createAnalysisRecords({
        feelingLogIds: logs.map((log) => log.id),
        audience: FeelingLogAnalysisAudience.MENTION_TARGET,
        targetUserId: target.id,
        analysis: outcome.analysis,
        model: outcome.model
      });
    }

    const leadershipMentionNames = Array.from(new Set(
      tenantLogs.flatMap((log) => log.mentions.map((mention) => mention.mentionLabel))
    ));
    const leadershipOutcome = await analyzeBatchWithAi({
      tenantId,
      mode: "leadership",
      logs: tenantLogs,
      mentionNames: leadershipMentionNames
    });
    if (leadershipOutcome.model) {
      modelsUsed.push(leadershipOutcome.model);
    }
    await createAnalysisRecords({
      feelingLogIds: tenantLogs.map((log) => log.id),
      audience: FeelingLogAnalysisAudience.LEADERSHIP,
      analysis: leadershipOutcome.analysis,
      model: leadershipOutcome.model
    });
  }

  await prisma.feelingLog.updateMany({
    where: { id: { in: pendingLogs.map((log) => log.id) } },
    data: { processedAt: now }
  });

  const summary = {
    skipped: false,
    processedLogs: pendingLogs.length,
    tenants: logsByTenant.size,
    authorGroups,
    mentionGroups,
    durationMs: Date.now() - startedAt
  };

  await logAiRun({
    operation: AiRunOperation.FEELING_LOG_ANALYSIS,
    status: AiRunStatus.SUCCESS,
    promptVersion: PROMPT_VERSION,
    durationMs: summary.durationMs,
    model: modelsUsed[0],
    trace: {
      batchRun: true,
      ...summary,
      completedAt: now.toISOString()
    }
  }).catch(() => void 0);

  return summary;
}

export async function getFeelingLogBatchSchedulerStatus() {
  const lastRun = await prisma.aiRunLog.findFirst({
    where: {
      operation: AiRunOperation.FEELING_LOG_ANALYSIS,
      status: AiRunStatus.SUCCESS
    },
    orderBy: { createdAt: "desc" }
  });

  const pendingCount = await prisma.feelingLog.count({ where: { processedAt: null } });
  const trace = (lastRun?.traceJson ?? null) as Record<string, unknown> | null;
  const lastBatchAt = trace?.batchRun ? lastRun?.createdAt ?? null : null;

  return {
    cron: env.feelingLogBatchCron,
    timezone: env.feelingLogBatchTimezone,
    intervalDays: env.feelingLogBatchIntervalDays,
    pendingCount,
    lastBatchAt: lastBatchAt?.toISOString() ?? null,
    nextEligibleAt: lastBatchAt
      ? new Date(lastBatchAt.getTime() + BATCH_INTERVAL_MS).toISOString()
      : null,
    latestTrace: trace
  };
}

export function startFeelingLogBatchScheduler() {
  cron.schedule(env.feelingLogBatchCron, async () => {
    try {
      const summary = await processPendingFeelingLogsBatch();
      if (!summary.skipped) {
        console.log("[FEELING_LOG_BATCH] Run summary", summary);
      }
    } catch (error) {
      await logAiRun({
        operation: AiRunOperation.FEELING_LOG_ANALYSIS,
        status: AiRunStatus.FAILED,
        promptVersion: PROMPT_VERSION,
        trace: { batchRun: true },
        errorMessage: error instanceof Error ? error.message : "unknown feeling log batch error"
      }).catch(() => void 0);
      console.error("[FEELING_LOG_BATCH] Scheduler failed", error);
    }
  }, {
    timezone: env.feelingLogBatchTimezone
  });

  console.log(
    `[FEELING_LOG_BATCH] Scheduler started with cron ${env.feelingLogBatchCron} (${env.feelingLogBatchTimezone}), interval ${env.feelingLogBatchIntervalDays} day(s)`
  );
}

export async function createFeelingLog(input: FeelingLogCreateInput) {
  const hasAccess = input.user.systemRole === "SUPER_ADMIN" || input.user.systemRole === "MODERATOR"
    ? true
    : await ensureTenantMembership(input.user, input.tenantId);

  if (!hasAccess) {
    throw new Error("FORBIDDEN_TENANT_SCOPE");
  }

  const mentionIds = normalizeMentions(input.mentionedUserIds);
  const mentionTargets = await validateMentionedMembers(input.tenantId, mentionIds);

  return prisma.feelingLog.create({
    data: {
      tenantId: input.tenantId,
      authorId: input.authorId,
      content: input.content,
      emoji: input.emoji ?? null,
      isPrivate: true,
      processedAt: null,
      mentions: {
        create: mentionTargets.map((target) => ({
          mentionedUserId: target.id,
          mentionLabel: target.name
        }))
      }
    }
  });
}

export async function listMyFeelingLogs(tenantId: string, user: TenantAuthUser) {
  const hasAccess = isPlatformAdmin(user) ? true : await ensureTenantMembership(user, tenantId);
  if (!hasAccess) {
    throw new Error("FORBIDDEN_TENANT_SCOPE");
  }

  return prisma.feelingLog.findMany({
    where: {
      tenantId,
      authorId: user.id
    },
    orderBy: { createdAt: "desc" },
    include: {
      mentions: {
        include: {
          mentionedUser: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      },
      analyses: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
}

export async function getFeelingLogInbox(tenantId: string, user: TenantAuthUser) {
  const hasAccess = await ensureTenantRole(user, tenantId, [TenantRole.TENANT_ADMIN, TenantRole.MANAGER]);
  if (!hasAccess) {
    throw new Error("FORBIDDEN_TENANT_SCOPE");
  }

  const windowStart = new Date(Date.now() - ANALYSIS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const recentInsights = await prisma.feelingLogAnalysis.findMany({
    where: {
      feelingLog: {
        tenantId,
        processedAt: { not: null },
        createdAt: { gte: windowStart }
      },
      audience: {
        in: [FeelingLogAnalysisAudience.LEADERSHIP, FeelingLogAnalysisAudience.MENTION_TARGET]
      }
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      feelingLog: {
        select: {
          id: true,
          emoji: true,
          createdAt: true,
          mentions: {
            select: { mentionLabel: true }
          }
        }
      },
      targetUser: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  const mentionTotals = await prisma.feelingLogMention.groupBy({
    by: ["mentionedUserId"],
    where: {
      feelingLog: {
        tenantId,
        processedAt: { not: null },
        createdAt: { gte: windowStart }
      }
    },
    _count: { mentionedUserId: true },
    having: {
      mentionedUserId: { _count: { gt: 5 } }
    }
  });

  const mentionUsers = mentionTotals.length > 0
    ? await prisma.user.findMany({
      where: { id: { in: mentionTotals.map((item) => item.mentionedUserId) } },
      select: { id: true, name: true, email: true }
    })
    : [];

  const userById = new Map(mentionUsers.map((member) => [member.id, member]));
  const scheduler = await getFeelingLogBatchSchedulerStatus();

  return {
    recentInsights: recentInsights.map((item) => ({
      id: item.id,
      audience: item.audience,
      title: item.title,
      summary: privacySafeInsightText(item.summary, "มีสัญญาณจากบันทึกส่วนตัวที่ควรติดตามอย่างระมัดระวัง โดยไม่เปิดเผยข้อความต้นฉบับ"),
      interpretation: privacySafeInsightText(item.interpretation, "ควรดูแนวโน้มต่อเนื่องในรอบถัดไป และตีความอย่างระมัดระวังโดยไม่ระบุตัวผู้เขียน"),
      recommendation: privacySafeInsightText(item.recommendation ?? "", "ติดตามด้วยท่าทีสนับสนุน เปิดพื้นที่รับฟัง และหลีกเลี่ยงการระบุตัวบุคคล"),
      riskLevel: item.riskLevel,
      createdAt: item.createdAt.toISOString(),
      emoji: item.feelingLog.emoji,
      mentionCount: item.feelingLog.mentions.length,
      mentionedPeople: item.feelingLog.mentions.map((mention) => mention.mentionLabel),
      targetUser: item.targetUser
    })),
    frequentMentions: mentionTotals.map((item) => {
      const mentionUser = userById.get(item.mentionedUserId);
      return {
        userId: item.mentionedUserId,
        name: mentionUser?.name ?? item.mentionedUserId,
        email: mentionUser?.email,
        count: item._count.mentionedUserId
      };
    }),
    windowStart: windowStart.toISOString(),
    windowEnd: new Date().toISOString(),
    batchScheduler: scheduler
  };
}
