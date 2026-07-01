# Next-day handover — 2026-06-30

Session notes for Meeting Studio raw-text flow and Continuity dashboard UX. **Meeting Studio + Continuity sections shipped in `cfbd0a1`.** Later sessions (nicknames, package gating, knowledge import, INDIVIDUAL UX) documented at end of file.

---

## Meeting Studio — Raw text + Analyze (approved as-is)

**Route:** `/meetings` (guided step 1 — upload)

### UX change

| Before | After |
|--------|--------|
| Label: `ข้อความถอดเสียง` | `ข้อความที่ถูกถอดแล้ว (Raw text)` + hint under label |
| Buttons: Transcribe, Clear | Transcribe, Clear, **วิเคราะห์ด้วย AI** (emerald) |
| Analyze only via background job after upload | User can **edit raw text** then click Analyze explicitly |

### Intended flow

1. **ถอดข้อความจากไฟล์** / live record / paste → fills the raw-text textarea.
2. User edits text if needed.
3. **วิเคราะห์ด้วย AI** → `POST /ai/playground/generate` with `buildTranscriptAnalysisPrompt()` → maps JSON into minute template, checklist, summary; advances guided step (2 or 3).

### Deliberate product decision (2026-06-30)

User said **เอาแบบนี้ไปก่อน** — keep current behavior where:

- **Background audio job** still **transcribes + auto-analyzes** when ASR returns text (`audioJob.ts` → `analyzeMeetingTranscriptFromText` after `/transcribe`).
- **Manual Analyze** is additive: paste/edit raw text, re-run analysis after edits, or analyze without re-uploading.

**Not done (optional later):** split “Transcribe only” so ASR never auto-analyzes; user would always press Analyze. Discuss before changing — would affect `runMeetingAudioJob` and background banner completion semantics.

### Key files

| File | Role |
|------|------|
| `apps/web/src/pages/MeetingStudioPage.tsx` | `handleAnalyzeTranscript`, UI buttons, `meetingJobMessages` |
| `apps/web/src/lib/meetingStudio/audioJob.ts` | Exported `analyzeMeetingTranscriptFromText()` (shared with background job) |
| `apps/web/src/lib/meetingStudio/meetingAnalysisPrompt.ts` | `buildTranscriptAnalysisPrompt()` |
| `apps/web/src/i18n/th.json`, `en.json` | `meetings.rawTranscript`, `meetings.actions.analyzeTranscript`, `meetings.status.analyzingTranscript`, `meetings.errors.emptyTranscriptForAnalyze` |

### i18n keys (TH)

- `meetings.rawTranscript` — ข้อความที่ถูกถอดแล้ว (Raw text)
- `meetings.rawTranscriptHint` — ข้อความดิบจากไฟล์เสียง…
- `meetings.actions.analyzeTranscript` — วิเคราะห์ด้วย AI
- `meetings.actions.clearTranscript` — ล้างข้อความ (shortened)

### Smoke test

1. Open Meeting Studio, select project, upload short Thai audio.
2. Wait for background job OR paste text manually.
3. Confirm raw-text box label and hint.
4. Edit text → **วิเคราะห์ด้วย AI** → template/checklist populated, step advances.
5. Empty box → Analyze disabled; if forced, `emptyTranscriptForAnalyze` error.

---

## Continuity dashboard — navigation UX (same session)

**Route:** `/continuity/:projectId`

### 1. Tab ตามเจ้าของ → รายการงาน

- Expand owner row → click overdue item → `focusActionItem(id)`:
  - `?tab=actions&actionItemId=...`
  - Resets action filters so item is visible
  - Scrolls into view, opens edit controls, highlight ring
- Same `onItemClick` on **ตามโครงการ** list
- Hint: `continuity.overdueItemClickHint`

### 2. Tab ข้อมูลที่ขาดหายไป

- Intro banner (title + 3 steps)
- Primary CTA per row: **เปิดในรายการงาน** → `focusActionItem`
- Hide **เปิดโปรเจค** when already on that project
- Removed technical `ACTION_ITEM` type label; badge shows missing owner/due date

### Key files

| File | Role |
|------|------|
| `apps/web/src/components/features/continuity/ContinuityDashboard.tsx` | `focusActionItem`, `selectTab`, scroll refs, missing-tab UI |
| `apps/web/src/components/features/continuity/OverdueByOwner.tsx` | `onItemClick` prop |
| `apps/web/src/components/features/continuity/OverdueItemsList.tsx` | Clickable rows when `onItemClick` set |
| `apps/web/src/i18n/th.json`, `en.json` | `continuity.missingInfo*`, `openInActionItems`, `overdueItemClickHint` |

### Smoke test

1. `/continuity/:projectId?tab=byOwner` — expand owner, click item → lands on actions tab centered on item.
2. `?tab=missing` — read intro, click **เปิดในรายการงาน** → same focus behavior.

---

## Related context (earlier same week, may already be on `main`)

- Ask-AI from web uses `resolveApiBaseUrl()` → `/api/ask-ai` (not web origin 405).
- My Tasks status **ทั้งหมด** = active/open only (excludes DONE/CANCELLED unless explicit).
- Action item card colors: DONE green, CRITICAL red (`actionItemTypes.ts`).

---

## Open / follow-up

1. ~~**Deploy** — web changes above if not yet on Railway production.~~ Shipped (`cfbd0a1`+).
2. **Meeting Studio** — optional: transcribe-only mode (no auto-analyze on background job).
3. **Continuity** — PM timeline tab (still on backlog from earlier handover).

---

## Member nickname (tenant-scoped) — 2026-07-02

### Two requirements

1. **Add nickname field** when onboarding/editing members (Dashboard, Tenant setup, Admin orgs, invitations).
2. **Same email across orgs** must not leak nickname from org B into org A.

### Root cause (before fix)

- `User.email` is globally unique → one account per email.
- `nickname` was stored on `User`, so any edit or re-onboard overwrote it for **all** tenants.

### Fix

- `TenantMembership.nickname` — nickname is **per organization**.
- Migration: `20260702120000_tenant_membership_nickname` (backfill from legacy `User.nickname`).
- API writes nickname on membership, not `User`, when managing tenant members.
- UI reads `member.nickname` (fallback `member.user?.nickname` for legacy).
- AI owner mapping (Meeting Studio) matches `ownerName` against membership **nickname** as well as legal name/email.

### Key files

| Layer | Files |
|-------|--------|
| Schema | `apps/api/prisma/schema.prisma` |
| API | `tenants.ts`, `admin.ts`, `auth.ts` |
| Web | `lib/memberDisplay.ts`, `ProjectsPage`, `AdminOrganizationsPage` |
| AI map | `meetingStudio/shared.ts`, `MeetingStudioPage.tsx` |

---

## Package feature gating — 2026-07-03 (`9755b97`)

### Goal

Every checkbox on `/admin/packages` must **actually gate** access on related pages and API routes.

### Web

| Layer | Files |
|-------|--------|
| Entitlements | `Layout.tsx` → `GET /tenants/me` → `setPackageEntitlements(packageCode, features)` |
| Store | `featureFlagStore.ts` — `enabledFeatureIds` overrides legacy `plan` map |
| Guards | `FeatureRoute.tsx`, `FeatureGate.tsx`, `lib/featureAccess.ts` |
| Nav | `Sidebar.tsx` filters items by `NAV_FEATURE_REQUIREMENTS` |

### API

`packageAccessService.ts` — `requirePackageFeature()` on ask-ai, observability, continuity, reminders, meeting create/extract.

### Feature → surface map (summary)

| Feature | Gated surface |
|---------|----------------|
| `AI_CHAT_BASIC` | `/dashboard` |
| `AI_CHAT_ADVANCED` | `/meetings`, meeting history |
| `AI_TRACE_PANEL` | `/ai-trace` |
| `OBSERVABILITY_*` | Trace tabs (run logs / conversations) |
| `CONTINUITY_*` | `/continuity` |
| `REMINDERS_*` | `/reminders` (+ escalation sub-features) |

### Feeling log exception

Blocked when package **code** is `INDIVIDUAL` — not a checkbox. `lib/packageAccess.ts`, `FeelingLogsRoute`, API `packageAccessService`.

### Smoke test

1. Assign STANDARD vs PRO packages to two test orgs.
2. PRO org sees AI Trace; STANDARD without `AI_TRACE_PANEL` gets upgrade prompt / 403 on API.
3. INDIVIDUAL org — no Feeling Log in sidebar or route.

---

## Project Knowledge — progress UI + server import — 2026-07-03 (`99b14fe`, `0366d1e`, `37f36a5`)

### Problem fixed

Large PDF uploads hung at step 2 with **no Network request** — client-side regex PDF parser blocked the main thread.

### Solution

Move extraction to API:

```
POST /projects/:projectId/knowledge/sources/import
Content-Type: multipart/form-data
field: file
```

| Layer | Files |
|-------|--------|
| Parser | `documentTextService.ts` — pdf-parse **v1.1.1**, mammoth (DOCX), xlsx |
| Orchestration | `projectKnowledgeService.importProjectKnowledgeFromFile()` |
| Route | `projects.ts` — multer upload |
| Web | `ProjectKnowledgePage.tsx` — `postFormData`; removed client parsers |
| Progress | `WorkflowProgressPanel` — steps: upload → `processingOnServer` → extract → review |

### Supported file types

`.txt`, `.md`, `.csv`, `.tsv`, `.docx`, `.pdf`, `.xlsx` — text clipped to **120k chars**.

### Deploy note

After changing `apps/api/package.json`, run **`pnpm install` at monorepo root** (not npm) so `pnpm-lock.yaml` stays in sync — Railway uses `pnpm install --frozen-lockfile`.

### Smoke test

1. `/projects/:id/knowledge` — upload small PDF with selectable text.
2. DevTools Network → `POST .../knowledge/sources/import` returns 200.
3. Progress panel advances through server processing; review queue populates.
4. Scanned/image-only PDF → `PDF_NO_TEXT` error (expected).

---

## INDIVIDUAL dashboard + AI chat — 2026-07-01

### Shipped

| Area | Change |
|------|--------|
| **AI chat history (INDIVIDUAL)** | Sidebar **ประวัติการแชทกับ AI** restored; route `/ai-trace` uses conversations tab via `AI_CHAT_BASIC` |
| **Self-scoped history API** | `GET /ask-ai/conversations`, `GET /ask-ai/conversations/:id` — current user only (replaces observability endpoint for INDIVIDUAL) |
| **Chat session persistence** | Dashboard `AIChatPanel` uses `persistKey="dashboard"` + wait for projects load so prompt/answer survive navigation |
| **Tenant persona** | `tenantPersonaPromptService` — signup `tenantCategory` shapes AI tone on all server prompts |
| **Project limit** | `maxProjects` from package config (no hardcoded INDIVIDUAL = 1) |
| **Typography** | IBM Plex Sans (+ Thai) app-wide; API HTML via `brandFonts.ts` |
| **Dashboard UI** | INDIVIDUAL project cards 3-column grid; mockup-style chat composer; dismissible guide (localStorage) |

### Key files

| Layer | Files |
|-------|--------|
| History API | `apps/api/src/routes/ask-ai.ts` |
| History web | `useAskAiQueryLogs.ts`, `AskAiTracePanel.tsx`, `packageAccess.ts`, `Sidebar.tsx` |
| Chat persist | `aiChatStorage.ts`, `AIChatPanel.tsx`, `DashboardPage.tsx` |
| Persona | `tenantPersonaPromptService.ts`, `aiService.ts` |

### Smoke test

1. INDIVIDUAL tenant — chat on dashboard → open **ประวัติการแชทกับ AI** → conversation listed.
2. Ask AI → navigate away → return to dashboard → prompt + answer still visible.
3. `/admin/packages` — set INDIVIDUAL `maxProjects: 3` → dashboard allows up to 3 project cards.

---

## Knowledge import jobs — DB persistence — 2026-07-01

### Problem fixed

Async import (`POST .../knowledge/sources/import-jobs` + poll `GET .../import-jobs/:id`) returned **404** near 100% when API restarted — jobs lived only in an in-memory `Map` (`ts-node-dev` reload).

### Solution

- Prisma model `ProjectKnowledgeImportJob` + migration `20260630150000_project_knowledge_import_jobs`
- `projectKnowledgeImportJobService.ts` — create/update/read via DB; TTL cleanup after 1 hour

### Smoke test

1. `/projects/:id/knowledge` — upload `.xlsx` with extractable text.
2. Network: `POST .../import-jobs` → 202; poll `GET .../import-jobs/:id` until `status: completed`.
3. Restart API mid-import (optional) — poll should still resolve (job row survives restart; in-flight work does not resume).

