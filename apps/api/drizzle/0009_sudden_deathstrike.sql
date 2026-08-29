-- Hand-fixed after generation to match docs/modules/workspace.md's DDL:
-- job_id/user_id ... REFERENCES jobs(id)/users(id) — drizzle-kit cannot
-- follow the cross-module relative import needed to declare these via
-- drizzle's object-reference API (see infra/schema.ts's comment).
CREATE TABLE `todo_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL REFERENCES jobs(id),
	`user_id` text NOT NULL REFERENCES users(id),
	`label` text NOT NULL,
	`due_date` text,
	`subject_hint` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_proposals_job` ON `todo_proposals` (`job_id`);