# Sprint 3 Recommendations

This note outlines practical next steps after Sprint 2 completion.

## 1. Productization and Commercial Controls

1. Add billing and subscription plans.
2. Add feature entitlement controls by plan tier.
3. Add admin pricing and activation backend.

## 2. Identity and Enterprise Access

1. Introduce organization/tenant entity as first-class model.
2. Add enterprise SSO (OIDC/SAML) and lifecycle controls.
3. Add stronger role policy matrix (org admin, PM, contributor, viewer).

## 3. Reliability and Testing

1. Build integration tests for full workflow:
- ingest -> extract -> approve -> ask-ai -> reminder -> continuity
2. Add regression tests for scope isolation and reminder escalation.
3. Add contract tests for critical API responses and pagination.

## 4. Observability and Operations

1. Add external telemetry sink (metrics/log aggregation).
2. Add alerting for failed AI runs, reminder failures, and retrieval anomalies.
3. Add dashboards for latency/error trends by operation.

## 5. UX and Workflow Surfaces

1. Build continuity dashboard UI widgets using /continuity endpoints.
2. Build reminder operations page for escalation/digest inspection.
3. Build ask-ai trace panel for citations and evidence transparency.

## 6. AI and Retrieval Quality

1. Improve chunking strategy and ranking tuning by data profile.
2. Add evaluation harness for retrieval precision and answer grounding quality.
3. Add model routing and fallback strategy for resilience.

## 7. AI Provider Abstraction

1. Introduce a provider layer that can route between local LLM, OpenAI, Anthropic, and future models.
2. Add provider selection and defaults per workflow, such as Meeting Studio, Ask-AI, and transcript processing.
3. Keep Ollama as the local fallback provider when on-device or LAN inference is preferred.
4. Store provider configuration centrally so admins can switch models without code changes.
