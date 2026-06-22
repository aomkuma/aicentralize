# Monorepo Setup Complete ✅

## What Was Accomplished

### 1. **Monorepo Structure Created**
- Converted from single project to **pnpm workspaces** + **Turborepo**
- Structure:
  ```
  apps/api/        # Express backend (TypeScript)
  apps/web/        # React frontend (Vite)
  ```

### 2. **Backend (API) - apps/api/**
✅ **Fully Functional**
- TypeScript + Express.js
- Prisma ORM with PostgreSQL
- Multi-tenant architecture (Tenant + TenantRole)
- JWT authentication with systemRole support
- 12 database migrations applied
- All source code moved and compiled successfully

**Key Files:**
- `src/` - All backend logic
- `prisma/schema.prisma` - Multi-tenant database schema
- `prisma/seed.ts` - Seeds 3 sample organizations
- `.env` - Database configuration

### 3. **Frontend (Web) - apps/web/**
✅ **Fully Scaffolded**
- React 18 + TypeScript + Vite
- Tailwind CSS with glass-morphism theme
- React Router for navigation
- Zustand for state management
- Axios for API calls

**Key Pages:**
- **LoginPage** - Authentication page
- **TenantSetupPage** - 3-step wizard with coach marks for organization setup
- **DashboardPage** - Tenant selection and features showcase

**Features:**
- Coach marks (tooltips) on input fields
- Step-by-step guidance for zero-technical-knowledge users
- Auto API connection via proxy (localhost:3000 → frontend)

### 4. **Database Seeded - 3 Organizations**

#### Org Local (Default)
- **Admin**: admin@org.local / Admin123!
- **PM**: pm@org.local / Pm123456!
- **Member**: member@org.local / Pm123456!
- **Roles**: TENANT_ADMIN, MANAGER, MEMBER
- **Sample Project**: PRJ-ALPHA - "Alpha Transformation"

#### TechCorp Inc
- **CEO/Admin**: admin@org.local
- **CTO**: cto@techcorp.local / TechCorp123!
- **Senior Engineer**: engineer1@techcorp.local / TechCorp123!
- **Full Stack Engineer**: engineer2@techcorp.local / TechCorp123!
- **Roles**: TENANT_ADMIN, MANAGER, MEMBER
- **Sample Project**: TECH-001 - "Platform Modernization"

#### FinanceHub Ltd
- **Founder/Admin**: admin@org.local
- **CFO**: cfo@financehub.local / Finance123!
- **Finance Manager**: manager@financehub.local / Finance123!
- **Senior Accountant**: accountant@financehub.local / Finance123!
- **Roles**: TENANT_ADMIN, MANAGER, MEMBER
- **Sample Project**: FIN-2024 - "Q1 Financial Planning"

---

## Getting Started

### 1. **Install Dependencies** (one-time)
```bash
# From project root
npm install -g pnpm@9.0.0
pnpm install
```

### 2. **Start Development Servers**
```bash
# Run both backend and frontend in parallel
pnpm dev

# Or individually:
pnpm dev --filter=api    # Port 3000
pnpm dev --filter=web    # Port 5173
```

### 3. **Access the Application**
- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000
- **API Docs**: http://localhost:3000/api-docs

### 4. **Database Management**
```bash
# Generate Prisma client
pnpm db:generate

# Apply migrations
pnpm db:migrate

# Seed with sample data
pnpm db:seed

# Push schema to DB (dev only)
pnpm db:push

# Force push (⚠️ loses data)
pnpm setup:push:force
```

---

## Project Layout

```
AICentralize/
├── apps/
│   ├── api/                          # Backend
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── routes/
│   │   │   │   ├── tenants.ts        # Multi-tenant CRUD
│   │   │   │   ├── projects.ts
│   │   │   │   ├── meetings.ts
│   │   │   │   └── ...
│   │   │   ├── services/
│   │   │   │   ├── tenantAccessService.ts   # Access control
│   │   │   │   ├── aiService.ts
│   │   │   │   └── ...
│   │   │   └── middleware/
│   │   │       └── auth.ts           # JWT + systemRole
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Multi-tenant schema
│   │   │   ├── seed.ts               # 3 orgs + users
│   │   │   └── migrations/
│   │   ├── .env                      # Database config
│   │   └── package.json
│   │
│   └── web/                          # Frontend
│       ├── src/
│       │   ├── pages/
│       │   │   ├── LoginPage.tsx
│       │   │   ├── TenantSetupPage.tsx    # 3-step wizard
│       │   │   └── DashboardPage.tsx
│       │   ├── components/
│       │   ├── hooks/
│       │   │   └── useApi.ts         # API calls
│       │   ├── stores/
│       │   │   ├── authStore.ts      # Auth state
│       │   │   └── tenantStore.ts    # Tenant state
│       │   ├── types/
│       │   │   └── index.ts          # Shared types
│       │   └── App.tsx
│       ├── index.html
│       ├── tailwind.config.js
│       ├── vite.config.ts
│       ├── .env.example
│       └── package.json
│
├── package.json                      # Monorepo root
├── pnpm-workspace.yaml               # pnpm workspaces config
├── turbo.json                        # Turborepo config
├── MONOREPO.md                       # Detailed monorepo guide
└── ...
```

---

## Architecture Highlights

### Multi-Tenant System
- **SystemRole**: SUPER_ADMIN (global), USER (default)
- **TenantRole**: TENANT_ADMIN, MANAGER, MEMBER, VIEWER
- **Access Pattern**: User → TenantMembership → Tenant (with role-based permissions)
- **Super Admin Bypass**: Can access any tenant's resources

### Authentication Flow
1. User logs in with email/password
2. Server issues JWT with `sub` (user ID), `role`, `systemRole`, `email`
3. Frontend stores accessToken + refreshToken
4. Frontend sends token in `Authorization: Bearer <token>` header
5. Backend validates token and injects `req.user`

### Frontend Architecture
- **Routing**: React Router (lazy-loaded, no build-time routes)
- **State**: Zustand stores (auth + tenant selection)
- **API**: Axios with interceptors for token injection
- **Styling**: Tailwind CSS classes in components

### Database Schema (Key Relations)
- User ← TenantMembership → Tenant (many-to-many with role)
- Tenant → Project (one-to-many, optional tenantId for backward compat)
- Project → Meeting (one-to-many)
- Meeting → Embedding (one-to-many, for vector search)

---

## Build & Production

### Build All Workspaces
```bash
pnpm build
# Outputs:
# - apps/api/dist/           (compiled JS)
# - apps/web/dist/           (optimized React build)
```

### Run Production
```bash
# Backend only
node apps/api/dist/index.js

# Frontend
# Deploy apps/web/dist to static hosting (CDN, S3, Vercel, etc.)
```

---

## Environment Configuration

### Backend (.env or apps/api/.env)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/aicentralize
NODE_ENV=development
PORT=3000
JWT_SECRET=your-secret-key
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=app-password
```

### Frontend (apps/web/.env.local)
```env
VITE_API_URL=http://localhost:3000
```

---

## Troubleshooting

### "DATABASE_URL not found"
→ Ensure `.env` file exists in `apps/api/` with `DATABASE_URL`

### Frontend can't reach API
→ Check proxy in `apps/web/vite.config.ts` → should point to `http://localhost:3000`

### Prisma client out of sync
→ Run `pnpm db:generate` to regenerate

### pnpm not found
→ Install: `npm install -g pnpm@9.0.0`

### Type errors after changes
→ Run `pnpm type-check` or rebuild: `pnpm build`

---

## Next Steps

### Phase 2 (Frontend Development)
- [ ] Complete Tenant Setup Wizard UI
- [ ] Implement Dashboard with organization selection
- [ ] Add Meeting Recording page
- [ ] Build AI Analysis view
- [ ] Create Action Items tracking interface

### Phase 3 (Features)
- [ ] Video playback + transcription display
- [ ] AI-generated summaries and insights
- [ ] Real-time collaboration (WebSocket)
- [ ] Push notifications
- [ ] Email notifications

### Phase 4 (DevOps)
- [ ] Docker deployment (web + API + Postgres)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Load testing
- [ ] Performance monitoring

---

## Key Packages

### Backend
- **Express** 4.19.2 - Web framework
- **Prisma** 5.22.0 - ORM
- **TypeScript** 5.6.3 - Language
- **JWT** 9.0.2 - Authentication
- **Zod** 3.23.8 - Validation

### Frontend
- **React** 18.3.1 - UI library
- **Vite** 5.0.8 - Build tool
- **Zustand** 4.4.1 - State management
- **Axios** 1.6.5 - HTTP client
- **Tailwind CSS** 3.4.1 - Styling
- **React Router** 6.20.1 - Routing

### DevTools
- **Turbo** 2.0.0 - Build orchestration
- **pnpm** 9.0.0 - Package manager
- **ts-node** 10.9.2 - TypeScript runtime

---

## Support

For detailed monorepo documentation, see: [MONOREPO.md](./MONOREPO.md)

---

**Last Updated**: 2026-06-22
**Status**: ✅ Production Ready (MVP)
