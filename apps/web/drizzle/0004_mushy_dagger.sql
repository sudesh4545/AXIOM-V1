CREATE TABLE `decision_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`outcome` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiment_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_receipts_experiment_outcome` ON `decision_receipts` (`experiment_id`,`outcome`);--> statement-breakpoint
CREATE INDEX `idx_receipts_workspace_created` ON `decision_receipts` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `experiment_analyses` (
	`experiment_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`decision` text NOT NULL,
	`analysis_json` text NOT NULL,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiment_definitions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_analyses_workspace_decision` ON `experiment_analyses` (`workspace_id`,`decision`);--> statement-breakpoint
CREATE TABLE `experiment_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`variant` text NOT NULL,
	`metric_key` text NOT NULL,
	`converted` integer DEFAULT 0 NOT NULL,
	`guardrail_breached` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`observed_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiment_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outcomes_workspace_key` ON `experiment_outcomes` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_outcomes_experiment_subject_metric` ON `experiment_outcomes` (`experiment_id`,`subject_id`,`metric_key`);--> statement-breakpoint
CREATE INDEX `idx_outcomes_experiment_variant` ON `experiment_outcomes` (`experiment_id`,`variant`);--> statement-breakpoint
CREATE TABLE `integration_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`accepted_count` integer NOT NULL,
	`duplicate_count` integer NOT NULL,
	`received_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_deliveries_workspace_provider_external` ON `integration_deliveries` (`workspace_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_deliveries_workspace_received` ON `integration_deliveries` (`workspace_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `workspace_risk_policies` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`max_traffic_pct` integer DEFAULT 25 NOT NULL,
	`min_observed_users` integer DEFAULT 10 NOT NULL,
	`min_subjects_per_variant` integer DEFAULT 30 NOT NULL,
	`confidence_threshold_pct` integer DEFAULT 95 NOT NULL,
	`max_guardrail_increase_pct` integer DEFAULT 3 NOT NULL,
	`auto_rollback` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
