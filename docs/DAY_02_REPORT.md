# AXIOM V1 — Day 2 Report

Date: 27 August 2026

## Outcome

The backend contract and data foundation are in place. `apps/api` is a running FastAPI service with
a Postgres-ready relational model, tenant-scoped access, a typed dashboard contract shared with the
frontend, and a working event-ingestion path. The dashboard consumed this service over HTTP by the
end of the day.

## Implemented today

- FastAPI application scaffold with settings loaded entirely from environment variables.
- Versioned `/api/v1` router aggregation.
- Health endpoint reporting both service and database readiness.
- Domain model: organizations, workspaces, users, events — with UUID primary keys, timestamp
  mixins and eleven domain enums (plan, environment, role, event type, data source, severity, risk,
  experiment status, decision outcome, metric unit, trend direction).
- Workspace listing and single-workspace retrieval, scoped per operator.
- Typed dashboard contract mirrored between Pydantic schemas and the TypeScript client, so a
  contract change breaks the build rather than silently rendering wrong numbers.
- Event ingestion accepting batches, enforcing a configurable per-request limit, and deduplicating
  by idempotency key.
- An ingestion stats endpoint, so an SDK integrator can confirm events actually landed instead of
  guessing.
- Alembic migration setup with the initial schema revision.
- A demo-data seeder producing an organization, production and sandbox workspaces, three operators
  with distinct roles, and synthetic user event history.
- 61 tests across health, workspaces, dashboard and ingestion.

## Design decisions worth defending

**SQLite locally, Postgres-ready in code.** The database URL is the only thing that changes between
the two; the model layer, queries and migrations are unchanged. This avoided spending a day of a
30-day budget on database installation while keeping the Postgres commitment real rather than
aspirational.

**202 Accepted for ingestion, not 201 Created.** The response cannot honestly claim everything was
created, because duplicate events are accepted and skipped. 202 states that the batch was accepted
and puts the actual breakdown in the response body.

**Versioned path from the first endpoint.** Adding `/v1` after clients exist means breaking them.

**404, not 403, for an inaccessible workspace.** 403 confirms the resource exists, which turns the
endpoint into a workspace-ID enumerator.

## Explicit limitation carried into Day 3

`get_current_user` reads an operator email from a request header. That is trivially spoofable and is
**not authentication**. It exists so per-operator scoping could be modelled without blocking on an
auth system, and it is marked as temporary in the code, in the TypeScript client and in
`apps/api/README.md`. Real authentication is Day 4 work.

## Validation

- `pytest apps/api -q` — 61 passed.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — success.

## Next milestone

Day 3 should make dashboard state persist per operator and remove the requirement that a separate
backend process be running before the dashboard can load.
