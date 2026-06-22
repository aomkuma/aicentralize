# Sprint 2 Retrieval and AI Run Runbook

This runbook focuses on retrieval quality checks and AI run trace diagnostics.

## 0. pgvector Prerequisite Check

Before running retrieval diagnostics, ensure extension is active in the same database used by the app:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

Expected result:
- `vector` exists in `pg_extension`
- version should be visible (for this setup: `0.8.3`)

## 1. Retrieval and Indexing Overview

Retrieval is based on approved knowledge chunks:
- minute summaries
- key points
- decisions
- action items
- meeting metadata

Core flow:
1. build chunks from approved minute versions
2. generate embeddings via provider abstraction
3. persist chunk text and embedding json
4. retrieve with hybrid ranking (vector + lexical + boosts)

## 2. Indexing and Backfill

Use admin endpoint:
- POST /retrieval/backfill

Expected output:
- indexedVersions
- indexedChunks

If values are zero unexpectedly:
1. verify approved minute versions exist
2. verify embedding provider is reachable
3. inspect AiRunLog and API error output

## 3. Retrieval Query Diagnostics

Use endpoint:
- POST /retrieval/search

Inspect response:
- provider
- strategy
- evidence[] with vectorScore, lexicalScore, hybridScore

Common troubleshooting:
1. If lexicalScore is always zero, check query token quality and text chunk contents.
2. If vectorScore is always zero, verify embedding generation and dimensions.
3. If only old content is returned, tune recency/source boosts as needed.

## 4. Ask-AI Grounding Diagnostics

Use endpoint:
- POST /ask-ai

For admin debug:
- includeRetrievalDebug=true

Inspect response:
- citations
- usedEvidence
- uncertainties
- retrievalDebug (admin)

If answer quality is weak:
1. validate retrieval evidence relevance first
2. verify cited snippets are from approved records
3. inspect AiRunLog for duration, status, and model metadata

## 5. AI Run Trace Inspection

Use endpoint:
- GET /observability/ai-runs

Filter options:
- operation
- status
- projectId
- meetingId
- userId

Operation values:
- MINUTE_EXTRACTION
- RETRIEVAL_QUERY
- ASK_AI_ANSWER
- REMINDER_RUN

Status values:
- SUCCESS
- FAILED

## 6. Reminder Worker Diagnostics

Run manually:
- POST /reminders/run-now

Inspect:
- byRule counters
- escalation counters
- digest generation summary

Cross-check:
- GET /reminders/logs
- GET /reminders/digests
- GET /observability/ai-runs?operation=REMINDER_RUN

## 7. Failure Patterns and Actions

1. FAILED MINUTE_EXTRACTION:
- inspect errorMessage
- inspect artifact availability and model output format

2. FAILED RETRIEVAL_QUERY:
- verify embedding provider and DB connectivity
- verify scope parameters are valid for user role

3. FAILED ASK_AI_ANSWER:
- check model endpoint health
- check retrieval evidence count and payload size

4. FAILED REMINDER_RUN:
- check scheduler settings and channel integrations
- check fallback escalation email configuration

## 8. Security and Data Notes

1. Access is membership-scoped by project/meeting participation for member role.
2. Avoid storing excessive sensitive raw payload in traceJson; prefer metadata and bounded context.
3. Treat observability endpoint as privileged operational surface.
