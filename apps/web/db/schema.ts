import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => axiomUsers.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
}, (table) => [index('idx_audit_events_user_created').on(table.userId, table.createdAt)]);
