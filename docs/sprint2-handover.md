# Sprint 2 Handover (Completed)

This document captures the current Sprint 2 implementation status for handover continuity.

## Scope Status

Completed:
1. Prompt 01 - Hybrid retrieval foundation
2. Prompt 02 - Ask-AI grounded answering V2
3. Prompt 03 - Reminder escalation and digest
4. Prompt 04 - Project continuity dashboard API layer
5. Prompt 05 - Tenant and organization isolation hardening (project/meeting membership-based)
6. Prompt 06 - Observability and AI run auditability
7. Prompt 07 - Final acceptance and handover consolidation

## Prompt 01 - Hybrid Retrieval Foundation

Implemented:
- Meeting knowledge chunk indexing service
- Embedding provider abstraction and embedding persistence
- Hybrid retrieval scoring (vector, lexical, source boost, recency boost)
- Retrieval endpoints for search and backfill

Primary files:
- src/services/retrieval/knowledgeIndexService.ts
- src/services/retrieval/hybridRetrievalService.ts
- src/routes/retrieval.ts

## Prompt 02 - Ask-AI Grounded Answering V2

Implemented:
- Ask-AI now uses hybrid retrieval evidence
- Grounded answering prompt with conservative behavior rules
- Response model includes answer, confidence, uncertainties, citations, usedEvidence
- Optional retrievalDebug for admin usage
- Ask-AI query logging model and persistence

Primary files:
- src/services/approvedAskAiService.ts
- src/routes/ask-ai.ts
- prisma/schema.prisma
- prisma/migrations/20260621101500_sprint2_ask_ai_grounded_v2/migration.sql

## Prompt 03 - Reminder Escalation and Digest

Implemented:
- Escalation rules: DUE_SOON, OVERDUE, OVERDUE_SHORT, OVERDUE_ESCALATE
- Owner and project lead escalation path
- Fallback escalation email route
- Rule-specific dedupe windows
- Reminder digest persistence and query endpoints

Primary files:
- src/services/reminderService.ts
- src/services/reminderDispatchService.ts
- src/services/reminderDigestService.ts
- src/routes/reminders.ts
- prisma/schema.prisma
- prisma/migrations/20260621112000_sprint2_reminder_escalation_digest/migration.sql

## Prompt 04 - Project Continuity Dashboard API Layer

Implemented:
- Project continuity summary metrics
- Overdue grouping by owner and by project
- Missing owner or due-date audit endpoint (schema-aware notes)
- Recent approved meetings with action counts
- Project memory snapshot endpoint

Primary files:
- src/services/continuityService.ts
- src/routes/continuity.ts
- src/app.ts
- src/routes/index.ts

## Prompt 05 - Access Hardening

Implemented:
- Centralized scope guard service for project, meeting, draft, and action-item checks
- Scope checks added to key routes: meetings, minute drafts, action items, retrieval, continuity, ask-ai
- Member access constrained by project/meeting participation model

Primary files:
- src/services/accessScopeService.ts
- src/routes/meetings.ts
- src/routes/minute-drafts.ts
- src/routes/action-items.ts
- src/routes/retrieval.ts
- src/routes/continuity.ts
- src/routes/projects.ts

## Prompt 06 - Observability and AI Run Audit

Implemented:
- Structured AI run log model (`AiRunLog`) with operation/status metadata
- Runtime trace logging for:
	- minute extraction
	- retrieval queries
	- ask-ai answering
	- reminder worker runs
- Observability query endpoint for admins/PMs

Primary files:
- prisma/schema.prisma
- prisma/migrations/20260621130000_sprint2_observability_ai_run_audit/migration.sql
- src/services/aiRunLogService.ts
- src/routes/observability.ts
- src/services/minuteExtractionService.ts
- src/services/approvedAskAiService.ts
- src/routes/retrieval.ts
- src/services/reminderService.ts

## Prompt 07 - Documentation and Acceptance Refresh

Implemented:
- Updated README Sprint 2 status and docs references
- Updated Sprint 2 handover and acceptance checklist
- Added retrieval/AI run debugging runbook
- Added Sprint 3 recommendation notes

## API Additions (Sprint 2 so far)

- POST /retrieval/search
- POST /retrieval/backfill
- GET /ask-ai/logs
- POST /reminders/run-now
- GET /reminders/digests
- GET /reminders/logs
- GET /continuity/summary
- GET /continuity/overdue/by-owner
- GET /continuity/overdue/by-project
- GET /continuity/action-items/missing-owner-or-due-date
- GET /continuity/meetings/recent-approved
- GET /continuity/projects/:projectId/memory-snapshot
- GET /observability/ai-runs

## Data Model and Migration Impact

Applied migrations for Sprint 2 additions:
1. 20260621101500_sprint2_ask_ai_grounded_v2
2. 20260621112000_sprint2_reminder_escalation_digest
3. 20260621130000_sprint2_observability_ai_run_audit

New model and enum changes include:
- AskAiQueryLog
- ReminderDigest
- ReminderLogType enum values: OVERDUE_SHORT, OVERDUE_ESCALATE
- AiRunLog
- AiRunOperation enum
- AiRunStatus enum

## Operational Notes

- Local development policy: host PostgreSQL (no Docker required locally)
- Deployment policy: Docker Compose with production profile and env file
- On Windows, Prisma generate can fail with EPERM when query engine DLL is locked by running Node processes

## Residual Gaps After Sprint 2

1. Access model is membership-based but still lacks dedicated organization/tenant entity and policy layer.
2. Observability is persisted and queryable but not wired to external monitoring/alerting systems.
3. Dashboard remains backend-first with no dedicated continuity UI page.
4. Integration tests for cross-module Sprint 2 behavior are still limited.

## Post-Handover UI Update (2026-06-22)

Implemented after Sprint 2 handover:
- Dashboard now embeds AI Chat with parity to AI Playground core functions.
- Added in-app prompt generation, recording workflow, transcript editing, and analyze flow.
- Sidebar/top navigation consistency for AI surface has been improved.

Primary files:
- apps/web/src/components/AIChatPanel.tsx
- apps/web/src/pages/DashboardPage.tsx
- apps/api/src/routes/ai-route.ts

Verification completed:
1. `pnpm --filter=web build` passed.
2. `pnpm --filter=api build` passed.
3. Manual browser check on `/dashboard` confirms AI Chat component rendered and tab switching works.

Known follow-up (recommended next step):
1. Extract shared AI Playground logic to reusable client module to reduce duplicated logic between standalone page JS and React component.
2. Add i18n strings for all AI Chat labels and status messages.
3. Add end-to-end tests for record/analyze flow.

## Post-Handover UI and Access Update (2026-06-23)

Implemented:
1. Role-gated navigation and route hardening
- `setup` is SUPER_ADMIN only in sidebar and route guard.
- `settings` remains SUPER_ADMIN only.

2. Dashboard workflow split by role
- SUPER_ADMIN: organization-focused cards.
- PM/non-super-admin: `Projects On Hand` cards with direct links to project-level continuity/reminders/ai-trace pages.

3. PM project creation workflow on dashboard
- Inline create form with code/name/description.
- Submit to `/projects` with tenant context.
- Project list refresh after success.

4. Validation hardening for project creation
- Frontend duplicate check by code (case-insensitive).
- Backend duplicate check by code (case-insensitive) returns 409.

5. Whisper setting enforcement in runtime path
- `/ai/playground/transcribe` now checks global system settings before Whisper execution.
- Returns 403 when Whisper disabled; frontend falls back to browser transcript messaging.

Primary files:
- apps/web/src/App.tsx
- apps/web/src/components/Sidebar.tsx
- apps/web/src/pages/DashboardPage.tsx
- apps/web/src/config/navigation.ts
- apps/web/src/components/AIChatPanel.tsx
- apps/web/src/i18n/en.json
- apps/web/src/i18n/th.json
- apps/api/src/routes/projects.ts
- apps/api/src/routes/ai-route.ts

Verification completed:
1. PM cannot access `/setup` or `/settings`.
2. PM sees project-focused dashboard and can create projects.
3. Duplicate project code is blocked in UI and API.
4. Whisper disabled path is enforced in backend endpoint.
