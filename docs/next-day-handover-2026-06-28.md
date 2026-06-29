# Next-Day Handover - 2026-06-28

## Current Working State

Repository has uncommitted work for first-login password handling, personal profile management, and admin organization management.

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

Still open / not done:
- B-2 follow-up only deferred item is gone; observability/reminders are now tenant-scoped.
- No tests yet for the suspension path at the route level (login/requireAuth/refresh).
- No login-page banner explaining the `403 Account suspended` response to end users.
- Explicit platform-user (moderator) management UI still not built.
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
- Add UI controls for editing member `jobTitle` and `department`, not only role/status.
- Add tests for inactive tenant/member access.
- Add explicit platform-user management UI if moderators need to be created/managed from the app.

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

## Caution

There are uncommitted changes. Do not revert them. `apps/web/tsconfig.tsbuildinfo` is touched by type-check; restore it after checks with:

```powershell
git restore -- apps/web/tsconfig.tsbuildinfo
```

## Follow-Up Note (2026-06-28, PM project timeline)

User asked whether roles above `MEMBER` already have a project analysis/evaluation panel with a Project Manager timeline.

Current state:
- There is a `Project Continuity Dashboard` at `/continuity` and `/continuity/:projectId`.
- Dashboard/Projects link each project to Continuity, Reminders, and AI Trace.
- Continuity currently shows summary, overdue by owner, overdue by project, missing info, and saved meetings.

Gap:
- There is not yet a dedicated PM timeline view that lays out milestones/action items/meeting sequence/workload by date.
- Recommended future implementation: add a timeline section or tab under Continuity that combines action item due dates, priorities, meetings, recent decisions, and stale/risk indicators into a date-ordered PM view.

## Design Note (2026-06-28, AI workload balancing suggestion)

User approved a suggestion-only workload balancing assistant for PM/manager project continuity.

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

## Follow-Up Idea (2026-06-29, employee communication sentiment trend)

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
- Add tests for tenant isolation and JSON validation.
