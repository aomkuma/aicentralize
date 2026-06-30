import { PushSubscription } from "@prisma/client";
import webpush, { WebPushError } from "web-push";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

let webPushConfigured = false;

function canSendPush(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);
}

function ensureConfigured() {
  if (webPushConfigured || !canSendPush()) {
    return;
  }

  webpush.setVapidDetails(
    env.vapidSubject!,
    env.vapidPublicKey!,
    env.vapidPrivateKey!
  );
  webPushConfigured = true;
}

function toWebPushSubscription(subscription: PushSubscription): webpush.PushSubscription {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ? subscription.expirationTime.getTime() : null,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth
    }
  };
}

export type PushSendResult = {
  attempted: number;
  sent: number;
  failed: number;
  staleRemoved: number;
};

export async function sendPushMessage(params: {
  subscriptions: PushSubscription[];
  title: string;
  message: string;
  url?: string;
}): Promise<PushSendResult> {
  if (!params.subscriptions.length) {
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      staleRemoved: 0
    };
  }

  if (!canSendPush()) {
    console.log("[PUSH] Skipped (VAPID keys are not configured)");
    return {
      attempted: params.subscriptions.length,
      sent: 0,
      failed: params.subscriptions.length,
      staleRemoved: 0
    };
  }

  ensureConfigured();

  const payload = JSON.stringify({
    title: params.title,
    body: params.message,
    url: params.url ?? "/"
  });

  let staleRemoved = 0;

  const results = await Promise.allSettled(
    params.subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(subscription), payload);
        return true;
      } catch (error) {
        const webPushError = error as WebPushError;
        if (webPushError.statusCode === 404 || webPushError.statusCode === 410) {
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: subscription.endpoint }
          });
          staleRemoved += 1;
          console.log("[PUSH] Removed stale subscription", subscription.endpoint);
        } else {
          console.error("[PUSH] Failed to send push", webPushError.message);
        }
        return false;
      }
    })
  );

  const sent = results.filter((result) => result.status === "fulfilled" && result.value).length;
  const attempted = params.subscriptions.length;
  const failed = attempted - sent;

  if (sent > 0) {
    console.log(`[PUSH] Sent ${sent} push message(s): ${params.title}`);
  }

  return {
    attempted,
    sent,
    failed,
    staleRemoved
  };
}

export async function sendPushReminder(params: {
  subscriptions: PushSubscription[];
  title: string;
  message: string;
  url?: string;
}): Promise<boolean> {
  const result = await sendPushMessage(params);
  return result.sent > 0;
}
