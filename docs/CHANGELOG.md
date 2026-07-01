# Changelog

Product-facing history for **Kora** (`main`). For current status and open work, see [`HANDOVER.md`](./HANDOVER.md).

| Date | Commit | Summary |
|------|--------|---------|
| 2026-07-01 | (pending) | INDIVIDUAL AI chat history + self-scoped `/ask-ai/conversations`; dashboard chat persistence; knowledge import jobs in DB; tenant AI persona; IBM Plex Sans; billing phase 2 |
| 2026-07-03 | (pending) | Tenant billing: `billingStartDate` on first login; `maxUsers` enforcement; admin billing columns |
| 2026-07-03 | `37f36a5` | Sync `pnpm-lock.yaml` after API document parsing deps (Railway deploy fix) |
| 2026-07-03 | `0366d1e` | Server-side Project Knowledge file import (`documentTextService`: pdf-parse, mammoth, xlsx) |
| 2026-07-03 | `99b14fe` | Project Knowledge guided steps + live progress panel |
| 2026-07-03 | `9755b97` | Enforce subscription package checkbox features across UI routes and API |
| 2026-07-02 | `1e26b1b` | API build fix; knowledge history collapse + pagination |
| 2026-07-02 | `9ba381d` | Tenant-scoped permissions, team edit UI, 500 MB upload limits |
| 2026-07-02 | `b249758` | Tenant-scoped nicknames; team member removal |
| 2026-07-02 | `cfbd0a1` | Meeting Studio raw-text Analyze button; Continuity focus UX |
| 2026-07-01 | `e82bc9d` | Welcome origin story section + quote block; hero origin line |
| 2026-07-01 | `8b95055` | Welcome packages: 4-column layout, sort by price, remove subtitle |
| 2026-07-01 | `e15a048` | Public `GET /packages`; welcome pricing cards; fix new-package form reset |
| 2026-07-01 | `8abc4b6` | Fix package schema Zod types (API build) |
| 2026-07-01 | `7ec7c8c` | Package discounts; readable reminder emails; OG link preview meta |
| 2026-07-01 | `73c80a2` | Subscription packages admin; feeling-log privacy; general notes links; docs refresh |
| 2026-06-30 | `2d1cd5d` | My Tasks; tenant-admin assignees; welcome Knowledge Hub / Feeling Log spotlight |
| 2026-06-30 | `922b7d7` | Full-width Kora landing banner |
| 2026-06-30 | `c912763` | Rebrand to Kora; guest welcome at `/` |
| 2026-06-30 | `37eac5d` | Feeling log batch AI every 3 days at 02:00 Bangkok |
| 2026-06-30 | `ae265c3` | Feeling log API + `/feeling-logs` web |
| 2026-06-30 | `ab2611f` | Morning briefing scheduler panel in AI Trace |
| 2026-06-30 | `ae26706` | Rubjob morning briefings; general note PUBLIC/PRIVATE |
| 2026-06-30 | `db369f8` | iPhone push PWA wizard + onboarding banner |
| 2026-06-30 | `61127ae` | Playground / Meeting Studio prompt limit 120k chars |
| 2026-06-30 | `4e69563` | ASR default timeout 1 hour |
| 2026-06-30 | `5f1d652` | nginx `/ai/` proxy timeout 3700s |
| 2026-06-30 | `4e9aaf6` | Action-item push notifications; Meeting Studio job fixes |

Older sprint-level notes: [`archive/sprints/`](./archive/sprints/). Full daily logs: [`archive/handover/`](./archive/handover/).
