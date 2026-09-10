# AXIOM company setup

1. Sign in with a verified account. Open the workspace selector and choose your
   company workspace. **Demo** contains sample data and is read-only.
2. Open **Settings**. Save the company name, workspace name and business objective.
   Only an owner or admin can edit these fields; changes are saved to the database.
3. Open **Integrations → Connect source → Upload CSV**. Use real company events,
   with a stable user identifier and one event per row. A file can contain up to
   5,000 rows and must be smaller than 2 MB. AXIOM validates the file before writing
   it, imports in batches of 100, and shows progress. Uploading the same file again
   skips duplicates, including after an interrupted import.
4. Wait for enough evidence: at least 10 observed users, signup events and activation
   events. Until that gate passes, business metrics show “—” and setup guidance.
   Imported events update the dashboard without a full page reload.
5. Review the measured funnel in **Analytics** and the recommendation in
   **Intelligence**. **Simulations** explores scenarios; simulated lift is a
   prediction, not proof of an outcome.
6. An owner/admin can review and approve a bounded canary after safety checks pass.
   To deliver a real experiment, the company's product must consume AXIOM feature
   flag assignments and send exposure/outcome events. Approval alone does not
   modify your company's product. Monitor guardrails and Decision Receipts.

## CSV format

Required columns: `event_name` and `user_id` (or `anonymous_id`).
Recommended: `occurred_at` in ISO 8601 with timezone. If omitted, the import time
is used. Optional: `event_type`, `monthly_amount_inr`, `idempotency_key`.
Use a stable upstream `idempotency_key` to deduplicate the same event across
different exports. File-derived keys deduplicate retries of the same file.

```csv
event_name,user_id,occurred_at,monthly_amount_inr
user_signed_up,customer-001,2026-09-10T09:00:00Z,
trial_started,customer-001,2026-09-10T09:05:00Z,
activation_completed,customer-001,2026-09-10T09:15:00Z,
subscription_started,customer-001,2026-09-10T10:00:00Z,1500
```

This example explains the format; it does not meet the 10-user evidence gate.
Keep event timestamps and identities accurate. Quoted commas and multiline CSV
fields are supported. Invalid rows show a row number and reason.

## Mobile and connection recovery

Install the updated Android APK to receive native shell fixes. The app loads the
live service, so dashboard updates arrive through hosting. If the service cannot
be reached at startup, the local reconnect page provides a retry link. A signed-in
web session can display its recent cached snapshot while reconnecting; live
experiments still require a successful server request. Email/push delivery is not
configured by the in-app notification display.
