# AXIOM V1 — Day 3 Report

Date: 28 August 2026

## Outcome

Dashboard state is now persistent and per-operator, and the dashboard no longer needs a separate
backend process to load. Approving the recommended experiment is a real write that survives a
restart. Separately, the chart and sparkline rendering was rebuilt after a unit-mixing bug was
identified as the cause of every visibly wrong line in the UI.

## Part 1 — Persistent same-origin API

`apps/web/app/api/v1/dashboard/route.ts` serves the dashboard from the same origin as the app,
backed by the workspace data store through Drizzle.

Implemented:

- `GET /api/v1/dashboard` — resolves the caller, ensures the schema exists, upserts the operator,
  then returns their stored snapshot. First visit seeds a snapshot from the bundled demo overview.
- `POST /api/v1/dashboard` — the `approve_recommendation` action. On approval it sets the
  recommendation to `running`, prepends the new experiment, prepends a monitoring Decision Receipt,
  bumps the snapshot revision and writes an audit event. The snapshot update and the audit write go
  through `db.batch()` so they land together or not at all.
- Schema bootstrapping for `axiom_users`, `dashboard_snapshots` and `audit_events`, with indexes on
  the columns actually queried (`axiom_users.email`, and `audit_events (user_id, created_at)`).
- `apps/web/.axiom/hosting.json` declares the local `DB` binding.
- Drizzle schema and generated migration under `apps/web/db` and `apps/web/drizzle`.

The FastAPI service became optional rather than removed. `NEXT_PUBLIC_AXIOM_API_URL` still switches
the client to it; blank — the new default — uses the same-origin route.

### Design decisions worth defending

**No connection string anywhere in source.** `db/index.ts` reaches the managed store through the
runtime environment binding, and `drizzle.config.ts` carries no URL. There is nothing
to leak because there is no credential to commit.

**Approval is idempotent.** Re-approving an already-approved recommendation returns the current
state and does not bump the revision or duplicate the experiment and receipt. A retried request
after a flaky network must not create a second canary.

**The Reality Gate is checked server-side, on every approval.** A request whose gate has not passed,
or that does not require human approval, is refused with 409. The client cannot approve its way past
a safety check.

**Invalid actions return 400 without echoing the payload.** Unknown action, mismatched
recommendation ID and malformed JSON all return the same generic `invalid_action` response.

**Identity handling here is still development-grade.** Authenticated requests are recognised from
platform-provided headers; a request to `localhost` falls back to a fixed local development
operator. This is not authentication and is scheduled to be replaced.

### Verified end to end

Against the running local server:

- `GET /api/v1/dashboard` — 200, `storage.state: connected`, snapshot read back from a previous
session, so persistence is genuinely working rather than being regenerated per request.
- Approval state persisted across restarts: revision 2, with `approved-demo-recommendation-invite`
  in experiments and `approval-demo-recommendation-invite` in decisions.
- Re-approve — 200, revision stayed 2, no duplicate rows.
- Unknown action, wrong recommendation ID, malformed body — 400 each, no payload echoed.
- Revision re-checked after the failed writes — unchanged.

## Part 2 — Chart and sparkline rebuild

### The bug

Every line in the dashboard was drawn with CSS-rotated divs whose length and angle were computed
with `Math.hypot` and `Math.atan2`. The two inputs were in **different units**: `x` was a pixel
value while `y` was a percentage. Feeding mixed units into the same triangle produces both a wrong
length and a wrong angle. Measured in the browser, one sparkline segment rendered as 12.4px at
27.5° where the true geometry was 11.7px at 20°. The growth chart compounded this with a
`vh`-based length and a hand-tuned `* .55` multiplier, which only happened to look correct at one
screen size.

### The fix

Both are now SVG polylines with `viewBox="0 0 100 100"` and `preserveAspectRatio="none"`, so
coordinates are direct percentages of the container and the browser computes the geometry. No
trigonometry, no magic numbers, and correct at every viewport. `vectorEffect="non-scaling-stroke"`
keeps stroke width constant under the non-uniform stretch. Draw-on animation comes from
`stroke-dasharray` with `stroke-dashoffset`.

Measured result: alignment error 0.0px on all 19 chart points and on all 10 points of each of the
four sparklines.

### Other rendering fixes

**Sparklines used only a third of their box.** Raw API values were applied directly as percentages,
so in a 68px box every dot sat between 29px and 59px. Churn was worst — its entire movement was
24px, reading as a cramped squiggle. Each series is now normalised against its own min/max into a
12%–88% band. Spread went to 52px, 76% of the box, with the shape unchanged.

The growth chart deliberately does **not** normalise: it has a labelled ₹0–₹10L axis, so absolute
`value / axisMax` scaling is the only correct choice. Sparklines have no axis, so normalising is
correct there. These being different is intentional.

**Panel content appeared to overlap.** It was not overlap — it was clipping from `height: 100%` plus
`overflow: hidden`. Panels are now flex columns with `flex: 0 0 auto` headers, `flex: 1 1 auto;
min-height: 0` content and `margin-top: auto` footers. Measured `scrollHeight - clientHeight` is now
0 on all five panels.

**Animations were invisible on the creator's machine.** The reduced-motion block contained
`*, *::before, *::after { animation-duration: .001ms !important }`. With Windows animation effects
switched off, Chrome reports `prefers-reduced-motion: reduce` and that rule killed every animation
in the product. WCAG 2.3.3 asks for large motion to be avoided, not for all motion to be removed.
The block now disables only movement-based animations by name and leaves opacity and glow pulses
running.

**Sidebar wave colours ran off the intended palette.** The hue was `calc(190deg + var(--i) * 10deg)`
with `--i` up to 19, reaching 380° — which wraps to 20°, orange-red. The multiplier is now 2.4°, so
the range stays between cyan and indigo. Two hardcoded purple and blue accent rules were removed.

**AXIOM Copilot renamed to AXIOM AI** across the sidebar card, the drawer and all ARIA labels.

### A cascade trap worth remembering

Two fixes appeared not to apply. Both times the cause was the `vh`-clamp media query further down
`globals.css` re-declaring the same properties, silently overriding the new values. Anything that
sets a property inside a `@media` block has to be patched there too.

## Validation

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — success, both routes emitted.
- `pytest apps/api -q` — 61 passed.
- Browser measurement: 0.0px line alignment, 0px panel clipping, 76% sparkline box usage, all
  animations reported `running`, 0 console errors.

## Known open items

- **Visual match against the locked reference is unverified.** The Browser pane was hidden during
  this work, so screenshots timed out and every check was numeric rather than visual. The layout is
  measured correct; whether it *looks* like `docs/design/axiom-dashboard-final-reference.png` still
  needs a human comparison.
- **The FastAPI/D1 split is undecided.** Ingestion, the relational model and Alembic live only in
  `apps/api`; per-operator dashboard state lives only in D1. Whether to port ingestion into the
  Next route or keep both is not settled.
- `apps/web/.git.day1-backup` is a renamed nested git directory, kept because a nested `.git` makes
  the parent repository track the folder as a single commit pointer and silently commit none of the
  files inside. It can be restored with `mv apps/web/.git.day1-backup apps/web/.git`.

## Next milestone

Day 4 should replace development-grade identity with real authentication, then build organizations
and workspaces on top of it.

## Closure update — 29 August 2026

The two open Day 3 checks are now closed. Browser QA at 1366×768 / 100% zoom confirmed no document
scroll, panel clipping or action overlap, including the recommendation action's permanent internal
bottom gap and the four-row experiment state. The former FastAPI/D1 ambiguity was also resolved on
Day 5: D1 is the working same-origin Sites path for dashboard state and event ingestion, while the
FastAPI/PostgreSQL implementation remains the optional analytics scale-up path.
