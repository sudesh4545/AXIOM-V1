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
│   ├── web/          # Next.js dashboard + same-origin API route (Cloudflare D1)
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
Cloudflare D1 via Drizzle. This removed the hard dependency on a locally running FastAPI process
and made experiment approval persist: approving the recommended canary writes a new snapshot
revision, appends the experiment, appends a Decision Receipt, and records an audit event. Repeated
approval is idempotent and does not bump the revision.

The chart and sparkline rendering was also rebuilt on SVG polylines after the original
trigonometric approach was found to be mixing pixel and percentage units in the same calculation,
which produced both wrong segment lengths and wrong angles.

### Honest boundary

Displayed business numbers are still seed data. AXIOM does not yet ingest live customer data, run
real production experiments, or make verified causal claims. The identity handling in both API
surfaces is development-grade and is not authentication — see `apps/api/README.md`. Real
authentication is scheduled for Day 4.

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
cd apps/web && npx tsc --noEmit && npm run lint && npm run build
```

```bash
./.venv/Scripts/python.exe -m pytest apps/api -q
```

## Project context

`docs/PROJECT_CONTEXT.md` holds the product vision, 30-day scope, architecture direction, safety
principles and success criteria. Daily reports are in `docs/DAY_0*_REPORT.md`.
