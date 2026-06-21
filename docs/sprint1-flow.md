# Sprint 1 End-to-End Flow

This document describes the implemented Sprint 1 meeting-minute workflow.

## Scope
- Create meeting under project
- Save transcript and raw note artifacts
- Extract minute draft from artifacts using local LLM
- Review and edit draft
- Approve draft into immutable minute version
- Create structured decisions and action items from approved minute
- Track action items with status and ownership updates
- Ask AI grounded on approved meeting knowledge
- Run due-soon and overdue reminder worker

## Step-by-Step Product Flow
1. Create meeting
- Endpoint: `POST /projects/:projectId/meetings`
- Creates meeting metadata and optional participants.

2. Save transcript/raw notes
- Endpoint: `POST /meetings/:meetingId/artifacts`
- Supports at least `TRANSCRIPT` and `RAW_NOTE` artifact types.

3. Extract minute draft
- Endpoint: `POST /meetings/:meetingId/minute-drafts/extract`
- Loads meeting artifacts, builds extraction prompt, calls local LLM, validates JSON output, stores `MinuteDraft`.

4. Review draft
- Endpoint: `GET /minute-drafts/:draftId`
- Returns meeting context, draft summary, decisions, action items, risks, open questions, and generation metadata.

5. Edit draft
- Endpoint: `PATCH /minute-drafts/:draftId`
- Supports human correction for summary, decisions, action items, risks, and open questions.

6. Approve draft
- Endpoint: `POST /minute-drafts/:draftId/approve`
- Creates `MinuteVersion` snapshot.
- Creates structured `Decision` and `ActionItem` rows.
- Writes initial `ActionItemStatusHistory` rows.

7. Operate action board
- List/filter endpoint: `GET /action-items`
- Detail endpoint: `GET /action-items/:id`
- Quick edit endpoint: `PATCH /action-items/:id`
- Reassign owner endpoint: `POST /action-items/:id/reassign`
- Status transition endpoint: `POST /action-items/:id/status`

8. Ask AI from approved knowledge
- Endpoint: `POST /ask-ai`
- Retrieval uses approved `MinuteVersion`, `Decision`, and `ActionItem` data.
- Returns grounded answer with citations and used source IDs.

9. Run reminder worker
- Internal scheduler: `startReminderScheduler()`
- Manual trigger: `runReminderNow()`
- Selects due-soon and overdue approved action items, dedupes by reminder window, dispatches notifications, and writes `ReminderLog`.

## Trust Boundary
- Approved minute versions and structured action rows are the source of truth for downstream usage.
- Unapproved drafts are editable working artifacts, not authoritative evidence.

## Key Data Lifecycle
1. `Meeting` created
2. `MeetingArtifact` appended
3. `MinuteDraft` extracted
4. `MinuteVersion` approved
5. `Decision` and `ActionItem` materialized
6. `ActionItemStatusHistory` and `ReminderLog` accumulate operational history
