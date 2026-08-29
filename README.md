# AXIOM V1

AXIOM is a verified autonomous experimentation operating system for B2B SaaS startups.

Its core loop is:

```text
Business objective
  -> evidence-backed hypothesis
  -> bounded experiment
  -> policy and risk verification
  -> real measurement
  -> rollback or scale
  -> auditable Decision Receipt
```

## Repository layout

```text
AXIOM V1/
├── apps/
│   ├── web/          # Next.js dashboard + same-origin API route
│   └── api/          # FastAPI service: domain model, event ingestion (optional)
├── docs/             # Project context, daily reports, locked design reference
└── README.md
```

## Current progress

**Day 1 — dashboard foundation** (`apps/web`)

Responsive overview and navigation, growth KPI cards, bottleneck funnel, experiment
recommendation and approval review, active experiments, recent Decision Receipts, AXIOM AI drawer,
search shortcut, and desktop/tablet/mobile layouts. Built against the locked reference in
`docs/design/axiom-dashboard-final-reference.png`.

**Day 2 — backend contract and data foundation** (`apps/api`)

FastAPI service with a Postgres-ready domain model (organizations, workspaces, users, events),
tenant isolation, a typed dashboard contract shared with the frontend, event ingestion with batch
limits and idempotent deduplication, Alembic migrations, a demo-data seeder, and 61 tests.

**Day 3 — persistent same-origin API**

The dashboard now reads and writes through its own Next.js route (`/api/v1/dashboard`) backed by
the managed workspace data store via Drizzle. This removed the hard dependency on a locally running FastAPI process
and made experiment approval persist: approving the recommended canary writes a new snapshot
revision, appends the experiment, appends a Decision Receipt, and records an audit event. Repeated
approval is idempotent and does not bump the revision.

The chart and sparkline rendering was also rebuilt on SVG polylines after the original
trigonometric approach was found to be mixing pixel and percentage units in the same calculation,
which produced both wrong segment lengths and wrong angles.

**Day 4 — identity, organizations and workspaces**

Hosted requests now use the identity headers supplied by the Sites platform; the fixed local user is
available only on loopback for development. Organizations, memberships, workspaces, active-workspace
preferences and workspace-scoped dashboard snapshots live in D1. The workspace selector is
server-authorized and remembers the operator's active workspace.

**Day 5 — same-origin event ingestion**

`POST /api/v1/events` accepts bounded AXIOM SDK or webhook batches, validates the payload, isolates
events by workspace and deduplicates retries with a workspace/idempotency-key constraint. Source
status, event totals, anonymous-user totals and last-delivery time are shown honestly on the
Integrations page. Every accepted batch also produces an audit event.

**Days 6–10 — governed metrics and bottleneck engine**

The ingestion route now enforces a versioned lifecycle/product/revenue taxonomy, actor identity for
business events, revenue property rules and timestamp bounds. A workspace-scoped measurement engine
turns governed events into MRR, activation, trial conversion, churn, 30-day growth, sequential
funnel steps, D7/D30 retention and the strongest measured bottleneck. The dashboard stays on clearly
labelled demo data until its evidence gate has at least 10 observed users plus signup and activation
signals; only then does it switch to `ingested` metrics and a deterministic, human-approved next-step
recommendation.

**Days 11–15 — opportunity and hypothesis engine**

Every measured bottleneck now produces three deterministic intervention candidates instead of one
unexplained suggestion. Candidates include evidence, assumptions, predicted lift, confidence, risk,
delivery effort, reversibility and a transparent score breakdown. The highest-ranked candidate is
selected for the human approval flow; alternatives remain visible in Intelligence and can be
inspected without pretending that correlation is causal proof.

**Days 16–17 — experiment delivery and exposure tracking**

Approving a recommendation now creates a persisted experiment definition and a workspace-scoped
feature flag. `/api/v1/experiments` provides stable subject assignment, bounded control/treatment
allocation, sticky assignment persistence, idempotent exposure tracking and audited pause/resume/
rollback controls. A paused or rolled-back flag always serves control; rollback is terminal.

**Days 18–25 — outcome analysis, adapters and governed decisions**

Experiments now accept idempotent binary outcomes only after a matching sticky assignment and
exposure. A conservative two-proportion monitor reports control/treatment sample size, absolute and
relative lift, 95% interval and probability of treatment improvement while refusing causal claims
below the configured evidence floor. PostHog and Stripe-style deliveries normalize into the same
governed event taxonomy. Workspace policies enforce traffic, evidence, confidence and guardrail
limits; harmful guardrail results automatically disable the flag, audit the rollback and persist a
complete Decision Receipt with objective, hypothesis, evidence, alternatives, population, observed
result, policy violations and final decision.

**Days 26–30 — shadow simulation and production-readiness package**

CompanyGym-lite now runs persisted conservative/base/aggressive Monte Carlo scenarios and reports a
90% interval, positive-outcome probability, guardrail risk and bounded launch advice without presenting
simulation as causal evidence. Durable rate-limit windows, security headers and a workspace operations
endpoint add protection and health/SLO visibility. The final architecture, incident/recovery runbook,
case study and complete Day 1–30 acceptance matrix are included under `docs`.

### Honest boundary

Production dashboard business numbers are still seed data. AXIOM can persist real event batches and
calculates governed KPIs when a workspace passes the evidence gate. Production currently has
no connected customer events, so its cards correctly remain demo data; Sandbox contains an explicitly
synthetic verification cohort. AXIOM still does not run production experiments or make verified
causal claims. Hosted identity is supplied by the Sites platform; localhost deliberately
uses a development-only fallback. The separate FastAPI service still has its own development-grade
header identity — see `apps/api/README.md`.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
cd apps/web && npm install && npm run dev
```

Open `http://localhost:3000`. No backend process is required — the dashboard serves itself from the
same origin, and local D1 state persists between restarts.

To use the FastAPI service instead, set `NEXT_PUBLIC_AXIOM_API_URL` in `apps/web/.env.local` and
follow `apps/api/README.md`. Leaving it blank keeps the same-origin route.

## Validation

```bash
cd apps/web && npm test && npm run test:api && npx tsc --noEmit && npm run lint && npm run build
```

```bash
./.venv/Scripts/python.exe -m pytest apps/api -q
```

## Project context

`docs/PROJECT_CONTEXT.md` holds the product vision, 30-day scope, architecture direction, safety
principles and success criteria. Daily reports are in `docs/DAY_0*_REPORT.md`.

The final Day 1–30 verification matrix is in `docs/DAY_01_30_VERIFICATION.md`.
The post-acceptance security, quality and readability sweep is in `docs/FINAL_CLOSURE_AUDIT.md`.
