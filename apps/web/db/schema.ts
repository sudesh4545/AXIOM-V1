import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const axiomUsers = sqliteTable('axiom_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_axiom_users_email').on(table.email)]);

export const dashboardSnapshots = sqliteTable('dashboard_snapshots', {
  userId: text('user_id').primaryKey().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  payloadJson: text('payload_json').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ownerUserId: text('owner_user_id').notNull().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_organizations_slug').on(table.slug)]);

export const organizationMemberships = sqliteTable('organization_memberships', {
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('owner'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.userId] }),
  index('idx_memberships_user').on(table.userId),
]);

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  environment: text('environment').notNull().default('production'),
  objective: text('objective'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_workspaces_org_slug').on(table.organizationId, table.slug),
  index('idx_workspaces_org').on(table.organizationId),
]);

export const userWorkspacePreferences = sqliteTable('user_workspace_preferences', {
  userId: text('user_id').primaryKey().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  activeWorkspaceId: text('active_workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  updatedAt: text('updated_at').notNull(),
});

export const workspaceDashboardSnapshots = sqliteTable('workspace_dashboard_snapshots', {
  userId: text('user_id').notNull().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  payloadJson: text('payload_json').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.workspaceId] }),
  index('idx_workspace_snapshots_workspace').on(table.workspaceId),
]);

export const ingestedEvents = sqliteTable('ingested_events', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  eventType: text('event_type').notNull(),
  eventName: text('event_name').notNull(),
  anonymousId: text('anonymous_id'),
  propertiesJson: text('properties_json').notNull().default('{}'),
  occurredAt: text('occurred_at').notNull(),
  receivedAt: text('received_at').notNull(),
}, (table) => [
  uniqueIndex('idx_ingested_events_workspace_key').on(table.workspaceId, table.idempotencyKey),
  index('idx_ingested_events_workspace_occurred').on(table.workspaceId, table.occurredAt),
]);

export const sourceConnections = sqliteTable('source_connections', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  status: text('status').notNull().default('connected'),
  eventCount: integer('event_count').notNull().default(0),
  lastEventAt: text('last_event_at'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.source] })]);

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_audit_events_user_created').on(table.userId, table.createdAt)]);

export const experimentDefinitions = sqliteTable('experiment_definitions', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  recommendationId: text('recommendation_id').notNull(),
  name: text('name').notNull(),
  hypothesis: text('hypothesis').notNull(),
  primaryMetric: text('primary_metric').notNull(),
  guardrailMetric: text('guardrail_metric').notNull(),
  status: text('status').notNull().default('running'),
  trafficPct: integer('traffic_pct').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_experiment_workspace_recommendation').on(table.workspaceId, table.recommendationId),
  index('idx_experiment_workspace_status').on(table.workspaceId, table.status),
]);

export const featureFlags = sqliteTable('feature_flags', {
  key: text('key').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  experimentId: text('experiment_id').notNull().references(() => experimentDefinitions.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('running'),
  allocationPct: integer('allocation_pct').notNull(),
  salt: text('salt').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.key] }),
  uniqueIndex('idx_feature_flags_experiment').on(table.experimentId),
]);

export const experimentAssignments = sqliteTable('experiment_assignments', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  experimentId: text('experiment_id').notNull().references(() => experimentDefinitions.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull(),
  variant: text('variant').notNull(),
  assignedAt: text('assigned_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.experimentId, table.subjectId] }),
  index('idx_assignments_experiment_variant').on(table.experimentId, table.variant),
]);

export const experimentExposures = sqliteTable('experiment_exposures', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  experimentId: text('experiment_id').notNull().references(() => experimentDefinitions.id, { onDelete: 'cascade' }),
  subjectId: text('subject_id').notNull(),
  variant: text('variant').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  exposedAt: text('exposed_at').notNull(),
}, (table) => [
  uniqueIndex('idx_exposures_workspace_key').on(table.workspaceId, table.idempotencyKey),
  index('idx_exposures_experiment_variant').on(table.experimentId, table.variant),
]);

export const experimentOutcomes = sqliteTable('experiment_outcomes', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete:'cascade' }),
  experimentId: text('experiment_id').notNull().references(() => experimentDefinitions.id, { onDelete:'cascade' }), subjectId: text('subject_id').notNull(),
  variant: text('variant').notNull(), metricKey: text('metric_key').notNull(), converted: integer('converted').notNull().default(0),
  guardrailBreached: integer('guardrail_breached').notNull().default(0), idempotencyKey: text('idempotency_key').notNull(), observedAt: text('observed_at').notNull(),
}, (table) => [uniqueIndex('idx_outcomes_workspace_key').on(table.workspaceId, table.idempotencyKey), uniqueIndex('idx_outcomes_experiment_subject_metric').on(table.experimentId, table.subjectId, table.metricKey), index('idx_outcomes_experiment_variant').on(table.experimentId, table.variant), index('idx_outcomes_workspace_experiment_metric').on(table.workspaceId, table.experimentId, table.metricKey)]);

export const experimentAnalyses = sqliteTable('experiment_analyses', {
  experimentId: text('experiment_id').primaryKey().references(() => experimentDefinitions.id, { onDelete:'cascade' }), workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete:'cascade' }),
  decision: text('decision').notNull(), analysisJson: text('analysis_json').notNull(), computedAt: text('computed_at').notNull(),
}, (table) => [index('idx_analyses_workspace_decision').on(table.workspaceId, table.decision)]);

export const workspaceRiskPolicies = sqliteTable('workspace_risk_policies', {
  workspaceId: text('workspace_id').primaryKey().references(() => workspaces.id, { onDelete:'cascade' }), maxTrafficPct: integer('max_traffic_pct').notNull().default(25),
  minObservedUsers: integer('min_observed_users').notNull().default(10), minSubjectsPerVariant: integer('min_subjects_per_variant').notNull().default(30),
  confidenceThresholdPct: integer('confidence_threshold_pct').notNull().default(95), maxGuardrailIncreasePct: integer('max_guardrail_increase_pct').notNull().default(3),
  autoRollback: integer('auto_rollback').notNull().default(1), updatedAt: text('updated_at').notNull(),
});

export const integrationDeliveries = sqliteTable('integration_deliveries', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete:'cascade' }), provider: text('provider').notNull(),
  externalId: text('external_id').notNull(), acceptedCount: integer('accepted_count').notNull(), duplicateCount: integer('duplicate_count').notNull(), receivedAt: text('received_at').notNull(),
}, (table) => [uniqueIndex('idx_deliveries_workspace_provider_external').on(table.workspaceId, table.provider, table.externalId), index('idx_deliveries_workspace_received').on(table.workspaceId, table.receivedAt)]);

export const decisionReceipts = sqliteTable('decision_receipts', {
  id: text('id').primaryKey(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete:'cascade' }), experimentId: text('experiment_id').notNull().references(() => experimentDefinitions.id, { onDelete:'cascade' }),
  outcome: text('outcome').notNull(), payloadJson: text('payload_json').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_receipts_experiment_outcome').on(table.experimentId, table.outcome), index('idx_receipts_workspace_created').on(table.workspaceId, table.createdAt)]);

export const simulationRuns = sqliteTable('simulation_runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  recommendationId: text('recommendation_id').notNull(),
  scenario: text('scenario').notNull(),
  inputJson: text('input_json').notNull(),
  resultJson: text('result_json').notNull(),
  createdBy: text('created_by').notNull().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_simulation_runs_workspace_created').on(table.workspaceId, table.createdAt),
  index('idx_simulation_runs_recommendation').on(table.workspaceId, table.recommendationId),
]);

export const rateLimitWindows = sqliteTable('rate_limit_windows', {
  subjectKey: text('subject_key').notNull(),
  scope: text('scope').notNull(),
  windowStartedAt: integer('window_started_at').notNull(),
  requestCount: integer('request_count').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.subjectKey, table.scope, table.windowStartedAt] }),
  index('idx_rate_limit_windows_updated').on(table.updatedAt),
]);
