# AXIOM V1 Architecture

## Closed-loop system

```text
PostHog / Stripe / AXIOM SDK
              |
              v
     Governed event taxonomy -----> Workspace-isolated D1 storage
              |                                  |
              v                                  v
  KPI + funnel measurement              Immutable audit events
              |
              v
   Bottleneck detection -> Ranked opportunities -> CompanyGym-lite simulation
                                                        |
                                                        v
                                             Reality Gate + risk policy
                                                        |
                                               explicit human approval
                                                        |
                                                        v
                                     Sticky feature flag + exposure tracking
                                                        |
                                                        v
                               Outcomes -> conservative causal monitor
                                      |                 |
                               guardrail harm       sufficient result
                                      |                 |
                                      v                 v
                             automatic rollback   decision recommendation
                                      \                 /
                                       Decision Receipt
```

## Runtime boundaries

- `apps/web` is the working modular monolith. Vinext serves the interface and same-origin APIs.
- A managed SQLite-compatible store holds workspace product state. Every product query carries a workspace key.
- Sites identity headers identify hosted users; loopback receives an explicit development identity.
- The FastAPI application is retained as the PostgreSQL-oriented scale-up path and regression suite.
- Product event writes are idempotent. Experiment delivery is bounded, sticky and reversible.

## Trust boundaries

1. Identity is resolved only on the server.
2. Organization membership is checked before workspace access.
3. Input taxonomy, size, time and actor constraints are enforced before persistence.
4. AI-style recommendations cannot bypass deterministic risk policy.
5. Simulation is labelled directional and never treated as causal evidence.
6. Causal claims require persisted assignment, exposure, outcome and evidence thresholds.
7. Guardrails are evaluated before a winner and may automatically disable delivery.
8. Every material change creates an audit event or Decision Receipt.

## Scaling path

- Move high-volume event analytics from the workspace store to PostgreSQL/ClickHouse only when measured load needs it.
- Place ingestion behind a durable queue when synchronous adapter latency becomes a constraint.
- Replace the V1 normal approximation with an always-valid sequential method before high-stakes use.
- Add managed secret-backed OAuth for external connectors; current adapters are governed webhook endpoints.
