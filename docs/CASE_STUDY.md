# AXIOM V1 Case Study — Safe Growth Experimentation

## Problem

Small B2B SaaS teams have analytics but often lack the time and expertise to convert signals into a
safe, measurable experiment. Advice without controlled delivery, rollback and memory is not enough.

## AXIOM workflow

AXIOM ingests governed product/revenue events, measures the customer journey, identifies the largest
constraint and ranks three interventions. The selected intervention is stress-tested in a transparent
shadow simulation. Deterministic policy checks and human approval control launch. Sticky feature flags,
exposure/outcome records and conservative analysis measure the effect. Harm triggers automatic rollback.
The complete reasoning and result become a Decision Receipt.

## Demonstrated safety scenario

The Sandbox verification cohort launched a bounded onboarding intervention. Ten control and ten treatment
outcomes were recorded after valid assignments and exposures. Treatment guardrail harm was 50 percentage
points above control. AXIOM evaluated the guardrail before the primary metric, disabled the flag, set the
experiment to terminal `rolled_back`, audited the action and persisted a detailed receipt. Restart testing
confirmed that later policy changes could not rewrite the terminal result.

## Engineering decisions

- Modular monolith for speed and correctness before premature microservices.
- D1 persistence for the same-origin Sites application; FastAPI/PostgreSQL retained as a scale-up path.
- Honest demo/measured data boundary prevents fabricated customer claims.
- Deterministic policies contain model recommendations.
- Idempotency protects event, adapter, exposure and outcome retries.
- CompanyGym-lite exposes uncertainty and explicitly does not claim causal proof.

## Honest limitations

V1 handles binary experiment outcomes, Stripe INR events and webhook-style PostHog/Stripe adapters. Its
normal approximation is conservative but not a research-grade always-valid sequential test. Shadow
simulation is directional. Production OAuth, secret rotation, automated traffic scaling and enterprise
incident infrastructure are post-V1 work.

