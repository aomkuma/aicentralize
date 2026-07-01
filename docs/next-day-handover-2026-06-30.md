# Next-day handover — 2026-06-30

Session notes for Meeting Studio raw-text flow and Continuity dashboard UX. **Not yet pushed** unless otherwise noted.

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

1. **Deploy** — web changes above if not yet on Railway production.
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

