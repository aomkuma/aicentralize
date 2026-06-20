import { Router } from "express";
import { UserRole } from "@prisma/client";
import webpush from "web-push";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { sendPushMessage } from "../services/pushService";

export const notificationRouter = Router();

const updateSettingsSchema = z.object({
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional()
}).refine((data) => (
  data.inAppEnabled !== undefined ||
  data.emailEnabled !== undefined ||
  data.pushEnabled !== undefined
), {
  message: "At least one setting is required"
});

const upsertPushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  }),
  expirationTime: z.number().nullable().optional()
});

const deletePushSubscriptionSchema = z.object({
  endpoint: z.string().url()
});

const broadcastPushSchema = z.object({
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(500),
  userIds: z.array(z.string().min(1)).optional(),
  onlyPushEnabled: z.boolean().optional().default(true)
});

async function getOrCreateSettings(userId: string) {
  const existing = await prisma.notificationSetting.findUnique({
    where: { userId }
  });

  if (existing) {
    return existing;
  }

  return prisma.notificationSetting.create({
    data: {
      userId,
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false
    }
  });
}

notificationRouter.get("/me", requireAuth, async (req, res) => {
  const settings = await getOrCreateSettings(req.user!.id);
  if (!settings.inAppEnabled) {
    return res.json([]);
  }

  const items = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { sentAt: "desc" },
    include: {
      actionItem: {
        include: {
          meeting: true
        }
      }
    },
    take: 50
  });

  res.json(items);
});

notificationRouter.get("/settings/me", requireAuth, async (req, res) => {
  const settings = await getOrCreateSettings(req.user!.id);
  res.json(settings);
});

notificationRouter.patch("/settings/me", requireAuth, async (req, res) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const settings = await getOrCreateSettings(req.user!.id);
  const updated = await prisma.notificationSetting.update({
    where: { id: settings.id },
    data: parsed.data
  });

  res.json(updated);
});

notificationRouter.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: env.vapidPublicKey ?? null });
});

notificationRouter.post("/push/generate-vapid", requireAuth, requireRole([UserRole.ADMIN]), async (req, res) => {
  const keys = webpush.generateVAPIDKeys();

  res.json({
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: env.vapidSubject ?? "mailto:admin@your-org.local"
  });
});

notificationRouter.get("/push-subscriptions/me", requireAuth, async (req, res) => {
  const items = await prisma.pushSubscription.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" }
  });

  res.json(items);
});

notificationRouter.post("/push-subscriptions/me", requireAuth, async (req, res) => {
  const parsed = upsertPushSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const expirationTime = parsed.data.expirationTime == null
    ? null
    : new Date(parsed.data.expirationTime);

  const item = await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: {
      userId: req.user!.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      expirationTime
    },
    create: {
      userId: req.user!.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      expirationTime
    }
  });

  res.status(201).json(item);
});

notificationRouter.delete("/push-subscriptions/me", requireAuth, async (req, res) => {
  const parsed = deletePushSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  await prisma.pushSubscription.deleteMany({
    where: {
      userId: req.user!.id,
      endpoint: parsed.data.endpoint
    }
  });

  res.status(204).send();
});

notificationRouter.post("/push/broadcast", requireAuth, requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = broadcastPushSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const where: {
    userId?: { in: string[] };
    user?: { notificationSetting: { is: { pushEnabled: boolean } } };
  } = {};

  if (parsed.data.userIds?.length) {
    where.userId = { in: parsed.data.userIds };
  }

  if (parsed.data.onlyPushEnabled) {
    where.user = {
      notificationSetting: {
        is: { pushEnabled: true }
      }
    };
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where });
  const result = await sendPushMessage({
    subscriptions,
    title: parsed.data.title,
    message: parsed.data.message
  });

  const targetedUsers = new Set(subscriptions.map((item) => item.userId)).size;

  res.json({
    ...result,
    targetedUsers,
    requestedUsers: parsed.data.userIds?.length ?? null,
    onlyPushEnabled: parsed.data.onlyPushEnabled
  });
});

notificationRouter.get("/push/broadcast/page", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Push Broadcast</title>
  <style>
    :root {
      --bg: #ecf7f5;
      --panel: #ffffff;
      --accent: #0f766e;
      --text: #172026;
      --subtle: #5e6d74;
      --border: #cfe2de;
      --warn: #a44123;
    }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: var(--text);
      background: linear-gradient(135deg, #e5f4f0 0%, #f7fbfa 100%);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 18px;
    }
    .card {
      width: min(720px, 100%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 16px 36px rgba(7, 35, 31, 0.12);
      padding: 22px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 1.6rem;
    }
    p {
      margin: 0 0 14px;
      color: var(--subtle);
    }
    .grid {
      display: grid;
      gap: 10px;
    }
    label {
      font-weight: 600;
      font-size: 0.95rem;
    }
    input[type="text"], textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
    }
    textarea {
      min-height: 120px;
      resize: vertical;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    button {
      border: 0;
      border-radius: 9px;
      background: var(--accent);
      color: #fff;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
    }
    #status {
      min-height: 1.2em;
      color: var(--warn);
      margin-top: 8px;
      white-space: pre-wrap;
      font-size: 0.95rem;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Push Broadcast</h1>
    <p>Admin tool for sending one-shot push messages to subscribed devices.</p>

    <div class="grid">
      <label for="token">Admin bearer token</label>
      <input id="token" type="text" placeholder="Paste admin JWT token" />

      <label for="title">Title</label>
      <input id="title" type="text" placeholder="System announcement" maxlength="120" />

      <label for="message">Message</label>
      <textarea id="message" placeholder="Write broadcast message here" maxlength="500"></textarea>

      <label for="userIds">User IDs (optional, comma-separated)</label>
      <input id="userIds" type="text" placeholder="Leave empty to target all subscribed users" />

      <label class="check"><input id="onlyPushEnabled" type="checkbox" checked /> Target only users with pushEnabled setting</label>

      <div class="actions">
        <button id="send">Send Broadcast</button>
      </div>

      <div id="status"></div>
    </div>
  </main>

  <script>
    const tokenEl = document.getElementById("token");
    const titleEl = document.getElementById("title");
    const messageEl = document.getElementById("message");
    const userIdsEl = document.getElementById("userIds");
    const onlyPushEnabledEl = document.getElementById("onlyPushEnabled");
    const statusEl = document.getElementById("status");

    function setStatus(text) {
      statusEl.textContent = text;
    }

    document.getElementById("send").addEventListener("click", async () => {
      try {
        const token = tokenEl.value.trim();
        const title = titleEl.value.trim();
        const message = messageEl.value.trim();
        const rawIds = userIdsEl.value.trim();

        if (!token) {
          throw new Error("Admin token is required");
        }
        if (!title || !message) {
          throw new Error("Title and message are required");
        }

        const userIds = rawIds
          ? rawIds.split(",").map((item) => item.trim()).filter(Boolean)
          : undefined;

        setStatus("Sending broadcast...");

        const response = await fetch("/notifications/push/broadcast", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({
            title,
            message,
            userIds,
            onlyPushEnabled: !!onlyPushEnabledEl.checked
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Broadcast failed");
        }

        setStatus(
          "Broadcast sent\n"
          + "attempted: " + data.attempted + "\n"
          + "sent: " + data.sent + "\n"
          + "failed: " + data.failed + "\n"
          + "staleRemoved: " + data.staleRemoved + "\n"
          + "targetedUsers: " + data.targetedUsers
        );
      } catch (error) {
        setStatus(error.message || "Broadcast failed");
      }
    });
  </script>
</body>
</html>`);
});

notificationRouter.get("/settings/page", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Notification Settings</title>
  <style>
    :root {
      --bg: #f4f7f8;
      --panel: #ffffff;
      --accent: #0f766e;
      --text: #172026;
      --subtle: #6b7280;
      --border: #d8e2e7;
    }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      background: radial-gradient(circle at top right, #d6f0ec 0%, var(--bg) 55%);
      color: var(--text);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .card {
      width: min(560px, 100%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
      padding: 22px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 1.4rem;
    }
    p {
      margin: 0 0 16px;
      color: var(--subtle);
    }
    .row {
      margin-bottom: 12px;
    }
    label {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 10px;
    }
    input[type="text"] {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      box-sizing: border-box;
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      background: var(--accent);
      color: #fff;
      font-weight: 600;
      cursor: pointer;
    }
    .status {
      margin-top: 10px;
      color: var(--subtle);
      min-height: 1.2em;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Notification Settings</h1>
    <p>Default behavior is in-app enabled and email disabled.</p>

    <div class="row">
      <input id="token" type="text" placeholder="Paste Bearer token" />
    </div>

    <div class="row">
      <button id="load">Load Current Settings</button>
      <button id="save">Save Settings</button>
    </div>

    <div class="row">
      <label><input id="inAppEnabled" type="checkbox" /> In-app notifications</label>
    </div>
    <div class="row">
      <label><input id="emailEnabled" type="checkbox" /> Email notifications</label>
    </div>
    <div class="row">
      <label><input id="pushEnabled" type="checkbox" /> Push notifications (reserved for PWA)</label>
    </div>

    <div class="row">
      <button id="subscribePush">Register Push For This Browser</button>
      <button id="unsubscribePush">Remove Push From This Browser</button>
    </div>

    <div id="status" class="status"></div>
  </main>

  <script>
    const tokenEl = document.getElementById("token");
    const inAppEl = document.getElementById("inAppEnabled");
    const emailEl = document.getElementById("emailEnabled");
    const pushEl = document.getElementById("pushEnabled");
    const statusEl = document.getElementById("status");

    function urlBase64ToUint8Array(base64String) {
      const padding = "=".repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    const setStatus = (text) => { statusEl.textContent = text; };

    async function request(path, method = "GET", body) {
      const token = tokenEl.value.trim();
      if (!token) {
        throw new Error("Token is required");
      }

      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Request failed");
      }

      return response.json();
    }

    document.getElementById("load").addEventListener("click", async () => {
      try {
        setStatus("Loading settings...");
        const data = await request("/notifications/settings/me");
        inAppEl.checked = !!data.inAppEnabled;
        emailEl.checked = !!data.emailEnabled;
        pushEl.checked = !!data.pushEnabled;
        setStatus("Loaded");
      } catch (error) {
        setStatus(error.message || "Load failed");
      }
    });

    document.getElementById("save").addEventListener("click", async () => {
      try {
        setStatus("Saving...");
        await request("/notifications/settings/me", "PATCH", {
          inAppEnabled: inAppEl.checked,
          emailEnabled: emailEl.checked,
          pushEnabled: pushEl.checked
        });
        setStatus("Saved");
      } catch (error) {
        setStatus(error.message || "Save failed");
      }
    });

    document.getElementById("subscribePush").addEventListener("click", async () => {
      try {
        setStatus("Registering push subscription...");
        const token = tokenEl.value.trim();
        if (!token) {
          throw new Error("Token is required");
        }

        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          throw new Error("Push is not supported in this browser");
        }

        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          throw new Error("Notification permission not granted");
        }

        const vapidResponse = await fetch("/notifications/push/vapid-public-key");
        const vapidJson = await vapidResponse.json();
        if (!vapidJson.publicKey) {
          throw new Error("VAPID public key is not configured on server");
        }

        const swCode = "self.addEventListener('push', (event) => {\\n"
          + "  const data = event.data ? event.data.json() : { title: 'AI Centralize', body: 'New notification' };\\n"
          + "  event.waitUntil(self.registration.showNotification(data.title || 'AI Centralize', {\\n"
          + "    body: data.body || 'New notification',\\n"
          + "    icon: '/favicon.ico'\\n"
          + "  }));\\n"
          + "});";

        const swBlob = new Blob([swCode], { type: "application/javascript" });
        const swUrl = URL.createObjectURL(swBlob);
        const registration = await navigator.serviceWorker.register(swUrl);

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidJson.publicKey)
        });

        await request("/notifications/push-subscriptions/me", "POST", subscription.toJSON());
        setStatus("Push subscription registered");
      } catch (error) {
        setStatus(error.message || "Push subscribe failed");
      }
    });

    document.getElementById("unsubscribePush").addEventListener("click", async () => {
      try {
        setStatus("Removing push subscription...");
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;

        if (!subscription) {
          setStatus("No active browser subscription found");
          return;
        }

        await request("/notifications/push-subscriptions/me", "DELETE", {
          endpoint: subscription.endpoint
        });

        await subscription.unsubscribe();
        setStatus("Push subscription removed");
      } catch (error) {
        setStatus(error.message || "Push unsubscribe failed");
      }
    });
  </script>
</body>
</html>`);
});
