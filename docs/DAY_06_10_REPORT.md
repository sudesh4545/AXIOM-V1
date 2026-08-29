# AXIOM V1 — Days 6–10 Report

Date: 29 August 2026

## Outcome

AXIOM now has a working event-to-insight loop. Events are not merely counted: they are validated,
grouped by user and time, transformed into governed business metrics, assembled into a sequential
funnel, evaluated for retention/churn and scored to find the strongest current bottleneck.

## Day 6 — governed event taxonomy

- Versioned taxonomy `1.0` for `lifecycle`, `product`, `revenue` and `system` events.
- Standard lifecycle journey: `user_signed_up`, `trial_started`, `activation_completed`,
  `teammate_invited`.
- Revenue journey: `subscription_started`, `subscription_cancelled`, `revenue_recorded`.
- Product events support bounded lowercase snake-case names for activity/retention analysis.
- Business events require an anonymous user ID.
- Subscription/revenue events require a valid non-negative INR amount.
- Event time must be valid, no more than five minutes in the future and within two years.

## Day 7 — governed KPI engine

- Current MRR from each user's latest subscription/revenue state.
- MRR change against seven days prior.
- Activation rate from sequential signup → trial → activation journeys.
- Trial-to-paid conversion from subscriptions after trial start.
- Workspace-specific metric cards and sparklines.
- Evidence gate: at least 10 observed users plus signup and activation signals.
- Dashboard remains visibly `demo_seed` until that gate passes.

## Day 8 — funnel engine

The 30-day funnel counts a user only when steps happen in order. Skipping directly to activation
does not falsely count as a successful trial journey. Each step includes total conversion,
previous-step conversion, display width and an explicit bottleneck marker.

## Day 9 — retention and churn

- D7 retention: eligible signup cohorts with a product event during days 7–13.
- D30 retention: eligible signup cohorts with a product event during days 30–36.
- Logo churn: cancellations during the window divided by accounts active at its start.
- Analytics UI reports measured cohort evidence or a collecting-state evidence gate.

## Day 10 — bottleneck diagnosis

The weakest sequential step becomes the active bottleneck. Severity comes from measured drop-off:
low, medium, high or critical. The Intelligence page receives the measured funnel and a bounded,
reversible next-step proposal. It remains a diagnostic recommendation, not a causal claim, and
human approval stays mandatory.

## Responsive correction

The main 100% Chrome-zoom problem was a later CSS rule that overrode the compact laptop layout and
forced lower dashboard rows to minimum heights of 285px and 190px. At the CSS heights left by Chrome
on common laptops, those minimums physically could not fit. Final desktop-density rules now:

- use the actual remaining viewport height;
- keep normal readable text sizes;
- share remaining height between analysis and operations rows;
- compress spacing and decoration before text;
- keep footer actions inside their panels;
- keep dedicated pages in a no-scroll grid for 641–780px desktop heights.

## Controlled verification dataset

Only **Acme Sandbox** received the synthetic verification cohort:

- 151 governed business events;
- 40 observed users;
- calculated MRR ₹2.3L;
- activation 52%;
- trial conversion 40%;
- churn 16.7%;
- D7 retention 60.6%;
- D30 retention 46.7%;
- detected bottleneck: Activation → Collaboration, 53.8% drop-off.

An exact event retry inserted zero rows and returned one duplicate. An invalid subscription without
an amount returned `400`. **Acme Cloud Production received no verification events** and remains on
labelled demo data.

## Honest boundary

The Sandbox cohort is synthetic test evidence, not a customer result. The metric engine is working,
but Day 11 should add broader metric-definition tests and more edge-case cohorts before any pilot.
The recommendation is deterministic diagnosis; the generative hypothesis engine begins on Day 12.
