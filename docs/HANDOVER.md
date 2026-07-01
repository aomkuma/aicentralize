# Handover — Kora

**Last updated:** 2026-07-01 · **pending push to `main`**

| Doc | Purpose |
|-----|---------|
| [`FEATURES.md`](./FEATURES.md) | Product feature catalog (routes, modules) |
| [`next-day-handover-2026-06-30.md`](./next-day-handover-2026-06-30.md) | Meeting Studio, Continuity, knowledge import, INDIVIDUAL UX |
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
| **Package feature gating** | Checkbox features on `/admin/packages` enforced in sidebar, `FeatureRoute`, and key API routes (`packageAccessService`) |
| **Tenant billing** | `billingStartDate` on first login; admin billing — see [`guides/BILLING.md`](./guides/BILLING.md) |
| **Project Knowledge import** | Server-side parsing; async `import-jobs` + poll; jobs persisted in DB (`ProjectKnowledgeImportJob`) |
| **INDIVIDUAL AI history** | `/ai-trace` conversations for `AI_CHAT_BASIC`; `GET /ask-ai/conversations` (self-scoped) |
| **Dashboard chat persist** | `sessionStorage` with stable `persistKey` on INDIVIDUAL dashboard |
| **Tenant AI persona** | Signup category (`tenantCategory`) injected into server-side AI prompts |
| **IBM Plex Sans** | App + API HTML typography (EN/TH) |
| **Feeling log (INDIVIDUAL)** | Hidden when tenant package code is `INDIVIDUAL` (separate from checkbox features) |
| **Tenant nicknames** | Per-org `TenantMembership.nickname`; Meeting Studio owner mapping |
| **Upload limits** | 500 MB files; ASR 6h timeout; nginx `/ai/` 22200s |

### Recent migrations

- `20260704120000_tenant_billing_phase2`
- `20260703120000_tenant_billing`
- `20260701193000_tenant_entity_categories`
- `20260630150000_project_knowledge_import_jobs`
- `20260703120000_tenant_billing`
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
cd apps/api && npx prisma generate
```

**Smoke:**

1. Guest `/` — hero, packages, story section, EN/TH.
2. `/my-tasks` — create task; tenant admin assignee dropdown (needs 2+ members).
3. `/admin/packages` — create/edit package with discount; assign package to org; verify nav hides gated routes.
4. `/projects/:id/knowledge` — upload XLSX/PDF; `POST .../import-jobs` + poll until completed (no 404 at 100%).
5. INDIVIDUAL tenant — dashboard chat → `/ai-trace` shows conversation; navigate away/back restores chat.
6. INDIVIDUAL package tenant — `/feeling-logs` hidden; other tiers show feeling log.
7. Share welcome URL — OG image absolute (after `VITE_APP_PUBLIC_URL` set).

---

## Open items

| Item | Status | Notes |
|------|--------|-------|
| `CUSTOM_WORKFLOWS` feature gate | **Open** | Checkbox exists; no dedicated page to gate yet |
| Tenant billing (`billing_start_date`) | **Shipped (P1)** | Activate on first login — [`guides/BILLING.md`](./guides/BILLING.md) |
| Billing history + `/admin/billing` | **Planned (P2)** | `TenantBillingEvent` / `TenantBillingPeriod` — see BILLING.md scale roadmap |
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

1. Production smoke (welcome, my-tasks, packages, **package gating per tier**, **knowledge file import**, feeling log batch, morning briefing, iPhone push).
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
