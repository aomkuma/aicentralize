# Frontend Features — Summary

**Last updated:** 2026-06-30 · includes Feeling Log (pending commit)

> **Canonical product map:** [`docs/FEATURES.md`](../../docs/FEATURES.md) (all main modules + sub-features).  
> **Handover / changelog:** [`docs/next-day-handover-2026-06-28.md`](../../docs/next-day-handover-2026-06-28.md)

---

## Main modules (web)

| # | Module | Route(s) | Key UI |
|---|--------|----------|--------|
| 1 | **Dashboard & AI Chat** | `/dashboard` | `AIChatPanel.tsx` — prompt, record, upload, analyze |
| 2 | **Meeting Studio** | `/meetings` | 3-step wizard, live record, upload, background job banner |
| 3 | **Meeting history** | `/meetings/history` | Saved minutes list + edit |
| 4 | **Projects** | `/projects` | Project cards, sentiment badges, links to continuity/knowledge |
| 5 | **Continuity** | `/continuity/:projectId` | `ContinuityDashboard` — risk, overdue, missing info, workload hint |
| 6 | **Project knowledge** | `/projects/:id/knowledge` | Onboarding Q&A, file import, AI extraction |
| 7 | **General notes** | `/projects/:id/notes`, `/general-notes` | Free-form notes for Ask-AI |
| 8 | **Reminders** | `/reminders` | Digest inspection, escalation metrics |
| 9 | **Ask-AI trace** | `/ai-trace` | AI run logs, filters, evidence |
| 10 | **Feeling log** | `/feeling-logs` | Journal + manager insights (`FeelingLogsPage`) |
| 11 | **Profile & notifications** | `/profile` | In-app / email / push toggles, `PushSetupPanel` |
| 12 | **System settings** | `/settings` | ASR, AI providers, prompt limits (`SUPER_ADMIN`) |
| 13 | **Admin** | `/admin/organizations`, `/admin/platform-users` | Org registry, suspension, invites |
| 14 | **Auth** | `/login`, `/accept-invite`, `/change-password` | Invitation flow, forced password change |

---

## Sub-features by area

### Meeting Studio
- Import: audio/video (ASR), documents (TXT→XLSX), paste, live record
- Background transcription + `MeetingStudioJobBanner`
- AI analysis → compose template → save
- Prompt builder: `lib/meetingStudio/meetingAnalysisPrompt.ts` (120k budget)

### Continuity (`components/features/continuity/`)
- Tabs: Summary, By Owner, By Project, Missing Info
- Saved meetings section (from `GET /meetings?projectId=`)
- Workload balancing suggestion popup
- Entry from project card only (not sidebar)

### Reminders (`components/features/reminders/`)
- Digest list + detail split view
- Date range filters, escalation rate bar
- Feature-gated via `featureFlagStore` (billing-ready scaffold)

### Ask-AI trace (`components/features/aiTrace/`)
- Filter by operation + status
- Evidence list, error display
- Model/confidence redacted in user views

### Push & PWA
- `PushSetupPanel` — Step 1 install, Step 2 allow notifications
- `PushOnboardingBanner` in `Layout.tsx`
- `public/push-sw.js`, `public/manifest.json`
- Hooks: `usePushSetup.ts`, `usePWA.ts`

### i18n
- English + Thai (`i18n/en.json`, `th.json`)
- Navigation labels via `config/navigation.ts`

---

## Architecture (frontend)

```
apps/web/src/
├── components/
│   ├── features/continuity|reminders|aiTrace/
│   ├── AIChatPanel.tsx
│   ├── MeetingStudioJobBanner.tsx
│   ├── NotificationPreferences.tsx
│   ├── PushSetupPanel.tsx
│   └── PushOnboardingBanner.tsx
├── lib/
│   ├── meetingStudio/          # audioJob, prompts, job store
│   ├── pushNotifications.ts
│   └── pwaUtils.ts
├── pages/                      # Route pages
├── stores/                     # auth, tenant, feature flags, meeting jobs
└── hooks/                      # useApi, usePushSetup, useContinuity, …
```

---

## Related docs

| File | Purpose |
|------|---------|
| [`docs/FEATURES.md`](../../docs/FEATURES.md) | Full product catalog (API + web) |
| [`QUICK_REFERENCE.md`](../../QUICK_REFERENCE.md) | Commands, roles, troubleshooting |
| [`FRONTEND_MODULES_GUIDE.md`](./FRONTEND_MODULES_GUIDE.md) | Technical module guide |
| [`FRONTEND_QUICK_START.md`](./FRONTEND_QUICK_START.md) | Developer quick start |
| [`PWA_RESPONSIVE_GUIDE.md`](./PWA_RESPONSIVE_GUIDE.md) | PWA + responsive notes |

---

**Status:** Production features through `db369f8`. Open items (tests, timeline tab, vector retrieval) tracked in handover doc.
