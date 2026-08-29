# AXIOM V1 — Day 5 Report

Date: 29 August 2026

## Outcome

The working Sites application now has a same-origin event-ingestion foundation. AXIOM can accept,
deduplicate and persist measured product events per workspace, and the Integrations page reports the
actual event state instead of presenting planned connectors as live.

## API

### `POST /api/v1/events`

Accepts one to 100 events from `axiom_sdk` or `webhook`. Each event includes an idempotency key,
type, name, optional anonymous user, optional properties and an occurrence time.

Protection includes:

- server-authorized workspace membership;
- a 100-event batch ceiling;
- bounded text fields;
- JSON-object validation and a 16 KB properties limit;
- normalized timestamps;
- a unique `(workspace_id, idempotency_key)` constraint;
- audit events for accepted batches.

### `GET /api/v1/events?workspaceId=...`

Returns total accepted events, distinct anonymous users, last delivery time and per-source status for
the authorized workspace.

## Integrations UI

The page now shows live event count, known anonymous users, active sources, last delivery time and
connection coverage. With no events it says the endpoint is ready and waiting; after ingestion it
changes to a measured live state. Stripe, PostHog, GA4 and Webhooks remain explicitly labelled
planned until their adapters actually exist.

## Verification

The controlled test ran only in **Acme Sandbox**:

- first event batch: one inserted;
- exact retry: zero inserted, one duplicate;
- summary: one event, one anonymous user, `axiom_sdk` connected;
- unknown workspace: `403 workspace_forbidden`;
- Production workspace remained at zero ingested events;
- Browser layout at 1366×768: no document scroll, horizontal overflow or panel clipping.

## Honest boundary

Event telemetry is now real, but dashboard MRR, activation, conversion, churn and funnel values are
still labelled demo seed data. Day 6 should build governed event-to-metric transformations before
those KPI cards can truthfully become measured data.
