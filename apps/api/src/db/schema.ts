// Table definitions live in each module's own infra/schema.ts
// (packages/core/src/<module>/infra/schema.ts), not here: apps/api/drizzle.config.ts
// globs them directly for drizzle-kit generate. Nothing in apps/api imports
// this file; it exists as a pointer for humans looking for "where's the DB
// schema".
export {};
