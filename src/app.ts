import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import fs from "node:fs";
import path from "node:path";
import {
  aiRouter,
  authRouter,
  meetingRouter,
  notificationRouter,
  projectRouter
} from "./routes";

export function createApp() {
  const app = express();

  app.use(helmet());
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
  <style>
    :root {
      --bg-a: #d9f0ea;
      --bg-b: #f4fbf9;
      --card: #ffffff;
      --text: #102129;
      --muted: #5d6a70;
      --accent: #0f766e;
      --accent-soft: #e7f5f2;
      --border: #cfe4df;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: var(--text);
      background:
        radial-gradient(80vw 40vh at 15% -10%, #c4e9df 0%, transparent 70%),
        radial-gradient(70vw 40vh at 100% 10%, #e6f8f3 0%, transparent 70%),
        linear-gradient(135deg, var(--bg-a), var(--bg-b));
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .shell {
      width: min(960px, 100%);
      background: color-mix(in srgb, var(--card) 92%, transparent);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 18px 36px rgba(16, 33, 41, 0.12);
      overflow: hidden;
    }
    .hero {
      padding: 28px 28px 12px;
    }
    h1 {
      margin: 0;
      font-size: clamp(1.6rem, 3vw, 2.2rem);
      letter-spacing: 0.2px;
    }
    .subtitle {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      padding: 20px 28px 28px;
    }
    a.card {
      display: block;
      text-decoration: none;
      color: inherit;
      background: var(--accent-soft);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
    }
    a.card:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: 0 8px 18px rgba(15, 118, 110, 0.16);
    }
    .k {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: 0.4px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .t {
      font-size: 1rem;
      font-weight: 700;
      margin: 0 0 4px;
    }
    .d {
      margin: 0;
      color: var(--muted);
      font-size: 0.93rem;
      line-height: 1.35;
    }
    .foot {
      border-top: 1px dashed var(--border);
      padding: 12px 28px 20px;
      color: var(--muted);
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <h1>AI Centralize</h1>
      <p class="subtitle">Unified meeting intelligence with reminders, push delivery, and admin broadcast tools.</p>
    </section>

    <section class="grid">
      <a class="card" href="/ai/playground/page">
        <div class="k">LLM</div>
        <p class="t">Prompt Playground</p>
        <p class="d">Dynamic prompt textarea connected to local Qwen model.</p>
      </a>

      <a class="card" href="/docs">
        <div class="k">API</div>
        <p class="t">Swagger Documentation</p>
        <p class="d">Inspect and test all endpoints from one place.</p>
      </a>

      <a class="card" href="/notifications/settings/page">
        <div class="k">User</div>
        <p class="t">Notification Settings</p>
        <p class="d">Control in-app, email, and push preference.</p>
      </a>

      <a class="card" href="/notifications/push/broadcast/page">
        <div class="k">Admin</div>
        <p class="t">Push Broadcast Console</p>
        <p class="d">Send one-shot push announcements to subscribed devices.</p>
      </a>

      <a class="card" href="/health">
        <div class="k">System</div>
        <p class="t">Health Check</p>
        <p class="d">Quick verify backend service status.</p>
      </a>
    </section>

    <section class="foot">
      API base URL: / | For authenticated tools, paste your Bearer token inside each UI page.
    </section>
  </main>
</body>
</html>`);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/projects", projectRouter);
  app.use("/meetings", meetingRouter);
  app.use("/ai", aiRouter);
  app.use("/notifications", notificationRouter);

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
