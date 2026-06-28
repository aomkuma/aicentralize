import { Router } from "express";
import { SystemRole } from "@prisma/client";
import webpush from "web-push";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSystemRole } from "../middleware/auth";
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

notificationRouter.get("/push/sw.js", (_req, res) => {
  res.type("application/javascript").send(`self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : { title: "AI Centralize", body: "New notification" };
  const title = payload && payload.title ? payload.title : "AI Centralize";
  const body = payload && payload.body ? payload.body : "New notification";

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/favicon.ico"
  }));
});`);
});

notificationRouter.post("/push/generate-vapid", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
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

notificationRouter.post("/push/broadcast", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
            display: ["Sora", "Plus Jakarta Sans", "ui-sans-serif", "sans-serif"]
          },
          colors: {
            deep: "#13233f"
          }
        }
      }
    };
  </script>
  <style>
    body {
      background:
        radial-gradient(70vw 50vh at -10% 20%, rgba(136, 219, 180, 0.36), transparent 65%),
        radial-gradient(60vw 40vh at 108% 18%, rgba(147, 191, 255, 0.30), transparent 65%),
        linear-gradient(180deg, #f9fcff 0%, #f4f9ff 42%, #eef6f8 100%);
    }
    .glass {
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(8px);
    }
  </style>
</head>
<body class="font-sans text-deep antialiased">
  <main class="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
    <header class="glass rounded-2xl border border-white/70 px-5 py-3 shadow-card sm:px-7">
      <div class="flex items-center justify-between gap-3">
        <a href="/" class="flex items-center gap-3">
          <div class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 text-lg font-extrabold text-white">A</div>
          <div>
            <p class="font-display text-lg font-bold tracking-tight">AI Centralize</p>
            <p class="text-xs text-slate-500">AI workspace for modern teams</p>
          </div>
        </a>

        <nav class="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
          <a href="/#features" class="transition hover:text-blue-600">Features</a>
          <a href="/#workflow" class="transition hover:text-blue-600">Workflow</a>
          <a href="/docs" class="transition hover:text-blue-600">API Docs</a>
          <a href="/health" class="transition hover:text-blue-600">Health</a>
        </nav>

        <div class="flex items-center gap-2 sm:gap-3">
          <a href="/auth/login" class="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 sm:inline">Log in</a>
          <a href="/ai/playground/page" class="hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] sm:inline-block">Get Started</a>
          <button id="menuToggle" type="button" class="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 md:hidden" aria-controls="mobileMenu" aria-expanded="false" aria-label="Open navigation menu">
            <svg id="menuIconOpen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg id="menuIconClose" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div id="mobileMenu" class="mt-3 hidden rounded-xl border border-slate-200 bg-white p-3 md:hidden">
        <nav class="grid gap-2 text-sm font-semibold text-slate-700">
          <a href="/#features" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Features</a>
          <a href="/#workflow" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Workflow</a>
          <a href="/docs" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">API Docs</a>
          <a href="/health" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Health</a>
          <a href="/auth/login" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Log in</a>
          <a href="/ai/playground/page" class="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-center text-white">Get Started</a>
        </nav>
      </div>
    </header>

    <section class="mt-4">
      <h1 class="font-display text-2xl font-extrabold">Push Broadcast</h1>
      <p class="mt-1 text-sm text-slate-500">Admin tool for one-shot push announcements to subscribed devices.</p>
    </section>

    <section class="mt-4">
    <section class="glass rounded-2xl border border-white/80 p-6 shadow-2xl sm:p-7">
      <div class="grid gap-3">
        <label class="text-sm font-semibold text-slate-600" for="token">Admin bearer token</label>
        <input id="token" type="text" placeholder="Paste admin JWT token" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />

        <label class="text-sm font-semibold text-slate-600" for="title">Title</label>
        <input id="title" type="text" placeholder="System announcement" maxlength="120" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />

        <label class="text-sm font-semibold text-slate-600" for="message">Message</label>
        <textarea id="message" placeholder="Write broadcast message here" maxlength="500" class="min-h-[130px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"></textarea>

        <label class="text-sm font-semibold text-slate-600" for="userIds">User IDs (optional, comma-separated)</label>
        <input id="userIds" type="text" placeholder="Leave empty to target all subscribed users" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />

        <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><input id="onlyPushEnabled" type="checkbox" checked /> Target only users with pushEnabled setting</label>

        <div class="mt-1 flex flex-wrap gap-2">
          <button id="send" class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Send Broadcast</button>
        </div>

        <div id="status" class="min-h-[1.2em] whitespace-pre-wrap pt-1 text-sm text-rose-600"></div>
      </div>
    </section>
    </section>
  </main>

  <script>
    const menuToggleEl = document.getElementById("menuToggle");
    const mobileMenuEl = document.getElementById("mobileMenu");
    const menuIconOpenEl = document.getElementById("menuIconOpen");
    const menuIconCloseEl = document.getElementById("menuIconClose");

    if (menuToggleEl && mobileMenuEl && menuIconOpenEl && menuIconCloseEl) {
      const setOpen = (open) => {
        mobileMenuEl.classList.toggle("hidden", !open);
        menuIconOpenEl.classList.toggle("hidden", open);
        menuIconCloseEl.classList.toggle("hidden", !open);
        menuToggleEl.setAttribute("aria-expanded", String(open));
      };

      setOpen(false);
      menuToggleEl.addEventListener("click", () => {
        const isOpen = !mobileMenuEl.classList.contains("hidden");
        setOpen(!isOpen);
      });
    }

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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
            display: ["Sora", "Plus Jakarta Sans", "ui-sans-serif", "sans-serif"]
          },
          colors: {
            deep: "#13233f"
          }
        }
      }
    };
  </script>
  <style>
    body {
      background:
        radial-gradient(70vw 50vh at -10% 20%, rgba(136, 219, 180, 0.36), transparent 65%),
        radial-gradient(60vw 40vh at 108% 18%, rgba(147, 191, 255, 0.30), transparent 65%),
        linear-gradient(180deg, #f9fcff 0%, #f4f9ff 42%, #eef6f8 100%);
    }
    .glass {
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(8px);
    }
  </style>
</head>
<body class="font-sans text-deep antialiased">
  <main class="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
    <header class="glass rounded-2xl border border-white/70 px-5 py-3 shadow-card sm:px-7">
      <div class="flex items-center justify-between gap-3">
        <a href="/" class="flex items-center gap-3">
          <div class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 text-lg font-extrabold text-white">A</div>
          <div>
            <p class="font-display text-lg font-bold tracking-tight">AI Centralize</p>
            <p class="text-xs text-slate-500">AI workspace for modern teams</p>
          </div>
        </a>

        <nav class="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
          <a href="/#features" class="transition hover:text-blue-600">Features</a>
          <a href="/#workflow" class="transition hover:text-blue-600">Workflow</a>
          <a href="/docs" class="transition hover:text-blue-600">API Docs</a>
          <a href="/health" class="transition hover:text-blue-600">Health</a>
        </nav>

        <div class="flex items-center gap-2 sm:gap-3">
          <a href="/auth/login" class="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 sm:inline">Log in</a>
          <a href="/ai/playground/page" class="hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] sm:inline-block">Get Started</a>
          <button id="menuToggle" type="button" class="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 md:hidden" aria-controls="mobileMenu" aria-expanded="false" aria-label="Open navigation menu">
            <svg id="menuIconOpen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg id="menuIconClose" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div id="mobileMenu" class="mt-3 hidden rounded-xl border border-slate-200 bg-white p-3 md:hidden">
        <nav class="grid gap-2 text-sm font-semibold text-slate-700">
          <a href="/#features" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Features</a>
          <a href="/#workflow" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Workflow</a>
          <a href="/docs" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">API Docs</a>
          <a href="/health" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Health</a>
          <a href="/auth/login" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Log in</a>
          <a href="/ai/playground/page" class="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-center text-white">Get Started</a>
        </nav>
      </div>
    </header>

    <section class="mt-4">
      <h1 class="font-display text-2xl font-extrabold">Notification Settings</h1>
      <p class="mt-1 text-sm text-slate-500">Default behavior is in-app enabled and email disabled.</p>
    </section>

    <section class="mt-4">
    <section class="glass rounded-2xl border border-white/80 p-6 shadow-2xl sm:p-7">
      <div class="space-y-3">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Session</p>
          <p id="sessionInfo" class="mt-1 text-sm text-slate-600">Checking local device session...</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <a href="/auth/login" class="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50">Open Login</a>
            <button id="clearSession" type="button" class="rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50">Clear Session On This Device</button>
          </div>
        </div>

        <details class="rounded-xl border border-slate-200 bg-white p-3">
          <summary class="cursor-pointer text-sm font-semibold text-slate-700">Advanced: override access token</summary>
          <input id="token" type="text" placeholder="Paste Bearer token (optional override)" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
        </details>

        <div class="flex flex-wrap gap-2">
          <button id="load" class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Load Current Settings</button>
          <button id="save" class="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Save Settings</button>
        </div>

        <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><input id="inAppEnabled" type="checkbox" /> In-app notifications</label>
        <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><input id="emailEnabled" type="checkbox" /> Email notifications</label>
        <label class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"><input id="pushEnabled" type="checkbox" /> Push notifications (reserved for PWA)</label>

        <div class="flex flex-wrap gap-2">
          <button id="subscribePush" class="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50">Register Push For This Browser</button>
          <button id="unsubscribePush" class="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50">Remove Push From This Browser</button>
        </div>

        <div id="status" class="min-h-[1.2em] pt-1 text-sm text-slate-600"></div>
      </div>
    </section>
    </section>
  </main>

  <script>
    const menuToggleEl = document.getElementById("menuToggle");
    const mobileMenuEl = document.getElementById("mobileMenu");
    const menuIconOpenEl = document.getElementById("menuIconOpen");
    const menuIconCloseEl = document.getElementById("menuIconClose");

    if (menuToggleEl && mobileMenuEl && menuIconOpenEl && menuIconCloseEl) {
      const setOpen = (open) => {
        mobileMenuEl.classList.toggle("hidden", !open);
        menuIconOpenEl.classList.toggle("hidden", open);
        menuIconCloseEl.classList.toggle("hidden", !open);
        menuToggleEl.setAttribute("aria-expanded", String(open));
      };

      setOpen(false);
      menuToggleEl.addEventListener("click", () => {
        const isOpen = !mobileMenuEl.classList.contains("hidden");
        setOpen(!isOpen);
      });
    }

    const tokenEl = document.getElementById("token");
    const inAppEl = document.getElementById("inAppEnabled");
    const emailEl = document.getElementById("emailEnabled");
    const pushEl = document.getElementById("pushEnabled");
    const statusEl = document.getElementById("status");
    const sessionInfoEl = document.getElementById("sessionInfo");
    const ACCESS_KEY = "aicentralize_token";
    const REFRESH_KEY = "aicentralize_refresh_token";

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

    function getAccessToken() {
      return (tokenEl.value || localStorage.getItem(ACCESS_KEY) || "").trim();
    }

    function setAccessToken(token) {
      if (!token) return;
      localStorage.setItem(ACCESS_KEY, token);
      tokenEl.value = token;
      refreshSessionInfo();
    }

    function refreshSessionInfo() {
      const hasAccess = !!(localStorage.getItem(ACCESS_KEY) || "").trim();
      const hasRefresh = !!(localStorage.getItem(REFRESH_KEY) || "").trim();
      if (!sessionInfoEl) return;
      if (hasRefresh) {
        sessionInfoEl.textContent = "Active device session found (auto refresh enabled).";
      } else if (hasAccess) {
        sessionInfoEl.textContent = "Access token found, but no refresh token. Login again for persistent session.";
      } else {
        sessionInfoEl.textContent = "No local session. Please login first.";
      }
    }

    async function refreshAccessToken() {
      const refreshToken = (localStorage.getItem(REFRESH_KEY) || "").trim();
      if (!refreshToken) {
        throw new Error("Session expired. Please login again.");
      }

      const response = await fetch("/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });

      const data = await response.json();
      if (!response.ok || !data.token || !data.refreshToken) {
        throw new Error("Session expired. Please login again.");
      }

      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      setAccessToken(data.token);
      return data.token;
    }

    async function request(path, method = "GET", body, isRetry = false) {
      const token = getAccessToken();
      if (!token) {
        throw new Error("Please login first at /auth/login");
      }

      const response = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (response.status === 401 && !isRetry) {
        await refreshAccessToken();
        return request(path, method, body, true);
      }

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
        if (!getAccessToken() && !localStorage.getItem(REFRESH_KEY)) {
          throw new Error("Please login first at /auth/login");
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

        const registration = await navigator.serviceWorker.register("/notifications/push/sw.js");

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

    document.getElementById("clearSession").addEventListener("click", async () => {
      try {
        const refreshToken = (localStorage.getItem(REFRESH_KEY) || "").trim();
        if (refreshToken) {
          await fetch("/auth/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken })
          });
        }
      } finally {
        localStorage.removeItem(ACCESS_KEY);
        localStorage.removeItem(REFRESH_KEY);
        tokenEl.value = "";
        refreshSessionInfo();
        setStatus("Local session cleared.");
      }
    });

    tokenEl.value = localStorage.getItem(ACCESS_KEY) || "";
    refreshSessionInfo();

    if (getAccessToken()) {
      document.getElementById("load").click();
    }
  </script>
</body>
</html>`);
});
