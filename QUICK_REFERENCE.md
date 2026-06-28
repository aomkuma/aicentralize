# Quick Reference - Common Commands

## Session Update (2026-06-28)

- Platform roles are separated from tenant/workflow roles:
  - `SystemRole.SUPER_ADMIN`: full platform + system settings.
  - `SystemRole.MODERATOR`: platform organization/member management.
  - `SystemRole.USER`: normal tenant user.
- New code should use `systemRole` for platform access. Do not use `UserRole.ADMIN` as the platform-admin signal.
- Tenant roles still control tenant work:
  - `TENANT_ADMIN` / `MANAGER`: manage tenant members and projects.
  - `MEMBER` / `VIEWER`: normal tenant access.
- Invitation flow:
  - Frontend: `/accept-invite?token=...`
  - Preview: `GET /auth/invitations/:token`
  - Accept: `POST /auth/invitations/:token/accept`
- `/accept-invite` must exist in both logged-out and logged-in route trees. If it is missing for logged-in users, the page renders blank.
- Auth clears stale `tenant-store` on user change/logout. Dashboard and projects reselect tenant from `/tenants/me`.
- Full handover: `docs/next-day-handover-2026-06-28.md`

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
