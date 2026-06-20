import { ActionStatus, ReminderType } from "@prisma/client";
import cron from "node-cron";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { sendReminderEmail } from "./emailService";
import { sendPushReminder } from "./pushService";

async function processReminders() {
  const now = new Date();
  const lookAhead = new Date(now.getTime() + env.reminderLookAheadHours * 60 * 60 * 1000);

  const upcoming = await prisma.actionItem.findMany({
    where: {
      status: { not: ActionStatus.DONE },
      dueDate: { gte: now, lte: lookAhead }
    },
    include: {
      assignee: {
        include: {
          notificationSetting: true,
          pushSubscriptions: true
        }
      }
    }
  });

  const overdue = await prisma.actionItem.findMany({
    where: {
      status: { not: ActionStatus.DONE },
      dueDate: { lt: now }
    },
    include: {
      assignee: {
        include: {
          notificationSetting: true,
          pushSubscriptions: true
        }
      }
    }
  });

  for (const item of upcoming) {
    const existing = await prisma.notification.findFirst({
      where: {
        actionItemId: item.id,
        userId: item.assigneeId,
        type: ReminderType.UPCOMING
      }
    });

    if (!existing) {
      const inAppEnabled = item.assignee.notificationSetting?.inAppEnabled ?? true;
      const emailEnabled = item.assignee.notificationSetting?.emailEnabled ?? false;
      const pushEnabled = item.assignee.notificationSetting?.pushEnabled ?? false;
      if (!inAppEnabled && !emailEnabled && !pushEnabled) {
        continue;
      }

      const message = `Upcoming due task: ${item.task} at ${item.dueDate.toISOString()}`;
      if (inAppEnabled) {
        await prisma.notification.create({
          data: {
            actionItemId: item.id,
            userId: item.assigneeId,
            type: ReminderType.UPCOMING,
            message
          }
        });
      }

      if (emailEnabled) {
        try {
          const sent = await sendReminderEmail({
            to: item.assignee.email,
            subject: `[AI Centralize] Upcoming Task: ${item.task}`,
            message
          });
          if (!sent) {
            console.log("[EMAIL] Skipped (SMTP not configured)");
          }
        } catch (error) {
          console.error("[EMAIL] Failed to send upcoming reminder", error);
        }
      }

      if (pushEnabled) {
        await sendPushReminder({
          subscriptions: item.assignee.pushSubscriptions,
          title: "Upcoming Task",
          message
        });
      }

      console.log(`[REMINDER] UPCOMING -> ${item.assignee.email}: ${item.task}`);
    }
  }

  for (const item of overdue) {
    const existing = await prisma.notification.findFirst({
      where: {
        actionItemId: item.id,
        userId: item.assigneeId,
        type: ReminderType.OVERDUE
      }
    });

    if (!existing) {
      const inAppEnabled = item.assignee.notificationSetting?.inAppEnabled ?? true;
      const emailEnabled = item.assignee.notificationSetting?.emailEnabled ?? false;
      const pushEnabled = item.assignee.notificationSetting?.pushEnabled ?? false;
      if (!inAppEnabled && !emailEnabled && !pushEnabled) {
        continue;
      }

      const message = `Overdue task: ${item.task} (due ${item.dueDate.toISOString()})`;
      if (inAppEnabled) {
        await prisma.notification.create({
          data: {
            actionItemId: item.id,
            userId: item.assigneeId,
            type: ReminderType.OVERDUE,
            message
          }
        });
      }

      if (emailEnabled) {
        try {
          const sent = await sendReminderEmail({
            to: item.assignee.email,
            subject: `[AI Centralize] Overdue Task: ${item.task}`,
            message
          });
          if (!sent) {
            console.log("[EMAIL] Skipped (SMTP not configured)");
          }
        } catch (error) {
          console.error("[EMAIL] Failed to send overdue reminder", error);
        }
      }

      if (pushEnabled) {
        await sendPushReminder({
          subscriptions: item.assignee.pushSubscriptions,
          title: "Overdue Task",
          message
        });
      }

      console.log(`[REMINDER] OVERDUE -> ${item.assignee.email}: ${item.task}`);
    }
  }
}

export function startReminderScheduler() {
  cron.schedule(env.reminderCron, async () => {
    try {
      await processReminders();
    } catch (error) {
      console.error("Reminder scheduler failed", error);
    }
  });

  console.log(`[REMINDER] Scheduler started with cron ${env.reminderCron}`);
}

export async function runReminderNow() {
  await processReminders();
}
