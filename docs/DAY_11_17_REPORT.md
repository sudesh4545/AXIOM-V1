# AXIOM V1 — Days 11–17

## Outcome

Days 11–17 close the gap between “a dashboard recommendation” and a bounded, deliverable
experiment. The implementation remains deterministic and auditable: no model is allowed to invent
customer facts, no treatment is served before human approval, and no experiment bypasses its
workspace boundary.

## Day 11 — measurement hardening

- Added automated coverage for evidence-gate boundaries, sequential funnel order, MRR state,
  trial conversion, churn denominator, D7/D30 retention, invalid stored data and zero denominators.
- Added taxonomy tests for actors, names, money bounds and business/telemetry separation.

## Days 12–15 — hypothesis and opportunity portfolio

- Added a bottleneck-specific opportunity engine with three candidate interventions.
- Each candidate carries evidence, assumptions, focus metric, predicted lift, confidence, risk,
  effort, reversibility and an inspectable score breakdown.
- Ranking is deterministic, so identical governed evidence produces identical output.
- Intelligence shows the ranked portfolio and routes the selected candidate through the existing
  Reality Gate and human approval flow.
- Claims remain diagnostic/hypothetical until experiment evidence exists.

## Day 16 — definitions and feature flags

- Human approval creates a workspace-scoped experiment definition.
- Every definition receives a unique feature-flag key, traffic allocation and random salt.
- Subject assignment is deterministic, sticky and isolated by workspace, flag and salt.
- Disabled flags always return control even when a treatment assignment was previously persisted.

## Day 17 — tracking and operational controls

- Added idempotent exposure tracking linked to persisted assignments.
- Assignment mismatches are rejected instead of silently corrupting experiment evidence.
- Added audited pause, resume and rollback operations.
- Added an explicit state machine; rollback is terminal and invalid/no-op transitions are blocked.
- Added compound indexes for flag lookup, assignment analysis and exposure analysis.

## API

```text
GET  /api/v1/experiments?workspaceId=...&flagKey=...&subjectId=...
POST /api/v1/experiments  action=record_exposure
POST /api/v1/experiments  action=pause|resume|rollback
```

## Verification

- Web unit tests: 39 passed.
- FastAPI regression tests: 61 passed.
- Live API verification: 10 groups passed, including 50 concurrent dashboard requests.
- TypeScript, ESLint and production build: passed.
- D1 integrity: `ok`; event measurement query uses the workspace/occurred-at index.
- Controlled server restart preserved active workspace, events, opportunities and experiment state.

## Honest boundary

This is a working internal feature-flag delivery API, not yet a PostHog/LaunchDarkly adapter. It does
not claim statistical significance and does not autonomously scale traffic. Those remain later
milestones in the 30-day plan.
