# Detailed Rerun Guide: UI-Only Problem Flow (2026-06-26)

## Purpose
Repeat the full problem-flow demo with UI-only owner mapping in Meeting Studio and verify outputs in Continuity, Reminders, and AI Trace.

## Preconditions
1. Local database is running and migrated.
2. API and web apps are running.
3. At least one tenant and one project exist.
4. Tenant has real members (owners) to choose from in Meeting Studio.

## Environment Setup
1. Install dependencies:
   - pnpm install
2. Start apps:
   - pnpm dev
3. If needed, run migrations:
   - pnpm db:migrate

## Test Data
1. Use this minute source file:
   - docs/simulated-minutes/minute-min-young-problem-2026-06-26.docx
2. Ensure target project is selected (example: TEST-01).
3. Ensure owner candidates exist in tenant member list.

## Rerun Procedure

### A. Meeting Studio (UI-only)
1. Open Meeting Studio page.
2. Select target project.
3. Upload DOCX minute file.
4. Wait for extraction and AI mapping.
5. Verify checklist section appears with mapped items.
6. Edit checklist text as needed.
7. For every checklist item:
   - Select owner
   - Set due date
8. Save meeting.
9. Confirm save success and redirect to continuity page.

### B. Validation of Save Guardrails
1. Try removing owner from one checklist item and save.
   - Expected: save blocked with owner-required validation.
2. Try invalid or empty due date and save.
   - Expected: save blocked with due-date-required validation.

### C. Continuity Validation
1. Open Continuity summary tab.
2. Confirm expected count pattern for demo data:
   - Open = 3
   - Due soon = 1
   - Overdue = 2
3. Open By Owner tab.
   - Confirm overdue ownership visibility.
4. Open By Project tab.
   - Confirm overdue item visibility for project.

### D. Reminders Validation
1. Open Reminders overview.
2. Open project reminders list.
3. Confirm digest reflects open/due-soon/overdue totals.

### E. AI Trace Validation
1. Open AI Trace panel.
2. Confirm latest run logs are visible for flow operations.
3. Verify run metadata is present for the processed cycle.

## Evidence Capture Checklist
Capture these screenshots during rerun (or compare with existing set):
1. docs/manual-screenshots/2026-06-26-problem-flow/step-01-reminders-overview.png
2. docs/manual-screenshots/2026-06-26-problem-flow/step-02-reminders-list-problem-visible.png
3. docs/manual-screenshots/2026-06-26-problem-flow/step-04-continuity-summary-problem.png
4. docs/manual-screenshots/2026-06-26-problem-flow/step-05-continuity-by-owner-fixed-thai.png
5. docs/manual-screenshots/2026-06-26-problem-flow/step-06-continuity-by-project-fixed-thai.png
6. docs/manual-screenshots/2026-06-26-problem-flow/step-07-ai-trace-audit.png
7. docs/manual-screenshots/2026-06-26-problem-flow/step-08-reminders-project-final.png

## Pass Criteria
1. Meeting can be saved using checklist owner mapping in UI only.
2. Save is blocked when checklist owner or due date is incomplete.
3. Continuity reflects expected open/due-soon/overdue counts.
4. Reminders digest mirrors continuity problem state.
5. AI trace provides backend processing evidence.

## Known Limitation
- Some digest detail routes may return 404 intermittently.
- This does not invalidate summary/list-level demo verification.

## Cleanup (Optional)
1. Delete simulated action items (for example items tagged with [SIM]).
2. Run reminder cycle again to normalize next digest output.
