CREATE TABLE `experiment_assignments` (
	`workspace_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`variant` text NOT NULL,
	`assigned_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `experiment_id`, `subject_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiment_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_assignments_experiment_variant` ON `experiment_assignments` (`experiment_id`,`variant`);--> statement-breakpoint
CREATE TABLE `experiment_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`name` text NOT NULL,
	`hypothesis` text NOT NULL,
	`primary_metric` text NOT NULL,
	`guardrail_metric` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`traffic_pct` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_experiment_workspace_recommendation` ON `experiment_definitions` (`workspace_id`,`recommendation_id`);--> statement-breakpoint
CREATE INDEX `idx_experiment_workspace_status` ON `experiment_definitions` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `experiment_exposures` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`variant` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`exposed_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiment_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_exposures_workspace_key` ON `experiment_exposures` (`workspace_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_exposures_experiment_variant` ON `experiment_exposures` (`experiment_id`,`variant`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text NOT NULL,
	`workspace_id` text NOT NULL,
	`experiment_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`allocation_pct` integer NOT NULL,
	`salt` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `key`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiment_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feature_flags_experiment` ON `feature_flags` (`experiment_id`);