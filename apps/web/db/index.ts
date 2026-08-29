import { env } from 'cloudflare:workers';

export function getDatabase(): D1Database {
  if (!env.DB) throw new Error('AXIOM persistent database is unavailable.');
  return env.DB;
}

let schemaReady: Promise<void> | null = null;

export function ensureDatabase(): Promise<void> {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = getDatabase();
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS axiom_users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_axiom_users_email ON axiom_users (email)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS dashboard_snapshots (
        user_id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES axiom_users(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (owner_user_id) REFERENCES axiom_users(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS organization_memberships (
        organization_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TEXT NOT NULL,
        PRIMARY KEY (organization_id, user_id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES axiom_users(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships (user_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY NOT NULL,
        organization_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        environment TEXT NOT NULL DEFAULT 'production',
        objective TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_org_slug ON workspaces (organization_id, slug)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces (organization_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS user_workspace_preferences (
        user_id TEXT PRIMARY KEY NOT NULL,
        active_workspace_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES axiom_users(id) ON DELETE CASCADE,
        FOREIGN KEY (active_workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS workspace_dashboard_snapshots (
        user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, workspace_id),
        FOREIGN KEY (user_id) REFERENCES axiom_users(id) ON DELETE CASCADE,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_workspace_snapshots_workspace ON workspace_dashboard_snapshots (workspace_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS ingested_events (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_name TEXT NOT NULL,
        anonymous_id TEXT,
        properties_json TEXT NOT NULL DEFAULT '{}',
        occurred_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES axiom_users(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_ingested_events_workspace_key ON ingested_events (workspace_id, idempotency_key)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_ingested_events_workspace_occurred ON ingested_events (workspace_id, occurred_at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS source_connections (
        workspace_id TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'connected',
        event_count INTEGER NOT NULL DEFAULT 0,
        last_event_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, source),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES axiom_users(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_events_user_created ON audit_events (user_id, created_at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS experiment_definitions (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        recommendation_id TEXT NOT NULL,
        name TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        primary_metric TEXT NOT NULL,
        guardrail_metric TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        traffic_pct INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_workspace_recommendation ON experiment_definitions (workspace_id, recommendation_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_experiment_workspace_status ON experiment_definitions (workspace_id, status)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS feature_flags (
        key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        experiment_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        allocation_pct INTEGER NOT NULL,
        salt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (experiment_id) REFERENCES experiment_definitions(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_flags_experiment ON feature_flags (experiment_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS experiment_assignments (
        workspace_id TEXT NOT NULL,
        experiment_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        variant TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, experiment_id, subject_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (experiment_id) REFERENCES experiment_definitions(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_assignments_experiment_variant ON experiment_assignments (experiment_id, variant)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS experiment_exposures (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        experiment_id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        variant TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        exposed_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (experiment_id) REFERENCES experiment_definitions(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_exposures_workspace_key ON experiment_exposures (workspace_id, idempotency_key)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_exposures_experiment_variant ON experiment_exposures (experiment_id, variant)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS experiment_outcomes (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, experiment_id TEXT NOT NULL, subject_id TEXT NOT NULL, variant TEXT NOT NULL, metric_key TEXT NOT NULL, converted INTEGER NOT NULL DEFAULT 0, guardrail_breached INTEGER NOT NULL DEFAULT 0, idempotency_key TEXT NOT NULL, observed_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE, FOREIGN KEY (experiment_id) REFERENCES experiment_definitions(id) ON DELETE CASCADE)`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_outcomes_workspace_key ON experiment_outcomes (workspace_id, idempotency_key)'),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_outcomes_experiment_subject_metric ON experiment_outcomes (experiment_id, subject_id, metric_key)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_outcomes_experiment_variant ON experiment_outcomes (experiment_id, variant)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_outcomes_workspace_experiment_metric ON experiment_outcomes (workspace_id, experiment_id, metric_key)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS experiment_analyses (experiment_id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, decision TEXT NOT NULL, analysis_json TEXT NOT NULL, computed_at TEXT NOT NULL, FOREIGN KEY (experiment_id) REFERENCES experiment_definitions(id) ON DELETE CASCADE, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_analyses_workspace_decision ON experiment_analyses (workspace_id, decision)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS workspace_risk_policies (workspace_id TEXT PRIMARY KEY NOT NULL, max_traffic_pct INTEGER NOT NULL DEFAULT 25, min_observed_users INTEGER NOT NULL DEFAULT 10, min_subjects_per_variant INTEGER NOT NULL DEFAULT 30, confidence_threshold_pct INTEGER NOT NULL DEFAULT 95, max_guardrail_increase_pct INTEGER NOT NULL DEFAULT 3, auto_rollback INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS integration_deliveries (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, external_id TEXT NOT NULL, accepted_count INTEGER NOT NULL, duplicate_count INTEGER NOT NULL, received_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_workspace_provider_external ON integration_deliveries (workspace_id, provider, external_id)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_deliveries_workspace_received ON integration_deliveries (workspace_id, received_at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS decision_receipts (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL, experiment_id TEXT NOT NULL, outcome TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE, FOREIGN KEY (experiment_id) REFERENCES experiment_definitions(id) ON DELETE CASCADE)`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_experiment_outcome ON decision_receipts (experiment_id, outcome)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_receipts_workspace_created ON decision_receipts (workspace_id, created_at)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS simulation_runs (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        recommendation_id TEXT NOT NULL,
        scenario TEXT NOT NULL,
        input_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES axiom_users(id) ON DELETE CASCADE
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_simulation_runs_workspace_created ON simulation_runs (workspace_id, created_at)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_simulation_runs_recommendation ON simulation_runs (workspace_id, recommendation_id)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS rate_limit_windows (
        subject_key TEXT NOT NULL,
        scope TEXT NOT NULL,
        window_started_at INTEGER NOT NULL,
        request_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (subject_key, scope, window_started_at)
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_updated ON rate_limit_windows (updated_at)'),
    ]);
    await db.prepare('PRAGMA optimize').run();
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}
