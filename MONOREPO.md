# AICentralize Monorepo

A meeting intelligence platform with multi-tenant support, built with React + TypeScript frontend and Express + Prisma backend.

## 📁 Project Structure

```
apps/
├── api/          # Express TypeScript backend
├── web/          # React TypeScript frontend (Vite)
packages/        # Shared utilities (future)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+ with pgvector extension

### Installation

```bash
# Install dependencies across all workspaces
pnpm install

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed database with sample data
pnpm db:seed
```

### Development

```bash
# Run both API and frontend in parallel
pnpm dev

# Or run specific workspace
pnpm dev --filter=api
pnpm dev --filter=web
```

Access:
- Frontend: http://localhost:5173
- API: http://localhost:3000
- API Docs: http://localhost:3000/api-docs

### Build

```bash
# Build all workspaces
pnpm build

# Build specific workspace
pnpm build:api
pnpm build:web
```

### Database Management

```bash
# Generate Prisma client
pnpm db:generate

# Create/apply migrations
pnpm db:migrate

# Seed database
pnpm db:seed

# Push schema to database
pnpm db:push

# Force push (⚠️ loses data)
pnpm setup:push:force
```

## 📚 Workspaces

### `/apps/api`
Express server with:
- JWT authentication with multi-tenant support
- Tenant & TenantRole RBAC
- Meeting management and AI processing
- Vector embeddings for hybrid retrieval
- Email notifications with cron jobs

**Scripts:**
```bash
pnpm dev --filter=api         # Dev server
pnpm build:api                # TypeScript compilation
pnpm start --filter=api       # Run compiled server
```

### `/apps/web`
React + Vite frontend with:
- Tenant setup wizard with coach marks
- Dashboard with tenant selection
- Component library with Tailwind CSS
- Zustand for state management
- Axios for API calls

**Scripts:**
```bash
pnpm dev --filter=web         # Vite dev server
pnpm build:web                # Production build
pnpm preview --filter=web     # Preview build
```

## 🔐 Environment Variables

### API (`apps/api/.env`)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/aicentralize
NODE_ENV=development
JWT_SECRET=your-secret-key
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

### Web (`apps/web/.env.local`)
```env
VITE_API_URL=http://localhost:3000
```

## 🗄️ Database

### Schema Highlights
- **User**: Basic user model
- **Tenant**: Organization entity
- **TenantMembership**: User-to-Tenant with role assignment
- **Project**: Team projects (tenant-scoped)
- **Meeting**: Recording metadata with embeddings
- **Vector Support**: pgvector for semantic search

### Migrations
Located in `apps/api/prisma/migrations/`

Latest migration: `20260622093000_tenant_role_foundation`

## 🧪 Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Type checking
pnpm type-check
```

## 📦 Deployment

### Docker
```bash
docker-compose up -d
```

Includes:
- PostgreSQL 16 + pgvector extension
- Node.js environment setup

### Production Build
```bash
# Build all
pnpm build

# Start API
node apps/api/dist/index.js

# Serve frontend (use static hosting)
# Upload apps/web/dist to CDN or static host
```

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run all dev servers |
| `pnpm build` | Build all workspaces |
| `pnpm start` | Start API server |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint all code |
| `pnpm type-check` | TypeScript checking |
| `pnpm clean` | Remove all build artifacts |
| `pnpm db:migrate` | Create/apply migrations |
| `pnpm db:seed` | Seed database |

## 📝 Contributing

1. Changes to API? Update `apps/api/**`
2. Changes to Frontend? Update `apps/web/src/**`
3. Need shared utilities? Create in `packages/`
4. Run `pnpm type-check` before committing

## 📄 License

Proprietary - AICentralize Platform
