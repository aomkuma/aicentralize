# AICentralize — Feature Catalog

**Last updated:** 2026-06-30 · **`main` through `ab2611f`** (Feeling Log pending next commit)

This document is the product feature map (main modules and sub-features). For day-to-day commands and access rules, see [`QUICK_REFERENCE.md`](../QUICK_REFERENCE.md). For chronological implementation notes, see [`next-day-handover-2026-06-28.md`](./next-day-handover-2026-06-28.md).

---

## 1. Meeting Studio

**Route:** `/meetings` · **API:** `/meetings`, `/ai/playground/*`

| Sub-feature | Description |
|-------------|-------------|
| **3-step wizard** | Import → Compose → Review & save. One step visible at a time; manual stepper navigation. |
| **Live recording** | In-browser audio capture with live transcript preview. |
| **File upload (audio/video)** | Single file per upload; sent to ASR (`faster-whisper`, CPU). |
| **Background transcription** | Long runs continue in `meetingStudioJobStore`; `MeetingStudioJobBanner` in layout shows progress; browser notification on completion. |
| **Paste transcript** | Manual text input when ASR is skipped or for merged multi-part transcripts. |
| **Document import** | TXT, MD, CSV, TSV, DOCX, PDF (text), XLSX — extracted via `documentText.ts` / `jszip`. |
| **AI minute analysis** | Summary, objective, decisions, risks, action items, consultant notes (JSON from playground generate). |
| **Prompt budget** | Shared builder `meetingAnalysisPrompt.ts`; up to **120,000** chars (system max). |
| **Save minutes** | `POST /meetings` with project link, template fields, checklist items. |
| **Meeting history** | `/meetings/history`, `/meetings/history/:meetingId` — review and edit saved minutes. |

**Limits / ops**

- ASR timeout: **1 hour** (`ASR_REQUEST_TIMEOUT_MS=3600000`, nginx `/ai/` proxy **3700s**).
- No auto-merge of multiple audio parts; split externally and paste or upload one-by-one.
- AI model / confidence labels hidden in user UI (`redactAiMetadata.ts`).

---

## 2. Projects & Continuity

**Routes:** `/projects`, `/continuity/:projectId`, `/projects/:projectId/knowledge`, `/projects/:projectId/notes`

| Sub-feature | Description |
|-------------|-------------|
| **Project list** | Cards with links to continuity, knowledge, notes, meeting studio context. |
| **Continuity dashboard** | Risk summary, overdue by owner/project, missing owner/due-date audit, saved meetings section. |
| **Workload balancing** | Suggestion popup when owner load is uneven (`ContinuityDashboard`). |
| **Navigation** | Continuity is **not** in sidebar; open from project card. Bare `/continuity` → `/projects`. |
| **Project knowledge** | Onboarding Q&A, file import, AI extraction into knowledge items (`projectKnowledgeService`). |
| **General notes** | Free-form project notes used as Ask-AI evidence (`projectGeneralNoteService`). |
| **Team sentiment badges** | Mood indicators on projects team table (`TENANT_ADMIN` / `MANAGER`). |

---

## 3. Ask-AI & AI Chat

**Routes:** `/dashboard` (AI Chat), `/ai-trace` · **API:** `/ask-ai`, `/ai/playground/generate`, `/retrieval/*`

| Sub-feature | Description |
|-------------|-------------|
| **Dashboard AI Chat** | Text prompt, record/upload audio, speaker grouping, diarize-analyze. |
| **Grounded answers** | Project snapshot + hybrid retrieval (lexical; vector planned). |
| **Deep links** | Answers can link to projects, action items, knowledge (`approvedAskAiService`). |
| **Session persistence** | Chat state persisted in localStorage. |
| **Ask-AI trace** | Inspect AI runs, filters, evidence, errors (`/ai-trace`). |
| **Playground prompt limit** | Hard cap **120,000** chars; default system setting promoted from legacy 4k/12k. |
| **Language policy** | Thai/English output rules applied server-side on generate. |

---

## 4. Action Items & Reminders

**Routes:** `/reminders`, action items via projects/continuity · **API:** `/action-items`, `/reminders/*`

| Sub-feature | Description |
|-------------|-------------|
| **Action item board** | Status, priority, owner, due date, reassign. |
| **Reminder worker** | Due-soon / overdue selection with dedupe windows. |
| **Escalation** | `OVERDUE_SHORT`, `OVERDUE_ESCALATE` rules. |
| **Digest snapshots** | Admin/PM digest views with date filters. |
| **Delivery logs** | Per-channel outcome (in-app, email, push). |
| **Change notifications** | Push + in-app on reassign, due date, status, priority changes (`actionItemNotificationService`). |

---

## 5. Notifications & PWA

**Routes:** `/profile` (#notifications) · **API:** `/notifications/*`, `public/push-sw.js`

| Sub-feature | Description |
|-------------|-------------|
| **In-app** | Toggle per user on Profile. |
| **Email** | Reminders and digests when SMTP configured. |
| **Web push (VAPID)** | `web-push` on API; subscriptions stored per user/device. |
| **Push events** | Task reassign, due date, priority, status changes; due/overdue reminders. |
| **iPhone setup wizard** | Step 1: Add to Home Screen · Step 2: Allow notifications (`PushSetupPanel`). |
| **Onboarding banner** | Top banner links to Profile when install/push incomplete. |
| **Service worker** | `/push-sw.js` on web origin; registers before permission on iOS. |
| **PWA manifest** | `manifest.json`, apple-touch-icon, standalone display. |

**iPhone requirements**

1. Safari → Share → Add to Home Screen  
2. Open app from Home Screen icon (not Safari tab)  
3. Profile → Enable push → Allow  

**Env (API):** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:admin@...`).

---

## 6. Communication Sentiment

**Route:** `/projects` (team table) · **API:** `/communication-sentiment/*`

| Sub-feature | Description |
|-------------|-------------|
| **Snapshot analysis** | AI JSON analysis of message patterns per scope. |
| **Team mood badges** | Visual trend on projects page for managers. |
| **Cron / manual run** | `POST .../communication-sentiment/run` for batch refresh. |

---

## 7. Platform & Tenant Admin

| Sub-feature | Route / API | Who |
|-------------|-------------|-----|
| **Organization setup** | `/setup` | `SUPER_ADMIN` |
| **Organization registry** | `/admin/organizations` | `SUPER_ADMIN`, `MODERATOR` |
| **Platform users** | `/admin/platform-users` | `SUPER_ADMIN` |
| **Invitations** | `/accept-invite?token=...` | Public + logged-in |
| **Member onboarding** | `POST /tenants/:id/members/create` | Tenant admin; SMTP invite |
| **Account suspension** | `PATCH /admin/users/:id` | Platform admin |
| **Tenant/member active flags** | Admin org UI | Block access without deleting data |
| **First-login password** | `/change-password` | `mustChangePassword` users |

**Role model**

- **Platform:** `SystemRole` — `SUPER_ADMIN`, `MODERATOR`, `USER`
- **Tenant workflow:** `TenantRole` — `TENANT_ADMIN`, `MANAGER`, `MEMBER`, `VIEWER`
- **Legacy workflow:** `UserRole` — `ADMIN`, `PM`, `MEMBER` (do not use `UserRole.ADMIN` for platform checks)

---

## 8. System Settings & Integrations

**Route:** `/settings` · **API:** `/system-settings`

| Sub-feature | Description |
|-------------|-------------|
| **ASR mode** | whisper / browser / hybrid |
| **Whisper config** | Model, language, timeout |
| **Generation provider** | Ollama, OpenAI, Anthropic, Gemini + fallbacks |
| **Max prompt chars** | 256–120,000 (default 120,000) |
| **AI provider keys** | Encrypted accounts per provider |
| **Security** | MFA flag, session TTL |
| **Notification toggles** | Email, digest, escalation (system-level) |
| **Push admin** | VAPID generate, broadcast (`SUPER_ADMIN`) |

---

## 9. Observability

**Route:** `/ai-trace` · **API:** `/observability/*`

| Sub-feature | Description |
|-------------|-------------|
| **AI run logs** | Extraction, retrieval, ask-ai, reminder runs |
| **Ask-AI query log** | Questions, answers, evidence IDs |
| **Tenant scoping** | Non-platform users see own tenants only |

---

## 10. Feeling Log (บันทึกความรู้สึก)

**Route:** `/feeling-logs` · **API:** `/tenants/:tenantId/feeling-logs`

| Sub-feature | Description |
|-------------|-------------|
| **Private journal** | Text + emoji; only author sees raw entries |
| **@mention** | Autocomplete coworkers in organization |
| **AI analysis (Rubjob)** | Batch every **3 days at 02:00** (Asia/Bangkok); grouped by author and mentioned people |
| **Save flow** | Store immediately (`processedAt` null); no inline AI on save |
| **Manager inbox** | `TENANT_ADMIN` / `MANAGER` see derived insights only (no author name) |
| **Frequent mentions** | Names surfaced when mentioned >5 times in 30 days |
| **Observability** | `AiRunOperation.FEELING_LOG_ANALYSIS` |

---

## 11. Frontend Architecture (summary)

| Area | Location |
|------|----------|
| Feature modules | `apps/web/src/components/features/{continuity,reminders,aiTrace}` |
| Meeting Studio jobs | `apps/web/src/lib/meetingStudio/`, `meetingStudioJobStore` |
| Push / PWA | `pushNotifications.ts`, `pwaUtils.ts`, `usePushSetup.ts`, `PushSetupPanel` |
| i18n | `apps/web/src/i18n/en.json`, `th.json` |
| Navigation | `apps/web/src/config/navigation.ts` |

---

## Deploy & runtime

| Item | Detail |
|------|--------|
| **Monorepo** | `apps/api`, `apps/web`, `apps/asr` |
| **Migrations** | `prisma migrate deploy` on API Docker boot (`docker/start.sh`) |
| **Web proxy** | nginx: `/api/`, `/ai/` → API; `client_max_body_size 100m` |
| **ASR service** | Separate Railway/container; `ASR_BASE_URL` on API |

---

## Open / planned (not shipped)

See **Open Items Tracker** in [`next-day-handover-2026-06-28.md`](./next-day-handover-2026-06-28.md):

- PM date-ordered timeline tab in Continuity  
- Sentiment + suspension automated tests  
- Project memory vector retrieval  
- Project knowledge item-level review UI  
- Full offline PWA (no vite-plugin-pwa service worker cache yet)
