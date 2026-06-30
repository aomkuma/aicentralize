import {
  AiRunOperation,
  FeelingLogAnalysisAudience,
  type Prisma,
  TenantRole
} from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma";
import { generateWithLocalModel } from "./aiService";
import { logAiRun } from "./aiRunLogService";
import { ensureTenantMembership, ensureTenantRole, isPlatformAdmin, type TenantAuthUser } from "./tenantAccessService";

const PROMPT_VERSION = "feeling-log-v1";
const ANALYSIS_LOOKBACK_DAYS = 30;

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

function buildHeuristicAnalysis(input: {
  content: string;
  emoji?: string | null;
  mentionNames: string[];
}): FeelingLogAnalysisResult {
  const preview = safePreview(input.content, 200);
  const hasStress = /เครียด|เหนื่อย|กดดัน|ไม่ไหว|ท้อ|เบื่อ|frustrat|stress|anxious/i.test(input.content);
  const hasJoy = /ดีใจ|สบายใจ|ขอบคุณ|happy|good|calm|relief/i.test(input.content);
  const hasConflict = /โกรธ|หงุดหงิด|ไม่โอเค|ทะเลาะ|ผิดหวัง|upset|annoy/i.test(input.content);

  const riskLevel = hasConflict || hasStress ? "MEDIUM" : hasJoy ? "LOW" : "LOW";

  return {
    personalTitle: input.emoji ? `สะท้อนจาก ${input.emoji}` : "สะท้อนจากบันทึก",
    personalSummary: hasStress
      ? "ข้อความนี้สะท้อนความตึงเครียดหรือความล้าทางอารมณ์บางส่วน ควรค่อยๆ แยกประเด็นที่หนักที่สุดออกมาก่อน"
      : hasConflict
        ? "ข้อความนี้มีโทนขัดข้องหรือไม่สบายใจอยู่บ้าง แต่ยังเป็นข้อมูลเชิงสังเกตที่นำไปคุยต่อได้"
        : "ข้อความนี้มีโทนค่อนข้างเป็นกลางและใช้ต่อยอดทำความเข้าใจสภาวะภายในได้",
    interpretation: [
      `สารตั้งต้นจากบันทึก: ${preview || "ไม่มีข้อความที่ชัดเจน"}.`,
      hasStress
        ? "มีสัญญาณของความกดดัน ความล้า หรือพื้นที่ทางใจที่ต้องพัก"
        : "ยังไม่เห็นสัญญาณความเสี่ยงเชิงอารมณ์ที่รุนแรงจากข้อความนี้",
      input.mentionNames.length > 0
        ? `มีการ mention ถึง: ${input.mentionNames.join(", ")}`
        : "ไม่มี mention ที่ระบุบุคคล"
    ].join(" "),
    executiveSummary: input.mentionNames.length > 0
      ? "มีบันทึกส่วนตัวที่สะท้อนประเด็นการทำงาน/ความรู้สึกซึ่งเกี่ยวข้องกับเพื่อนร่วมงานบางคน ควรติดตามอย่างระวังและไม่เปิดชื่อผู้เขียน"
      : "มีบันทึกส่วนตัวที่สะท้อนสภาวะความรู้สึกของทีม/บุคคล ควรติดตามเชิงสนับสนุนมากกว่าการตีความเชิงตัดสิน",
    mentionSummary: input.mentionNames.length > 0
      ? `ประเด็น mention กระทบกับ: ${input.mentionNames.join(", ")}`
      : "ไม่มี mention target",
    recommendation: hasStress
      ? "ควรเช็กอินแบบอ่อนโยน ถามว่าต้องการความช่วยเหลืออะไรหรืออยากให้ลดงานส่วนไหนชั่วคราว"
      : hasConflict
        ? "ควรชวนคุยแบบเป็นข้อเท็จจริงและหลีกเลี่ยงการตอบโต้ด้วยอารมณ์"
        : "เก็บเป็นข้อมูลต่อเนื่องและดูแพตเทิร์นในช่วงถัดไป",
    riskLevel
  };
}

function buildAiPrompt(input: {
  content: string;
  emoji?: string | null;
  mentionNames: string[];
  heuristic: FeelingLogAnalysisResult;
}) {
  return [
    "You are Rubjob, a supportive workplace-aware reflection assistant.",
    "Analyze a private feeling log with extreme care.",
    "Do NOT diagnose mental health, personality, intent, or relationships.",
    "Do NOT write harsh, shaming, or emotionally escalated wording.",
    "Keep the response factual, cautious, and supportive.",
    "Never mention the author name.",
    "If mentions are present, treat the mentioned people separately and summarize only the observable context.",
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
    "Input:",
    JSON.stringify({
      content: input.content,
      emoji: input.emoji ?? null,
      mentionNames: input.mentionNames
    }, null, 2)
  ].join("\n");
}

async function analyzeFeelingLogWithAi(input: {
  content: string;
  emoji?: string | null;
  mentionNames: string[];
}): Promise<{ analysis: FeelingLogAnalysisResult; model?: string }> {
  const heuristic = buildHeuristicAnalysis(input);

  try {
    const result = await generateWithLocalModel({
      prompt: buildAiPrompt({
        content: input.content,
        emoji: input.emoji,
        mentionNames: input.mentionNames,
        heuristic
      })
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
        personalTitle: typeof parsed.personalTitle === "string" && parsed.personalTitle.trim() ? parsed.personalTitle.trim() : heuristic.personalTitle,
        personalSummary: typeof parsed.personalSummary === "string" && parsed.personalSummary.trim() ? parsed.personalSummary.trim() : heuristic.personalSummary,
        interpretation: typeof parsed.interpretation === "string" && parsed.interpretation.trim() ? parsed.interpretation.trim() : heuristic.interpretation,
        executiveSummary: typeof parsed.executiveSummary === "string" && parsed.executiveSummary.trim() ? parsed.executiveSummary.trim() : heuristic.executiveSummary,
        mentionSummary: typeof parsed.mentionSummary === "string" && parsed.mentionSummary.trim() ? parsed.mentionSummary.trim() : heuristic.mentionSummary,
        recommendation: typeof parsed.recommendation === "string" && parsed.recommendation.trim() ? parsed.recommendation.trim() : heuristic.recommendation,
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
          tenant: {
            isActive: true
          }
        }
      }
    },
    select: {
      id: true,
      name: true,
      email: true
    }
  });

  const byId = new Map(members.map((member) => [member.id, member]));
  return mentionedUserIds
    .map((id) => byId.get(id))
    .filter((member): member is TenantMember => Boolean(member));
}

async function createAnalysisRecords(input: {
  feelingLogId: string;
  mentionTargets: TenantMember[];
  analysis: FeelingLogAnalysisResult;
  model?: string;
}) {
  type AnalysisRow = {
    feelingLogId: string;
    audience: FeelingLogAnalysisAudience;
    targetUserId?: string | null;
    title: string;
    summary: string;
    interpretation: string;
    recommendation: string;
    riskLevel: FeelingLogAnalysisResult["riskLevel"];
    model: string | null;
    promptVersion: string;
  };

  const analyses: AnalysisRow[] = [
    {
      feelingLogId: input.feelingLogId,
      audience: FeelingLogAnalysisAudience.PERSONAL,
      title: input.analysis.personalTitle,
      summary: input.analysis.personalSummary,
      interpretation: input.analysis.interpretation,
      recommendation: input.analysis.recommendation,
      riskLevel: input.analysis.riskLevel,
      model: input.model ?? null,
      promptVersion: PROMPT_VERSION
    },
    {
      feelingLogId: input.feelingLogId,
      audience: FeelingLogAnalysisAudience.LEADERSHIP,
      title: "ข้อความบันทึกส่วนตัวสำหรับหัวหน้าทีม",
      summary: input.analysis.executiveSummary,
      interpretation: input.analysis.interpretation,
      recommendation: input.analysis.recommendation,
      riskLevel: input.analysis.riskLevel,
      model: input.model ?? null,
      promptVersion: PROMPT_VERSION
    }
  ];

  const mentionAnalyses: AnalysisRow[] = input.mentionTargets.map((target) => ({
    feelingLogId: input.feelingLogId,
    audience: FeelingLogAnalysisAudience.MENTION_TARGET,
    targetUserId: target.id,
    title: `Context for ${target.name}`,
    summary: input.analysis.mentionSummary,
    interpretation: input.analysis.interpretation,
    recommendation: input.analysis.recommendation,
    riskLevel: input.analysis.riskLevel,
    model: input.model ?? null,
    promptVersion: PROMPT_VERSION
  }));

  await prisma.feelingLogAnalysis.createMany({
    data: analyses.concat(mentionAnalyses).map((item) => ({
      feelingLogId: item.feelingLogId,
      audience: item.audience,
      targetUserId: item.targetUserId ?? null,
      title: item.title,
      summary: item.summary,
      interpretation: item.interpretation,
      recommendation: item.recommendation,
      riskLevel: item.riskLevel,
      model: item.model,
      promptVersion: item.promptVersion
    }))
  });
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
  const analysisOutcome = await analyzeFeelingLogWithAi({
    content: input.content,
    emoji: input.emoji ?? null,
    mentionNames: mentionTargets.map((member) => member.name)
  });

  const log = await prisma.feelingLog.create({
    data: {
      tenantId: input.tenantId,
      authorId: input.authorId,
      content: input.content,
      emoji: input.emoji ?? null,
      isPrivate: true,
      mentions: {
        create: mentionTargets.map((target) => ({
          mentionedUserId: target.id,
          mentionLabel: target.name
        }))
      }
    }
  });

  await createAnalysisRecords({
    feelingLogId: log.id,
    mentionTargets,
    analysis: analysisOutcome.analysis,
    model: analysisOutcome.model
  });

  await logAiRun({
    operation: AiRunOperation.FEELING_LOG_ANALYSIS,
    status: "SUCCESS",
    userId: input.authorId,
    trace: {
      feelingLogId: log.id,
      tenantId: input.tenantId,
      mentionCount: mentionTargets.length,
      createdAt: new Date().toISOString()
    },
    model: analysisOutcome.model,
    promptVersion: PROMPT_VERSION
  }).catch(() => void 0);

  return log;
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
        createdAt: {
          gte: windowStart
        }
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
            select: {
              mentionLabel: true
            }
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
        createdAt: {
          gte: windowStart
        }
      }
    },
    _count: {
      mentionedUserId: true
    },
    having: {
      mentionedUserId: {
        _count: {
          gt: 5
        }
      }
    }
  });

  const mentionUsers = mentionTotals.length > 0
    ? await prisma.user.findMany({
      where: {
        id: { in: mentionTotals.map((item) => item.mentionedUserId) }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    })
    : [];

  const userById = new Map(mentionUsers.map((member) => [member.id, member]));

  return {
    recentInsights: recentInsights.map((item) => ({
      id: item.id,
      audience: item.audience,
      title: item.title,
      summary: item.summary,
      interpretation: item.interpretation,
      recommendation: item.recommendation,
      riskLevel: item.riskLevel,
      createdAt: item.createdAt.toISOString(),
      emoji: item.feelingLog.emoji,
      mentionCount: item.feelingLog.mentions.length,
      mentionedPeople: item.feelingLog.mentions.map((mention) => mention.mentionLabel),
      targetUser: item.targetUser
    })),
    frequentMentions: mentionTotals.map((item) => {
      const user = userById.get(item.mentionedUserId);
      return {
        userId: item.mentionedUserId,
        name: user?.name ?? item.mentionedUserId,
        email: user?.email,
        count: item._count.mentionedUserId
      };
    }),
    windowStart: windowStart.toISOString(),
    windowEnd: new Date().toISOString()
  };
}
