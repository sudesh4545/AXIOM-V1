# AXIOM V1 — Day 1–25 Verification Matrix

Verified locally on 29 August 2026. “Complete” means complete for the defined daily milestone, not
enterprise production readiness.

| Days | Verified capability |
|---|---|
| 1–5 | Responsive dashboard, D1 persistence, identity/workspace isolation and event ingestion |
| 6–10 | Governed taxonomy, KPI/funnel/retention/churn measurement and bottleneck evidence gate |
| 11–15 | Deterministic three-candidate opportunity ranking with evidence and assumptions |
| 16–17 | Persisted experiment definitions, sticky feature flags and exposure tracking |
| 18–19 | Outcome ingestion, sample boundaries and conservative sequential analysis |
| 20–22 | PostHog/Stripe adapters and randomized two-proportion causal-analysis V1 |
| 23–25 | Workspace risk policy, pre-launch blocking, automatic rollback and detailed receipts |

## Verification result

```text
Web unit tests                 51 passed
FastAPI regression tests      61 passed
Live same-origin API          12 groups passed
TypeScript                    passed
ESLint                        passed with zero warnings
Production build              passed
D1 integrity                  ok
Controlled restart            state preserved
```

The live suite verifies tenant isolation, event validation, ingestion and adapter idempotency,
production pre-launch blocking, persisted rollback/receipt state and 50 concurrent dashboard reads.
The first safety run additionally verified sticky assignment, exposure deduplication, primary-metric
outcomes, pause/resume recovery and an automatic guardrail rollback.

## Persisted checkpoint

- Production remains the active workspace and still has no fabricated measured events.
- Sandbox contains measured governed events from SDK, PostHog and Stripe verification sources.
- Sandbox experiment status is `rolled_back` after the intentional harmful-treatment scenario.
- The top Sandbox Decision Receipt records the 50-point guardrail increase and final rollback.

## Remaining 30-day scope

Days 26–30 still contain CompanyGym-lite/shadow simulation, broad security/observability/rate-limit
hardening, deployment verification, architecture diagrams and the final case study. These are not
claimed as complete here.
