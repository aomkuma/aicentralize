# Frontend Features — Summary

**Last updated:** 2026-06-30 (late session) · **`main` through `2d1cd5d`**

> **Canonical product map:** [`docs/FEATURES.md`](../../docs/FEATURES.md) (all main modules + sub-features).  
> **Handover / changelog:** [`docs/next-day-handover-2026-06-28.md`](../../docs/next-day-handover-2026-06-28.md)

---

## Main modules (web)

| # | Module | Route(s) | Key UI |
|---|--------|----------|--------|
| 0 | **Guest welcome (Kora)** | `/` | `WelcomePage.tsx` — hero, banner, spotlight, feature grid |
| 1 | **Dashboard & AI Chat** | `/dashboard` | `AIChatPanel.tsx`; `MorningBriefingDialog` on load when unacknowledged |
| 2 | **My Tasks** | `/my-tasks` | `MyTasksPage.tsx` → `ActionItemsPanel` (`mode="mine"`) |
| 3 | **Meeting Studio** | `/meetings` | 3-step wizard, live record, upload, background job banner |
| 4 | **Meeting history** | `/meetings/history` | Saved minutes list + edit |
| 5 | **Projects** | `/projects` | Project cards, sentiment badges, links to continuity/knowledge |
| 6 | **Continuity** | `/continuity/:projectId` | `ContinuityDashboard` — risk, overdue, missing info, workload hint, actions tab |
| 7 | **Project knowledge** | `/projects/:id/knowledge` | Onboarding Q&A, file import, AI extraction |
| 8 | **General notes** | `/projects/:id/notes`, `/general-notes` | Free-form notes for Ask-AI |
| 9 | **Reminders** | `/reminders` | Digest inspection, escalation metrics |
| 10 | **Ask-AI trace** | `/ai-trace` | AI run logs, filters, evidence |
| 11 | **Feeling log** | `/feeling-logs` | Tab **บันทึกของฉัน** + tab **ภาพรวมทีม** (managers) |
| 12 | **Profile & notifications** | `/profile` | In-app / email / push toggles, `PushSetupPanel` |
| 13 | **System settings** | `/settings` | ASR, AI providers, prompt limits (`SUPER_ADMIN`) |
| 14 | **Admin** | `/admin/organizations`, `/admin/platform-users` | Org registry, suspension, invites |
| 15 | **Auth** | `/auth/login`, `/accept-invite`, `/change-password` | Invitation flow, forced password change |

Sidebar order (tenant users): Dashboard → **My Tasks** → Meeting Studio → Projects → …

---

## Sub-features by area

### Guest welcome (`pages/WelcomePage.tsx`)
- Hero copy + full-width `kora-landing-banner.png`
- Spotlight cards: Knowledge Hub, Feeling Log (`landing.spotlight.*`)
- Language switcher; CTA to login
- Guests only at `/`; authenticated users redirect to dashboard/admin

### My Tasks (`components/features/action-items/`)
- `ActionItemsPanel` with `mode="mine"`
- Create form: collapsed toggle (`myTasks.showCreateForm`)
- Project column visible; owner filter hidden
- Assignee dropdown: `canAssignActionItemsToOthers()` + `resolveTenantMembership()`
- Owner list: `/tenants/:id/members` (+ `/users` fallback)

### Continuity (`components/features/continuity/`)
- Tabs: Summary, By Owner, By Project, **Actions**, Missing Info
- Actions tab: project-scoped tasks (team view); partial overlap with `ActionItemsPanel` (refactor pending)
- Saved meetings section (from `GET /meetings?projectId=`)
- Workload balancing suggestion popup
- Entry from project card only (not sidebar)

### Meeting Studio
- Import: audio/video (ASR), documents (TXT→XLSX), paste, live record
- Background transcription + `MeetingStudioJobBanner`
- AI analysis → compose template → save
- Prompt builder: `lib/meetingStudio/meetingAnalysisPrompt.ts` (120k budget)

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
- My Tasks strings: `myTasks.*`

---

## Architecture (frontend)

```
apps/web/src/
├── components/
│   ├── features/
│   │   ├── action-items/     # ActionItemsPanel, actionItemTypes
│   │   ├── continuity/
│   │   ├── reminders/
│   │   └── aiTrace/
│   ├── AIChatPanel.tsx
│   ├── MeetingStudioJobBanner.tsx
│   ├── NotificationPreferences.tsx
│   ├── PushSetupPanel.tsx
│   └── PushOnboardingBanner.tsx
├── lib/
│   ├── actionItemPermissions.ts
│   ├── meetingStudio/
│   ├── pushNotifications.ts
│   └── pwaUtils.ts
├── pages/
│   ├── WelcomePage.tsx
│   └── MyTasksPage.tsx
├── stores/                   # auth, tenant, feature flags, meeting jobs
└── hooks/                    # useApi, usePushSetup, useContinuity, …
```

---

## Related docs

| File | Purpose |
|------|---------|
| [`docs/FEATURES.md`](../../docs/FEATURES.md) | Full product catalog (API + web) |
| [`QUICK_REFERENCE.md`](../../QUICK_REFERENCE.md) | Commands, roles, troubleshooting |
| [`FRONTEND_MODULES_GUIDE.md`](./FRONTEND_MODULES_GUIDE.md) | Technical module guide |
| [`FRONTEND_QUICK_START.md`](./FRONTEND_QUICK_START.md) | Developer quick start |
| [`public/brand/README.md`](./public/brand/README.md) | Kora asset layout |
| [`PWA_RESPONSIVE_GUIDE.md`](./PWA_RESPONSIVE_GUIDE.md) | PWA + responsive notes |

---

**Status:** Production features through `2d1cd5d`. Open items (Continuity refactor, `assertCanMutate`, tests) in handover doc.
