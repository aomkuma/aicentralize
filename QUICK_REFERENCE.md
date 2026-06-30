# Quick Reference - Common Commands

## Session Update (2026-06-30)

**`main` through `db369f8`.** Full feature map: [`docs/FEATURES.md`](docs/FEATURES.md). Handover log: `docs/next-day-handover-2026-06-28.md`.

Recent product changes:
- **Push / PWA:** Profile wizard (install app → enable push); iPhone requires Home Screen install; `PushOnboardingBanner` in layout; VAPID on API.
- **Action-item push:** Alerts on reassign, due date, priority, status changes (+ reminder worker).
- **Prompt limit:** Playground / Meeting Studio up to **120,000** chars (`61127ae`).
- **ASR:** 1-hour timeout (`ASR_REQUEST_TIMEOUT_MS=3600000`); nginx `/ai/` **3700s**.
- **Meeting Studio:** background audio transcription (`MeetingStudioJobBanner`); uploads TXT/MD/CSV/TSV/DOCX/PDF/XLSX.
- **Continuity:** not in sidebar; open from `/projects` → project card → `/continuity/:projectId`.
- **Communication sentiment:** mood badges on `/projects` team table (`TENANT_ADMIN` / `MANAGER`).
- **Project knowledge + general notes:** `/projects/:projectId/knowledge`, `/projects/:projectId/notes`.
- **User-facing UI:** AI model/confidence labels hidden via `redactAiMetadata.ts`.
- **Deploy:** API Docker runs `npx prisma migrate deploy` on boot (`docker/start.sh`).

## Session Update (2026-06-28, earlier)

- Platform roles are separated from tenant/workflow roles:
  - `SystemRole.SUPER_ADMIN`: full platform + system settings.
  - `SystemRole.MODERATOR`: platform organization/member management.
  - `SystemRole.USER`: normal tenant user.
- New code should use `systemRole` for platform access. Do not use `UserRole.ADMIN` as the platform-admin signal.
- Tenant roles still control tenant work:
  - `TENANT_ADMIN` / `MANAGER`: manage tenant members and projects.
  - `MEMBER` / `VIEWER`: normal tenant access.
- Tenant workflow access must honor `TenantMembership.role`, not only legacy `User.role`:
  - `TENANT_ADMIN` / `MANAGER` can list tenant projects, create saved meetings/minutes,
    edit saved minutes, and open project continuity for projects inside their tenant.
  - This matters for users like `korapotu@gmail.com`, who is `TENANT_ADMIN` / CTO in the
    Aommy tenant while legacy workflow `User.role` may still be `MEMBER`.
- Invitation flow:
  - Frontend: `/accept-invite?token=...`
  - Preview: `GET /auth/invitations/:token`
  - Accept: `POST /auth/invitations/:token/accept`
- `/accept-invite` must exist in both logged-out and logged-in route trees. If it is missing for logged-in users, the page renders blank.
- Auth clears stale `tenant-store` on user change/logout. Dashboard and projects reselect tenant from `/tenants/me`.

### Access control (3 levels)
- Platform infra ops use `requireSystemRole([SUPER_ADMIN])`, not `UserRole.ADMIN`:
  `POST /reminders/run-now`, `POST /retrieval/backfill`, `POST /notifications/push/generate-vapid`, `POST /notifications/push/broadcast`.
- Observability and reminder reads are tenant-scoped via `listTenantIdsForUser`
  (`/observability/ai-runs`, `/observability/ask-ai-queries`, `/reminders/digests`, `/reminders/logs`).
  Platform admins (returns `undefined`) are unrestricted; tenant users see only their own tenants.
- Three ways to block access, smallest to largest scope:
  - `TenantMembership.isActive=false`: user loses access to one organization only.
  - `Tenant.isActive=false`: whole organization blocked.
  - `User.isActive=false`: account suspended platform-wide — blocks login, refresh,
    and every authenticated request immediately (`requireAuth` reads the DB per request).
- Suspend/restore login and edit member `jobTitle`/`department` from `/admin/organizations`.
  Admins cannot suspend themselves or a `SUPER_ADMIN`.
- API tests live in `apps/api` (vitest): `pnpm --filter api test`.

### Meeting Studio is a step-by-step wizard
- `MeetingStudioPage` (`/meetings`) shows ONE step at a time, not all blocks at once:
  1. Import — project + time, upload/live-record/paste transcript, transcribe/analyze.
  2. Compose — review/edit minute template (objective, summary, decisions, risks, tasks).
  3. Review & save — full minutes preview, then Save.
- Audio transcription runs in the background (2026-06-30): progress banner in layout, notification when done.
- Document import supports TXT, MD, CSV, TSV, DOCX, PDF (text), XLSX in addition to paste.
- The clickable stepper header tracks completion (✓) per step; Back/Next/Save live in a
  footer bar. `guidedStep` state drives which step renders. Step navigation is manual —
  no auto-advance — so editing a field never jumps the user to another step.
- Full handover: `docs/next-day-handover-2026-06-28.md`

### Saved minutes history and continuity
- Meeting Studio saves through `POST /meetings`; tenant admins/managers are allowed by tenant role.
- Saved minutes can be reviewed and edited at:
  - `/meetings/history`
  - `/meetings/history/:meetingId`
- Project continuity (`/continuity/:projectId`) is reached from each project card on `/projects`
  (Continuity is not a sidebar item as of 2026-06-30).
- Continuity pages show a `Saved meetings` section loaded from `GET /meetings?projectId=...`.

## Session Update (2026-06-22)

- Dashboard now includes `AI Chat` with feature parity to playground:
	- text prompt generation (`/ai/playground/generate`)
	- record/upload audio (`/ai/playground/record/upload`)
	- auto speaker grouping A/B/C
	- transcript analyze (`/ai/playground/diarize-analyze`)
- Main implementation files:
	- `apps/web/src/components/AIChatPanel.tsx`
	- `apps/web/src/pages/DashboardPage.tsx`

## 🚀 Development

```bash
# Start everything (API + Web in parallel)
pnpm dev

# Start individual services
pnpm dev --filter=api              # Port 4000
pnpm dev --filter=web              # Port 5175

# Build for production
pnpm build                         # Both
pnpm build:api                     # Just API
pnpm build:web                     # Just Web

# Start production API
pnpm start
```

## 🗄️ Database

```bash
# Generate Prisma client (after schema changes)
pnpm db:generate

# Create and apply migrations
pnpm db:migrate

# Seed database (3 orgs)
pnpm db:seed

# View database in Prisma Studio
pnpm db:studio

# Push schema directly (dev only, no migration file)
pnpm db:push

# Force push (⚠️ DESTRUCTIVE - loses data)
pnpm setup:push:force
```

## 🧪 Testing & Linting

```bash
# Run tests
pnpm test

# Watch mode for tests
pnpm test:watch

# Type check
pnpm type-check

# Lint code
pnpm lint

# Clean builds
pnpm clean
```

## 🔄 Workspace Operations

```bash
# Install dependencies (monorepo-wide)
pnpm install

# List what's installed
pnpm list --depth=0

# Run command in specific workspace
pnpm --filter=api run build
pnpm --filter=web run build

# Remove all node_modules
pnpm clean
```

## 📝 Test Credentials

### Organization: Org Local
```
Email: admin@org.local
Password: Admin123!
```

### Organization: TechCorp Inc
```
Email: cto@techcorp.local
Password: TechCorp123!
```

### Organization: FinanceHub Ltd
```
Email: cfo@financehub.local
Password: Finance123!
```

## 🌐 Access Points

- **Frontend**: http://localhost:5175
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/docs (Swagger)
- **Database**: localhost:5432 (PostgreSQL)

## 📁 Important Paths

```
Backend code    → apps/api/src/
Frontend code   → apps/web/src/
Database schema → apps/api/prisma/schema.prisma
Migrations      → apps/api/prisma/migrations/
Config (BE)     → apps/api/.env
Config (FE)     → apps/web/.env.local
```

## 🐛 Troubleshooting

### Invitation link opens a blank page
```bash
# Confirm the route exists for both logged-out and logged-in users:
# apps/web/src/App.tsx -> /accept-invite

# Verify token preview directly:
curl http://localhost:4000/auth/invitations/<token>
```

### Wrong organization after cleaning local data
```bash
# Browser may still have an old tenant persisted:
localStorage.removeItem('tenant-store')

# Logout/login also clears tenant-store after the 2026-06-28 fix.
```

### Packages won't install
```bash
# Clear pnpm cache
pnpm install --force
# Or reinstall
pnpm clean && pnpm install
```

### Build fails with type errors
```bash
# Regenerate Prisma
pnpm db:generate

# Check for errors
pnpm type-check
```

### Can't connect to database
```bash
# Check DATABASE_URL in apps/api/.env
# Verify PostgreSQL is running
# Test connection: psql postgresql://user:pass@localhost:5432/aicentralize
```

### Frontend can't reach API
```bash
# API should be running on port 4000
# Check apps/web/vite.config.ts proxy setting
# Verify VITE_API_URL in apps/web/.env.local
# Production web uses same-origin /api when VITE_API_URL is localhost/unset
```

### iPhone push does not show Allow dialog
```text
1. Must use Safari → Share → Add to Home Screen
2. Open AICentralize from the Home Screen icon (not a Safari tab)
3. Profile → Step 1 install → Step 2 Enable push
4. If blocked before: Settings → Notifications → AICentralize → Allow
5. API needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
```

### Long audio transcription times out
```bash
# API env:
ASR_REQUEST_TIMEOUT_MS=3600000

# nginx web template already sets /ai/ proxy_read_timeout 3700s
# Redeploy both API and Web after changing
```

## ✅ Dashboard AI Chat Smoke Test

1. Open `http://localhost:5175/dashboard`
2. Scroll to `AI Chat`
3. Text Prompt tab:
	- Input prompt
	- Click `Generate`
4. Record & Transcript tab:
	- Click `Start Recording`
	- Speak short conversation
	- Click `Stop Recording`
	- Edit transcript if needed
	- Click `Analyze Transcript`

Expected result:
- Analysis summary appears in `Text Prompt` result pane
- Transcript is populated into prompt field for follow-up asks

## 📊 Performance

### Build times
- API: ~5s (TypeScript compilation)
- Web: ~3s (Vite)
- Both: ~8s total (parallel with Turbo)

### Development
- API hot-reload: ts-node-dev (auto-restart)
- Web hot-reload: Vite (instant)

---

**Monorepo Version**: 1.0.0  
**Created**: 2026-06-22
