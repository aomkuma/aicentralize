# Problem Flow Demo (2026-06-26)

End-to-end demo: meeting → owner-linked action items → problem visibility in Continuity, Reminders, and AI Trace — **UI only** (no backend assignment scripts).

## Objective

Show that a meeting can produce owner-linked action tracking and problem visibility through the product UI, without workaround scripts.

## Preconditions

1. Local database migrated; API + web running (`pnpm dev`).
2. At least one tenant, project (e.g. TEST-01), and tenant members for owner selection.
3. Test minute file: `docs/simulated-minutes/minute-min-young-problem-2026-06-26.docx`

## What was implemented (UI)

1. Meeting Studio editable checklist rows from AI output.
2. Each row requires owner + due date before save.
3. Meeting save sends action items in payload.
4. Tenant member lookup for owner dropdown.
5. Save blocked when owner or due date missing.

## Rerun procedure

### A. Meeting Studio

1. Open Meeting Studio → select project.
2. Upload DOCX minute → wait for extraction/AI.
3. For every checklist item: set owner + due date.
4. Save → confirm redirect to continuity.

### B. Guardrails

- Remove owner → save blocked.
- Empty due date → save blocked.

### C. Continuity

- Summary: Open **3**, Due soon **1**, Overdue **2**.
- **By owner** / **By project**: overdue visibility.

### D. Reminders

- Overview + project list digest aligned with open/due-soon/overdue.

### E. AI Trace

- Latest run logs visible for the processed cycle.

## Demo steps (with screenshots)

| Step | Action | Screenshot |
|------|--------|------------|
| 1 | Reminders overview | `docs/manual-screenshots/2026-06-26-problem-flow/step-01-reminders-overview.png` |
| 2 | Project reminders — problem digest | `step-02-reminders-list-problem-visible.png`, `step-08-reminders-project-final.png` |
| 3 | Continuity summary | `step-04-continuity-summary-problem.png` |
| 4 | Continuity by owner | `step-05-continuity-by-owner-fixed-thai.png` |
| 5 | Continuity by project | `step-06-continuity-by-project-fixed-thai.png` |
| 6 | AI Trace audit | `step-07-ai-trace-audit.png` |

## Pass criteria

- Save via checklist owner mapping in UI only.
- Continuity + Reminders reflect expected counts.
- AI Trace shows processing evidence.

## Known limitations

- Some reminder digest **detail** routes may 404; list/summary views still work for the demo.

## Cleanup (optional)

- Delete action items tagged `[SIM]`.
- Re-run reminder worker to normalize next digest.

## Executive conclusion

The problem flow is demonstrable with UI-driven owner mapping. Evidence spans Continuity, Reminders, and AI Trace without backend assignment scripts.
