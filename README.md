# AI Centralize - Sprint 1 to Sprint 2

AI Centralize is a backend-first meeting-minute workflow system built on Node.js, Prisma, and PostgreSQL.

Sprint 1 turns the project from playground-style AI usage into an operational workflow:
- meeting ingestion
- AI minute draft extraction
- human review and approval
- structured action tracking
- approved-data grounded Ask-AI
- reminder worker with dedupe and delivery logs

## What Sprint 1 Includes

1. Meeting ingestion
- `POST /projects/:projectId/meetings`
- `POST /meetings/:meetingId/artifacts`
- `GET /meetings/:meetingId`

2. Minute draft extraction
- `POST /meetings/:meetingId/minute-drafts/extract`

3. Draft review and approval
- `GET /minute-drafts/:draftId`
- `PATCH /minute-drafts/:draftId`
- `POST /minute-drafts/:draftId/approve`

4. Action item board operations
- `GET /action-items`
- `GET /action-items/:id`
- `PATCH /action-items/:id`
- `POST /action-items/:id/reassign`
- `POST /action-items/:id/status`

5. Ask-AI grounded on approved data
- `POST /ask-ai`

6. Reminder Worker V1
- due-soon and overdue selection
- duplicate prevention by time window
- reminder delivery logs

## Sprint 2 Progress (Current)

Completed modules:
1. Prompt 01: Hybrid retrieval foundation
- Retrieval chunk indexing and backfill
- Hybrid scoring (vector + lexical + boosts)

2. Prompt 02: Ask-AI grounded answering V2
- Uses hybrid retrieval evidence
- Structured citations and used evidence output
- Ask-AI query log persistence for audit

3. Prompt 03: Reminder escalation and digest
- Escalation rules (`OVERDUE_SHORT`, `OVERDUE_ESCALATE`)
- Improved dedupe windows by reminder rule
- Reminder digest snapshots and admin/PM endpoints

4. Prompt 04: Project continuity dashboard API layer
- Continuity summary metrics by project
- Risk-oriented grouped views
- Project memory snapshot endpoint

5. Prompt 05: Tenant and access hardening
- Centralized scope guards for project/meeting/draft/action-item access
- Ask-AI, retrieval, continuity, meeting, and action-item scope checks for member access

6. Prompt 06: Observability and AI run audit
- Structured AI run logging (`AiRunLog`) for extraction/retrieval/ask-ai/reminder runs
- Observability endpoint for AI run inspection

7. Prompt 07: Acceptance and handover refresh
- Sprint 2 handover docs updated
- Sprint 2 acceptance checklist updated
- Sprint 3 recommendation notes added

## Source of Truth Rule

- Approved `MinuteVersion` + structured `Decision` and `ActionItem` rows are the source of truth.
- Unapproved drafts are editable work artifacts and are not the primary evidence source for downstream automation.

## Runtime Strategy

- Local development: use PostgreSQL installed on your machine (no Docker required).
- Deployment environment: use Docker (`Dockerfile` + `docker-compose.yml`) with the `production` profile and a dedicated `.env.production` file.

## Local Runbook

1. Install dependencies

```bash
npm install
```

2. Start local PostgreSQL service

```bash
pg_ctl -D "<your_pg_data_dir>" start
```

3. Create database (once)

```bash
psql -U postgres -c "CREATE DATABASE aicentralize;"
```

4. Install and enable pgvector (Windows, one-time)

Build extension (run in x64 Native Tools Command Prompt as administrator):

```bash
set "PGROOT=C:\Program Files\PostgreSQL\16"
cd %TEMP%
git clone --branch v0.8.3 https://github.com/pgvector/pgvector.git
cd pgvector
nmake /F Makefile.win
nmake /F Makefile.win install
```

Enable extension in app database:

```bash
psql -h localhost -U postgres -d aicentralize -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -h localhost -U postgres -d aicentralize -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"
```

5. Configure environment

```bash
copy .env.example .env
```

6. Generate Prisma client

```bash
npm run prisma:generate
```

7. Apply migrations

```bash
npm run prisma:migrate -- --name local_init
```

8. Seed sample data

```bash
npm run prisma:seed
```

9. Run API

```bash
npm run dev
```

10. Build validation

```bash
npm run build
```

## Deployment Runbook (Docker)

Note:
- Production Docker uses a pgvector-enabled Postgres image (`pgvector/pgvector:0.8.3-pg16`).
- `vector` and `pg_trgm` extensions are initialized automatically via `docker/init/01_extensions.sql`.
- Manual pgvector build/install is only needed for local host PostgreSQL setup.

1. Create deployment env file

```bash
copy .env.production.example .env.production
```

2. Build and start services

```bash
docker compose --profile production --env-file .env.production up -d --build
```

The stack now includes an Ollama service by default. The API resolves it through `OLLAMA_BASE_URL`, which defaults to `http://ollama:11434` in Docker.

3. Check service health

```bash
docker compose --profile production --env-file .env.production ps
```

4. Tail logs

```bash
docker compose --profile production --env-file .env.production logs -f app
```

5. Stop services

```bash
docker compose --profile production --env-file .env.production down
```

## Required Environment Variables

Core:
- `DATABASE_URL`
- `JWT_SECRET`

AI and Reminder:
- `AI_SIMILARITY_THRESHOLD` (optional)
- `OLLAMA_BASE_URL` (optional, defaults to `http://127.0.0.1:11434` locally and `http://ollama:11434` in Docker)
- `REMINDER_CRON` (optional)
- `REMINDER_LOOKAHEAD_HOURS` (optional)
- `REMINDER_DEDUPE_HOURS` (optional)

Notification channels (optional):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `MAIL_FROM`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

## API and Docs

- API base: `http://localhost:4000`
- Swagger UI: `http://localhost:4000/docs`
- OpenAPI file: `src/openapi.yaml`

## Documentation

- End-to-end flow: `docs/sprint1-flow.md`
- Manual acceptance checklist: `docs/sprint1-acceptance-checklist.md`
- Open TODOs and Sprint 2 recommendations: `docs/sprint1-open-todos.md`
- Sprint 2 handover: `docs/sprint2-handover.md`
- Next-day handover (latest UI/AI integration): `docs/next-day-handover-2026-06-22.md`
- Sprint 2 manual acceptance checklist: `docs/sprint2-acceptance-checklist.md`
- Retrieval and AI run runbook: `docs/sprint2-retrieval-ai-run-runbook.md`
- Sprint 3 recommendations: `docs/sprint3-recommendations.md`

## Known Limitations

- Draft extraction repair is basic controlled JSON repair.
- Owner mapping from free-text draft fields is heuristic.
- Tenant model is currently project/meeting membership based; no dedicated organization entity yet.
- Integration tests for cross-module Sprint 2 behavior still need expansion.
- Some dashboard areas are now role-aware, but full end-to-end UI coverage for all modules is still in progress.
- Global project code is currently unique across all tenants by schema; if tenant-scoped code uniqueness is required, schema and validation should be adjusted.

## Next Recommended Modules

1. Sprint 3 Productization (billing, plan controls, admin pricing backend)
2. Enterprise identity (SSO/SCIM) and stronger org-level access controls
3. Full integration and regression test suite for core workflow
4. Complete UI test coverage for role-gated navigation, dashboard project workflows, and AI settings behavior
