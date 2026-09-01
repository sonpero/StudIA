-- Hand-fixed after generation to match docs/modules/workspace.md's DDL:
-- user_id REFERENCES users(id) — drizzle-kit cannot follow the
-- cross-module relative import needed to declare this via drizzle's
-- object-reference API (see infra/schema.ts's comment). todo_id needed no
-- such fix: it references this same module's own todos table, so
-- drizzle-kit already emitted its FOREIGN KEY clause below correctly.
CREATE TABLE `pomodoro_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id),
	`todo_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`duration_seconds` integer NOT NULL,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_pomodoro_sessions_user` ON `pomodoro_sessions` (`user_id`,`started_at`);