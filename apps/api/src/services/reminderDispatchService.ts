import { PushSubscription, ReminderType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sendReminderEmail } from "./emailService";
import { sendPushReminder } from "./pushService";

type DispatchReminderInput = {
  actionItemId: string;
  task: string;
  recipientUserId?: string;
  recipientEmail?: string;
  recipientName: string;
  pushSubscriptions?: PushSubscription[];
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  reminderType: ReminderType;
  message: string;
};

type DispatchReminderResult = {
  sent: boolean;
  deliveryStatus: "SENT" | "SKIPPED" | "FAILED";
  channelMeta: {
    inApp: "sent" | "disabled" | "failed";
    email: "sent" | "disabled" | "failed";
    push: "sent" | "disabled" | "failed";
  };
};

export async function dispatchReminder(input: DispatchReminderInput): Promise<DispatchReminderResult> {
  const channelMeta: DispatchReminderResult["channelMeta"] = {
    inApp: "disabled",
    email: "disabled",
    push: "disabled"
  };

  if (!input.inAppEnabled && !input.emailEnabled && !input.pushEnabled) {
    return {
      sent: false,
      deliveryStatus: "SKIPPED",
      channelMeta
    };
  }

  let hasAnySent = false;

  if (input.inAppEnabled && input.recipientUserId) {
    try {
      await prisma.notification.create({
        data: {
          actionItemId: input.actionItemId,
          userId: input.recipientUserId,
          type: input.reminderType,
          message: input.message
        }
      });
      channelMeta.inApp = "sent";
      hasAnySent = true;
    } catch {
      channelMeta.inApp = "failed";
    }
  }

  if (input.emailEnabled && input.recipientEmail) {
    try {
      const sent = await sendReminderEmail({
        to: input.recipientEmail,
        subject: `[AI Centralize] ${input.reminderType === "UPCOMING" ? "Upcoming" : "Overdue"} Task: ${input.task}`,
        message: input.message
      });
      channelMeta.email = sent ? "sent" : "failed";
      hasAnySent = hasAnySent || sent;
    } catch {
      channelMeta.email = "failed";
    }
  }

  if (input.pushEnabled && input.pushSubscriptions && input.pushSubscriptions.length > 0) {
    try {
      await sendPushReminder({
        subscriptions: input.pushSubscriptions,
        title: input.reminderType === "UPCOMING" ? "Upcoming Task" : "Overdue Task",
        message: input.message
      });
      channelMeta.push = "sent";
      hasAnySent = true;
    } catch {
      channelMeta.push = "failed";
    }
  }

  if (hasAnySent) {
    return {
      sent: true,
      deliveryStatus: "SENT",
      channelMeta
    };
  }

  const hasFailure = Object.values(channelMeta).includes("failed");
  return {
    sent: false,
    deliveryStatus: hasFailure ? "FAILED" : "SKIPPED",
    channelMeta
  };
}
