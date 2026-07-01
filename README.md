# Kora

**Kora** is an AI-powered meeting and work OS: organizational knowledge, team pulse (feeling logs), meeting intelligence, action tracking, and context-aware Ask AI — multi-tenant, EN/TH.

## Documentation

| Doc | Purpose |
|-----|---------|
| [**docs/FEATURES.md**](docs/FEATURES.md) | Product feature catalog |
| [**QUICK_REFERENCE.md**](QUICK_REFERENCE.md) | Commands, env, access rules |
| [**docs/HANDOVER.md**](docs/HANDOVER.md) | Current status & open items |
| [**docs/README.md**](docs/README.md) | Full documentation index |

## Quick start

**Prerequisites:** Node.js 22+, pnpm 9+, PostgreSQL 16+ (pgvector)

```bash
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- **Web:** http://localhost:5175 (guest welcome at `/`)
- **API:** http://localhost:4000

Copy env from `.env.example` and `apps/web/.env.example`. Production template: `.env.production.example`.

### Common scripts

```bash
pnpm --filter api type-check
pnpm --filter web type-check
pnpm --filter api test
cd apps/api && npx prisma migrate deploy   # production / deploy
```

## Monorepo layout

```
apps/
  api/     # Express + Prisma + PostgreSQL
  web/     # React + Vite + Tailwind
docs/      # Product docs, guides, archive
```

## Stack

- **Backend:** TypeScript, Express, Prisma, JWT auth, multi-tenant
- **Frontend:** React 18, Vite, Zustand, react-i18next, PWA
- **AI / ASR:** Configurable providers (Gemini, OpenAI, Ollama, etc.); faster-whisper ASR

## License

Proprietary — internal / organizational use unless otherwise licensed.
