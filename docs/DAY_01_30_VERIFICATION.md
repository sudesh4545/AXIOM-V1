# AXIOM V1 — Day 1–30 Final Acceptance Matrix

| Scope | Completed acceptance |
|---|---|
| Days 1–5 | Responsive product UI, D1 state, identity, workspace isolation, governed ingestion |
| Days 6–10 | Metrics, funnel, retention, churn, evidence gate and bottleneck detection |
| Days 11–15 | Ranked evidence-backed opportunities with explicit assumptions |
| Days 16–19 | Feature flags, sticky assignment, exposure, outcomes and conservative analysis |
| Days 20–25 | PostHog/Stripe adapters, causal boundary, policies, rollback and receipts |
| Days 26–27 | Persisted CompanyGym-lite shadow simulation with uncertainty and risk |
| Day 28 | Rate limits, security headers, operational health and SLO reporting |
| Day 29 | Migration, build, API, concurrency, persistence and recovery verification |
| Day 30 | Architecture, runbook, case study and final truthful product documentation |

## Definition of complete

The 30-day V1 narrow loop is complete when a reviewer can ingest data, see a measured bottleneck, inspect
ranked actions, simulate the selected action, pass deterministic policies, approve bounded delivery, record
assignment/exposure/outcome, trigger safety rollback and inspect the final Decision Receipt. Automated tests
must pass and production demo data must remain clearly labelled. Enterprise-scale infrastructure and real
customer deployment are explicitly not part of this V1 acceptance definition.

## Final automated evidence — 29 August 2026

```text
Web unit tests                  56 passed across 11 files
FastAPI regression tests       62 passed
Live same-origin verification  15 groups passed
TypeScript                     passed
ESLint                         passed with zero warnings
Production build               passed (9 routes)
Concurrent dashboard smoke     50/50 successful
Sequential dashboard latency   75ms average / 96ms p95 (20 local reads)
Local restart                  state preserved
Final workspace                Acme Cloud / production / storage connected
```

The live groups cover security headers, persisted simulations, operational health/SLOs, tenant isolation,
input boundaries, idempotent ingestion, adapter replay, risk policy, automatic rollback, Decision Receipt
persistence and active-workspace restoration.

A post-acceptance closure audit then upgraded vulnerable dependencies, removed the final lint/build warnings,
tightened simulation/audit validation, verified rate limiting, corrected remaining small typography and made
the legacy FastAPI data surface fail closed outside local development. See `FINAL_CLOSURE_AUDIT.md`.
