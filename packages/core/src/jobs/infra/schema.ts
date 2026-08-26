import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// user_id intentionally has no drizzle `.references()` object-reference to
// identity's usersTable: jobs/** is a frozen kernel (dependency-cruiser's
// frozen-kernels rule) and must never import a business module, not even
// through identity's own index.ts. The `REFERENCES users(id)` constraint
// from docs/modules/jobs.md's DDL is added by hand, once, directly in the
// generated migration SQL instead (see apps/api/drizzle/).
export const jobsTable = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    payload: text("payload_json", { mode: "json" }).notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    runAfter: text("run_after").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_jobs_claim").on(table.status, table.runAfter),
    // docs/modules/jobs.md orders this index's last column DESC; this
    // drizzle-orm version has no per-column index direction on sqlite-core,
    // so it's hand-fixed once in the generated migration (see
    // apps/api/drizzle/), same as the user_id FK below.
    index("idx_jobs_user").on(table.userId, table.type, table.createdAt),
  ],
);
