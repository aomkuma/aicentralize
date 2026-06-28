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
- Dashboard AI panel rebranded with a "ตัวรับจบ" / "The Closer" persona (copy only).
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

## Caution

There are uncommitted changes. Do not revert them. `apps/web/tsconfig.tsbuildinfo` is touched by type-check; restore it after checks with:

```powershell
git restore -- apps/web/tsconfig.tsbuildinfo
```
