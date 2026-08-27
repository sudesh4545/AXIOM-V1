# AXIOM API (`apps/api`)

FastAPI service for AXIOM's domain model, dashboard contract and event ingestion.

## Status: optional in the current setup

Read this first, because it changes how you run the project.

The web app **no longer requires this service to start**. Since Day 3 the dashboard is served
by a same-origin Next.js route (`apps/web/app/api/v1/dashboard/route.ts`) backed by Cloudflare D1,
so `npm run dev` in `apps/web` works on its own.

This FastAPI service remains in the repository because it holds work the D1 route does not yet cover:

- the relational domain model (organizations, workspaces, users, events) with tenant isolation;
- event ingestion with batch limits and idempotent deduplication;
- the Postgres-ready migration path via Alembic;
- 61 tests covering health, workspaces, dashboard and ingestion.

Two paths forward are open, and the choice is not yet made: port ingestion into the D1 route, or
keep this service for the analytics/ingestion side while D1 holds per-user dashboard state. Until
that decision, treat this service as the reference implementation of the data model.

To point the web app at this service instead of the same-origin route, set the following in
`apps/web/.env.local`:

```bash
NEXT_PUBLIC_AXIOM_API_URL=http://127.0.0.1:8000
```

Leaving it blank (the default) uses the same-origin D1 route.

## Local setup

Requirements: Python 3.12 or newer.

```bash
python -m venv .venv
```

```bash
./.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
```

Copy the environment template and adjust if needed:

```bash
cp apps/api/.env.example apps/api/.env
```

The default database is SQLite, so nothing needs installing to run locally:

```text
AXIOM_DATABASE_URL=sqlite+aiosqlite:///./axiom_local.db
```

## Run

```bash
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000 --app-dir apps/api
```

Interactive docs: `http://127.0.0.1:8000/docs`

## Seed demo data

```bash
./.venv/Scripts/python.exe apps/api/scripts/seed.py
```

Add `--reset` to drop and regenerate. The script prints the workspace and operator identifiers it
created; you need the workspace ID for every scoped request.

## Endpoints

All routes are mounted under the `/api/v1` prefix. The version is in the path from day one because
adding a version later means breaking clients that already depend on unversioned paths.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Service and database readiness |
| `GET` | `/api/v1/workspaces` | Workspaces visible to the caller |
| `GET` | `/api/v1/workspaces/{workspace_id}` | One workspace |
| `GET` | `/api/v1/dashboard` | Typed dashboard contract |
| `POST` | `/api/v1/workspaces/{workspace_id}/events` | Ingest an event batch |
| `GET` | `/api/v1/workspaces/{workspace_id}/events/stats` | Confirm events actually landed |

## Migrations

```bash
./.venv/Scripts/python.exe -m alembic -c apps/api/alembic.ini upgrade head
```

`alembic.ini` intentionally ships with an empty `sqlalchemy.url`. The URL is read from
`AXIOM_DATABASE_URL` at runtime so no connection string is ever committed.

Switching to Postgres is a one-line change plus one dependency — no application code changes:

```text
AXIOM_DATABASE_URL=postgresql+asyncpg://axiom:password@localhost:5432/axiom
```

```bash
./.venv/Scripts/python.exe -m pip install asyncpg==0.31.0
```

## Tests

```bash
./.venv/Scripts/python.exe -m pytest apps/api -q
```

Tests run against a throwaway SQLite database and do not touch `axiom_local.db`.

## Security boundaries you must not misread

These are deliberate limitations, written down so nobody mistakes them for finished work.

- **`get_current_user` is not authentication.** It reads an operator email from a request header,
  which is trivially spoofable. It exists so Day 2 could model per-operator scoping without
  blocking on an auth system. Real authentication is scheduled for Day 4. This must never reach
  production as-is.
- **A missing or inaccessible workspace returns 404, not 403.** 403 would confirm the resource
  exists, which lets an attacker enumerate workspace IDs. 404 reveals nothing either way.
- **CORS lists explicit origins and never uses `*`.** Origins come from `AXIOM_CORS_ORIGINS`.
- **Stack traces are logged server-side only.** Error responses carry a stable machine-readable
  code and a human-readable message, never internal detail.
- **Validation errors do not echo the submitted payload back.** An error response that reflects
  input is a reliable way to leak whatever the client accidentally sent.
- **End-user identity is stored as a pseudonymous `distinct_id`.** No end-user PII is persisted by
  the ingestion path.
- **Every generated recommendation carries `requires_human_approval=True` unconditionally.** No
  code path can set it to false.
