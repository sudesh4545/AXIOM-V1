CREATE TABLE `ingested_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`event_type` text NOT NULL,
	`event_name` text NOT NULL,
	`anonymous_id` text,
	`properties_json` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `axiom_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ingested_events_workspace_key` ON `ingested_events` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_ingested_events_workspace_occurred` ON `ingested_events` (`workspace_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `source_connections` (
	`workspace_id` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`event_count` integer DEFAULT 0 NOT NULL,
	`last_event_at` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `source`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
