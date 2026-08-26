-- Hand-fixed after generation to match docs/modules/jobs.md's DDL exactly:
-- 1. `user_id ... REFERENCES users(id)` — drizzle-orm's TS schema
--    (packages/core/src/jobs/infra/schema.ts) deliberately has no object
--    reference to identity's usersTable: jobs/** is a frozen kernel and
--    must never import a business module (dependency-cruiser's
--    frozen-kernels rule), so drizzle-kit could not generate this FK on its
--    own. Added here once, by hand, since jobs/** never changes again after
--    this migration.
-- 2. `status ... CHECK (status IN (...))` — matches the DDL's explicit
--    CHECK; this drizzle-orm version's `{ enum: [...] }` column option is
--    TypeScript-only and does not emit one.
-- 3. `idx_jobs_user`'s `created_at` column is DESC per the DDL; this
--    drizzle-orm version has no per-column index direction on sqlite-core.
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES users(id),
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL CHECK (status IN ('pending','running','done','failed')),
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`last_error` text,
	`run_after` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_claim` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `idx_jobs_user` ON `jobs` (`user_id`,`type`,`created_at` DESC);
