# AICentralize — Feature Catalog

**Last updated:** 2026-07-01 · **`main` through `2157f3e`**

This document is the product feature map (main modules and sub-features). For day-to-day commands and access rules, see [`QUICK_REFERENCE.md`](../QUICK_REFERENCE.md). For current status and open work, see [`HANDOVER.md`](./HANDOVER.md).

---

## 0. Guest Welcome (Kora)

**Route:** `/` (guests) · **Logged-in:** redirects to dashboard/admin

| Sub-feature | Description |
|-------------|-------------|
| **Marketing landing** | Dark Kora theme; logo header (`kora-lockup.png`); EN/TH language switcher |
| **Hero copy** | Eyebrow, title, subtitle, three highlight cards (`landing.heroHighlights`) |
| **Full-width banner** | `/brand/kora-landing-banner.png` |
| **Spotlight (`#spotlight`)** | Two selling-point cards: **Knowledge Hub** + **Feeling Log** (`landing.spotlight.*`) |
| **Feature grid** | Six modules; Knowledge Hub and Feeling Log listed first |
| **CTA** | Sign in → `/auth/login`; explore → `#packages` |
| **Pricing (`#packages`)** | Public `GET /packages` — active subscription cards sorted by price |
| **Origin story (`#our-story`)** | Why we built Kora — narrative + quote (EN/TH) |
| **In-app browser hint** | Popup when opened from LINE / Instagram / etc. (local; pending release) |
| **Brand assets** | `apps/web/public/brand/` — see `brand/README.md`; ingest via `scripts/ingest-kora-pack.py` |

**i18n:** `landing.*` in `en.json` / `th.json`. Product positioning emphasizes organizational knowledge and team atmosphere, not meetings alone.

---

## 0.5 First-Run Tours

**Routes:** `/starter-tour`, `/individual-tour` · **Entry:** Dashboard banners

| Tour | Package | Path |
|------|---------|------|
| **Starter tour** | `STARTER` | Create project -> add project knowledge -> save first meeting -> review My Tasks -> ask AI |
| **Individual tour** | `INDIVIDUAL` | Create personal workspace -> add/approve knowledge -> ask AI from the library -> manage personal action items |

Tour prompts are dismissed/completed per user + tenant in localStorage (`starterTour.ts`). The INDIVIDUAL tour intentionally centers knowledge and Ask AI, with My Tasks as a personal follow-up layer rather than a meeting-first workflow.

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

- Upload max: **500 MB** (`MAX_UPLOAD_BYTES` / `ASR_MAX_UPLOAD_BYTES` / nginx `client_max_body_size 500m`).
- ASR timeout: **6 hours** (`ASR_REQUEST_TIMEOUT_MS=21600000`, nginx `/ai/` proxy **22200s**).
- No auto-merge of multiple audio parts; split externally and paste or upload one-by-one.
- AI model / confidence labels hidden in user UI (`redactAiMetadata.ts`).

---

## 2. Projects & Continuity

**Routes:** `/projects`, `/continuity/:projectId`, `/projects/:projectId/knowledge`, `/projects/:projectId/notes`

| Sub-feature | Description |
|-------------|-------------|
| **Project list** | Cards with links to continuity, knowledge, notes, meeting studio context. |
| **First-run entry** | Dashboard tour cards route STARTER users to `/starter-tour` and INDIVIDUAL users to `/individual-tour`. |
| **Continuity dashboard** | Risk summary, overdue by owner/project, missing owner/due-date audit, saved meetings section. |
| **Workload balancing** | Suggestion popup when owner load is uneven (`ContinuityDashboard`). |
| **Navigation** | Continuity is **not** in sidebar; open from project card. Bare `/continuity` → `/projects`. |
| **Project knowledge** | Org route `/projects/:projectId/knowledge` (`ProjectKnowledgePage`): paste or upload (`POST .../import-jobs` + poll); guided 3-step UX; **library panel** with tabs **Review queue** / **Approved memory**; pending `EXTRACTED` sources highlighted; approved memory **grouped by source document** then by memory type; **add-source form collapses** when baseline status is `BASELINE_READY`. INDIVIDUAL tenants on the same route get `PersonalKnowledgePage` instead (see below). Supported files: `.txt`, `.md`, `.csv`, `.tsv`, `.docx`, `.pdf`, `.xlsx` (120k clip). |
| **Personal knowledge (INDIVIDUAL)** | Same route `/projects/:projectId/knowledge` for INDIVIDUAL package — 3-step upload → review → memory; student vs general persona from `tenantCategory`; approved memory **grouped by uploaded file** with drill-down into chapter/type categories (`personalKnowledge.ts`). |
| **General notes** | Free-form project notes used as Ask-AI evidence (`projectGeneralNoteService`); **PUBLIC** / **PRIVATE** visibility (private excluded from shared evidence); saved-note URLs are linkified and open in a new tab. |
| **Team sentiment badges** | Mood indicators on projects team table (`TENANT_ADMIN` / `MANAGER`). |

---

## 3. Ask-AI & AI Chat

**Routes:** `/dashboard` (AI Chat), `/ai-trace` · **API:** `/ask-ai`, `/ask-ai/conversations`, `/ai/playground/generate`, `/retrieval/*`

**Package gates (tenant `currentPackage.features`):** `AI_CHAT_BASIC` (dashboard + INDIVIDUAL chat history), `AI_CHAT_ADVANCED` (Meeting Studio + history), `AI_TRACE_PANEL` (org trace page), `OBSERVABILITY_*` (run logs / all-tenant conversations). Enforced in web (`FeatureRoute`, sidebar) and API.

| Sub-feature | Description |
|-------------|-------------|
| **Dashboard AI Chat** | Text prompt, record/upload audio, speaker grouping, diarize-analyze; INDIVIDUAL mockup-style composer + suggestion pills. |
| **Grounded answers** | Project snapshot + hybrid retrieval (lexical; vector planned). |
| **Deep links** | Answers can link to projects, action items, knowledge (`approvedAskAiService`). |
| **Session persistence** | Chat state in `sessionStorage` (`aiChatStorage.ts`); dashboard uses stable `persistKey`. |
| **INDIVIDUAL chat history** | Sidebar link → `/ai-trace` conversations tab; `GET /ask-ai/conversations` (current user). |
| **Ask-AI trace (org)** | Inspect AI runs, filters, evidence, errors (`/ai-trace`); observability endpoints for ADMIN/PM. |
| **Tenant persona** | Signup `tenantCategory` prepended to server AI prompts (`tenantPersonaPromptService`). |
| **Playground prompt limit** | Hard cap **120,000** chars; default system setting promoted from legacy 4k/12k. |
| **Language policy** | Thai/English output rules applied server-side on generate. |

---

## 4. Action Items & Reminders

**Routes:** `/my-tasks`, `/reminders`, action items via projects/continuity · **API:** `/action-items`, `/reminders/*`

| Sub-feature | Description |
|-------------|-------------|
| **My Tasks** | `/my-tasks` — tasks assigned to current user across accessible projects (`GET /action-items?mine=true`) |
| **Create (project-only)** | `POST /action-items` — `{ projectId, title, dueDate, priority?, ownerUserId? }`; no meeting required |
| **Action item board** | Status, priority, owner, due date, reassign — Continuity Actions tab (team) + My Tasks (personal) |
| **Assignee permissions** | See table below; enforced in API + `actionItemPermissions.ts` |
| **Shared UI** | `ActionItemsPanel` — `mode="project"` \| `mode="mine"` |
| **Reminder worker** | Due-soon / overdue selection with dedupe windows |
| **Escalation** | `OVERDUE_SHORT`, `OVERDUE_ESCALATE` rules |
| **Digest snapshots** | Admin/PM digest views with date filters |
| **Delivery logs** | Per-channel outcome (in-app, email, push) |
| **Change notifications** | Push + in-app on reassign, due date, status, priority changes |

**My Tasks vs Continuity actions**

| View | Route | Scope |
|------|-------|-------|
| My Tasks | `/my-tasks` | Assignee = me, all accessible projects |
| Continuity | `/continuity/:projectId` → Actions | All items in one project |

**Assignee permissions**

| Role | Can assign to others? |
|------|------------------------|
| `UserRole` ADMIN / PM | Yes |
| `TenantRole` TENANT_ADMIN | Yes (highest authority in that tenant) |
| `TenantRole` MANAGER | Yes (operational management within delegated scope) |
| `MEMBER` / `VIEWER` | No — self only |

**Schema:** `ActionItem.projectId` required; `meetingId` optional — migration `20260630210000_action_item_project_scope`.

**Role intent:** `TENANT_ADMIN` is the highest authority inside its own tenant, similar to an owner/CEO role. `MANAGER` is a strong operational role, but should not outrank `TENANT_ADMIN`.

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
| **Package management** | `/admin/packages`, `PATCH /admin/tenants/:id` (`currentPackageId`) | `SUPER_ADMIN` |
| **Feature entitlements** | Ten checkbox features per package (`AI_CHAT_BASIC`, … `CUSTOM_WORKFLOWS`); synced to web via `/tenants/me` → `featureFlagStore`; enforced on routes (`FeatureRoute`) and API (`packageAccessService`) | Tenant users |
| **INDIVIDUAL feeling log** | Package code `INDIVIDUAL` hides `/feeling-logs` (not a checkbox) | Tenant users |
| **Project quota** | `POST /projects` | Enforces `currentPackage.maxProjects` per tenant |
| **Billing clock** | First successful member login sets `billingStartDate`; `GET /tenants/me` + `/admin/organizations` show status | Tenant admins / SUPER_ADMIN |
| **maxUsers quota** | Member create + invite accept | Enforced per `currentPackage.maxUsers` |
| **Invitations** | `/accept-invite?token=...` | Public + logged-in |
| **Member onboarding** | `POST /tenants/:id/members/create` | Tenant admin; SMTP invite |
| **Account suspension** | `PATCH /admin/users/:id` | Platform admin |
| **Tenant/member active flags** | Admin org UI | Block access without deleting data |
| **First-login password** | `/change-password` | `mustChangePassword` users |

**Role model**

- **Platform:** `SystemRole` — `SUPER_ADMIN`, `MODERATOR`, `USER`
- **Tenant workflow:** `TenantRole` — `TENANT_ADMIN` (highest in tenant), `MANAGER`, `MEMBER`, `VIEWER`
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
| **Scheduler panels** | Morning briefing cron status + Run now (`ab2611f`); feeling log batch API only (UI panel planned) |

---

## 10. Rubjob Morning Briefing

**Route:** `/dashboard` (dialog on load) · **API:** `/morning-briefings`

| Sub-feature | Description |
|-------------|-------------|
| **Daily generation** | Cron **04:30** (`MORNING_BRIEFING_CRON`, default `30 4 * * *`, `Asia/Bangkok`) |
| **Scope** | `MEMBER`: own action items; `TENANT_ADMIN` / `MANAGER`: own + team follow-ups |
| **Signals** | Overdue, due today/soon, blocked, high/critical priority |
| **Acknowledgement** | `I got it!` (+3), `I know` (0), `เออ รู้แล้ว` (-3) → communication sentiment |
| **Evidence cards** | Deep-link to `/action-items/:id` |
| **Admin** | `POST /morning-briefings/run-now`, scheduler status in AI Trace |
| **Observability** | `AiRunOperation.MORNING_BRIEFING` |

---

## 11. Feeling Log (บันทึกความรู้สึก)

**Route:** `/feeling-logs` · **API:** `/tenants/:tenantId/feeling-logs`

| Sub-feature | Description |
|-------------|-------------|
| **Private journal** | Text + emoji; only author sees raw entries |
| **INDIVIDUAL package** | Hidden from sidebar + route when tenant package code is `INDIVIDUAL` (not a checkbox feature) |
| **@mention** | Autocomplete coworkers in organization |
| **AI analysis (Rubjob)** | Batch every **3 days at 02:00** (Asia/Bangkok); grouped by author and mentioned people; leadership/mention outputs must be privacy-preserving psychological observations, not raw-entry quotes |
| **Save flow** | Store immediately (`processedAt` null); no inline AI on save |
| **Manager inbox** | Tab **ภาพรวมทีม** on `/feeling-logs` (`TENANT_ADMIN` / `MANAGER`); derived insights only (no author name) |
| **Batch admin** | `POST /feeling-log-batch/run-now`, `GET /feeling-log-batch/scheduler-status` (`SUPER_ADMIN`) |
| **Frequent mentions** | Names surfaced when mentioned >5 times in 30 days |
| **Observability** | `AiRunOperation.FEELING_LOG_ANALYSIS` |

---

## 12. Frontend Architecture (summary)

| Area | Location |
|------|----------|
| Feature modules | `apps/web/src/components/features/{continuity,reminders,aiTrace,action-items}` |
| Package / feature gates | `featureFlagStore`, `lib/featureAccess.ts`, `FeatureRoute`, `FeatureGate`, `WorkflowProgressPanel` |
| Action items panel | `apps/web/src/components/features/action-items/ActionItemsPanel.tsx` |
| Assignee permissions | `apps/web/src/lib/actionItemPermissions.ts` |
| Guest welcome | `apps/web/src/pages/WelcomePage.tsx` |
| Meeting Studio jobs | `apps/web/src/lib/meetingStudio/`, `meetingStudioJobStore` |
| Push / PWA | `pushNotifications.ts`, `pwaUtils.ts`, `usePushSetup.ts`, `PushSetupPanel` |
| i18n | `apps/web/src/i18n/en.json`, `th.json` |
| Navigation | `apps/web/src/config/navigation.ts` |

---

## Deploy & runtime

| Item | Detail |
|------|--------|
| **Monorepo** | `apps/api`, `apps/web`, `apps/asr` — **use `pnpm install` at root** (Docker: `pnpm install --frozen-lockfile`) |
| **Migrations** | `prisma migrate deploy` on API Docker boot (`docker/start.sh`) |
| **Web proxy** | nginx: `/api/`, `/ai/` → API; `client_max_body_size 500m`; `/ai/` proxy **22200s** |
| **ASR service** | Separate Railway/container; `ASR_BASE_URL` on API |

---

## Open / planned (not shipped)

See **Open Items** and **roadmap** in [`HANDOVER.md`](./HANDOVER.md):

- Continuity fully on `ActionItemsPanel` (duplicate UI remains)
- Tenant admin edit others' tasks (patch/status) — `assertCanMutate` gap
- PM date-ordered timeline tab in Continuity  
- Sentiment + suspension automated tests  
- Project memory vector retrieval  
- Project knowledge item-level review UI  
- Feeling log batch scheduler panel in AI Trace  
- Manager dashboard badge for new feeling-log insights  
- Cron leader lock for multi-replica API  
- Full offline PWA (no vite-plugin-pwa service worker cache yet)
