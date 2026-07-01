import {
  ActionItemPriority,
  ActionStatus,
  AiRunOperation,
  AiRunStatus,
  MorningBriefingAckMood,
  Prisma,
  TenantRole
} from "@prisma/client";
import cron from "node-cron";
import { APP_DISPLAY_NAME } from "../config/brand";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { startOfBriefingDay } from "../lib/briefingTimeZone";
import { generateWithLocalModel } from "./aiService";
import { logAiRun } from "./aiRunLogService";

const PROMPT_VERSION = "rubjob-morning-briefing-v1";
const NEAR_DUE_DAYS = 3;
const HIGH_PRIORITY_NEAR_DUE_DAYS = 7;

type BriefingItem = {
  id: string;
  task: string;
  detail: string | null;
  dueDate: Date;
  priority: ActionItemPriority;
  status: ActionStatus;
  assigneeId: string;
  assigneeName: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  meetingId: string | null;
  meetingTitle: string | null;
  overdue: boolean;
  dueSoon: boolean;
  highPriority: boolean;
  blocked: boolean;
  ownedByViewer: boolean;
};

type BriefingContent = {
  headline: string;
  summary: string;
  sections: Array<{ title: string; items: string[] }>;
};

async function expirePriorUnacknowledgedBriefings(input: {
  tenantId: string;
  userId: string;
  briefingDate: Date;
}) {
  const staleBriefings = await prisma.morningBriefing.findMany({
    where: {
      tenantId: input.tenantId,
      userId: input.userId,
      briefingDate: { lt: input.briefingDate },
      acknowledgements: {
        none: { userId: input.userId }
      }
    },
    select: { id: true }
  });

  if (!staleBriefings.length) {
    return 0;
  }

  await prisma.$transaction(
    staleBriefings.map((briefing) => prisma.morningBriefingAcknowledgement.upsert({
      where: {
        briefingId_userId: {
          briefingId: briefing.id,
          userId: input.userId
        }
      },
      create: {
        briefingId: briefing.id,
        userId: input.userId,
        mood: MorningBriefingAckMood.I_KNOW,
        score: 0,
        reviewAgain: false
      },
      update: {
        mood: MorningBriefingAckMood.I_KNOW,
        score: 0,
        reviewAgain: false
      }
    }))
  );

  return staleBriefings.length;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isManagerScope(role: TenantRole) {
  return role === TenantRole.TENANT_ADMIN || role === TenantRole.MANAGER;
}

function activeStatuses() {
  return [ActionStatus.OPEN, ActionStatus.TODO, ActionStatus.IN_PROGRESS, ActionStatus.BLOCKED];
}

function scoreItem(item: BriefingItem, now: Date) {
  let score = 0;
  if (item.overdue) score += 90;
  if (item.blocked) score += 45;
  if (item.priority === ActionItemPriority.CRITICAL) score += 45;
  if (item.priority === ActionItemPriority.HIGH) score += 30;
  if (item.dueSoon) score += 25;
  if (item.ownedByViewer) score += 12;

  const hoursUntilDue = (item.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilDue >= 0) {
    score += Math.max(0, 24 - Math.min(24, hoursUntilDue));
  }
  return score;
}

function classifyItem(item: BriefingItem) {
  if (item.overdue) return "overdue";
  if (item.blocked) return "blocked";
  if (item.dueSoon) return "due-soon";
  if (item.highPriority) return "high-priority";
  return "responsibility";
}

function buildFallbackContent(input: {
  userName: string;
  roleScope: string;
  items: BriefingItem[];
}) : BriefingContent {
  const ownItems = input.items.filter((item) => item.ownedByViewer);
  const overdue = input.items.filter((item) => item.overdue);
  const dueSoon = input.items.filter((item) => item.dueSoon && !item.overdue);
  const watchList = input.items.filter((item) => !item.ownedByViewer && (item.overdue || item.highPriority || item.blocked));

  const headline = input.items.length
    ? `Rubjob morning brief: ${overdue.length} overdue, ${dueSoon.length} due soon`
    : "Rubjob morning brief: no urgent action items found";

  const summary = input.items.length
    ? `Good morning ${input.userName}. I found ${ownItems.length} item(s) assigned to you and ${watchList.length} team item(s) worth monitoring in your ${input.roleScope} scope.`
    : `Good morning ${input.userName}. I did not find overdue, due-soon, blocked, or high-priority action items in your current scope.`;

  const formatItem = (item: BriefingItem) =>
    `${item.task} | ${item.projectName} | owner: ${item.assigneeName} | due: ${item.dueDate.toISOString().slice(0, 10)} | ${item.priority}/${item.status}`;

  return {
    headline,
    summary,
    sections: [
      { title: "Your responsibilities", items: ownItems.slice(0, 8).map(formatItem) },
      { title: "Needs attention", items: overdue.concat(dueSoon).slice(0, 8).map(formatItem) },
      { title: "Team follow-ups", items: watchList.slice(0, 8).map(formatItem) }
    ].filter((section) => section.items.length > 0)
  };
}

function extractJsonCandidate(raw: string) {
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace <= firstBrace) return null;
  return stripped.slice(firstBrace, lastBrace + 1);
}

function normalizeAiContent(raw: string, fallback: BriefingContent): BriefingContent {
  const json = extractJsonCandidate(raw);
  if (!json) return fallback;

  try {
    const parsed = JSON.parse(json) as Partial<BriefingContent>;
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
          .map((section) => ({
            title: typeof section?.title === "string" ? section.title : "",
            items: Array.isArray(section?.items)
              ? section.items.filter((item): item is string => typeof item === "string").slice(0, 8)
              : []
          }))
          .filter((section) => section.title && section.items.length > 0)
      : fallback.sections;

    return {
      headline: typeof parsed.headline === "string" && parsed.headline.trim() ? parsed.headline.trim() : fallback.headline,
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary,
      sections
    };
  } catch {
    return fallback;
  }
}

function buildPrompt(input: {
  userName: string;
  tenantName: string;
  roleScope: string;
  items: BriefingItem[];
}) {
  const evidence = input.items.slice(0, 25).map((item, index) => ({
    ref: `A${index + 1}`,
    actionItemId: item.id,
    category: classifyItem(item),
    task: item.task,
    detail: item.detail,
    dueDate: item.dueDate.toISOString(),
    priority: item.priority,
    status: item.status,
    owner: item.assigneeName,
    project: item.projectName,
    meeting: item.meetingTitle,
    viewerOwnsItem: item.ownedByViewer
  }));

  return [
    `You are Rubjob / น้องรับจบ, an operational AI teammate for ${APP_DISPLAY_NAME}.`,
    "Core identity: warm, direct, practical, evidence-grounded, cheerful but never careless.",
    "Decision engine: prioritize overdue, blocked, critical/high priority, due soon, and direct responsibility before broad team monitoring.",
    "Risk analysis: call out concrete follow-ups, owner, due date, and project context.",
    "Knowledge retrieval rules: use only the evidence below. Cite action item IDs or refs in the wording when useful.",
    "Recommendation engine: do not invent tasks, owners, dates, risk, or status.",
    "Communication style: write for an internal work dashboard. Be concise and useful for members, PMs, managers, and executives.",
    "Guardrails: never fabricate data; if evidence is empty, say there is no urgent work found.",
    "",
    `User: ${input.userName}`,
    `Tenant: ${input.tenantName}`,
    `Role scope: ${input.roleScope}`,
    "",
    "Return JSON only with this shape:",
    "{\"headline\":\"...\",\"summary\":\"...\",\"sections\":[{\"title\":\"...\",\"items\":[\"...\"]}]}",
    "",
    `Evidence: ${JSON.stringify(evidence)}`
  ].join("\n");
}

async function collectBriefingItems(input: {
  tenantId: string;
  userId: string;
  tenantRole: TenantRole;
  now: Date;
}) {
  const nearDue = addDays(input.now, NEAR_DUE_DAYS);
  const highPriorityNearDue = addDays(input.now, HIGH_PRIORITY_NEAR_DUE_DAYS);
  const managerScope = isManagerScope(input.tenantRole);

  const items = await prisma.actionItem.findMany({
    where: {
      status: { in: activeStatuses() },
      project: {
        tenantId: input.tenantId
      },
      ...(managerScope ? {} : { assigneeId: input.userId }),
      OR: [
        { dueDate: { lte: nearDue } },
        { status: ActionStatus.BLOCKED },
        {
          priority: { in: [ActionItemPriority.HIGH, ActionItemPriority.CRITICAL] },
          dueDate: { lte: highPriorityNearDue }
        },
        { assigneeId: input.userId }
      ]
    },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      project: { select: { id: true, code: true, name: true } },
      meeting: {
        select: {
          id: true,
          title: true
        }
      }
    },
    take: 80
  });

  return items
    .map((item): BriefingItem => {
      const overdue = item.dueDate < input.now;
      const dueSoon = item.dueDate >= input.now && item.dueDate <= nearDue;
      return {
        id: item.id,
        task: item.task,
        detail: item.detail,
        dueDate: item.dueDate,
        priority: item.priority,
        status: item.status,
        assigneeId: item.assigneeId,
        assigneeName: item.ownerDisplayName ?? item.assignee.name,
        projectId: item.project.id,
        projectName: item.project.name,
        projectCode: item.project.code,
        meetingId: item.meeting?.id ?? null,
        meetingTitle: item.meeting?.title ?? null,
        overdue,
        dueSoon,
        highPriority: item.priority === ActionItemPriority.HIGH || item.priority === ActionItemPriority.CRITICAL,
        blocked: item.status === ActionStatus.BLOCKED,
        ownedByViewer: item.assigneeId === input.userId
      };
    })
    .sort((a, b) => scoreItem(b, input.now) - scoreItem(a, input.now))
    .slice(0, 30);
}

type MorningBriefingWithAck = Prisma.MorningBriefingGetPayload<{
  include: {
    acknowledgements: true;
  };
}>;

function briefingHasActionableContent(briefing: MorningBriefingWithAck): boolean {
  const actionItemIds = Array.isArray(briefing.actionItemIdsJson) ? briefing.actionItemIdsJson : [];
  if (actionItemIds.length > 0) {
    return true;
  }

  const sections = Array.isArray(briefing.sectionsJson) ? briefing.sectionsJson : [];
  return sections.some((section) => {
    if (!section || typeof section !== "object") {
      return false;
    }

    const items = (section as { items?: unknown }).items;
    return Array.isArray(items) && items.length > 0;
  });
}

function serializeBriefing(briefing: MorningBriefingWithAck | null) {
  if (!briefing) return null;
  const acknowledgement = briefing.acknowledgements?.[0] ?? null;
  return {
    id: briefing.id,
    tenantId: briefing.tenantId,
    userId: briefing.userId,
    briefingDate: briefing.briefingDate.toISOString(),
    status: briefing.status,
    roleScope: briefing.roleScope,
    headline: briefing.headline,
    summary: briefing.summary,
    sections: Array.isArray(briefing.sectionsJson) ? briefing.sectionsJson : [],
    evidence: Array.isArray(briefing.evidenceJson) ? briefing.evidenceJson : [],
    actionItemIds: Array.isArray(briefing.actionItemIdsJson) ? briefing.actionItemIdsJson : [],
    generatedAt: briefing.generatedAt.toISOString(),
    acknowledgement: acknowledgement
      ? {
          id: acknowledgement.id,
          mood: acknowledgement.mood,
          score: acknowledgement.score,
          reviewAgain: acknowledgement.reviewAgain,
          createdAt: acknowledgement.createdAt.toISOString()
        }
      : null
  };
}

export async function generateMorningBriefingForMembership(input: {
  tenantId: string;
  tenantName: string;
  userId: string;
  userName: string;
  tenantRole: TenantRole;
  now?: Date;
}) {
  const runStartMs = Date.now();
  const now = input.now ?? new Date();
  const briefingDate = startOfBriefingDay(now);
  const roleScope = isManagerScope(input.tenantRole) ? `${input.tenantRole}_TEAM_SCOPE` : `${input.tenantRole}_OWN_SCOPE`;

  await expirePriorUnacknowledgedBriefings({
    tenantId: input.tenantId,
    userId: input.userId,
    briefingDate
  });

  const items = await collectBriefingItems({
    tenantId: input.tenantId,
    userId: input.userId,
    tenantRole: input.tenantRole,
    now
  });

  if (!items.length) {
    await prisma.morningBriefing.deleteMany({
      where: {
        tenantId: input.tenantId,
        userId: input.userId,
        briefingDate
      }
    });
    return null;
  }

  const fallback = buildFallbackContent({ userName: input.userName, roleScope, items });

  let content = fallback;
  let model: string | undefined;
  try {
    const generated = await generateWithLocalModel({
      prompt: buildPrompt({
        userName: input.userName,
        tenantName: input.tenantName,
        roleScope,
        items
      })
    });
    content = normalizeAiContent(generated.output, fallback);
    model = `${generated.provider}:${generated.model}`;
  } catch (error) {
    await logAiRun({
      operation: AiRunOperation.MORNING_BRIEFING,
      status: AiRunStatus.FAILED,
      userId: input.userId,
      promptVersion: PROMPT_VERSION,
      errorMessage: error instanceof Error ? error.message : "unknown morning briefing AI error",
      trace: { tenantId: input.tenantId, fallbackUsed: true, itemCount: items.length }
    });
  }

  const evidence = items.map((item) => ({
    actionItemId: item.id,
    task: item.task,
    projectId: item.projectId,
    projectName: item.projectName,
    meetingId: item.meetingId,
    meetingTitle: item.meetingTitle,
    assigneeId: item.assigneeId,
    assigneeName: item.assigneeName,
    dueDate: item.dueDate.toISOString(),
    priority: item.priority,
    status: item.status,
    category: classifyItem(item)
  }));

  const briefing = await prisma.morningBriefing.upsert({
    where: {
      tenantId_userId_briefingDate: {
        tenantId: input.tenantId,
        userId: input.userId,
        briefingDate
      }
    },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      briefingDate,
      roleScope,
      headline: content.headline,
      summary: content.summary,
      sectionsJson: content.sections as Prisma.InputJsonValue,
      evidenceJson: evidence as Prisma.InputJsonValue,
      actionItemIdsJson: items.map((item) => item.id) as Prisma.InputJsonValue,
      model,
      promptVersion: PROMPT_VERSION
    },
    update: {
      status: "GENERATED",
      roleScope,
      headline: content.headline,
      summary: content.summary,
      sectionsJson: content.sections as Prisma.InputJsonValue,
      evidenceJson: evidence as Prisma.InputJsonValue,
      actionItemIdsJson: items.map((item) => item.id) as Prisma.InputJsonValue,
      model,
      promptVersion: PROMPT_VERSION,
      generatedAt: now
    }
  });

  await logAiRun({
    operation: AiRunOperation.MORNING_BRIEFING,
    status: AiRunStatus.SUCCESS,
    userId: input.userId,
    promptVersion: PROMPT_VERSION,
    durationMs: Date.now() - runStartMs,
    retrievedIds: items.map((item) => item.id),
    trace: {
      tenantId: input.tenantId,
      itemCount: items.length,
      roleScope,
      model
    }
  });

  return briefing;
}

export async function runMorningBriefingsForAllTenants(now = new Date()) {
  const runStartMs = Date.now();
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      isActive: true,
      tenant: { isActive: true },
      user: { isActive: true }
    },
    select: {
      tenantId: true,
      role: true,
      tenant: { select: { name: true } },
      user: { select: { id: true, name: true } }
    }
  });

  const results = [];
  for (const membership of memberships) {
    try {
      const briefing = await generateMorningBriefingForMembership({
        tenantId: membership.tenantId,
        tenantName: membership.tenant.name,
        userId: membership.user.id,
        userName: membership.user.name,
        tenantRole: membership.role,
        now
      });
      if (!briefing) {
        results.push({
          userId: membership.user.id,
          tenantId: membership.tenantId,
          status: "SKIPPED" as const,
          reason: "NO_ACTIONABLE_ITEMS"
        });
        continue;
      }
      results.push({ userId: membership.user.id, tenantId: membership.tenantId, briefingId: briefing.id, status: "SUCCESS" as const });
    } catch (error) {
      results.push({
        userId: membership.user.id,
        tenantId: membership.tenantId,
        status: "FAILED" as const,
        error: error instanceof Error ? error.message : "unknown error"
      });
    }
  }

  const summary = {
    generatedAt: now.toISOString(),
    processed: results.length,
    succeeded: results.filter((item) => item.status === "SUCCESS").length,
    failed: results.filter((item) => item.status === "FAILED").length,
    results
  };

  await logAiRun({
    operation: AiRunOperation.MORNING_BRIEFING,
    status: summary.failed > 0 ? AiRunStatus.FAILED : AiRunStatus.SUCCESS,
    promptVersion: PROMPT_VERSION,
    durationMs: Date.now() - runStartMs,
    trace: summary,
    errorMessage: summary.failed > 0 ? `${summary.failed} morning briefing(s) failed` : undefined
  });

  return summary;
}

export async function getLatestMorningBriefingForUser(input: {
  userId: string;
  tenantId?: string;
}) {
  const today = startOfBriefingDay(new Date());
  const briefing = await prisma.morningBriefing.findFirst({
    where: {
      userId: input.userId,
      briefingDate: today,
      ...(input.tenantId ? { tenantId: input.tenantId } : {})
    },
    include: {
      acknowledgements: {
        where: { userId: input.userId },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!briefing || !briefingHasActionableContent(briefing)) {
    return null;
  }

  return serializeBriefing(briefing);
}

export async function acknowledgeMorningBriefing(input: {
  briefingId: string;
  userId: string;
  mood: MorningBriefingAckMood;
  reviewAgain?: boolean;
}) {
  const scoreByMood: Record<MorningBriefingAckMood, number> = {
    [MorningBriefingAckMood.GOT_IT]: 3,
    [MorningBriefingAckMood.I_KNOW]: 0,
    [MorningBriefingAckMood.RUDENESS]: -3
  };

  const briefing = await prisma.morningBriefing.findFirst({
    where: {
      id: input.briefingId,
      userId: input.userId
    },
    select: { id: true }
  });

  if (!briefing) {
    return null;
  }

  return prisma.morningBriefingAcknowledgement.upsert({
    where: {
      briefingId_userId: {
        briefingId: input.briefingId,
        userId: input.userId
      }
    },
    create: {
      briefingId: input.briefingId,
      userId: input.userId,
      mood: input.mood,
      score: scoreByMood[input.mood],
      reviewAgain: input.reviewAgain
    },
    update: {
      mood: input.mood,
      score: scoreByMood[input.mood],
      reviewAgain: input.reviewAgain
    }
  });
}

export async function getMorningBriefingSchedulerStatus() {
  const latestRun = await prisma.aiRunLog.findFirst({
    where: {
      operation: AiRunOperation.MORNING_BRIEFING
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      status: true,
      durationMs: true,
      traceJson: true,
      errorMessage: true,
      createdAt: true,
      promptVersion: true
    }
  });

  return {
    cron: env.morningBriefingCron,
    timezone: env.morningBriefingTimezone,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          durationMs: latestRun.durationMs,
          trace: latestRun.traceJson,
          errorMessage: latestRun.errorMessage,
          createdAt: latestRun.createdAt,
          promptVersion: latestRun.promptVersion
        }
      : null
  };
}

export function startMorningBriefingScheduler() {
  cron.schedule(env.morningBriefingCron, async () => {
    try {
      const summary = await runMorningBriefingsForAllTenants();
      console.log("[MORNING_BRIEFING] Run summary", summary);
    } catch (error) {
      await logAiRun({
        operation: AiRunOperation.MORNING_BRIEFING,
        status: AiRunStatus.FAILED,
        promptVersion: PROMPT_VERSION,
        errorMessage: error instanceof Error ? error.message : "unknown morning briefing scheduler error"
      });
      console.error("[MORNING_BRIEFING] Scheduler failed", error);
    }
  }, {
    timezone: env.morningBriefingTimezone
  });

  console.log(`[MORNING_BRIEFING] Scheduler started with cron ${env.morningBriefingCron} (${env.morningBriefingTimezone})`);
}
