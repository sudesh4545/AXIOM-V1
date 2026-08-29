# AXIOM V1 Operations Runbook

## Local start

```powershell
cd apps/web
npm install
npm run dev
```

Use `http://localhost:3000`. The working product does not require the FastAPI process.

## Health and diagnosis

- `GET /api/v1/dashboard` verifies the customer-facing read path.
- `GET /api/v1/operations?workspaceId=<id>` reports D1 query health, ingestion freshness, request latency,
  active experiments, receipts, simulations, authorization and security controls.
- A `degraded` state means database access or the freshness objective needs attention.
- Structured server errors use a stable code, safe message and HTTP status; internal exceptions remain in logs.

## Incident procedure

1. Stop experiment delivery with pause; use rollback when exposure may be harmful.
2. Confirm the feature flag serves control.
3. Inspect the latest analysis and Decision Receipt.
4. Verify D1 integrity and workspace isolation through the operations endpoint.
5. Preserve audit records; do not edit historical receipts.
6. Correct the input, policy or adapter issue and rerun the complete verification suite before resume.

## Backup and recovery

- Hosted D1 backup/export is an operator responsibility before migrations and releases.
- Local development state lives in `apps/web/axiom_local.db`; copy it only while the dev server is stopped.
- Migrations are append-only files under `apps/web/drizzle` and must be reviewed before deployment.
- Recovery acceptance requires `PRAGMA integrity_check = ok`, a successful dashboard read and preserved
  terminal rollback/receipt state after restart.

## Release gate

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:api
```

Then run `pytest` for `apps/api`. Do not release if any command fails, if production contains fabricated
measured data, or if a harmful experiment can remain enabled after a guardrail breach.
