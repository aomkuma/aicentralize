# Sprint 1 Acceptance Checklist

Use this checklist for manual QA before handover.

## A. Meeting Creation
1. Login and get JWT.
2. Call `POST /projects/:projectId/meetings` with title and meetingDate.
3. Verify response is `201`.
4. Verify meeting appears in `GET /meetings` and `GET /meetings/:meetingId`.

## B. Transcript and Raw Note Save
1. Call `POST /meetings/:meetingId/artifacts` with `artifactType=TRANSCRIPT` and `textContent`.
2. Call `POST /meetings/:meetingId/artifacts` with `artifactType=RAW_NOTE` and `textContent`.
3. Verify artifacts are returned in `GET /meetings/:meetingId` sorted by `createdAt`.

## C. Minute Draft Extraction
1. Call `POST /meetings/:meetingId/minute-drafts/extract`.
2. Verify response includes `draftId` and status (`READY_FOR_REVIEW` or `REJECTED`).
3. If malformed model output occurs, verify failure is handled gracefully and parse error metadata exists.

## D. Draft Review and Approval
1. Call `GET /minute-drafts/:draftId` and verify editable sections are present.
2. Call `PATCH /minute-drafts/:draftId` to edit summary, decisions, action items.
3. Call `POST /minute-drafts/:draftId/approve`.
4. Verify minute version is created with incremented version number.
5. Verify `Decision` and `ActionItem` rows are created and linked to meeting and minute version.

## E. Action Item Board
1. Call `GET /action-items` and verify paginated list output.
2. Verify filters: `ownerUserId`, `status`, `projectId`, `meetingId`, `overdueOnly`, `dueFrom`, `dueTo`.
3. Call `POST /action-items/:id/status` for valid transitions.
4. Call `POST /action-items/:id/reassign` and verify owner change.
5. Verify `ActionItemStatusHistory` is recorded for status changes and reassign events.

## F. Ask-AI Grounding
1. Call `POST /ask-ai` with question related to approved data.
2. Verify response includes `answer`, `citations`, `usedMeetingIds`.
3. Verify answer is cautious when evidence is weak or not found.
4. Verify endpoint does not rely primarily on unapproved drafts.

## G. Reminder Worker V1
1. Prepare approved action items in due-soon and overdue states.
2. Run reminder worker (scheduler or manual trigger).
3. Verify reminders are sent only for active statuses.
4. Verify no duplicate reminders inside dedupe window.
5. Verify `ReminderLog` rows are created with delivery status and channel metadata.

## H. Build and Docs
1. Run `npm run build` and verify no compile errors.
2. Verify OpenAPI has Sprint 1 endpoints.
3. Verify docs are updated (`README.md`, flow doc, acceptance checklist, TODO notes).
