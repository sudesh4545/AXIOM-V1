# AXIOM V1 — Project Context

## Context source

This document imports the complete project-relevant context from the earlier AXIOM discussion on 26 August 2026. It is the continuity document for future development sessions.

## Creator context and objective

- The creator is a third-year B.Tech IT student at a strong college with highly competitive peers.
- The goal is to build an unusually advanced, futuristic and genuinely useful project that stands out to companies such as Google and Microsoft.
- The project should be valuable to early-stage startups, not merely a visual college demo.
- The working deadline for AXIOM V1 is 30 days.
- The assistant is expected to handle the architecture, frontend, backend, database, APIs, AI logic, testing, documentation and deployment configuration. The creator will provide product decisions, required accounts/API keys, and feedback from local or cloud runs.
- The creator must understand every important component well enough to defend the design in interviews; explanations should therefore accompany implementation in simple Hinglish.

## Product identity

**Name:** AXIOM

**V1 positioning:** Customer-demo-ready Autonomous Experimentation OS for B2B SaaS startups.

**Long-term positioning:** Verified Autonomous Experimentation Operating System for trustworthy autonomous companies.

**Core primitive:**

```text
Objective -> Verified Experiment
```

Every AXIOM experiment should be measurable, causal, bounded, reversible, observable and auditable.

**Short explanation:** AXIOM is CI/CD for autonomous business decisions.

It does not merely give advice. It converts a business objective into hypotheses, evaluates possible interventions, applies safety policies, launches a controlled experiment after approval, measures the real result, rolls back harmful outcomes and records what was learned.

AXIOM is not intended to be:

- a generic chatbot;
- a CRM;
- a collection of disconnected APIs;
- a superficial dashboard;
- a group of dozens of role-playing AI agents;
- an unsafe system that directly rewrites production without approval.

## Target customer and initial niche

AXIOM V1 focuses on B2B SaaS startups rather than every kind of business.

Ideal early customer:

- 5–50 employees;
- roughly 1,000–100,000 users;
- needs help with activation, trial conversion, retention or churn;
- lacks a dedicated growth scientist, product analyst or experimentation engineer.

The customer-ready promise is intentionally narrow:

> Connect product and revenue data, identify a growth bottleneck, generate and rank a safe experiment, let a human approve it, measure the result, roll it back when a guardrail is violated, and produce an auditable decision receipt.

## End-to-end V1 flow

```text
Startup connects AXIOM
        ↓
AXIOM ingests product and revenue events
        ↓
Detects the most important growth bottleneck
        ↓
Generates evidence-backed hypotheses
        ↓
Ranks candidate experiments
        ↓
Estimates likely impact
        ↓
Checks policies, risk and reversibility
        ↓
Human approves
        ↓
Experiment launches through feature flags
        ↓
AXIOM monitors primary and guardrail metrics
        ↓
Harmful result -> pause and rollback
Positive result -> recommend scaling
        ↓
Decision Receipt and measurable report
```

Example customer objective:

```text
Increase paid conversion from 14% to 20% in 60 days.
Do not increase churn by more than 2%.
Maximum budget: ₹5 lakh.
```

Example output:

```text
Primary bottleneck: Trial -> Activation

Hypothesis:
Users who complete a key action in their first session
have materially higher paid conversion.

Experiment:
Move "Invite teammate" into onboarding step 2.

Expected activation uplift: +7.2%
Risk: Low
Traffic: 10%
Duration: 7 days
```

## Core product components

### 1. Event and metrics layer

- Ingest product events and revenue-related events.
- Maintain company, workspace and tenant isolation.
- Calculate funnels, activation, conversion, retention and churn.
- Detect anomalies and bottlenecks.
- Start with synthetic SaaS data, then support real integrations.

### 2. Living business/causal model

Represent important paths such as:

```text
Signup -> Onboarding -> First value -> Collaboration
       -> Engagement -> Trial conversion -> Paid -> Retention
```

V1 should make conservative evidence-backed claims and clearly separate correlation, hypothesis and experimentally verified effect.

### 3. Hypothesis and opportunity engine

- Identify likely leverage points.
- Generate candidate interventions.
- Attach evidence, assumptions, expected uplift, confidence and implementation requirements.
- Rank experiments by expected value, risk, cost and reversibility.

### 4. Experiment engine

- Define control and treatment variants.
- Allocate bounded traffic using feature flags.
- Track primary metrics and guardrail metrics.
- Support pause, rollback and scale recommendations.
- Avoid naive significance claims; sequential testing and selection bias must be handled or explicitly documented.

### 5. Reality Gate / risk engine

Every proposed action should be assessed for:

- business objective alignment;
- predicted gain and possible harm;
- financial exposure;
- privacy/security impact;
- affected user scope;
- reversibility and rollback time;
- model confidence;
- policy violations;
- whether human approval is mandatory.

High-impact, low-confidence or poorly reversible actions must be blocked.

### 6. Decision Receipts

Each important decision should produce an auditable record containing:

- objective;
- hypothesis;
- supporting evidence;
- causal path or reasoning summary;
- alternatives considered;
- predicted impact;
- risk score;
- experiment population;
- observed result and confidence;
- policy violations;
- approvals/human intervention;
- final decision: rollback, continue or scale.

### 7. Shadow Company / simulation

The long-term differentiator is a continuously updated counterfactual digital twin that compares multiple possible interventions before real execution.

For the 30-day V1, this becomes **CompanyGym-lite / shadow simulation**: a transparent, limited simulator using synthetic users, historical patterns and explicit assumptions. It must not pretend to predict reality perfectly.

### 8. CompanyGym (post-V1 research direction)

A simulated startup environment for benchmarking business agents across revenue improvement, constraint violations, causal accuracy, experiment quality, cost, risk, long-term effects and recovery ability.

This is an important future research/open-source direction, but not allowed to derail the 30-day V1.

## Initial integrations

The broader vision includes PostHog/analytics, Stripe, PostgreSQL, feature flags, GitHub, CRM, support, email and ads.

For V1, integrations should be limited. The first practical path is:

1. AXIOM SDK/API for product event ingestion;
2. synthetic/demo SaaS company;
3. PostHog-style analytics import or adapter;
4. Stripe-style revenue import or sandbox;
5. internal feature-flag experiment mechanism.

## Safety and credibility rules

- Human approval before a live experiment in V1.
- Controlled feature flags instead of autonomous source-code rewriting.
- Small canary traffic first.
- Explicit guardrail metrics.
- Automatic pause/rollback when a guardrail is violated.
- Encrypted credentials and secrets outside source control.
- Authentication, permissions, rate limits, logs, error handling and backups are product requirements, not optional polish.
- AI outputs are proposals; deterministic policy/risk checks decide what is allowed.
- No fabricated metrics, integrations, experiments or customer results.

## 30-day delivery scope

The agreed deadline is for a **customer-demo-ready and pilot-ready V1**, not enterprise-grade AXIOM.

| Days | Target |
|---|---|
| 1–3 | Product architecture, repository structure, database and UI foundation |
| 4–7 | Auth, organizations/workspaces, dashboard and event ingestion |
| 8–11 | Funnels, retention, churn and KPI/bottleneck detection |
| 12–15 | AI hypothesis and growth-opportunity engine |
| 16–19 | Experiment definitions, variants, feature flags and tracking |
| 20–22 | Analytics/revenue adapters and causal-analysis V1 |
| 23–25 | Risk policies, approvals, rollback and Decision Receipts |
| 26–27 | CompanyGym-lite / shadow simulation |
| 28 | Security, logging, rate limits and error handling |
| 29 | Production deployment and tests |
| 30 | Polished demo, documentation, architecture diagrams and case study |

## Explicitly out of scope for the 30-day V1

- enterprise-grade autonomous production changes;
- mathematically perfect causal discovery;
- Google-scale distributed infrastructure;
- dozens of integrations;
- support for every business category;
- fifty role-based agents;
- a complete research-grade digital twin;
- Kubernetes or Kafka merely for résumé keywords;
- claims that the system is universally novel or guarantees hiring.

## Quality target

The V1 should be:

- substantially beyond a normal college project or hackathon demo;
- strong enough for placement and deep interview discussion;
- a credible startup MVP/private-beta candidate;
- complete across one narrow end-to-end workflow;
- honest about limitations.

It is not expected to be enterprise production-ready in 30 days.

## Architecture direction discussed

```text
AXIOM V1/
├── apps/
│   ├── web/                 # Next.js + TypeScript frontend
│   └── api/                 # FastAPI backend
├── services/
│   ├── intelligence/
│   ├── experiments/
│   ├── analytics/
│   ├── simulation/
│   └── risk-engine/
├── packages/
│   ├── shared/
│   ├── sdk/
│   └── ui/
├── infrastructure/
│   ├── docker/
│   └── database/
├── docs/
│   ├── PRODUCT_VISION.md
│   ├── ARCHITECTURE.md
│   ├── 30_DAY_PLAN.md
│   ├── PROJECT_CONTEXT.md
│   └── INTERVIEW_NOTES.md
├── README.md
├── docker-compose.yml
├── .env.example
└── .gitignore
```

This is a direction, not a requirement to create empty microservices. Implementation should begin as a modular monolith unless real scaling or isolation needs justify separation.

## Likely technology direction

- Frontend: Next.js and TypeScript.
- Backend/intelligence: Python and FastAPI.
- Primary database: PostgreSQL.
- Background jobs/event processing: begin simply; introduce Redis/queues only when needed.
- Analytics at V1 scale: PostgreSQL first; ClickHouse/Redpanda can be future upgrades.
- Experiment delivery: internal feature flags with an SDK/API.
- Observability: structured logs and traces.
- Local/deployment packaging: Docker.

The earlier long-term discussion mentioned Kafka/Redpanda, ClickHouse, graph systems, OpenTelemetry and Kubernetes. These remain architectural evolution paths, not mandatory V1 dependencies.

## Interview understanding requirement

During development, the creator should learn to explain:

- why PostgreSQL is used;
- tenant isolation;
- event-driven vs synchronous choices;
- selection bias and experiment validity;
- sequential testing and false positives;
- correlation vs causal claims;
- hallucination containment;
- rollback behavior;
- metric gaming and guardrails;
- secret storage and permissions;
- failure handling and observability.

## Success criteria for AXIOM V1

A successful V1 allows a reviewer to:

1. create or enter a SaaS workspace;
2. load a realistic synthetic dataset or connect a supported source;
3. see a diagnosed growth bottleneck with evidence;
4. inspect ranked experiment proposals;
5. inspect risk, assumptions and predicted impact;
6. approve a bounded experiment;
7. simulate or run it through a feature flag;
8. observe KPI and guardrail changes;
9. demonstrate rollback on a harmful outcome;
10. inspect a complete Decision Receipt.

## Truthful positioning

No project can guarantee hiring, and absolute worldwide novelty cannot be proven because private and unpublished work may exist. AXIOM should be presented through its working closed loop, engineering depth, evaluation, failure handling and measurable evidence—not exaggerated claims.

## Current state

- Project location: `C:\Users\sudes\OneDrive\Desktop\New folder (7)\AXIOM V1`
- The previous discussion is now imported into this continuity document.
- Product delivery decision: AXIOM V1 will be a desktop-first SaaS web application with a public marketing website and a responsive mobile-browser experience. A native Android/iOS companion app is a future phase for alerts, approvals and emergency rollback, not part of the 30-day V1.
- Day 1 dashboard design is locked to `docs/design/axiom-dashboard-final-reference.png`, the creator's carefully edited reference. Implementation should reproduce its layout, content hierarchy, neon cyan/violet visual language, cosmic causal-network background, cards, charts and interactions as closely as practical in responsive code. The AXIOM wordmark needs stronger contrast: keep the X as the cyan/violet focal point while making A, I, O and M brighter and more dimensional so the full name remains equally legible.
- Day 1 implementation is located in `apps/web`. The responsive overview, KPI cards, growth chart, bottleneck funnel, recommendation review, active experiments, Decision Receipts and Copilot interactions are implemented. All displayed business numbers remain explicit demo data until the backend and event-ingestion milestones connect real sources.
- No implementation decisions beyond this document should be assumed final until the repository and local environment are inspected.
- Next action: begin Day 2 with the FastAPI service, PostgreSQL-ready domain model, typed dashboard contract and event-ingestion foundation.
