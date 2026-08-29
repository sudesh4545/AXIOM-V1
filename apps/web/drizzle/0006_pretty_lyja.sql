CREATE TABLE `rate_limit_windows` (
	`subject_key` text NOT NULL,
	`scope` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`subject_key`, `scope`, `window_started_at`)
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limit_windows_updated` ON `rate_limit_windows` (`updated_at`);--> statement-breakpoint
CREATE TABLE `simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`recommendation_id` text NOT NULL,
	`scenario` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `axiom_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_simulation_runs_workspace_created` ON `simulation_runs` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_simulation_runs_recommendation` ON `simulation_runs` (`workspace_id`,`recommendation_id`);