# Next-Day Handover - 2026-06-28

## Latest Status (2026-07-01)

**Pending push:** subscription packages, feeling-log privacy, general-notes UX, and full documentation refresh (see commit after `2d1cd5d`).

**`main` through `2d1cd5d` on remote.** Feature catalog: [`docs/FEATURES.md`](./FEATURES.md). Quick commands: [`QUICK_REFERENCE.md`](../QUICK_REFERENCE.md).

### This commit — what ships

| Area | What users get |
|------|----------------|
| **Subscription packages** | `SUPER_ADMIN` → `/admin/packages`; assign package on org setup + admin orgs; project quota (`maxProjects`) |
| **Feeling log privacy** | Manager insights sanitized — no raw-entry quotes in batch output |
| **General notes** | Clickable links open in new tab; PUBLIC notes feed Ask-AI evidence |
| **Feature flags** | Package `features[]` mapped to `featureFlagStore` entitlements |
| **Docs** | Handover, FEATURES, QUICK_REFERENCE, frontend module guides completed |

**New migration:** `20260630223000_subscription_packages`.

---

## Latest Status (2026-06-30, late session — prior push)

### Day summary — what shipped (late session)

| Area | Commit(s) | What users get |
|------|-----------|----------------|
| **Kora rebrand + Welcome** | `c912763`, `922b7d7` | Guest landing at `/`; Kora logo/assets; full-width marketing banner |
| **Welcome selling points** | `2d1cd5d` | Hero copy restored; spotlight **Knowledge Hub** + **Feeling Log**; EN/TH i18n |
| **My Tasks** | `2d1cd5d` | Sidebar **รายการงานของฉัน** (`/my-tasks`); cross-project tasks assigned to current user |
| **Action items (project scope)** | `2d1cd5d` | `ActionItem.projectId` required; `meetingId` optional; create project-only tasks |
| **Tenant-admin assignees** | `2d1cd5d` | `TENANT_ADMIN` / `MANAGER` can assign/reassign (not only legacy `UserRole` ADMIN/PM) |

### Commit log (late session, newest first)

| Commit | Summary |
|--------|---------|
| `2d1cd5d` | My Tasks, tenant-admin assignees, welcome hero + Knowledge Hub / Feeling Log spotlight |
| `922b7d7` | Full-width Kora landing banner on welcome page |
| `c912763` | Rebrand to Kora; guest welcome landing page at `/` |

**New migrations (late session):** `20260630210000_action_item_project_scope` (`ActionItem.projectId` required, `meetingId` optional).

**Still open:** see **Open Items Tracker** and **Development Roadmap** at bottom.

### Quick verification (late session)

```bash
pnpm --filter api type-check
pnpm --filter web type-check
# After deploy / local migrate:
cd apps/api && npx prisma migrate deploy
```

Manual smoke:
1. Guest `/` — hero text, banner, spotlight Knowledge Hub + Feeling Log, EN/TH switch.
2. Login → sidebar **รายการงานของฉัน** → `/my-tasks`.
3. Create task with project + due date; as `TENANT_ADMIN`, assignee dropdown lists tenant members.
4. Continuity project tab still lists all project action items (team view unchanged).

---

## Latest Status (2026-06-30, end of day — superseded)

**Superseded by late-session table above.**

**`main` through `37eac5d`.** Feature catalog: [`docs/FEATURES.md`](./FEATURES.md). Quick commands: [`QUICK_REFERENCE.md`](../QUICK_REFERENCE.md).

### Day summary — what shipped today

| Area | Commit(s) | What users get |
|------|-----------|----------------|
| **Meeting Studio / ASR** | `5f1d652`, `4e69563` | Long audio transcription up to **1 hour**; nginx `/ai/` **3700s** |
| **Prompt limits** | `61127ae` | Playground + Meeting Studio up to **120k** chars (`meetingAnalysisPrompt.ts`) |
| **Push notifications** | `4e9aaf6`, `db369f8` | Action-item push; iPhone **2-step PWA wizard** + onboarding banner |
| **Rubjob morning briefing** | `ae26706`, `ab2611f` | Daily briefing dialog on Dashboard; ack moods feed sentiment; AI Trace scheduler panel |
| **General notes** | `ae26706` | PUBLIC / PRIVATE visibility (private excluded from shared Ask-AI evidence) |
| **Feeling log** | `ae265c3`, `37eac5d` | `/feeling-logs` journal + manager **ภาพรวมทีม** tab; **batch AI every 3 days at 02:00** |
| **Docs** | `ae265c3` | `docs/FEATURES.md` product map; handover + QUICK_REFERENCE refresh |

### Commit log (today, newest first)

| Commit | Summary |
|--------|---------|
| `37eac5d` | Feeling log: save immediately; batch AI at 02:00 every 3 days (by author + mention groups) |
| `ae265c3` | Feeling log: API + web `/feeling-logs`, `docs/FEATURES.md` |
| `ab2611f` | Morning briefing scheduler status + Run now in AI Trace |
| `ae26706` | Rubjob morning briefings, general note visibility, dashboard dialog |
| `db369f8` | iPhone push setup wizard + `PushOnboardingBanner` |
| `61127ae` | Playground / Meeting Studio prompt limit **120k** |
| `4e69563` | ASR default timeout **1 hour** |
| `5f1d652` | nginx `/ai/` proxy timeouts **3700s** |
| `4e9aaf6` | Action-item push; Meeting Studio audio job fixes |
| `648c1b3` | Handover + QUICK_REFERENCE (earlier 2026-06-30 snapshot) |

**Migrations on production:** API Docker runs `npx prisma migrate deploy` on boot (`docker/start.sh`). New today: `20260630163000_morning_briefings`, `20260630170000_project_general_note_visibility`, `20260630183000_feeling_logs`, `20260630200000_feeling_log_batch_processing`.

**Still open:** see **Open Items Tracker** and **Development Roadmap** at bottom.

---

## Latest Status (2026-06-30, mid-day — superseded)

**Superseded by end-of-day table above.**

| Commit | Summary |
|--------|---------|
| `ab2611f` | Morning briefing scheduler status panel in AI Trace |
| `ae26706` | Rubjob morning briefings, general note visibility, dashboard dialog |
| `db369f8` | iPhone push setup wizard (install + notification steps), onboarding banner |
| `61127ae` | Playground / Meeting Studio prompt limit **120k** chars |
| `4e69563` | ASR default timeout **1 hour** |
| `5f1d652` | nginx `/ai/` proxy timeouts **3700s** |
| `4e9aaf6` | Action-item push; Meeting Studio audio job fixes |

---

## Latest Status (2026-06-30, earlier — superseded)

**Superseded.** Kept for reference:

| Commit | Summary |
|--------|---------|
| `4cb67d5` | Project knowledge onboarding + general notes for Ask-AI |
| `e0e836b` | Meeting Studio background transcription, multi-format uploads, hide AI labels |
| `627a446` | Communication sentiment + team mood badges |
| `54457cd` | Fix Railway deploy: `pnpm-lock.yaml` + `jszip` |

Sections below are a chronological log; use **Latest Status** at top, **Open Items Tracker**, and **Development Roadmap** at bottom for current truth.

## Current Working State (historical — 2026-06-28 snapshot)

> **Note:** This section describes work-in-progress from 2026-06-28. It is **committed and shipped**. Do not treat as current uncommitted state.

Repository had uncommitted work for first-login password handling, personal profile management, and admin organization management.

Implemented so far:
- Added `User.mustChangePassword` to Prisma schema.
- Added migration `20260628093000_user_must_change_password`.
- Updated member onboarding so generated temporary passwords set `mustChangePassword=true`.
- Updated login response to include `mustChangePassword`.
- Added `/auth/me`, `PATCH /auth/me`, and `/auth/change-password`.
- Added web pages:
  - `/profile`
  - `/change-password`
- Added route guard: users with `mustChangePassword=true` are forced to `/change-password`.
- Extended organization setup wizard with a fourth step to create the first team member and display the temporary password.
- Fixed Thai-only organization names failing tenant creation by generating a fallback slug like `org-xxxx`.
- Added `Tenant.isActive` and `TenantMembership.isActive`.
- Added migration `20260628103000_tenant_active_flags`.
- Updated tenant access helpers so inactive tenants/members are blocked for normal tenant access.
- Added admin API:
  - `GET /admin/tenants`
  - `PATCH /admin/tenants/:tenantId`
  - `GET /admin/tenants/:tenantId/members`
  - `PATCH /admin/tenants/:tenantId/members/:userId`
- Added web page `/admin/organizations`.
- Added admin organization menu item.
- Hid workflow menus for platform `systemRole` users (`SUPER_ADMIN` / `MODERATOR`).
- Added route guards so platform users are redirected away from workflow pages to `/admin/organizations`.
- Added `UserInvitation` token flow with migration `20260628112000_user_invitations`.
- Added SMTP invitation email sending for `POST /tenants/:tenantId/members/create`.
- Added public invitation endpoints:
  - `GET /auth/invitations/:token`
  - `POST /auth/invitations/:token/accept`
- Added web page `/accept-invite?token=...`.
- Added `APP_PUBLIC_URL` / `WEB_PUBLIC_URL` env support for building invitation links.
- Added invitation email delivery audit fields:
  - `UserInvitation.emailLastAttemptAt`
  - `UserInvitation.emailSentAt`
  - `UserInvitation.emailLastError`
- Added admin invitation resend support from `/admin/organizations`.
- Fixed `/accept-invite?token=...` blank page when an existing logged-in user opens an invitation link by registering the route in the authenticated route tree too.
- Added `SystemRole.MODERATOR` via migration `20260628133000_platform_moderator_role`.
- Split platform roles from tenant/workflow roles:
  - `SystemRole.SUPER_ADMIN`: full platform/system settings.
  - `SystemRole.MODERATOR`: platform organization/member management only.
  - `SystemRole.USER`: normal tenant user.
- Updated platform admin checks to use `systemRole` only, not `UserRole.ADMIN`.
- Updated tenant creation so platform users are not automatically inserted as tenant members.
- Updated tenant state handling:
  - `authStore.setAuth` clears stale `tenant-store` when the logged-in user changes.
  - `authStore.clearAuth` clears `tenant-store`.
  - dashboard/projects reselect the active tenant from `/tenants/me` instead of trusting stale localStorage.
- Updated member onboarding:
  - `TenantRole.TENANT_ADMIN` and `TenantRole.MANAGER` default to workflow `UserRole.PM`.
  - Tenant member/project APIs rely on tenant role where appropriate.

Local Prisma status:
- Killed local dev Node processes that locked Prisma client generation.
- Ran `pnpm --filter api prisma:generate` successfully.
- `prisma migrate dev` cannot run in this shell because it is non-interactive.
- Resolved existing local `20260623091000_system_settings` migration as applied because the table already existed.
- Ran `pnpm --filter api exec prisma migrate deploy` successfully, including the new 2026-06-28 migrations through `20260628133000_platform_moderator_role`.
- `pnpm --filter api exec prisma migrate status` reports DB is up to date.

Verification:
- `pnpm --filter api type-check` passed.
- `pnpm --filter web type-check` passed.
- Local Node is v20.10.0, while the repo warns it wants Node >=22.0.0.

## New Requirement Summary

User asked for governance/admin behavior:

1. Clear first-login password-change behavior for:
   - Members added to a team.
   - Invitation email flow.
   - Organization creation flow.
2. Personal profile page for all users.
3. User role `ADMIN` needs screens to manage organizations and members:
   - Edit organizations.
   - Active/inactive organizations.
   - Active/inactive members.
4. Platform admin/moderator users should not see organization workflow menus:
   - Continuity dashboard.
   - Meeting workflow.
   - Reminders/workflow pages.
   - Project execution flows.
   Admin should see only system/registered-organization management screens.

## Recommended Design

Use roles consistently:
- `SystemRole.SUPER_ADMIN`: full platform access and system settings.
- `SystemRole.MODERATOR`: platform organization registry/admin management only.
- `SystemRole.USER`: normal application user inside a tenant.
- `UserRole.ADMIN`: legacy workflow/admin role. Do not use it to identify platform users in new code.
- `UserRole.PM`: organization/project workflow owner.
- `UserRole.MEMBER`: assigned work only.
- `TenantRole.TENANT_ADMIN` / `MANAGER`: manage members and projects inside a tenant, subject to tenant active status.
- Platform checks should use `systemRole`, while tenant workflow checks should use `tenantRole` and tenant membership status.

## Post-Handover Work Completed (2026-06-28, later same day)

All hardening follow-ups below were implemented, verified, committed, and pushed to `main`.

Committed and pushed:
- Committed the entire uncommitted handover work as one feature commit; `logs/` is now gitignored.
- Documented `APP_PUBLIC_URL` / `WEB_PUBLIC_URL` in `.env.example`.
- Platform infra ops now use `requireSystemRole([SUPER_ADMIN])` instead of legacy `UserRole.ADMIN`:
  `POST /reminders/run-now`, `POST /retrieval/backfill`,
  `POST /notifications/push/generate-vapid`, `POST /notifications/push/broadcast`.
  Tenant workflow routes (meetings, action-items, minute-drafts) keep `requireRole`
  because they enforce per-resource tenant scope separately and tenant managers map to `UserRole.PM`.
- Closed a cross-tenant data leak: observability and reminder read endpoints are now
  tenant-scoped via `listTenantIdsForUser`
  (`/observability/ai-runs` + `/:id`, `/observability/ask-ai-queries` + `/:id`,
  `/reminders/digests`, `/reminders/logs`). Platform admins remain unrestricted;
  detail endpoints return 404 for out-of-tenant records so existence is not leaked.
- Added UI to edit member `jobTitle` / `department` in `/admin/organizations`
  (saves on blur; member PATCH now passes `null` through so values can be cleared).
- Added vitest unit tests (prisma mocked): `tenantAccessService` (inactive tenant/member,
  platform bypass, role checks) and `reminderDigestService` tenant filter. Run with
  `pnpm --filter api test` (17 tests pass).
- Added platform-wide account suspension (`User.isActive`, migration
  `20260628150000_user_is_active`):
  - Login and refresh return `403 Account suspended` when inactive.
  - `requireAuth` now reads the account from the DB on every request (role/systemRole
    read fresh too), so suspension and role changes take effect immediately instead of
    waiting for the 12h access token to expire.
  - `PATCH /admin/users/:userId { isActive }` toggles it, revokes active refresh tokens
    on suspend, and refuses to suspend yourself or a `SUPER_ADMIN`.
  - `/admin/organizations` member cards have a suspend/restore login control (hidden for
    `SUPER_ADMIN`) with a confirm prompt.

UI/UX changes also shipped:
- Dashboard AI panel rebranded with a "รับจบ" / "Rubjob" cheerful nerdy female AI teammate persona.
- Removed the AI Playground item from the sidebar (route still exists, just unlinked).
- Reworked the Meeting Studio (`/meetings`) from all-blocks-at-once into a true
  step-by-step wizard (Import → Compose → Review & save) with a clickable stepper,
  per-step completion ticks, and a Back/Next/Save footer. Auto-advance and inline
  step jumps were removed so editing never moves the user off the current step.

Three ways to block access now exist, smallest to largest scope:
- `TenantMembership.isActive=false`: blocked from one organization only.
- `Tenant.isActive=false`: whole organization blocked.
- `User.isActive=false`: account suspended platform-wide (blocks login everywhere).

Still open / not done (as of 2026-06-28; see later sections for items completed after this):
- B-2 follow-up only deferred item is gone; observability/reminders are now tenant-scoped.
- No tests yet for the suspension path at the route level (login/requireAuth/refresh).
- No login-page banner explaining the `403 Account suspended` response to end users.
- ~~Explicit platform-user (moderator) management UI still not built.~~ **Done 2026-06-29** — see
  `Post-Handover Work Completed (2026-06-29, platform users and action-item route)`.
- Local Node is still v20.10.0; repo wants `>=22`.

## Remaining Implementation Plan

Phase 1 is implemented locally:
- `Tenant.isActive Boolean @default(true)`.
- `TenantMembership.isActive Boolean @default(true)`.
- Admin API and `/admin/organizations`.
- Sidebar filter and route guards for platform `systemRole` (`SUPER_ADMIN` / `MODERATOR`).
- `/admin/organizations` is available to `SUPER_ADMIN` and `MODERATOR`.
- `/settings` remains `SUPER_ADMIN` only.

Recommended follow-up hardening:
- Review remaining backend workflow routes that still have `requireRole([UserRole.ADMIN, UserRole.PM])` and decide whether tenant-role checks should replace them.
- ~~Add UI controls for editing member `jobTitle` and `department`, not only role/status.~~ **Done** — `/admin/organizations` saves on blur.
- ~~Add tests for inactive tenant/member access.~~ **Done** — `tenantAccessService.test.ts` and
  `reminderDigestService.test.ts` (`pnpm --filter api test`, 17 tests).
- ~~Add explicit platform-user management UI if moderators need to be created/managed from the app.~~ **Done 2026-06-29** — `/admin/platform-users`.

Phase 2 is implemented locally:
- `UserInvitation` stores token hash, expiry, acceptance state, tenant/member metadata.
- Member creation sends an invite email when SMTP is configured.
- The invite link points to `/accept-invite?token=...`.
- User sets password on accept and is logged in.
- Temp password and manual invite URL remain as fallback if SMTP is missing or email delivery fails.
- Invite preview and accept endpoints:
  - `GET /auth/invitations/:token`
  - `POST /auth/invitations/:token/accept`
- Route caveat fixed: `/accept-invite` must exist both before login and after login so clicking a link while already authenticated does not render a blank page.

Local data cleanup performed on 2026-06-28:
- Deleted stale local `TenantMembership` rows for platform users (`SUPER_ADMIN` / `MODERATOR`) after role separation.
- Promoted existing local tenant managers/admins with `systemRole=USER` from workflow `UserRole.MEMBER` to `UserRole.PM`.
- Correction: the latest local tenant created during QA has `korapotu@gmail.com` as tenant `MANAGER`, `systemRole=USER`.
- Verified local tenant `ออมมี่ จำกัด` has `korapotu@gmail.com` as tenant `MANAGER`, `systemRole=USER`.

Local verification after latest changes:
- `pnpm --filter api type-check` passed.
- `pnpm --filter web type-check` passed.
- `GET http://localhost:4000/health` returned `{"status":"ok"}`.
- Invite token preview endpoint returned the expected invitation payload for `korapotu@gmail.com`.

Deployment note:
- Set API env `APP_PUBLIC_URL` to the web public origin, for example `https://web-production-xxxx.up.railway.app`.
- SMTP variables are required for automatic invite email delivery:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_SECURE`
  - `MAIL_FROM`

## Post-Handover Work Completed (2026-06-28, tenant admin minutes fix)

Implemented and verified locally:
- Added saved minutes history and edit flow:
  - Backend `GET /meetings/:meetingId` now includes `minutes` and `actionItems`.
  - Backend `PATCH /meetings/:meetingId` updates meeting metadata, transcript, and replaces
    saved minute sections.
  - Frontend page `/meetings/history` and `/meetings/history/:meetingId` lists saved meetings,
    opens details, and edits saved minutes.
  - Sidebar now includes `Minute History`.
- Fixed tenant-admin workflow access for projects and minutes:
  - `TENANT_ADMIN` / `MANAGER` now have project visibility and meeting/minute workflow access
    based on `TenantMembership.role`, even when legacy `User.role` is still `MEMBER`.
  - `POST /meetings` and `PATCH /meetings/:meetingId` now allow tenant admins/managers for
    projects inside their tenant.
  - `/projects` supports tenant-scoped listing for the active tenant; Dashboard, Projects,
    and Meeting Studio now call `/projects?tenantId=...`.
  - Project continuity now renders a `Saved meetings` section from `GET /meetings?projectId=...`
    so a newly saved Meeting Studio record appears immediately.

Local QA finding:
- `korapotu@gmail.com` is `TENANT_ADMIN`, job title `CTO`, `systemRole=USER`, and legacy
  workflow `User.role=MEMBER` in the Aommy tenant.
- Local project `Test01` / `Test AI` exists in the Aommy tenant. Before this fix it had
  `_count.meetings=0`, because `POST /meetings` was still blocked by legacy
  `UserRole.ADMIN/PM` checks.
- After this fix, restart API and save minutes again; the new meeting should appear in
  `/continuity/cmqxebe3y0001hji0asdy4lxp` under `Saved meetings` and in `/meetings/history`.

Local verification:
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.
- Restarted local dev servers:
  - API: `http://localhost:4000/health` returned `{"status":"ok"}`.
  - Web: `http://localhost:5175` returned HTTP 200.

## UX Review Before Next Implementation (2026-06-28, reminders and continuity)

User feedback:
- `/reminders` is confusing because digest cards look clickable, but clicking them does not
  show useful details.
- `/continuity` has orange missing-info/action-item rows, but the rows are not actionable,
  so users do not know what to do next.

Review findings:
- Reminders page:
  - Frontend `ReminderOperations` renders digest cards and calls
    `fetchDigestDetail(selectedDigestId)` on click.
  - `useReminders.fetchDigestDetail` calls `GET /reminders/digests/:digestId`.
  - Backend `apps/api/src/routes/reminders.ts` currently exposes `GET /reminders/digests`
    and `GET /reminders/logs`, but does not expose `GET /reminders/digests/:digestId`.
  - Result: card selection has no useful detail response, and the right panel remains
    effectively a dead-end / unclear state.
  - The date range fields are also local state only; they are not applied to the digest query
    because the current backend digest list endpoint has no `startDate` / `endDate` filters.
- Continuity missing-info tab:
  - `ContinuityDashboard` renders `missingOwnerItems` as static warning rows.
  - Rows do not link to a meeting, action-item detail, project context, or an edit/remediation
    workflow.
  - The orange badge communicates "missing information" but not the next action.

Recommended implementation plan:
- Reminders:
  - Add backend digest detail endpoint or adjust frontend to use the existing logs endpoint.
  - Preferred: add `GET /reminders/digests/:digestId` returning digest summary plus related
    reminder/action-item rows.
  - Make digest cards visibly selected and show loading/error/empty detail states in the
    right panel.
  - Add clear copy explaining that this page is for reminder digest inspection, overdue
    follow-up, and escalation review.
  - Either wire date range filters to backend query support or remove/disable them until
    they actually filter the data.
- Continuity:
  - Make missing-info rows actionable.
  - At minimum, add buttons/links such as `Open minutes`, `Open project`, or `Review action`
    depending on available IDs.
  - Include enough context in each row: project, meeting, owner/due-date missing reason, and
    suggested next step.
  - If no edit target exists yet, route to `/meetings/history/:meetingId` when possible or
    add a small remediation panel for owner/due-date fixes.

## Post-Handover Fix (2026-06-28, super-admin setup access)

Issue:
- `admin@org.local` / `Admin123!` could not open `/setup` even as `SUPER_ADMIN`.
- Cause: frontend route/page logic treated setup as first-run onboarding only.
  `SetupRoute` and `TenantSetupPage` both read `setup-onboarding-status-by-user` from
  localStorage and redirected to `/dashboard` when the current user had previously skipped
  or completed setup.

Fix:
- `/setup` now allows direct access for `SystemRole.SUPER_ADMIN` regardless of local
  onboarding skip/completed status.
- Non-super-admin users are still redirected away from `/setup`.
- `TenantSetupPage` still writes skip/completed status when its buttons are used, but no longer
  blocks a super admin from opening the route later.

## Post-Handover Work Completed (2026-06-28, reminders and continuity UX)

Implemented:
- Reminders:
  - Added backend `GET /reminders/digests/:digestId`.
  - Reminder digest list now accepts `startDate` / `endDate` date filters.
  - Reminder digest and log access now uses platform admin or tenant `TENANT_ADMIN` / `MANAGER`
    access instead of legacy `UserRole.ADMIN` / `UserRole.PM`.
  - Frontend date range now has an explicit `Apply date range` action.
  - Clicking a digest card now loads a real detail panel with project context, totals, owner
    grouping, action items, severity labels, due dates, owner/meeting context, and links to
    project continuity or meeting minutes.
  - Detail loading/error/empty states were added so the right panel no longer feels inert.
- Continuity:
  - Missing-info rows now preserve meeting/project context from the API.
  - Orange missing-info rows now show a next-step hint and action buttons:
    `Open minutes` when a meeting ID is available and `Open project` for the project context.
  - Missing reason is explicit (`Owner missing` or `Due date missing`) instead of a generic
    non-actionable badge only.

Verification:
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.

## Caution (type-check artifact)

`apps/web/tsconfig.tsbuildinfo` may change after `tsc`; restore before commit if needed:

```powershell
git restore -- apps/web/tsconfig.tsbuildinfo
```

## Follow-Up Note (2026-06-28, PM project timeline)

User asked whether roles above `MEMBER` already have a project analysis/evaluation panel with a Project Manager timeline.

Current state:
- There is a `Project Continuity Dashboard` at `/continuity/:projectId` (project-scoped).
- `/continuity` without `projectId` redirects to `/projects`.
- **Continuity is not in the sidebar** (2026-06-30, `e0e836b`); users open it from each project card on `/projects`.
- Continuity shows summary, overdue by owner, overdue by project, missing info, and saved meetings.

Gap:
- There is not yet a dedicated PM timeline view that lays out milestones/action items/meeting sequence/workload by date.
- A suggestion-only workload balancing popup **is** live on Continuity (2026-06-29); it is not a date-ordered timeline.
- Recommended future implementation: add a timeline section or tab under Continuity that combines action item due dates, priorities, meetings, recent decisions, and stale/risk indicators into a date-ordered PM view.

## Design Note (2026-06-28, AI workload balancing suggestion)

User approved a suggestion-only workload balancing assistant for PM/manager project continuity.

**Status: implemented and pushed 2026-06-29** in commit `e62e610` (`ContinuityDashboard.tsx`).
See `Post-Handover Work Completed (2026-06-29, workload balancing)` below for what shipped.

Design:
- Scope: `/continuity/:projectId` only, using the currently open project action items and current tenant members.
- Behavior: when the PM opens project continuity, run one AI analysis only when needed:
  - once per calendar day per project, or
  - again during the same day only if the action-item signature changes.
- Signature should include action item id, owner, due date, priority, status, and title, so new tasks from Meeting Studio or meaningful task changes trigger a fresh analysis.
- Cache should live in browser localStorage keyed by project id. If the user dismisses a suggestion, do not auto-open it again for the same day/signature.
- AI output must be suggestion-only. It must not automatically reassign work.
- Popup should be non-blocking, small, and dismissible; it should not interrupt current editing/review flows.
- Prompt should return structured JSON with summary, risk level, overloaded owners, and optional suggested reassignments.
- UI copy should stay user-friendly rather than system-ish; use gentle labels such as `Not now` / `Review action items` and human risk labels instead of raw enum values.
- Actual reassignment remains a PM-confirmed action in the existing Action Items tab.

## Follow-Up Idea (2026-06-28, CEO Ask-AI answers with app deep links)

User asked whether AI can answer executive questions and generate URLs that point back to the
source screens, for example:
- "What did the team agree yesterday?"
- "What did we discuss with customer xxx around the middle of last month?"
- "Which actions are still open?"

Feasibility:
- This is feasible with the current product direction because saved meetings, meeting history,
  continuity, and action items already exist as routable app screens.
- The missing piece is not only retrieval/answering; it is a structured answer contract that
  returns source references and UI links alongside the natural-language answer.

Recommended implementation:
- Add or extend an executive Ask-AI endpoint that retrieves from saved meetings, minute sections,
  decisions, transcript snippets, customer/project names, and action items within tenant scope.
- The AI response should return structured JSON:
  - `answer`: concise user-friendly answer.
  - `sources`: meeting/minute/action references with IDs, dates, project/customer context, and
    short evidence snippets.
  - `links`: app deep links such as `/meetings/history/:meetingId`,
    `/continuity/:projectId`, and a future action-item focused route/filter.
  - `followUps`: optional suggested follow-up questions.
- UI should render links as clear buttons such as `Open meeting minutes`, `Open project actions`,
  or `View open actions`, not raw URLs.
- For questions like "yesterday" or "middle of last month", resolve the date range explicitly
  before retrieval and show the interpreted range in the answer.
- For open action questions, prefer deterministic DB filtering first, then let AI summarize the
  grouped results; do not rely on the model to infer status from text alone.
- Tenant access checks must remain strict. Links should only point to records the current user can
  already open.
- Add telemetry to Ask-AI traces showing selected sources and generated deep links so PM/admins can
  audit why an answer was produced.

Future UI note:
- This could live in the existing dashboard AI chat, but answers should include citation cards
  under the response.
- If action-item detail pages are not added, use `/continuity/:projectId` with a query or state
  filter such as `?tab=actions&status=open` so generated links land close to the relevant work.

## Post-Handover Work Completed (2026-06-29, AI deep links, tenant-scoped continuity, meeting reset)

Implemented:
- Ask-AI answers can now return app deep links alongside the answer:
  - Meeting source: `/meetings/history/:meetingId`.
  - Project source: `/continuity/:projectId`.
  - Action source: `/continuity/:projectId?tab=actions&actionItemId=...`.
- Dashboard AI chat now renders related links directly inside the answer area, immediately after
  the final answer text, instead of placing them in a separate area below the chat.
- Dashboard AI chat now keeps the latest question, answer, and generated links in session storage
  so navigating to one suggested link and coming back does not lose the other suggestions. The state
  is cleared when the user asks a new question or presses clear.
- Project continuity now reads the `tab` and `actionItemId` query params so generated AI links can
  open the Action Items tab and highlight a relevant action item.
- Continuity APIs now support tenant-wide scope for `TENANT_ADMIN` and `MANAGER`, instead of
  incorrectly treating them like member-scoped users that require `projectId`.
- Continuity frontend now passes the active tenant id to summary, overdue-by-owner,
  overdue-by-project, and missing-owner queries so tenant data does not mix across organizations.
- Reminder digest generation and reminder processing now include action items created from
  Meeting Studio saved meetings, not only items attached to approved minute versions.
- Added a meeting-data-only reset script:
  - `pnpm --filter api db:clear-meetings` previews what will be deleted.
  - `pnpm --filter api db:clear-meetings:force` deletes meeting-related data.
  - The script keeps users, tenants/organizations, memberships, and projects.
  - It removes meetings, minutes, action items, reminder logs/digests, notifications,
    embeddings/knowledge chunks, decisions, and AI logs that can point at stale meeting data.

Local data cleanup performed on 2026-06-29:
- Ran `pnpm --filter api db:clear-meetings:force` against local `localhost:5432`.
- Kept: 2 users, 1 tenant/organization, 1 tenant membership, 1 project.
- Removed: 1 meeting, 6 minute entries, 7 embedding chunks, 2 action items,
  5 reminder digests, 5 Ask-AI query logs, and 12 AI run logs.

Verification:
- `pnpm.cmd --filter api type-check` passed.

Still open / recommended follow-up:
- Add route-level tests for the new tenant-scoped continuity behavior.
- Add UI/e2e coverage for AI deep-link persistence after navigation.
- ~~Add explicit platform-user management UI.~~ **Done 2026-06-29**.

## Post-Handover Work Completed (2026-06-29, platform users and action-item route)

Implemented:
- Added super-admin-only organization hard delete:
  - Backend `DELETE /admin/tenants/:tenantId`.
  - Frontend hard-delete button in `/admin/organizations`, visible only to `SUPER_ADMIN`.
  - UI uses a confirmation dialog before deletion.
  - Delete removes projects for the tenant first, then deletes the tenant so memberships,
    invitations, meetings, action items, and related project/meeting data do not remain orphaned.
- Added super-admin-only platform user management:
  - Backend `GET /admin/platform-users`.
  - Backend `PATCH /admin/platform-users/:userId`.
  - Frontend page `/admin/platform-users`.
  - Sidebar item `Platform Users` shown only to `SUPER_ADMIN`.
- The page allows a super admin to:
  - View all users and their platform system role.
  - Promote/demote between normal `USER` and `MODERATOR`.
  - Suspend/restore login access.
  - See tenant membership count per account.
- Super admin accounts are protected/read-only in this UI and cannot be modified from the page.
- Added standalone action item route:
  - `/action-items/:actionItemId`.
  - The route fetches `/action-items/:id`, resolves the project, then redirects to
    `/continuity/:projectId?tab=actions&actionItemId=...`.
  - This gives AI/deep-link flows a clean action-item URL while reusing the existing continuity
    action list, highlighting, and reassignment workflow.
- Ask-AI action links now point to `/action-items/:actionItemId`.

Verification:
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.

## Post-Handover Fix (2026-06-29, action item audit logs)

User asked whether action item operations are logged and visible from the action list:
- Assignee changes.
- Status updates such as done/cancelled/blocked.
- Priority changes.

Implemented:
- Status changes continue to write `ActionItemStatusHistory`.
- Reassign continues to write a history row with the same from/to status and a reassignment note.
- Priority changes now write a history row with a note such as
  `Priority changed from HIGH to CRITICAL`.
- `/continuity/:projectId?tab=actions` now has a per-action `Show action logs` toggle that fetches
  `/action-items/:id` and displays the timeline with status movement, note, timestamp, and actor.
- The same action list also supports PM-friendly controls for status updates, priority changes,
  reassignment, and focused filtering/sorting for high-priority or near-due work.

Verification:
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.

## Post-Handover Fix (2026-06-29, self-task Ask-AI scope)

Issue:
- When a user asked Dashboard AI about "my tasks" / "งานของฉัน" / "งานของตัวเอง", the project
  snapshot still included open action items for every owner in the project.
- Because the model could see other owners' tasks, it could incorrectly answer with another
  person's work as if it belonged to the requester.

Fix:
- `apps/api/src/routes/ai-route.ts` now detects self-task questions in Thai and English.
- When detected, `PROJECT_SNAPSHOT` is built with `assigneeId = current user id` before sending
  the context to the model.
- The prompt also marks `actionItemScope: CURRENT_USER_ONLY` and explicitly tells the model not to
  present another owner's task as the requester's own task.

Verification:
- `pnpm.cmd --filter api type-check` passed.

## Post-Handover Work Completed (2026-06-29, Meeting Studio consultant notes)

Implemented:
- Meeting Studio AI analysis now asks for `consultantNotes` from both document and audio/transcript
  analysis prompts.
- `consultantNotes` is intended to identify weak spots in the minute, missing context, things to
  clarify, risks to watch, or details to add before saving.
- Prompt tone is constructive consultant-style, not blame-oriented.
- The minute template now has an editable `Consultant notes` / `ข้อสังเกตจากที่ปรึกษา` field.
- Step 3 preview shows consultant notes immediately after the executive summary, before decisions.
- Saved meeting minutes now include consultant notes as a persisted minute section.
- DOCX heuristic fallback also fills basic consultant notes when AI analysis is unavailable.

Verification:
- `pnpm.cmd --filter web type-check` passed.

## Communication Sentiment Trend (2026-06-29 design → 2026-06-30 shipped)

**Status: implemented and pushed `627a446`.**

User asked whether the product can roughly analyze employee mood/emotional tone from chat text
across the organization by looking at language trends such as phrasing, politeness markers,
question style, profanity, irritation signals, and similar communication patterns over the last
two to three days, then store an aggregated analysis and mood score in the database.

Clarified intended UI:
- This should appear as a small mood/status icon in `/projects`, specifically in the organization
  team-management area.
- The icon is a lightweight signal for PMs or direct supervisors, not a full dashboard by default.
- Clicking/hovering the icon can reveal the latest trend summary, caveats, and supportive
  suggestions for the PM/lead.
- The goal is to help PMs/leads notice employee/team trends early, not to label or judge people.

Feasibility:
- Technically feasible, but it should be framed as a communication-tone trend, not a diagnosis of
  a person's real emotion or mental state.
- The score should be treated as a rough operational signal to help managers notice friction,
  overload, confusion, urgency, or morale risk, not as a performance judgment.
- This should require clear tenant-level consent/policy, role-based access, and careful copy so
  users understand what is being analyzed and why.

Recommended design:
- Input sources:
  - Start with messages already inside AICentralize-controlled workflows, such as AI chat prompts,
    meeting transcripts, comments/notes, or future team chat integrations.
  - Do not ingest private chat tools unless the organization explicitly connects them and policy
    disclosure is in place.
- Analysis window:
  - Run per tenant on a rolling 2-3 day window.
  - Store one aggregate snapshot per tenant/day and optionally per project/team, depending on
    privacy policy.
- Scheduler / batch processing:
  - Add a daily scheduled batch job that runs around 02:00 local tenant time, or a configured
    system timezone if tenant timezone is not available.
  - The batch should collect eligible chat/message history from the previous 2-3 days and build a
    bounded prompt for AI analysis.
  - Include the exact sent/typed timestamp for each message because time context is important for
    interpreting communication tone. For example, late-night repeated messages, urgent bursts,
    long gaps followed by terse replies, or frequent after-hours questions can change the meaning
    of the same words.
  - Include the full message text for the analysis window when allowed by policy, but cap prompt
    size and summarize older/lower-signal messages if needed.
  - Keep messages ordered by timestamp and grouped by tenant/project/member where appropriate.
  - The batch should write the validated structured result to the database and avoid re-running
    for the same tenant/window unless manually requested or source data changes.
  - Source message processing metadata:
    - Do not rely on a single boolean such as `isSentimentProcessed`; it is too limited for
      rolling 2-3 day windows and reprocessing.
    - Add metadata on eligible chat/history rows where appropriate:
      - `sentimentProcessedAt`
      - `sentimentBatchId`
      - `sentimentWindowStart`
      - `sentimentWindowEnd`
      - `sentimentProcessingStatus` such as `PENDING | PROCESSED | SKIPPED | FAILED`
    - This makes failed jobs, retries, schema changes, and manual reprocessing easier to audit.
- Data model idea:
  - `CommunicationSentimentSnapshot`
    - `tenantId`
    - `projectId?`
    - `userId?` or `memberUserId?` only if explicitly approved for supervisor-level views
    - `windowStart`
    - `windowEnd`
    - `sampleCount`
    - `moodScore` (for example -100 to 100)
    - `stressScore`
    - `frictionScore`
    - `urgencyScore`
    - `confidence`
    - `themesJson`
    - `signalsJson`
    - `createdAt`
  - `CommunicationSentimentSource`
    - `snapshotId`
    - `sourceType` such as `ASK_AI_QUERY`, `MEETING_TRANSCRIPT`, `COMMENT`, or future chat source
    - `sourceId`
    - `messageCreatedAt`
    - `includedAt`
    - This table records which exact source rows were used for a snapshot, so PM/admin audit and
      reprocessing are clearer than a boolean flag alone.
  - Prefer aggregate/team-level storage first. If using per-member signals for PM/supervisor
    visibility, store them as soft trend indicators with strict tenant/project access rules.
  - Avoid exposing raw message content by default.
- Prompt/output contract:
  - Return structured JSON only.
  - Include score values, confidence, short human-readable summary, detected signals, and caveats.
  - Instruct the model not to infer medical/psychological conditions.
  - Instruct the model to separate "text tone signal" from "person's actual feeling".
  - Instruct the model not to judge, blame, rank, or label the employee.
  - Use careful psychologist-like language: tentative, compassionate, context-aware, and focused
    on support. Example framing: "ข้อความช่วงนี้อาจสะท้อนความกดดันหรือความเร่งรีบมากขึ้น ควรเช็กอินอย่างอ่อนโยน"
    rather than "คนนี้หงุดหงิด" or "ทัศนคติไม่ดี".
  - Include a caveat that text alone can be misleading and should be used as a conversation aid.
- UI:
  - Add a small icon in `/projects` organization team-management area.
  - Icon states should be gentle and non-alarming, for example:
    - calm/normal
    - needs attention
    - high pressure signal
    - insufficient data
  - Use friendly, non-judgmental language such as `communication tone may be under pressure`
    rather than labeling employees as angry or negative.
  - Detail popover/modal should show trends and suggested supportive actions, not individual blame.
- Access control:
  - Tenant admins/managers can see aggregate tenant/project snapshots.
  - PMs/direct supervisors can see team/member trend icons only for people they are allowed to
    manage or projects they lead.
  - Members should not see other people's inferred tone. Consider whether members should see their
    own signal later, with supportive self-reflection copy only.
  - Platform admins should only access cross-tenant data if explicitly required for operations,
    ideally without message contents.
- Retention/privacy:
  - Keep source snippets short or avoid storing snippets entirely.
  - Store aggregate signals and anonymized examples where possible.
  - Add retention controls in system settings.

Implementation plan:
- Add Prisma model/migration for aggregate sentiment snapshots.
- Add backend worker or scheduled route that runs at about 02:00, collects eligible text and
  typed timestamps from the last 2-3 days per tenant/project/member, sends a bounded
  time-ordered prompt to the configured model, validates JSON, and stores the snapshot.
- Add tenant-scoped API endpoint for the latest snapshots.
- Add `/projects` team-management icon UI with popover/modal detail containing trend score,
  summary, caveats, and suggested supportive manager actions.
- Add tests for tenant isolation and JSON validation. **Still open.**

## Post-Handover Work Completed (2026-06-30, communication sentiment)

Implemented and pushed (`627a446`):
- Prisma migration `20260630120000_communication_sentiment`:
  - `CommunicationSentimentSnapshot`, `CommunicationSentimentSource`
  - `AskAiQueryLog` sentiment processing metadata fields
- `communicationSentimentService.ts`:
  - Rolling 3-day window from `AskAiQueryLog.question` (v1 input source)
  - Thai/English heuristics for profanity, urgency, stress, friction, after-hours signals
  - Optional AI summary via `generateWithLocalModel`
  - Daily cron at 02:00 (`SENTIMENT_CRON`, default `0 2 * * *`)
- API (`/tenants/:tenantId/communication-sentiment`):
  - `GET /latest`, `GET /members`, `POST /run`
  - `TENANT_ADMIN` and `MANAGER` only
- Web:
  - `TeamSentimentBadge` on `/projects` team table
  - Manual refresh button calls `POST /run`
  - i18n `communicationSentiment.*` (TH/EN)

Still open from original design:
- Per-project snapshots (v1 is tenant + per-member only)
- `MEETING_TRANSCRIPT` / `COMMENT` source types (enum exists, not wired in v1)
- Tenant isolation and JSON validation tests
- Tenant-level mood summary in team section header (per-member badges only today)

Verification:
- `pnpm --filter api type-check` passed
- `pnpm --filter web type-check` passed
- Local `prisma migrate deploy` applied; production applies via `docker/start.sh` on container boot

## Post-Handover Implementation (2026-06-29, project knowledge onboarding)

**Status: implemented and pushed `4cb67d5`.**

User asked how "Rubjob / รับจบ" should work with projects that are already ongoing rather than
newly created projects. The key concern is making sure baseline project knowledge is imported in
a correct, repeatable, and structured way before Ask-AI starts answering project questions.

Implemented first slice:
- Added Prisma models and migration:
  - `ProjectKnowledgeSource`
  - `ProjectKnowledgeExtraction`
  - `ProjectMemoryItem`
  - enums for source type, authority level, source status, memory item type, and memory status.
- Added project-scoped API endpoints:
  - `GET /projects/:projectId/knowledge/baseline`
  - `GET /projects/:projectId/knowledge/sources`
  - `POST /projects/:projectId/knowledge/sources`
  - `POST /projects/:projectId/knowledge/sources/:sourceId/extract`
  - `POST /projects/:projectId/knowledge/sources/:sourceId/approve`
  - `GET /projects/:projectId/knowledge/memory`
- Added `/projects/:projectId/knowledge` frontend page:
  - PM/admin can paste source text from TOR, requirements, old minutes, action/risk logs, etc.
  - Source can be marked as current truth, supporting context, or historical context.
  - Source can be extracted into a structured baseline draft.
  - Extracted baseline can be approved into `ProjectMemoryItem`.
  - Page shows baseline readiness, source queue, and approved memory grouped by type.
- Added a project card link from `/projects` to the new baseline page.
- Ask-AI now includes approved `ProjectMemoryItem` rows as project-memory evidence when a
  project-scoped question is asked, so Rubjob can use the imported baseline immediately.

Current limitations after first slice (superseded partially — see 2026-06-30 knowledge v2 below):
- ~~Upload is text/paste based. DOCX/PDF parsing is still a follow-up.~~ **Done** (`4cb67d5`) —
  client-side import for DOCX, PDF (text-based), XLSX, CSV, TXT, and MD.
- ~~Extraction is deterministic keyword/line based, not yet LLM-powered.~~ **Done** (`4cb67d5`) —
  AI extraction first (`project-knowledge-onboarding-v2-ai`), heuristic fallback on failure.
- Review UI approves the latest extraction as a batch; item-level edit/merge/discard is still a
  follow-up.
- Approved memory is included in Ask-AI through lexical scoring, not yet vectorized
  `MeetingKnowledgeChunk` style retrieval.

Verification:
- `pnpm.cmd --filter api prisma:generate` passed.
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.

Recommended concept:
- Add a dedicated `Project Knowledge Onboarding` flow for existing projects.
- The flow should let a PM/admin upload historical source material such as:
  - TOR / proposal / contract / scope documents.
  - System requirements, SRS, BRD, user stories, backlog exports, acceptance criteria.
  - Architecture diagrams or technical notes where available.
  - Old meeting minutes and decision logs.
  - Existing action item sheets, risk registers, issue logs, and timeline/milestone plans.
  - Customer emails or chat exports only if explicitly allowed and scoped to the project.
- The goal is not just file storage. The system should convert raw documents into structured
  project memory that matches the current product design: meetings, decisions, risks, action
  items, glossary/entities, milestones, open questions, assumptions, and retrieval chunks.

Suggested UX flow:
- Entry point:
  - `/projects/:projectId/knowledge-onboarding` or a tab inside project detail / continuity.
  - Show as a guided checklist for ongoing projects: `Upload sources`, `Review extracted memory`,
    `Confirm baseline`, `Activate Ask-AI`.
- Upload step:
  - Support batch upload with source type selection: TOR, requirement, minutes, action log,
    risk/issue log, timeline, other.
  - Capture document date, version, owner/uploader, project phase, and whether the source is
    authoritative.
  - Allow PM to mark older files as historical context rather than current truth.
- AI extraction step:
  - Extract structured JSON per document:
    - project overview / objective
    - scope in/out
    - stakeholders and customer names
    - requirements
    - milestones / deadlines
    - decisions
    - action items
    - risks / issues
    - assumptions / constraints
    - glossary and project-specific terms
    - unresolved questions
  - Store provenance on every extracted item: source document id, page/section if available,
    extractedAt, confidence, and original snippet or reference.
- Human review step:
  - Do not activate extracted knowledge blindly.
  - PM should approve, edit, merge duplicates, or discard extracted items.
  - Use clear conflict handling when older minutes contradict newer requirements:
    - prefer newer approved source
    - surface conflict warning
    - let PM mark the current truth.
- Activation step:
  - Once approved, write to the existing project knowledge surfaces:
    - meeting/minute history where source is historical minutes
    - action items where source contains open tasks
    - continuity summary / project memory snapshot
    - vector retrieval chunks with tenant/project/source metadata
    - AI trace provenance so answers can cite imported sources later.

Data model ideas:
- `ProjectKnowledgeSource`
  - `tenantId`
  - `projectId`
  - `sourceType`
  - `fileName`
  - `documentDate`
  - `versionLabel`
  - `authorityLevel` such as `AUTHORITATIVE | SUPPORTING | HISTORICAL`
  - `status` such as `UPLOADED | EXTRACTED | REVIEWED | APPROVED | REJECTED`
  - `uploadedById`
  - `createdAt`
- `ProjectKnowledgeExtraction`
  - `sourceId`
  - `extractionJson`
  - `confidence`
  - `model`
  - `promptVersion`
  - `createdAt`
- `ProjectMemoryItem`
  - `tenantId`
  - `projectId`
  - `sourceId`
  - `type` such as `REQUIREMENT | DECISION | RISK | ACTION | MILESTONE | GLOSSARY | ASSUMPTION`
  - `title`
  - `content`
  - `status`
  - `effectiveDate`
  - `supersededById?`
  - `approvedById?`
  - `approvedAt?`
- Existing embedding chunks should include `sourceId`, `projectId`, `tenantId`, `sourceType`,
  `authorityLevel`, and approved/review status so retrieval can prefer current approved knowledge.

Prompt and answer behavior:
- Ask-AI should know whether a project has a confirmed baseline.
- If baseline is incomplete, answers should say so gently and point to missing source categories.
- Answers should prioritize approved/current memory over raw uploads.
- When answering project questions, Rubjob should cite or link to the source category and detail
  page where possible, for example approved minute, requirement item, action item, or source file.
- The assistant should separate:
  - confirmed facts
  - likely interpretation
  - unresolved or conflicting information.

Important safeguards:
- Tenant/project isolation is mandatory.
- Do not let imported knowledge leak across projects.
- Avoid treating all old minutes as current truth; older decisions may be superseded.
- Keep a review queue so PM remains accountable for the baseline.
- Keep provenance for every extracted item because ongoing projects often have conflicting history.

Suggested first implementation slice:
- ~~Build upload + source registry for ongoing project knowledge.~~ **Done** (first slice + file import v2).
- ~~Support DOCX/PDF/text extraction for TOR, requirements, and old minutes.~~ **Done** (`4cb67d5`).
- ~~Generate a structured `Project Baseline Summary`.~~ **Done** via extraction + baseline status card.
- ~~Add PM review/approve screen.~~ **Done** via extract + approve on `/projects/:projectId/knowledge`.
- Store approved baseline as `ProjectMemoryItem` plus retrieval chunks. **Partial** — memory items yes, vector chunks no.
- Add a continuity/Ask-AI indicator: `Baseline ready`, `Needs review`, or `No baseline imported`. **Partial** — baseline status on knowledge page only.

## Post-Handover Work Completed (2026-06-30, project general notes)

**Status: implemented and pushed `4cb67d5`.**

Implemented:
- Added a new project-level `General Notes` surface for extra human knowledge that does not
  naturally fit into formal meeting minutes or baseline uploads.
- Added Prisma model and migration:
  - `ProjectGeneralNote`
  - Fields: `projectId`, `tenantId`, `authorId`, `title`, `content`, timestamps.
- Added project-scoped API:
  - `GET /projects/:projectId/notes`
  - `POST /projects/:projectId/notes`
- Added frontend page:
  - `/general-notes`
  - `/projects/:projectId/notes`
- Added sidebar menu item `General Notes` plus project-card shortcut from `/projects`.
- The page is intentionally step-based:
  1. Choose project.
  2. Write note.
  3. Save.
- Notes store the writer's user id automatically so later retrieval and source citation can
  identify who added the context.
- Ask-AI now pulls `ProjectGeneralNote` rows as additional project evidence when a project-scoped
  question is asked.
  - Citations include author name + author id inside the evidence snippet.
  - App links now include `Open general notes` and route to `/projects/:projectId/notes`.

Why this exists:
- People in the same meeting can interpret situations differently.
- Some ideas, concerns, or field knowledge are never presented in the room.
- Sometimes someone learns new context later and wants it searchable without rewriting official
  minutes.
- This feature gives Ask-AI a broader, attributable project memory layer beyond approved minutes
  and baseline onboarding.

Verification:
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.

Local environment note:
- `pnpm.cmd --filter api exec prisma generate` hit a Windows file lock on
  `.prisma/client/query_engine-windows.dll.node` while local processes were running.
- If Prisma client regeneration is needed again, stop local Node/API processes first, then rerun
  generate/deploy.

## Post-Handover Work Completed (2026-06-29, workload balancing)

Implemented and pushed (`e62e610`, `ContinuityDashboard.tsx`):
- Suggestion-only workload balancing popup on `/continuity/:projectId`.
- Runs once per calendar day per project, or again same day only when the action-item signature
  changes (id, owner, due date, priority, status, title).
- Cache in browser `localStorage` keyed by project id; dismiss suppresses re-open for same
  day/signature.
- Non-blocking dismissible popup with summary, risk level, overloaded owners, and optional
  reassignment suggestions — no automatic reassignment.
- User-friendly copy via i18n (`continuity.workloadSuggestions`, `Not now`, risk labels).

Still open from original design:
- Dedicated date-ordered PM timeline tab (separate from this popup) — see Follow-Up Note below.

## Post-Handover Work Completed (2026-06-30, project knowledge v2)

Implemented and pushed (`4cb67d5`):
- `ProjectKnowledgePage` now supports batch file import, not only paste:
  - DOCX via mammoth
  - PDF text extraction (text-based PDFs; image-only PDFs fail with a clear error)
  - XLSX via jszip shared strings
  - CSV/TSV and TXT/MD
- Each imported file creates a source, auto-runs extract, and reports per-file success/failure.
- Backend extraction now tries AI structured JSON first (`extractProjectKnowledgeWithAi`), then
  falls back to the deterministic line classifier if the model or parse fails.
- Ask-AI link type extended with `knowledge` for future deep links to the knowledge page.

Still open:
- Item-level edit/merge/discard in the review UI.
- Vectorized retrieval chunks for approved `ProjectMemoryItem` rows.
- Baseline readiness indicator on Continuity or Dashboard (currently knowledge page only).

Verification:
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.

## Post-Handover Work Completed (2026-06-30, Meeting Studio UX)

Implemented and pushed (`e0e836b`):

**Background audio transcription**
- Long ASR runs in a client-side background job (`meetingStudioJobStore`, `audioJob.ts`).
- Global `MeetingStudioJobBanner` in `Layout` shows top progress bar; browser notification on completion.
- User can navigate away while transcription runs.

**Multi-format document upload**
- `documentText.ts` supports TXT, MD, CSV, TSV, DOCX, PDF (text-based), XLSX (via `jszip`).
- Uploaded file name and `lastModified` stored in studio settings and persisted on save.

**Hide AI model/confidence from user-facing UI**
- `redactAiMetadata.ts` strips labels like model name and confidence from trace/continuity/knowledge views.

**Continuity navigation**
- Removed standalone Continuity item from sidebar (`navigation.ts`).
- `/continuity` redirects to `/projects`; project cards still link to `/continuity/:projectId`.

Deploy note:
- `jszip` was added to `apps/web/package.json` without updating `pnpm-lock.yaml` in the first push;
  fixed in `54457cd` (Railway `frozen-lockfile` install).

Verification:
- `pnpm --filter api type-check` passed
- `pnpm --filter web type-check` passed

## Post-Handover Work Completed (2026-06-30, Push + prompts + ASR)

Implemented and pushed:

**Action-item push notifications (`4e9aaf6`)**
- `actionItemNotificationService.ts` hooks on reassign, due date, priority, status changes.
- `reminderDispatchService` sends push when user has `pushEnabled` and active subscription.
- `push-sw.js` click handler navigates to target URL.

**Long transcription timeouts (`5f1d652`, `4e69563`)**
- nginx `/ai/` and `/api/playground/` proxy read timeout **3700s**.
- API `ASR_REQUEST_TIMEOUT_MS` default **3600000** (1 hour).

**Playground prompt limit (`61127ae`)**
- `MAX_PLAYGROUND_PROMPT_CHARS = 120_000` in `apps/api/src/constants/aiLimits.ts`.
- System settings default/max promoted from legacy 4k/12k.
- Shared `meetingAnalysisPrompt.ts` for Meeting Studio transcript/document analysis.

**iPhone push + PWA onboarding (`db369f8`)**
- `PushSetupPanel`: Step 1 install (iOS manual guide / Android native install), Step 2 enable push.
- `PushOnboardingBanner` in `Layout` → `/profile#notifications`.
- `pwaUtils.ts`: iOS detection, standalone PWA check, same-origin `/api` base URL.
- `pushNotifications.ts`: register service worker **before** `Notification.requestPermission()` on iOS.
- `manifest.json`: added `"id": "/"`.

Verification:
- `pnpm --filter web type-check` passed

## Post-Handover Work Completed (2026-06-30, Feeling Log)

Implemented and pushed (`ae265c3`, `37eac5d`):

**Feeling log API + web (`/feeling-logs`)**
- Prisma: `FeelingLog`, `FeelingLogMention`, `FeelingLogAnalysis`; migrations `20260630183000_feeling_logs`, `20260630200000_feeling_log_batch_processing` (`processedAt`).
- **Save flow:** store text + emoji + `@mention` immediately — **no inline AI** on save.
- **Batch flow:** cron daily **02:00** (`FEELING_LOG_BATCH_CRON`, default `0 2 * * *`, `Asia/Bangkok`); runs when **≥3 days** since last batch and pending logs exist.
- Batch groups pending logs by **recorder (author)** and **mentioned person**, plus tenant **leadership** summary (no author identity in manager view).
- API:
  - `GET/POST /tenants/:tenantId/feeling-logs/me`
  - `GET /tenants/:tenantId/feeling-logs/inbox` (`TENANT_ADMIN` / `MANAGER`)
  - `POST /feeling-log-batch/run-now` (`SUPER_ADMIN`)
  - `GET /feeling-log-batch/scheduler-status`
- Web: `FeelingLogsPage` — tab **บันทึกของฉัน** (all users) + tab **ภาพรวมทีม** (managers only).
- Scheduler: `startFeelingLogBatchScheduler()` in `apps/api/src/index.ts`.

**Manager UI location:** same page `/feeling-logs` → tab **ภาพรวมทีม** (not a separate route). Insights appear only after batch processing.

Verification:
- `pnpm --filter api type-check` passed (after `prisma generate`)
- `pnpm --filter web type-check` passed

## Post-Handover Work Completed (2026-06-30, Kora welcome + My Tasks)

Commits: `c912763`, `922b7d7`, `2d1cd5d` on `main`.

### Routing and auth behavior

| Path | Guest | Logged-in tenant user | Platform admin |
|------|-------|----------------------|----------------|
| `/` | `WelcomePage` | Redirect → `/dashboard` | Redirect → `/admin/organizations` |
| `/auth/login` | Login | Redirect → dashboard/admin if already authed | Same |
| `/my-tasks` | — | `MyTasksPage` (`WorkflowRoute`) | Redirect → admin |

`App.tsx` no longer sends unauthenticated users straight to login; marketing landing is the default entry.

### Kora rebrand (`c912763`, `922b7d7`)

- Display name **Kora** — `apps/api/src/config/brand.ts` (`APP_DISPLAY_NAME`); used in emails, push copy, OpenAPI title.
- Web: `index.html` title/theme, `manifest.json`, favicons/PWA icons under `apps/web/public/brand/` and `public/`.
- Brand ingest scripts:
  - `scripts/ingest-kora-pack.py` — from `kora-pack/` (KORA icon sections zip).
  - `scripts/extract-kora-brand-assets.py` — hero crops and icon sheet processing.
- Asset guide: `apps/web/public/brand/README.md`.
- `vite.config.ts` ignores `kora-pack/` for file watching (prevents EBUSY on Windows dev).
- Login page: link **กลับหน้าแรก** → `/`.

### Welcome page selling points (`2d1cd5d`)

**File:** `apps/web/src/pages/WelcomePage.tsx`

| Section | i18n keys | Notes |
|---------|-----------|-------|
| Hero | `landing.eyebrow`, `heroTitle`, `heroSubtitle` | Centered above banner |
| Banner | `landing.heroBannerAlt` | `/brand/kora-landing-banner.png` full width |
| Highlights (3) | `landing.heroHighlights.*` | knowledgeHub, teamPulse, contextAi |
| Spotlight | `landing.spotlight.*` | Two large cards: Knowledge Hub + Feeling Log |
| Feature grid | `landing.features.*` | 6 cards; knowledge + feelingLogs first |
| CTA | `landing.getStarted`, `exploreFeatures` | `#spotlight` anchor |

Product intent: sell **organizational knowledge** and **team atmosphere** (Feeling Log), not meetings alone.

### My Tasks — product rules (`2d1cd5d`)

| Topic | Behavior |
|-------|----------|
| **List scope** | Only items where `assigneeId` = current user |
| **Project scope** | Across all projects the user can access in current tenant |
| **Create** | Requires `projectId`; no meeting required |
| **Team view** | Unchanged — Continuity → Actions tab shows all project items |
| **Create form UX** | Collapsed by default; toggle `myTasks.showCreateForm` / `hideCreateForm` |
| **Title field label (TH)** | **งานที่ต้องดำเนินการ** (`myTasks.taskTitle`) |

### ActionItemsPanel — shared UI (`2d1cd5d`)

**Path:** `apps/web/src/components/features/action-items/ActionItemsPanel.tsx`

| Prop / mode | Continuity (`mode="project"`) | My Tasks (`mode="mine"`) |
|-------------|------------------------------|--------------------------|
| `projectId` | Required | N/A (cross-project) |
| `showCreateForm` | Optional | `true` |
| `showProjectColumn` | Usually false | `true` |
| `showOwnerFilter` | `true` | `false` |
| `allowReassign` | `true` (project context) | From `canAssignActionItemsToOthers` |

`ContinuityDashboard.tsx` still contains legacy action-item code in places; only minor nullable `meeting`/`project` display fixes were applied. Future refactor: fully delegate to `ActionItemsPanel`.

**Owner dropdown options:** `GET /tenants/:tenantId/members` (active only); fallback `GET /tenants/:tenantId/users` if member rows lack nested `user`.

### API — action items (`2d1cd5d`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/action-items?mine=true&pageSize=100` | Current user's tasks across accessible projects |
| `GET` | `/action-items?projectId=...` | Project board (Continuity) |
| `POST` | `/action-items` | Create project-only task |
| `POST` | `/action-items/:id/reassign` | Change assignee |
| `PATCH` | `/action-items/:id` | Update detail, due date, priority |
| `POST` | `/action-items/:id/status` | Status transition |

**Create body example:**

```json
{
  "projectId": "clx...",
  "title": "งานที่ต้องดำเนินการ",
  "dueDate": "2026-07-05T00:00:00.000Z",
  "priority": "MEDIUM",
  "ownerUserId": "optional — omit or self for members"
}
```

**Assignee permission (API):** `canAssignActionItemsToOthers(user, projectId)` in `actionItemService.ts`:
- `UserRole` ADMIN / PM → yes
- `TenantRole` TENANT_ADMIN / MANAGER for project's tenant → yes
- Otherwise → assignee forced to `req.user.id`

**Assignee permission (web):** `apps/web/src/lib/actionItemPermissions.ts` + `resolveTenantMembership()` (prefers fresh `/tenants/me` list over stale persisted `currentMembership`).

### Schema migration `20260630210000_action_item_project_scope`

1. Add `ActionItem.projectId` (nullable).
2. Backfill from `Meeting.projectId` where `meetingId` set.
3. `projectId` NOT NULL; `meetingId` nullable.
4. FK `projectId` → `Project` ON DELETE CASCADE.
5. Index `(projectId, status, dueDate)`.

Downstream services updated: `continuityService`, `reminderService`, `morningBriefingService`, `accessScopeService`, `minuteDraftService`, seed.

### Layout / tenant store fix (`2d1cd5d`)

`Layout.tsx` always calls `GET /tenants/me` for non-platform users and **re-syncs** `currentMembership` from API (fixes stale `tenant-store` in localStorage showing wrong role → assignee dropdown disabled).

### Known limitations / follow-ups

| Item | Notes |
|------|-------|
| `assertCanMutate` | Still uses legacy `UserRole.MEMBER` — tenant admin editing **another person's** task may 403 on patch/status |
| Single-member org | Assignee dropdown shows only self until more members onboarded |
| `requireRole([ADMIN, PM])` elsewhere | Partially addressed on action-item create/reassign; other routes still open (see tracker) |
| Continuity refactor | `ActionItemsPanel` extracted but Continuity not fully migrated |

### Files touched (high signal)

| Layer | Paths |
|-------|-------|
| Schema | `apps/api/prisma/schema.prisma`, `migrations/20260630210000_action_item_project_scope/` |
| API routes | `apps/api/src/routes/action-items.ts` |
| API services | `actionItemService.ts`, `accessScopeService.ts`, `continuityService.ts`, `reminderService.ts`, … |
| Web pages | `WelcomePage.tsx`, `MyTasksPage.tsx`, `LoginPage.tsx` |
| Web components | `ActionItemsPanel.tsx`, `actionItemTypes.ts`, `Layout.tsx`, `Sidebar.tsx` |
| Web lib | `actionItemPermissions.ts` |
| Config | `navigation.ts`, `App.tsx`, `i18n/en.json`, `th.json` |
| Brand | `apps/web/public/brand/*`, `scripts/ingest-kora-pack.py` |

Verification:
- `pnpm --filter api type-check` passed
- `pnpm --filter web type-check` passed

---

## Post-Handover Work Completed (2026-07-01, subscription packages + polish)

### Subscription packages

- **Migration:** `20260630223000_subscription_packages` — `SubscriptionPackage` model, `Tenant.currentPackageId`, default `FREE` package.
- **Admin API:** `GET/POST/PATCH/DELETE /admin/packages` (`SUPER_ADMIN`).
- **Admin UI:** `AdminPackagesPage.tsx` at `/admin/packages`; package picker on `AdminOrganizationsPage` and `TenantSetupPage`.
- **Quota:** `POST /projects` returns `409` when tenant reaches `currentPackage.maxProjects`.

### Feeling log privacy (`feelingLogService.ts`)

- `privacySafeInsightText()` strips content that mirrors raw journal phrasing.
- Batch AI prompts explicitly forbid quoting original entry text in manager/mention insights.

### General notes (`ProjectGeneralNotesPage.tsx`, `approvedAskAiService.ts`)

- URLs in note body render as links (`target="_blank"`).
- PUBLIC general notes included in approved Ask-AI project evidence.

### Feature flags (`featureFlagStore.ts`)

- Maps package `features` codes (e.g. `AI_CHAT_BASIC`, `CONTINUITY_SUMMARY`) to plan entitlements.

---

## Open Items Tracker (2026-06-30 end-of-day)

Reconciled against the codebase. Items marked done below are implemented; remaining items are
still open.

| Item | Status | Notes |
|------|--------|-------|
| Platform user management UI (`/admin/platform-users`) | **Done** | Committed `3ecf3f4` |
| Admin org member `jobTitle` / `department` edit | **Done** | `/admin/organizations`, save on blur |
| Inactive tenant/member unit tests | **Done** | `tenantAccessService.test.ts`, `reminderDigestService.test.ts` |
| Ask-AI deep links + session persistence | **Done** | Committed `58d5a65`; `knowledge` link type in `4cb67d5` |
| Reminders digest detail + date filters | **Done** | 2026-06-28 section |
| Continuity missing-info actionable rows | **Done** | 2026-06-28 section |
| Workload balancing suggestion popup | **Done** | Committed `e62e610` |
| Project knowledge onboarding (first slice) | **Done** | Committed `4cb67d5` |
| Project knowledge file import + AI extraction | **Done** | Committed `4cb67d5` |
| Project general notes | **Done** | Committed `4cb67d5` |
| Meeting Studio background transcription | **Done** | Committed `e0e836b` |
| Meeting Studio multi-format document upload | **Done** | Committed `e0e836b`; lockfile `54457cd` |
| Hide AI model/confidence in user UI | **Done** | Committed `e0e836b` |
| Continuity sidebar removed (Projects entry only) | **Done** | Committed `e0e836b` |
| Communication sentiment trend | **Done** | Committed `627a446`; tests still open |
| Action-item push notifications | **Done** | Committed `4e9aaf6` |
| Long ASR / nginx transcription timeouts | **Done** | Committed `5f1d652`, `4e69563` |
| Playground prompt 120k limit | **Done** | Committed `61127ae` |
| iPhone push setup wizard + PWA banner | **Done** | Committed `db369f8` |
| Morning briefing engine (Rubjob) | **Done** | Committed `ae26706`, `ab2611f` |
| General note PUBLIC/PRIVATE visibility | **Done** | Committed `ae26706` |
| Feeling log / private mood journal | **Done** | `ae265c3`, `37eac5d` — batch every 3 days 02:00 |
| Kora rebrand + guest welcome landing | **Done** | `c912763`, `922b7d7`, `2d1cd5d` |
| My Tasks (`/my-tasks`) | **Done** | `2d1cd5d` — project-scoped action items, mine filter |
| Tenant-admin action-item assignees | **Done** | `2d1cd5d` — `TenantRole` TENANT_ADMIN/MANAGER |
| Welcome Knowledge Hub + Feeling Log spotlight | **Done** | `2d1cd5d` |
| Subscription packages admin + tenant assignment | **Done** | `AdminPackagesPage`, migration `20260630223000_subscription_packages` |
| Project quota by package | **Done** | `POST /projects` enforces `maxProjects` |
| General notes links + Ask-AI context | **Done** | PUBLIC notes in evidence; URLs open in new tab |
| Feeling-log privacy-safe manager insights | **Done** | `privacySafeInsightText` + stricter batch prompts |
| Documentation refresh (Kora, My Tasks) | **Done** | handover, FEATURES, QUICK_REFERENCE, frontend guides |
| Action-item `requireRole` on create/reassign | **Done** | `2d1cd5d` |
| Continuity fully on `ActionItemsPanel` | **Open** | Panel extracted; Continuity still has duplicate logic |
| Tenant admin edit others' tasks (patch/status) | **Open** | `assertCanMutate` still MEMBER-only by assignee |
| Feeling log batch scheduler admin UI in AI Trace | **Open** | API exists; no web panel yet (mirror morning briefing panel) |
| Push notification delivery e2e test on real iPhone PWA | **Open** | Wizard shipped; production VAPID + Home Screen flow needs field verify |
| Account suspension route-level tests | **Open** | No vitest coverage for login/requireAuth/refresh suspend path |
| Login-page friendly suspended-account message | **Open** | `LoginPage` shows generic `error.message` only |
| PM date-ordered timeline view | **Open** | Continuity has summary/tabs but no timeline tab |
| Sentiment tenant isolation + JSON tests | **Open** | Service shipped without automated tests |
| Project memory vector retrieval | **Open** | Lexical scoring only |
| Project knowledge item-level review | **Open** | Batch approve only |
| Continuity tenant-scope route tests | **Open** | |
| Review `requireRole([ADMIN, PM])` vs tenant-role routes | **Open** | Partial — action-items create/reassign done in `2d1cd5d` |
| Local Node >= 22 | **Open** | Local still v20.10.0 |

Commit status:
- Prior push: **`2d1cd5d`** (2026-06-30 late session) on `main`.
- This session adds subscription packages, privacy polish, and documentation (commit pending push).
- Migrations on deploy: `20260630210000_action_item_project_scope`, `20260630223000_subscription_packages`.
- Production DB migrations apply automatically via `docker/start.sh` on API container boot.
- Product feature map: [`docs/FEATURES.md`](./FEATURES.md).

## Development Roadmap (recommended next steps)

Prioritized from open items, today's architecture, and product direction. Use this as the default backlog for the next session.

### P0 — Stabilize what shipped today

1. **Production smoke test (manual)**
   - **Welcome:** guest `/` — hero, banner, spotlight, language switch.
   - **My Tasks:** `/my-tasks` — list, create with project, tenant-admin assignee dropdown (needs 2+ members in org).
   - Feeling log: save entry → wait for batch or `POST /feeling-log-batch/run-now` → confirm personal card + manager tab **ภาพรวมทีม**.
   - Morning briefing: `POST /morning-briefings/run-now` → Dashboard dialog + ack → sentiment pipeline.
   - iPhone push: Home Screen install → Profile → Enable push → reassign task → notification.
   - Long Meeting Studio audio: 20+ min file completes within 1h ASR window.
2. **Feeling log batch observability in UI**
   - Add AI Trace panel for `FEELING_LOG_ANALYSIS` (like morning briefing): cron, last run, pending count, Run now.
3. **Cron singleton risk**
   - Document or implement leader lock if API scales to **multiple replicas** (morning briefing + feeling batch + reminders).

### P1 — Rubjob / people intelligence

4. **Connect feeling log → communication sentiment**
   - Leadership batch insights could feed `communicationSentimentService` as a new source type (careful: no raw text, no author PII).
5. **Manager dashboard entry**
   - Optional badge on `/projects` or Dashboard when manager inbox has new post-batch insights (today: user must open `/feeling-logs` → **ภาพรวมทีม**).
6. **Mentioned-person notification (opt-in)**
   - After batch, notify managers when frequent-mention threshold crossed (reuse push infrastructure).

### P1 — Ask-AI & knowledge depth

7. **Project memory vector retrieval** — enable pgvector scoring in `hybridRetrievalService` (lexical-only today).
8. **Project knowledge item-level review UI** — move beyond batch approve for onboarding extractions.
9. **PM continuity timeline tab** — date-ordered action/meeting timeline (requested earlier).

### P2 — Quality & governance

10. **Automated tests:** sentiment tenant isolation, feeling log batch grouping, suspension login/refresh paths.
11. **Login suspended-account friendly message** on `LoginPage`.
12. **Review `requireRole([ADMIN, PM])` vs tenant-role routes** for remaining legacy paths (action-item create/reassign **done** in `2d1cd5d`).
13. **Tenant admin mutate others' tasks** — extend `assertCanMutate` beyond legacy `UserRole.MEMBER` check.
14. **Refactor Continuity** to use `ActionItemsPanel` only (remove duplicate action-item UI).
15. **AI deep-link navigation e2e** (Playwright or similar).

### P2 — Platform & ops

16. **ASR scale path** — GPU Whisper or chunked pipeline if CPU `small` remains too slow for 20–60 min meetings.
17. **Multi-part audio** — optional upload queue + merge transcript (today: manual split + paste).
18. **Billing / feature flags** — wire `featureFlagStore` to user API instead of hardcoded `PRO` in `App.tsx`.
19. **Local Node >= 22** — align with repo engine requirement.

### Rubjob persona — longer arc

Preserve the spec blocks already in this handover (identity, decision engine, briefing, risk, retrieval, guardrails). Next incremental capabilities:

- **Role-aware tone** in morning briefing (CEO vs PM vs Member) — partial in prompt, not yet per-user profile driven.
- **Proactive nudges** when sentiment + feeling batch + overdue tasks align (needs rules engine, not more prompts alone).
- **Evidence-first answers** everywhere Ask-AI touches people topics — never surface raw feeling log text outside author view.

## New Requirement - Morning Briefing Engine (2026-06-30)

User wants to formalize "น้องรับจบ / Rubjob" as an operational AI teammate and implement daily AI-generated morning briefings.

AI capability spec to preserve:
- Core Identity: who Rubjob is, personality, boundaries, and operating stance.
- Decision Engine: prioritization rules for urgency, overdue work, risk, role scope, and responsibility.
- Daily Briefing Engine: generate a ready-to-read briefing every morning.
- Risk Analysis Engine: surface risk signals and suggested follow-ups.
- Knowledge Retrieval Rules: use approved data/RAG evidence and cite concrete records.
- Recommendation Engine: recommend from evidence only; never invent facts.
- Communication Style: adapt language for CEO, Sales, PM, Developer, HR, and Member users.
- Guardrails: do not fabricate data, do not expose cross-tenant data, do not overstate sentiment/HR conclusions.

Implementation requirement:
- Add a scheduled script/cron that runs every day at **04:30 AM**.
- The job should scan action items relevant to each active member:
  - overdue
  - due today / due soon
  - near due with high or critical priority
  - blocked or personally assigned responsibilities
- Generate a per-user AI morning briefing that appears when each team member opens the app.
- Users above `MEMBER` should receive broader visibility:
  - their own work
  - team/project follow-ups they should monitor
  - high-risk overdue or high-priority items in their accessible tenant/project scope
- Add acknowledgement buttons with sentiment score:
  - `I got it!` = `+3`
  - `I know` = `0`
  - `เออ รู้แล้ว` = `-3`
- If the user clicks `เออ รู้แล้ว`, show a confirmation dialog asking whether they want to review the briefing items again (`Yes` / `No`).
- Store acknowledgement score as a signal connected to the existing communication sentiment feature.

Suggested implementation notes:
- Add persistent `MorningBriefing` / `MorningBriefingAcknowledgement` data or equivalent.
- Add API endpoints for "my latest briefing", manual run, and acknowledge.
- Reuse existing action-item scope, tenant access, AI run logging, and sentiment processing patterns.
- Frontend entry point should be the dashboard so users see the morning briefing immediately after opening the app.

## Post-Handover Implementation (2026-06-30, Morning Briefing Engine)

Implemented and pushed (`ae26706`, `ab2611f`):
- Added Prisma models and migration `20260630163000_morning_briefings`:
  - `MorningBriefing`
  - `MorningBriefingAcknowledgement`
  - `MorningBriefingStatus`
  - `MorningBriefingAckMood`
- Added `AiRunOperation.MORNING_BRIEFING` for observability.
- Added `CommunicationSentimentSourceType.MORNING_BRIEFING_ACK` so acknowledgement scores can feed the existing communication sentiment pipeline.
- Added `morningBriefingService.ts`:
  - scheduled daily run from `MORNING_BRIEFING_CRON`, default `30 4 * * *`
  - timezone from `MORNING_BRIEFING_TIMEZONE`, default `Asia/Bangkok`
  - scans overdue, due-soon, blocked, high/critical priority, and direct responsibility action items
  - `MEMBER` scope receives own action items
  - `TENANT_ADMIN` / `MANAGER` scope receives own work plus broader tenant/team follow-ups
  - uses Rubjob persona/decision/guardrail prompt
  - falls back to deterministic briefing if AI provider fails
- Added API:
  - `GET /morning-briefings/me/latest?tenantId=...`
  - `POST /morning-briefings/:briefingId/acknowledge`
  - `POST /morning-briefings/run-now` (`SUPER_ADMIN`)
- Added scheduler startup in `src/index.ts`.
- Added dashboard `MorningBriefingDialog`:
  - appears on `/dashboard` when latest briefing is unacknowledged
  - no close / x button
  - acknowledgement choices:
    - `I got it!` = `+3`
    - `I know` = `0`
    - `เออ รู้แล้ว` = `-3`
  - clicking `เออ รู้แล้ว` opens a nested confirmation dialog asking whether to review the briefing again (`Yes` keeps the briefing open, `No` records `-3`)
  - evidence cards deep-link to `/action-items/:actionItemId`

Verification:
- `pnpm.cmd --filter api prisma:generate` passed after stopping the local API dev process that was locking Prisma Client.
- `pnpm.cmd --filter api type-check` passed.
- `pnpm.cmd --filter web type-check` passed.
- `pnpm.cmd --filter api test` passed (17 tests).

Operational notes:
- Apply DB migration before using the feature locally/production.
- The API dev process was stopped during implementation to unlock Prisma Client generation; restart it if needed.

Follow-up completed (`ab2611f`) — Morning Briefing cron health/admin visibility:
- Current state:
  - Cron runs inside the existing API process via `startMorningBriefingScheduler()`.
  - No separate Railway service is required when API has a single replica.
  - Railway logs should show scheduler registration:
    - `[MORNING_BRIEFING] Scheduler started with cron 30 4 * * * (Asia/Bangkok)`
  - After a scheduled/manual run, logs should show:
    - `[MORNING_BRIEFING] Run summary ...`
  - Manual run endpoint exists:
    - `POST /morning-briefings/run-now` (`SUPER_ADMIN`)
  - Scheduler status endpoint exists:
    - `GET /morning-briefings/scheduler-status` (`SUPER_ADMIN`)
  - Observability records are written as `AiRunOperation.MORNING_BRIEFING`.
  - API check:
    - `GET /observability/ai-runs?operation=MORNING_BRIEFING&pageSize=20`
- UI added:
  - `/ai-trace` operation dropdown includes `MORNING_BRIEFING`.
  - Super admin sees `Morning Briefing Scheduler` panel in the Run Logs tab.
  - Panel shows cron, timezone, latest run status/time/duration/counts/error.
  - Panel has `Run now` button wired to `POST /morning-briefings/run-now`.
- Remaining risk:
  - If API has multiple replicas in the future, document or implement singleton/lock behavior to prevent duplicate scheduled runs.

## New Requirement - Feeling Log / Private Mood Journal

User wants a new menu called "บันทึกความรู้สึก" available to everyone, not limited to work-related entries.

Core product shape:
- Add a private feeling log entry screen with:
  - free-text `textarea`
  - emoji selector
  - `@mention` autocomplete for coworkers inside the organization
  - free text allowed even without mentioning anyone
- When the user saves an entry:
  - the entry must remain confidential from other people in the organization
  - AI should still process the content and produce a psychological-style interpretation
  - if the entry contains mentions of people, process the mention-target context as a separate analysis stream
  - do not expose the author name in executive or manager-facing output
- If any person is mentioned more than 5 times across logs, the system should surface the mentioned person's name in the analysis/output summary

Handover / implementation notes:
- Add a new navigation item and page for feeling logs.
- Reuse organization member lookup for `@` suggestions.
- Store entry privacy as private by default; other org members must not be able to read raw entries.
- Add AI processing that produces:
  - personal psychological interpretation
  - mention-target analysis when relevant
  - executive/manager summary cards in their inbox or dashboard message area
- Keep language factual and non-harmful:
  - do not write emotionally escalating or psychologically aggressive text
  - avoid unsupported claims about diagnoses or intent
  - keep the tone observational and cautious
  - if the content is sensitive, summarize carefully and neutrally
- If the feature later integrates with sentiment or wellbeing metrics, keep the source separated from work-performance analytics.

Suggested data model:
- `FeelingLog`
- `FeelingLogMention`
- `FeelingLogAnalysis`
- optional `FeelingLogVisibility` or `isPrivate` flag

Suggested delivery rule:
- End users see only their own log history and AI interpretation.
- Executives / team leads see only aggregate or derived insights, not the raw writer identity.
- Mentioned people can be included in a separate “frequently mentioned” summary once the count threshold is exceeded.
