-- Hand-fixed after generation (same reasoning as migration 0011's `role`
-- column, packages/core/src/workspace/infra/schema.ts's own comment):
-- drizzle's `{ enum: [...] }` column option is TypeScript-only and does not
-- emit a CHECK constraint on its own.
ALTER TABLE `pomodoro_sessions` ADD `type` text DEFAULT 'focus' NOT NULL CHECK (type IN ('focus','shortBreak','longBreak'));