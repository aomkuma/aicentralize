import { ActionStatus, Prisma, ReminderLogType, ReminderType, UserRole } from "@prisma/client";
import cron from "node-cron";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { logAiRun } from "./aiRunLogService";
import { dispatchReminder } from "./reminderDispatchService";
import { sendReminderEmail } from "./emailService";
import { generateReminderDigests } from "./reminderDigestService";

type EligibleReminderItem = {
  id: string;
  task: string;
  dueDate: Date;
  assigneeId: string;
  meeting: {
    id: string;
    title: string;
    projectId: string;
  };
  assignee: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    notificationSetting: {
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushEnabled: boolean;
    } | null;
    pushSubscriptions: Array<{
      id: string;
      userId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      expirationTime: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;
  };
};

type ReminderRuleKey = "DUE_SOON" | "OVERDUE" | "OVERDUE_SHORT" | "OVERDUE_ESCALATE";

type ReminderRule = {
  key: ReminderRuleKey;
  reminderType: ReminderType;
  reminderLogType: ReminderLogType;
  dedupeHours: number;
  escalate: boolean;
};

type ReminderRecipient = {
  userId?: string;
  email?: string;
  displayName: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  pushSubscriptions: EligibleReminderItem["assignee"]["pushSubscriptions"];
};

type ReminderRunSummary = {
  processed: number;
  sent: number;
  skippedDedupe: number;
  failed: number;
  byRule: Record<ReminderRuleKey, number>;
  escalations: {
    toLead: number;
    toFallbackEmail: number;
  };
  digests: {
    generated: number;
    generatedAt: string;
  };
};

function activeStatusesForReminder() {
  return [ActionStatus.OPEN, ActionStatus.TODO, ActionStatus.IN_PROGRESS, ActionStatus.BLOCKED];
}

function overdueHours(dueDate: Date, now: Date): number {
  return (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60);
}

function classifyReminderRule(item: EligibleReminderItem, now: Date, lookAhead: Date): ReminderRule | null {
  if (item.dueDate >= now && item.dueDate <= lookAhead) {
    return {
      key: "DUE_SOON",
      reminderType: ReminderType.UPCOMING,
      reminderLogType: ReminderLogType.DUE_SOON,
      dedupeHours: Math.max(1, env.reminderDedupeHours),
      escalate: false
    };
  }

  if (item.dueDate >= now) {
    return null;
  }

  const hours = overdueHours(item.dueDate, now);
  if (hours >= env.reminderOverdueEscalateAfterHours) {
    return {
      key: "OVERDUE_ESCALATE",
      reminderType: ReminderType.OVERDUE,
      reminderLogType: ReminderLogType.OVERDUE_ESCALATE,
      dedupeHours: Math.max(1, env.reminderOverdueEscalateIntervalHours),
      escalate: true
    };
  }

  if (hours >= env.reminderOverdueShortAfterHours) {
    return {
      key: "OVERDUE_SHORT",
      reminderType: ReminderType.OVERDUE,
      reminderLogType: ReminderLogType.OVERDUE_SHORT,
      dedupeHours: Math.max(1, env.reminderOverdueShortIntervalHours),
      escalate: false
    };
  }

  return {
    key: "OVERDUE",
    reminderType: ReminderType.OVERDUE,
    reminderLogType: ReminderLogType.OVERDUE,
    dedupeHours: Math.max(1, env.reminderDedupeHours),
    escalate: false
  };
}

function buildOwnerMessage(item: EligibleReminderItem, rule: ReminderRule, now: Date): string {
  if (rule.key === "DUE_SOON") {
    return `Upcoming task: ${item.task} (project ${item.meeting.projectId}) due at ${item.dueDate.toISOString()}.`;
  }

  const hours = overdueHours(item.dueDate, now);
  if (rule.key === "OVERDUE_ESCALATE") {
    return `Escalated overdue task: ${item.task} in meeting ${item.meeting.title}. Overdue for ${Math.floor(hours)} hours (due ${item.dueDate.toISOString()}).`;
  }

  if (rule.key === "OVERDUE_SHORT") {
    return `Follow-up overdue task: ${item.task} in meeting ${item.meeting.title}. Overdue for ${Math.floor(hours)} hours.`;
  }

  return `Overdue task: ${item.task} (due ${item.dueDate.toISOString()}).`;
}

function buildLeadEscalationMessage(item: EligibleReminderItem, now: Date): string {
  const hours = overdueHours(item.dueDate, now);
  return [
    `Escalation notice: ${item.task}`,
    `owner: ${item.assignee.name}`,
    `meeting: ${item.meeting.title}`,
    `projectId: ${item.meeting.projectId}`,
    `due: ${item.dueDate.toISOString()}`,
    `overdueHours: ${Math.floor(hours)}`
  ].join(" | ");
}

function toRecipientFromUser(user: {
  id: string;
  email: string;
  name: string;
  notificationSetting: {
    inAppEnabled: boolean;
    emailEnabled: boolean;
    pushEnabled: boolean;
  } | null;
  pushSubscriptions: EligibleReminderItem["assignee"]["pushSubscriptions"];
}): ReminderRecipient {
  return {
    userId: user.id,
    email: user.email,
    displayName: user.name,
    inAppEnabled: user.notificationSetting?.inAppEnabled ?? true,
    emailEnabled: user.notificationSetting?.emailEnabled ?? false,
    pushEnabled: user.notificationSetting?.pushEnabled ?? false,
    pushSubscriptions: user.pushSubscriptions
  };
}

async function wasRecentlyReminded(
  actionItemId: string,
  reminderType: ReminderLogType,
  recipient: { userId?: string; displayName: string },
  dedupeHours: number,
  now: Date
) {
  const dedupeSince = new Date(now.getTime() - dedupeHours * 60 * 60 * 1000);

  const where: {
    actionItemId: string;
    reminderType: ReminderLogType;
    sentAt: { gte: Date };
    sentToUserId?: string;
    sentToDisplayName?: string;
  } = {
    actionItemId,
    reminderType,
    sentAt: { gte: dedupeSince }
  };

  if (recipient.userId) {
    where.sentToUserId = recipient.userId;
  } else {
    where.sentToDisplayName = recipient.displayName;
  }

  const existing = await prisma.reminderLog.findFirst({ where });
  return Boolean(existing);
}

async function writeReminderLog(input: {
  actionItemId: string;
  reminderType: ReminderLogType;
  recipient: { userId?: string; displayName: string };
  message: string;
  deliveryStatus: "SENT" | "SKIPPED" | "FAILED";
  channelMeta: unknown;
}) {
  await prisma.reminderLog.create({
    data: {
      actionItemId: input.actionItemId,
      reminderType: input.reminderType,
      sentToUserId: input.recipient.userId,
      sentToDisplayName: input.recipient.displayName,
      message: input.message,
      deliveryStatus: input.deliveryStatus,
      channelMetaJson: input.channelMeta as Prisma.InputJsonValue,
      sentAt: new Date()
    }
  });
}

const leadRecipientCache = new Map<string, ReminderRecipient | null>();

async function resolveProjectLeadRecipient(projectId: string, ownerUserId: string) {
  if (leadRecipientCache.has(projectId)) {
    return leadRecipientCache.get(projectId);
  }

  const leadMeeting = await prisma.meeting.findFirst({
    where: {
      projectId,
      createdById: { not: ownerUserId },
      createdBy: {
        role: {
          in: [UserRole.ADMIN, UserRole.PM]
        }
      }
    },
    orderBy: { sessionAt: "desc" },
    select: {
      createdBy: {
        select: {
          id: true,
          email: true,
          name: true,
          notificationSetting: true,
          pushSubscriptions: true
        }
      }
    }
  });

  const recipient = leadMeeting ? toRecipientFromUser(leadMeeting.createdBy) : null;
  leadRecipientCache.set(projectId, recipient);
  return recipient;
}

async function sendToRecipient(
  item: EligibleReminderItem,
  recipient: ReminderRecipient,
  rule: ReminderRule,
  message: string
) {
  const result = await dispatchReminder({
    actionItemId: item.id,
    task: item.task,
    recipientUserId: recipient.userId,
    recipientEmail: recipient.email,
    recipientName: recipient.displayName,
    pushSubscriptions: recipient.pushSubscriptions,
    inAppEnabled: recipient.inAppEnabled,
    emailEnabled: recipient.emailEnabled,
    pushEnabled: recipient.pushEnabled,
    reminderType: rule.reminderType,
    message
  });

  await writeReminderLog({
    actionItemId: item.id,
    reminderType: rule.reminderLogType,
    recipient,
    message,
    deliveryStatus: result.deliveryStatus,
    channelMeta: {
      ...result.channelMeta,
      rule: rule.key
    }
  });

  return result;
}

async function processReminders() {
  const runStartMs = Date.now();
  const now = new Date();
  const lookAhead = new Date(now.getTime() + env.reminderLookAheadHours * 60 * 60 * 1000);

  const items = await prisma.actionItem.findMany({
    where: {
      minuteVersionId: { not: null },
      status: { in: activeStatusesForReminder() },
      dueDate: { lte: lookAhead }
    },
    include: {
      meeting: {
        select: {
          id: true,
          title: true,
          projectId: true
        }
      },
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          notificationSetting: true,
          pushSubscriptions: true
        }
      }
    }
  });

  const summary: ReminderRunSummary = {
    processed: 0,
    sent: 0,
    skippedDedupe: 0,
    failed: 0,
    byRule: {
      DUE_SOON: 0,
      OVERDUE: 0,
      OVERDUE_SHORT: 0,
      OVERDUE_ESCALATE: 0
    },
    escalations: {
      toLead: 0,
      toFallbackEmail: 0
    },
    digests: {
      generated: 0,
      generatedAt: now.toISOString()
    }
  };

  for (const item of items) {
    const rule = classifyReminderRule(item, now, lookAhead);
    if (!rule) {
      continue;
    }

    summary.processed += 1;
    summary.byRule[rule.key] += 1;

    const ownerRecipient = toRecipientFromUser(item.assignee);
    const ownerDeduped = await wasRecentlyReminded(
      item.id,
      rule.reminderLogType,
      { userId: ownerRecipient.userId, displayName: ownerRecipient.displayName },
      rule.dedupeHours,
      now
    );

    if (ownerDeduped) {
      summary.skippedDedupe += 1;
      continue;
    }

    const ownerMessage = buildOwnerMessage(item, rule, now);
    const ownerResult = await sendToRecipient(item, ownerRecipient, rule, ownerMessage);
    if (ownerResult.deliveryStatus === "SENT") {
      summary.sent += 1;
    } else if (ownerResult.deliveryStatus === "FAILED") {
      summary.failed += 1;
    }

    if (!rule.escalate) {
      continue;
    }

    const leadRecipient = await resolveProjectLeadRecipient(item.meeting.projectId, item.assigneeId);
    const escalationMessage = buildLeadEscalationMessage(item, now);

    if (leadRecipient && leadRecipient.userId !== item.assigneeId) {
      const leadDeduped = await wasRecentlyReminded(
        item.id,
        rule.reminderLogType,
        { userId: leadRecipient.userId, displayName: leadRecipient.displayName },
        rule.dedupeHours,
        now
      );

      if (!leadDeduped) {
        const leadResult = await sendToRecipient(item, leadRecipient, rule, escalationMessage);
        summary.escalations.toLead += 1;
        if (leadResult.deliveryStatus === "SENT") {
          summary.sent += 1;
        } else if (leadResult.deliveryStatus === "FAILED") {
          summary.failed += 1;
        }
      }
      continue;
    }

    if (env.reminderEscalationFallbackEmail) {
      const fallbackRecipient = {
        displayName: env.reminderEscalationFallbackEmail
      };

      const fallbackDeduped = await wasRecentlyReminded(
        item.id,
        rule.reminderLogType,
        fallbackRecipient,
        rule.dedupeHours,
        now
      );

      if (fallbackDeduped) {
        continue;
      }

      let deliveryStatus: "SENT" | "FAILED" = "SENT";
      try {
        const sent = await sendReminderEmail({
          to: env.reminderEscalationFallbackEmail,
          subject: `[AI Centralize] Escalation: Overdue Task ${item.task}`,
          message: escalationMessage
        });
        if (!sent) {
          deliveryStatus = "FAILED";
        }
      } catch {
        deliveryStatus = "FAILED";
      }

      await writeReminderLog({
        actionItemId: item.id,
        reminderType: rule.reminderLogType,
        recipient: fallbackRecipient,
        message: escalationMessage,
        deliveryStatus,
        channelMeta: {
          inApp: "disabled",
          email: deliveryStatus === "SENT" ? "sent" : "failed",
          push: "disabled",
          rule: rule.key,
          recipientType: "fallback-email"
        }
      });

      summary.escalations.toFallbackEmail += 1;
      if (deliveryStatus === "SENT") {
        summary.sent += 1;
      } else {
        summary.failed += 1;
      }
    }
  }

  const digestResult = await generateReminderDigests(now);
  summary.digests = digestResult;

  await logAiRun({
    operation: "REMINDER_RUN",
    status: "SUCCESS",
    promptVersion: "reminder-worker-v2",
    durationMs: Date.now() - runStartMs,
    trace: summary
  });

  return summary;
}

export function startReminderScheduler() {
  cron.schedule(env.reminderCron, async () => {
    try {
      const summary = await processReminders();
      console.log("[REMINDER] Run summary", summary);
    } catch (error) {
      await logAiRun({
        operation: "REMINDER_RUN",
        status: "FAILED",
        promptVersion: "reminder-worker-v2",
        errorMessage: error instanceof Error ? error.message : "unknown reminder scheduler error"
      });
      console.error("Reminder scheduler failed", error);
    }
  });

  console.log(`[REMINDER] Scheduler started with cron ${env.reminderCron}`);
}

export async function runReminderNow() {
  return processReminders();
}
