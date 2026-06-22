import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import fs from "node:fs";
import path from "node:path";
import {
  actionItemRouter,
  aiRouter,
  askAiRouter,
  authRouter,
  meetingRouter,
  minuteDraftRouter,
  notificationRouter,
  continuityRouter,
  observabilityRouter,
  projectRouter,
  reminderRouter,
  retrievalRouter,
  systemSettingsRouter,
  tenantRouter
} from "./routes";

export function createApp() {
  const app = express();

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https:"]
      }
    }
  }));
  app.use(cors());
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Centralize</title>
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
            deep: "#13233f",
            mint: "#14a37f",
            skysoft: "#ebf4ff"
          },
          boxShadow: {
            panel: "0 30px 80px rgba(19, 35, 63, 0.12)",
            card: "0 16px 35px rgba(19, 35, 63, 0.10)"
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
      backdrop-filter: blur(9px);
    }
    .hero-grid {
      background:
        linear-gradient(125deg, rgba(255, 255, 255, 0.95), rgba(247, 252, 255, 0.88));
    }
    .rise {
      animation: rise 0.7s ease both;
    }
    .rise-delay-1 { animation-delay: 0.08s; }
    .rise-delay-2 { animation-delay: 0.16s; }
    .rise-delay-3 { animation-delay: 0.24s; }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(14px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
</head>
<body class="font-sans text-deep antialiased">
  <div class="absolute inset-0 -z-10 overflow-hidden">
    <div class="absolute -left-8 top-24 h-44 w-44 rounded-full bg-green-200/55 blur-2xl"></div>
    <div class="absolute -right-6 top-40 h-56 w-56 rounded-full bg-blue-200/55 blur-3xl"></div>
    <div class="absolute left-1/2 top-[36rem] h-56 w-56 -translate-x-1/2 rounded-full bg-cyan-100/80 blur-3xl"></div>
  </div>

  <main class="mx-auto w-full max-w-[1180px] px-4 pb-14 pt-6 sm:px-6 lg:px-8">
    <header class="rise glass rounded-2xl border border-white/70 px-5 py-3 shadow-card sm:px-7">
      <div class="flex items-center justify-between gap-3">
        <a href="/" class="flex items-center gap-3">
          <div class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 text-lg font-extrabold text-white shadow-sm">A</div>
          <div>
            <p class="font-display text-lg font-bold tracking-tight">AI Centralize</p>
            <p class="text-xs text-slate-500">AI workspace for modern teams</p>
          </div>
        </a>

        <nav class="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
          <a href="#features" class="transition hover:text-blue-600">Features</a>
          <a href="#workflow" class="transition hover:text-blue-600">Workflow</a>
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
          <a href="#features" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Features</a>
          <a href="#workflow" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Workflow</a>
          <a href="/docs" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">API Docs</a>
          <a href="/health" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Health</a>
          <a href="/auth/login" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Log in</a>
          <a href="/ai/playground/page" class="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-center text-white">Get Started</a>
        </nav>
      </div>
    </header>

    <section class="hero-grid rise rise-delay-1 mt-6 overflow-hidden rounded-3xl border border-blue-100/70 shadow-panel">
      <div class="grid gap-8 p-6 lg:grid-cols-2 lg:gap-10 lg:p-9">
        <div>
          <div class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            AI workspace for modern teams
          </div>
          <h1 class="mt-5 font-display text-4xl font-extrabold leading-tight text-deep sm:text-5xl">
            Bring all your AI work
            <span class="block bg-gradient-to-r from-blue-500 to-mint bg-clip-text text-transparent">into one friendly place</span>
          </h1>
          <p class="mt-5 max-w-xl text-[17px] leading-relaxed text-slate-600">
            From meetings and documents to reminders and action items, AI Centralize helps your team stay organized and make better decisions.
          </p>

          <div class="mt-7 flex flex-wrap items-center gap-3">
            <a href="/ai/playground/page" class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Get Started Free</a>
            <a href="/docs" class="rounded-xl border border-blue-200 bg-white px-5 py-3 text-sm font-bold text-blue-600 transition hover:border-blue-400 hover:bg-blue-50">See how it works</a>
          </div>

          <div class="mt-8 grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-3">
            <div class="glass rounded-xl border border-white/80 px-3 py-2"><span class="font-bold text-blue-600">Summarize</span><br />meetings and docs</div>
            <div class="glass rounded-xl border border-white/80 px-3 py-2"><span class="font-bold text-emerald-600">Extract</span><br />insights and action</div>
            <div class="glass rounded-xl border border-white/80 px-3 py-2"><span class="font-bold text-indigo-600">Organize</span><br />knowledge and tasks</div>
          </div>
        </div>

        <div class="glass rounded-2xl border border-white/80 p-4 shadow-card sm:p-5">
          <div class="rounded-xl bg-white p-4 shadow-sm">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-slate-500">Good morning, Alex</p>
                <h3 class="font-display text-xl font-bold">Today's Overview</h3>
              </div>
              <span class="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Live</span>
            </div>
            <div class="mt-4 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-xl bg-blue-50 px-2 py-3"><p class="text-2xl font-extrabold text-blue-600">4</p><p class="text-xs text-slate-500">Meetings</p></div>
              <div class="rounded-xl bg-emerald-50 px-2 py-3"><p class="text-2xl font-extrabold text-emerald-600">12</p><p class="text-xs text-slate-500">Action items</p></div>
              <div class="rounded-xl bg-amber-50 px-2 py-3"><p class="text-2xl font-extrabold text-amber-600">8</p><p class="text-xs text-slate-500">Documents</p></div>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-[1.35fr_1fr]">
              <div class="rounded-xl border border-slate-200 p-3">
                <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Upcoming</p>
                <ul class="mt-2 space-y-2 text-sm text-slate-700">
                  <li class="flex justify-between"><span>9:00 Marketing Sync</span><span class="text-slate-400">now</span></li>
                  <li class="flex justify-between"><span>11:00 Product Review</span><span class="text-slate-400">2h</span></li>
                  <li class="flex justify-between"><span>14:00 Q2 Planning</span><span class="text-slate-400">5h</span></li>
                </ul>
              </div>
              <div class="rounded-xl bg-indigo-50 p-3">
                <p class="text-xs font-bold uppercase tracking-wide text-indigo-500">AI Suggestion</p>
                <p class="mt-2 text-sm text-slate-600">2 related documents can improve your next review quality.</p>
                <a href="/ai/playground/page" class="mt-3 inline-block text-xs font-bold text-indigo-600">View suggestions</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="features" class="rise rise-delay-2 mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <a href="/meetings" class="glass rounded-2xl border border-white/70 p-5 shadow-card transition hover:-translate-y-1">
        <p class="text-sm font-extrabold uppercase tracking-wide text-emerald-600">Meetings Made Simple</p>
        <p class="mt-2 text-sm leading-relaxed text-slate-600">AI summarizes conversations, extracts action items, and keeps everyone aligned.</p>
      </a>
      <a href="/projects" class="glass rounded-2xl border border-white/70 p-5 shadow-card transition hover:-translate-y-1">
        <p class="text-sm font-extrabold uppercase tracking-wide text-blue-600">Documents, Smarter</p>
        <p class="mt-2 text-sm leading-relaxed text-slate-600">Extract key insights and transform notes into clear actions and plans.</p>
      </a>
      <a href="/notifications/settings/page" class="glass rounded-2xl border border-white/70 p-5 shadow-card transition hover:-translate-y-1">
        <p class="text-sm font-extrabold uppercase tracking-wide text-indigo-600">Workflows That Work</p>
        <p class="mt-2 text-sm leading-relaxed text-slate-600">Tune in-app, email, and push notification behavior by role and priority.</p>
      </a>
      <a href="/notifications/push/broadcast/page" class="glass rounded-2xl border border-white/70 p-5 shadow-card transition hover:-translate-y-1">
        <p class="text-sm font-extrabold uppercase tracking-wide text-amber-600">Broadcast in Seconds</p>
        <p class="mt-2 text-sm leading-relaxed text-slate-600">Send announcements instantly to subscribed devices from one admin console.</p>
      </a>
    </section>

    <section id="workflow" class="rise rise-delay-3 mt-8 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      <article class="glass rounded-2xl border border-white/70 p-6 shadow-card">
        <h2 class="font-display text-3xl font-extrabold leading-tight text-deep">Everything connected. <span class="text-mint">Everything easy.</span></h2>
        <p class="mt-3 text-slate-600">Unify tools, data, and people in one workspace so your team can focus on what matters.</p>
        <ul class="mt-5 grid gap-2 text-sm text-slate-700">
          <li>Centralized AI workspace</li>
          <li>Secure and permission-aware routes</li>
          <li>Built for teams of all sizes</li>
          <li>Works with your favorite tools and APIs</li>
        </ul>
      </article>
      <article class="glass rounded-2xl border border-white/70 p-6 shadow-card">
        <p class="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Quick Navigation</p>
        <div class="mt-4 grid gap-3 text-sm">
          <a class="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 font-semibold text-blue-700 transition hover:bg-blue-100" href="/ai/playground/page">AI Prompt Playground</a>
          <a class="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-100" href="/docs">Swagger Documentation</a>
          <a class="rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 font-semibold text-indigo-700 transition hover:bg-indigo-100" href="/notifications/settings/page">Notification Settings</a>
          <a class="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 font-semibold text-amber-700 transition hover:bg-amber-100" href="/health">Backend Health Check</a>
        </div>
      </article>
    </section>

    <footer class="mt-8 rounded-2xl border border-white/80 bg-white/85 px-5 py-4 text-center text-sm text-slate-500 shadow-sm">
      API base URL: / | For authenticated tools, attach Bearer token within each UI page.
    </footer>
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
  </script>
</body>
</html>`);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/projects", projectRouter);
  app.use("/meetings", meetingRouter);
  app.use("/minute-drafts", minuteDraftRouter);
  app.use("/action-items", actionItemRouter);
  app.use("/ask-ai", askAiRouter);
  app.use("/retrieval", retrievalRouter);
  app.use("/reminders", reminderRouter);
  app.use("/continuity", continuityRouter);
  app.use("/observability", observabilityRouter);
  app.use("/tenants", tenantRouter);
  app.use("/ai", aiRouter);
  app.use("/notifications", notificationRouter);
  app.use("/system-settings", systemSettingsRouter);

  const openApiPath = path.join(process.cwd(), "src", "openapi.yaml");
  if (fs.existsSync(openApiPath)) {
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(undefined, {
      swaggerOptions: { url: "/openapi.yaml" }
    }));

    app.get("/openapi.yaml", (_req, res) => {
      res.type("application/yaml");
      res.sendFile(openApiPath);
    });
  }

  return app;
}
