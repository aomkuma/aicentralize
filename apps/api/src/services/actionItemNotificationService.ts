import { ReminderType } from "@prisma/client";
import { APP_DISPLAY_NAME } from "../config/brand";
import { prisma } from "../lib/prisma";
import { dispatchReminder } from "./reminderDispatchService";

type NotifyAssigneeInput = {
  actionItemId: string;
  recipientUserId?: string | null;
  actorUserId: string;
  reminderType: ReminderType;
  message: string;
  pushTitle: string;
  emailSubject: string;
  deepLinkPath: string;
};

async function loadRecipient(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      notificationSetting: true,
      pushSubscriptions: true
    }
  });
}

export async function notifyActionItemAssignee(input: NotifyAssigneeInput) {
  if (!input.recipientUserId || input.recipientUserId === input.actorUserId) {
    return;
  }

  const [recipient, actionItem] = await Promise.all([
    loadRecipient(input.recipientUserId),
    prisma.actionItem.findUnique({
      where: { id: input.actionItemId },
      select: { task: true }
    })
  ]);

  if (!recipient) {
    return;
  }

  const settings = recipient.notificationSetting ?? {
    inAppEnabled: true,
    emailEnabled: false,
    pushEnabled: false
  };

  await dispatchReminder({
    actionItemId: input.actionItemId,
    task: actionItem?.task ?? "Action item",
    recipientUserId: recipient.id,
    recipientEmail: recipient.email,
    recipientName: recipient.name,
    pushSubscriptions: recipient.pushSubscriptions,
    inAppEnabled: settings.inAppEnabled,
    emailEnabled: settings.emailEnabled,
    pushEnabled: settings.pushEnabled,
    reminderType: input.reminderType,
    message: input.message,
    pushTitle: input.pushTitle,
    emailSubject: input.emailSubject,
    deepLinkPath: input.deepLinkPath
  });
}

export async function notifyActionItemReassigned(params: {
  actionItemId: string;
  newAssigneeUserId: string;
  previousAssigneeUserId?: string | null;
  actorUserId: string;
  actorName: string;
  task: string;
  newAssigneeName: string;
}) {
  const deepLinkPath = `/action-items/${params.actionItemId}`;
  const message = `${params.actorName} reassigned "${params.task}" to you.`;

  await notifyActionItemAssignee({
    actionItemId: params.actionItemId,
    recipientUserId: params.newAssigneeUserId,
    actorUserId: params.actorUserId,
    reminderType: ReminderType.REASSIGNED,
    message,
    pushTitle: "Task reassigned to you",
    emailSubject: `[${APP_DISPLAY_NAME}] Task reassigned: ${params.task}`,
    deepLinkPath
  });

  if (params.previousAssigneeUserId && params.previousAssigneeUserId !== params.newAssigneeUserId) {
    await notifyActionItemAssignee({
      actionItemId: params.actionItemId,
      recipientUserId: params.previousAssigneeUserId,
      actorUserId: params.actorUserId,
      reminderType: ReminderType.REASSIGNED,
      message: `${params.actorName} reassigned "${params.task}" from you to ${params.newAssigneeName}.`,
      pushTitle: "Task reassigned",
      emailSubject: `[${APP_DISPLAY_NAME}] Task reassigned: ${params.task}`,
      deepLinkPath
    });
  }
}

export async function notifyActionItemDueDateChanged(params: {
  actionItemId: string;
  assigneeUserId?: string | null;
  actorUserId: string;
  actorName: string;
  task: string;
  previousDueDate: Date;
  nextDueDate: Date;
}) {
  const formatter = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const deepLinkPath = `/action-items/${params.actionItemId}`;
  const message = `${params.actorName} changed the due date for "${params.task}" from ${formatter.format(params.previousDueDate)} to ${formatter.format(params.nextDueDate)}.`;

  await notifyActionItemAssignee({
    actionItemId: params.actionItemId,
    recipientUserId: params.assigneeUserId,
    actorUserId: params.actorUserId,
    reminderType: ReminderType.DUE_DATE_CHANGED,
    message,
    pushTitle: "Task due date updated",
    emailSubject: `[${APP_DISPLAY_NAME}] Due date changed: ${params.task}`,
    deepLinkPath
  });
}

export async function notifyActionItemStatusChanged(params: {
  actionItemId: string;
  assigneeUserId?: string | null;
  actorUserId: string;
  actorName: string;
  task: string;
  fromStatus: string;
  toStatus: string;
}) {
  const deepLinkPath = `/action-items/${params.actionItemId}`;
  const message = `${params.actorName} changed the status of "${params.task}" from ${params.fromStatus} to ${params.toStatus}.`;

  await notifyActionItemAssignee({
    actionItemId: params.actionItemId,
    recipientUserId: params.assigneeUserId,
    actorUserId: params.actorUserId,
    reminderType: ReminderType.STATUS_CHANGED,
    message,
    pushTitle: "Task status updated",
    emailSubject: `[${APP_DISPLAY_NAME}] Status changed: ${params.task}`,
    deepLinkPath
  });
}

export async function notifyActionItemPriorityChanged(params: {
  actionItemId: string;
  assigneeUserId?: string | null;
  actorUserId: string;
  actorName: string;
  task: string;
  fromPriority: string;
  toPriority: string;
}) {
  const deepLinkPath = `/action-items/${params.actionItemId}`;
  const message = `${params.actorName} changed the priority of "${params.task}" from ${params.fromPriority} to ${params.toPriority}.`;

  await notifyActionItemAssignee({
    actionItemId: params.actionItemId,
    recipientUserId: params.assigneeUserId,
    actorUserId: params.actorUserId,
    reminderType: ReminderType.PRIORITY_CHANGED,
    message,
    pushTitle: "Task priority updated",
    emailSubject: `[${APP_DISPLAY_NAME}] Priority changed: ${params.task}`,
    deepLinkPath
  });
}
