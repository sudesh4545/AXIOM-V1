# AXIOM V1 — Days 18–25

## Outcome

AXIOM now closes the loop from randomly assigned treatment through observed outcome, safety policy,
automatic rollback and an auditable Decision Receipt. The system still avoids claiming statistical
or causal certainty when the evidence floor has not been reached.

## Day 18 — outcome collection

- Outcomes require an existing workspace-scoped assignment and recorded exposure.
- Only the experiment's declared primary metric is accepted.
- One subject contributes at most one outcome for that metric.
- Idempotency keys and subject/metric uniqueness prevent duplicate evidence.

## Day 19 — sequential monitoring

- Control/treatment subjects, conversion rates and guardrail rates are calculated from persisted rows.
- Analysis reports absolute lift, relative lift, probability treatment is better and a 95% interval.
- Minimum subjects per variant and confidence thresholds are workspace policy, not UI guesses.
- Results remain `insufficient_data` or `continue` until configured evidence is available.

## Day 20 — PostHog adapter

- Normalizes lifecycle events and snake-cases custom product events.
- Requires `distinct_id`, stable delivery/event ids and valid timestamps.
- Delivery replay is idempotent and audited.

## Day 21 — Stripe adapter

- Supports subscription created/deleted and invoice paid.
- Converts minor INR units into governed monthly revenue properties.
- Rejects unsupported event types and non-INR payloads in V1.

## Day 22 — causal-analysis V1

- Uses persisted randomized assignments, exposures and binary outcomes.
- Provides a conservative two-proportion comparison and explicitly publishes its limitations.
- `causalClaimAllowed` stays false without sufficient randomized evidence and a conclusive boundary.

## Day 23 — deterministic risk policy

- Per-workspace limits: maximum traffic, evidence floor, subjects/variant, confidence threshold,
  guardrail increase and automatic rollback.
- Only owner/admin can change policies or experiment delivery.
- Production demo-only evidence is blocked before launch.

## Day 24 — automatic rollback

- Guardrail harm is evaluated before winner/loser classification.
- A breached policy atomically marks the experiment and flag rolled back.
- Disabled flags return control and rollback is terminal.
- The automatic action is written to the audit trail.

## Day 25 — complete Decision Receipts

- Receipt contains objective, hypothesis, evidence, alternatives, primary and guardrail metrics,
  population, observed analysis, policy violations, approval/automation context and final decision.
- Receipts are immutable per experiment/outcome and appear in the Decisions dashboard.

## Verified safety scenario

The Sandbox verification experiment reached 10 control and 10 treatment outcomes. Treatment
guardrail rate exceeded control by 50 percentage points. AXIOM automatically rolled back delivery,
returned the flag to control and persisted a detailed rolled-back Decision Receipt. The state and
receipt remained after a controlled local server restart.

## Honest limitations

- The V1 monitor uses a normal approximation and conservative thresholds; it is not a full
  always-valid sequential testing library.
- Outcomes are binary in this milestone.
- Stripe V1 accepts INR only; adapters are normalized import endpoints, not OAuth connection flows.
- Automatic traffic scaling is intentionally not implemented.
