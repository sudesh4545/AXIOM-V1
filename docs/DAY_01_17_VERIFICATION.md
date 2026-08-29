# AXIOM V1 — Day 1–17 Verification Matrix

Verified locally on 29 August 2026. This report distinguishes implemented behavior from future
30-day scope; “complete” below means complete for the agreed milestone, not enterprise production.

| Days | Acceptance outcome | Evidence |
|---|---|---|
| 1–3 | Responsive dashboard, typed contract, persistent same-origin API and idempotent approval | Production build; D1 revision survives restart |
| 4–5 | Hosted/local identity boundary, organizations, two authorized workspaces and governed event ingestion | Unknown workspace returns 403; duplicate event returns inserted=0 |
| 6–10 | Taxonomy, KPI/funnel/retention/churn measurement, evidence gate and measured bottleneck | 39 web tests; Sandbox remains measured after restart |
| 11–15 | Three ranked evidence-backed opportunities with transparent scores and assumptions | Determinism/ranking tests; live dashboard returns ranks 1–3 |
| 16–17 | Persisted definitions, sticky feature flags, exposure tracking and audited kill switch | Live assignment/exposure/pause/resume verification |

## Automated verification executed

```text
npm test                  39 passed
npm run test:api          10 verification groups passed
npx tsc --noEmit          passed
npm run lint              passed, zero warnings
npm run build             passed
pytest apps/api -q        61 passed
PRAGMA integrity_check    ok
```

The API verification covers dashboard health, workspace catalog, tenant isolation, malformed JSON,
batch bounds, unsupported sources, taxonomy rules, required actors, revenue rules, timestamp bounds,
payload size, ingestion idempotency, deterministic assignment, exposure deduplication, assignment
mismatch rejection, pause/resume behavior, sticky recovery and a 50-request concurrent smoke run.

## Persistence evidence

After a controlled local server stop/start:

- active workspace remained Production;
- Production dashboard revision remained 1;
- Sandbox retained 153 events;
- Sandbox remained in measured state;
- three ranked opportunities remained available;
- approved experiment and feature-flag delivery records remained in D1.

## Remaining 30-day roadmap (not part of Day 1–17)

- outcome aggregation and sequential experiment analysis;
- real analytics/revenue adapters;
- richer risk policies, automatic guardrail rollback and complete Decision Receipts;
- CompanyGym-lite simulation;
- rate limits, observability, backups, final hosted deployment and case study.

No claim is made that these later milestones are already complete.
