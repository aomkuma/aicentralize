# Sprint 2 Acceptance Checklist

Use this checklist to verify implemented Sprint 2 modules (Prompt 01 to Prompt 07).

## A. Hybrid Retrieval Foundation

1. Ensure approved minute versions exist with decisions and action items.
2. Call POST /retrieval/backfill as admin.
3. Verify indexedVersions and indexedChunks are greater than zero.
4. Call POST /retrieval/search with a query known to match approved content.
5. Verify response includes evidence list and hybrid scoring metadata.

## B. Ask-AI Grounded Answering V2

1. Call POST /ask-ai with a question tied to approved data.
2. Verify response includes:
- answer
- confidence
- uncertainties
- citations
- usedEvidence
3. Verify cited snippets map to approved evidence, not unapproved drafts as primary source.
4. With admin role, call POST /ask-ai using includeRetrievalDebug=true and verify retrievalDebug exists.
5. Call GET /ask-ai/logs as admin and verify log entries for recent ask-ai requests.

## C. Reminder Escalation and Digest

1. Prepare action items in due-soon and overdue ranges.
2. Call POST /reminders/run-now as admin.
3. Verify run summary includes byRule counters and digest generation metadata.
4. Verify ReminderLog entries are created for DUE_SOON and OVERDUE categories.
5. For heavily overdue tasks, verify OVERDUE_SHORT and/or OVERDUE_ESCALATE records appear.
6. Call GET /reminders/digests and verify project-level digest snapshots are returned.
7. Call GET /reminders/logs and verify pagination and filtering work.

## D. Continuity Dashboard API Layer

1. Call GET /continuity/summary and verify project summary blocks are returned.
2. Call GET /continuity/overdue/by-owner and verify grouped overdue owners.
3. Call GET /continuity/overdue/by-project and verify grouped overdue projects.
4. Call GET /continuity/meetings/recent-approved and verify approved meeting activity with action counts.
5. Call GET /continuity/projects/:projectId/memory-snapshot and verify snapshot sections:
- latestApprovedMinuteSummaries
- recentDecisions
- openCriticalActions
- overdueItems

## E. Build and Migration Validation

1. Run npm run prisma:generate.
2. Run npx prisma migrate deploy.
3. Run npm run build.
4. Verify no compile or migration errors.

## F. Access Hardening Validation (Prompt 05)

1. For MEMBER user, call POST /ask-ai without projectId/meetingId and verify forbidden or scoped validation response.
2. For MEMBER user, call GET /continuity/summary without projectId and verify scoped validation response.
3. For MEMBER user, call GET /action-items without projectId and verify scoped validation response.
4. Verify MEMBER can access only meetings/projects where the user is creator or participant.
5. Verify ADMIN/PM access remains functional for cross-project operations.

## G. Observability and AI Run Audit Validation (Prompt 06)

1. Trigger minute extraction and verify AiRunLog entry with operation=MINUTE_EXTRACTION.
2. Trigger retrieval search and verify AiRunLog entry with operation=RETRIEVAL_QUERY.
3. Trigger ask-ai and verify AiRunLog entry with operation=ASK_AI_ANSWER.
4. Trigger reminders run and verify AiRunLog entry with operation=REMINDER_RUN.
5. Call GET /observability/ai-runs (admin/pm) and verify filtering by operation/status/projectId works.

## H. Documentation and Handover Validation (Prompt 07)

1. Verify README references Sprint 2 completion and current docs.
2. Verify docs/sprint2-handover.md reflects final module status.
3. Verify docs/sprint2-retrieval-ai-run-runbook.md contains troubleshooting flow.
4. Verify docs/sprint3-recommendations.md exists and contains next-sprint planning notes.
