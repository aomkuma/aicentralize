# Handover — Kora

**Last updated:** 2026-07-01 · **`main` through `e82bc9d`**

| Doc | Purpose |
|-----|---------|
| [`FEATURES.md`](./FEATURES.md) | Product feature catalog (routes, modules) |
| [`next-day-handover-2026-06-30.md`](./next-day-handover-2026-06-30.md) | Meeting Studio raw text + Analyze; Continuity focus UX |
| [`../QUICK_REFERENCE.md`](../QUICK_REFERENCE.md) | Commands, env, access rules, smoke tests |
| [`CHANGELOG.md`](./CHANGELOG.md) | Commit history (summary) |
| [`README.md`](./README.md) | Documentation index |

---

## Latest shipped

| Area | What users get |
|------|----------------|
| **Welcome / Kora brand** | Guest `/` — hero, banner, spotlight, origin story, pricing cards, EN/TH |
| **Public packages** | `GET /packages` — active plans on welcome (sorted by price) |
| **Package admin** | `/admin/packages` — pricing, discounts (% / baht), quotas, features |
| **Reminder emails** | Multi-line Thai/EN escalation + HTML body |
| **OG previews** | `VITE_APP_PUBLIC_URL` + `/brand/og-cover.png` at build time |
| **My Tasks** | `/my-tasks` — cross-project tasks; tenant admin can assign |
| **Feeling log** | `/feeling-logs` — private journal; manager tab; batch AI 02:00 every 3 days |
| **Morning briefing** | Dashboard dialog; AI Trace scheduler panel |
| **Knowledge + notes** | Project onboarding, general notes, PUBLIC in Ask-AI |

### Recent migrations

- `20260630210000_action_item_project_scope`
- `20260630223000_subscription_packages`
- `20260630230000_subscription_package_discount`

Production: API Docker runs `npx prisma migrate deploy` on boot (`docker/start.sh`).

### Deploy env (common)

| Service | Variable | Notes |
|---------|----------|--------|
| Web | `VITE_APP_PUBLIC_URL` | Absolute URL for OG tags (rebuild required) |
| Web | `VITE_API_URL` | API origin |
| API | `APP_PUBLIC_URL` | Invitation links, emails |
| API | `MAIL_FROM` | e.g. `Kora <noreply@...>` |

---

## Quick verification

```bash
pnpm --filter api type-check
pnpm --filter web type-check
cd apps/api && npx prisma migrate deploy
```

**Smoke:**

1. Guest `/` — hero, packages, story section, EN/TH.
2. `/my-tasks` — create task; tenant admin assignee dropdown (needs 2+ members).
3. `/admin/packages` — create/edit package with discount.
4. Share welcome URL — OG image absolute (after `VITE_APP_PUBLIC_URL` set).

---

## Open items

| Item | Status | Notes |
|------|--------|-------|
| Continuity → full `ActionItemsPanel` reuse | **Open** | Panel exists; Continuity still has duplicate logic |
| Tenant admin authority model | **In progress** | Align code/docs so `TENANT_ADMIN` is highest authority inside its own tenant |
| Feeling log batch panel in AI Trace | **Open** | API exists; no web panel like morning briefing |
| In-app browser prompt (LINE/IG) | **Local** | Implemented on welcome; not yet on `main` |
| Push e2e on real iPhone PWA | **Open** | Wizard shipped; field verify VAPID + Home Screen |
| Login suspended-account friendly message | **Open** | Generic error today |
| PM continuity timeline tab | **Open** | No date-ordered timeline yet |
| Project memory vector retrieval | **Open** | Lexical scoring only |
| Project knowledge item-level review | **Open** | Batch approve only |
| Local Node >= 22 | **Open** | Repo expects 22+; some dev machines on 20 |

---

## Recommended next steps

### P0 — Stabilize

1. Production smoke (welcome, my-tasks, packages, feeling log batch, morning briefing, iPhone push).
2. Feeling log batch observability UI in AI Trace (mirror morning briefing panel).
3. Document cron singleton if API scales to multiple replicas.

### P1 — Product

4. Feeling log → communication sentiment (privacy-safe aggregates only).
5. Project memory vector retrieval (pgvector).
6. PM continuity timeline tab.

### P2 — Quality

7. Account suspension route tests + login UX.
8. Sentiment tenant isolation tests.

---

## Archive

Full historical handovers and sprint docs: [`archive/handover/`](./archive/handover/), [`archive/sprints/`](./archive/sprints/).

Demo runbook: [`demos/problem-flow-2026-06-26.md`](./demos/problem-flow-2026-06-26.md).
