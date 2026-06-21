# Sprint 1 Open TODOs and Next Sprint Notes

## V1 Limitations
- Retrieval for `POST /ask-ai` is lexical/rule-based, not pgvector hybrid retrieval.
- Minute extraction JSON repair is controlled but basic; no multi-pass self-healing pipeline.
- Owner resolution from draft text is heuristic (`name/email` lookup), can be ambiguous.
- Reminder dedupe is time-window based and not channel-specific policy based.
- No dedicated Sprint workflow UI yet; implementation is backend-first.

## Technical Debt
- Consolidate legacy and new action status semantics (`TODO` and `OPEN`) after migration hardening.
- Add stronger authorization scoping (project membership/tenant membership) for all new endpoints.
- Add persistence for Ask-AI query/answer traces if audit retention is required.
- Add robust parser telemetry for minute extraction quality tracking.

## Sprint 2 Recommendations
1. Add first-class Sprint workflow UI pages:
- Meetings ingest page
- Draft review/approve page
- Action board page
- Ask-AI citations view
- Reminder logs admin page

2. Improve retrieval quality:
- Add pgvector storage and hybrid retrieval (lexical + vector + recency weighting).

3. Improve workflow governance:
- Add revoke/re-approve workflows for minute versions.
- Add stronger assignment and ownership resolution.

4. Improve notifications:
- Add channel-specific retry policies and per-channel dedupe.
- Add escalation logic for long-overdue items.

5. Hardening and testing:
- Add integration tests for full Sprint flow.
- Add idempotency and race-condition checks around approval and reminders.

## Assumptions Captured
- Approved minute data is source of truth for board, reminders, and ask-ai.
- Existing auth model is reused; membership-hardening deferred.
- Sprint 1 prioritizes product workflow completeness over UI completeness.
