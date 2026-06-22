# Next-Day Handover - 2026-06-23

This note captures the latest role/access and dashboard workflow state for continuous development.

## What Changed Today

1. Enforced Whisper toggles from System Settings at runtime.
- Backend transcription endpoint now checks global settings before calling Whisper.
- If Whisper is disabled, endpoint returns 403 and frontend falls back to browser transcript messaging.

2. Hardened role-based navigation and route access.
- `setup` is now SUPER_ADMIN only in sidebar and direct URL route access.
- `settings` remains SUPER_ADMIN only.

3. Refactored Dashboard experience by system role.
- SUPER_ADMIN: sees organization management card section.
- PM/other non-super-admin users: see `Projects On Hand` section with per-project quick links:
  - continuity
  - reminders
  - ask-ai trace

4. Added PM project creation workflow directly on Dashboard.
- `Create Project` button and inline form.
- Submits to `/projects` with tenant context.
- Reloads project list after successful creation.

5. Added project creation validation.
- Frontend: duplicate project code guard (case-insensitive) against loaded project list.
- Backend: duplicate project code guard (case-insensitive) with clear 409 response.

## Code Touched (Latest Batch)

- apps/api/src/routes/ai-route.ts
- apps/api/src/routes/projects.ts
- apps/web/src/App.tsx
- apps/web/src/components/Sidebar.tsx
- apps/web/src/components/AIChatPanel.tsx
- apps/web/src/pages/DashboardPage.tsx
- apps/web/src/config/navigation.ts
- apps/web/src/i18n/en.json
- apps/web/src/i18n/th.json

## Current Runtime

- Web: http://localhost:5175
- API: http://localhost:4000
- Dashboard: http://localhost:5175/dashboard
- Settings: http://localhost:5175/settings (SUPER_ADMIN only)

## Verification Done

1. SUPER_ADMIN path
- Can access `/settings`.
- Can update System Settings (including Whisper toggles).

2. PM path
- Cannot see or access `/settings`.
- Cannot see or access `/setup`.
- Sees `Projects On Hand` section on dashboard.
- Can create project from dashboard and view it immediately.

3. Whisper behavior
- With Whisper disabled in settings, transcription endpoint does not run Whisper path.
- Frontend shows browser transcript fallback messaging.

4. Duplicate validation
- Duplicate project code is blocked in UI.
- Duplicate project code is blocked in API (409).

## Quick Resume Checklist

1. Start services
- `pnpm dev`

2. Login and smoke check roles
- SUPER_ADMIN: `admin@org.local / Admin123!`
- PM: `pm@org.local / Pm123456!`

3. SUPER_ADMIN checks
- Open `/settings` and verify access.
- Toggle Whisper setting and save.

4. PM checks
- Open `/dashboard` and confirm `Projects On Hand` appears.
- Confirm `/setup` redirects to `/dashboard`.
- Create a new project via dashboard form.

5. AI Chat check
- Record and transcribe once to confirm settings-based behavior.

## Open Follow-Ups

1. Add tests for role-gated routes and menu visibility (`setup`, `settings`).
2. Add API integration tests for `/projects` duplicate-code validation path (409).
3. Consider DB-level unique index strategy if requirement changes from global `code` uniqueness to per-tenant uniqueness.
4. Add success toast/UI confirmation for project creation (currently list refresh confirms success).

## Risks / Caveats

1. Browser speech recognition support varies by browser/locale.
2. Current `Project.code` is globally unique in schema; business decision may later require tenant-scoped uniqueness.
3. Some legacy console warnings remain (React Router future flags, zustand storage deprecation) and are non-blocking.
