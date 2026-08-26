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

## Current progress

Day 1 delivers the responsive dashboard foundation in `apps/web`:

- AXIOM overview and navigation;
- growth KPI cards;
- bottleneck funnel;
- experiment recommendation and approval review;
- active experiments;
- recent Decision Receipts;
- Copilot drawer, search shortcut and interface feedback;
- desktop, tablet and mobile layouts.

The current numbers are realistic demo data. Backend ingestion, authentication, tenant workspaces and persistent experiment state are scheduled for later milestones.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
cd apps/web
npm run lint
npm run build
```

## Project context

See `docs/PROJECT_CONTEXT.md` for the product vision, 30-day scope, architecture direction, safety principles and success criteria.
