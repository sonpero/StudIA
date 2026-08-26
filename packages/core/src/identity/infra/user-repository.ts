import { eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { UserRepository } from "../domain/ports.js";
import { usersTable } from "./schema.js";

// Matches whatever drizzle(sqlite) actually infers at each call site (no
// schema map passed in), rather than a hand-picked generic that can drift
// out of sync with it (see apps/api/src/db/connection.ts's Db type, built
// the same way).
export type IdentityDb = ReturnType<typeof drizzle>;

// better-sqlite3 is synchronous; these methods return Promise.resolve(...)
// rather than being declared `async` so the (already-resolved) value isn't
// wrapped in an extra microtask, while still satisfying the async
// UserRepository port.
export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: IdentityDb) {}

  findByUsername(username: string): ReturnType<UserRepository["findByUsername"]> {
    const row = this.db.select().from(usersTable).where(eq(usersTable.username, username)).get();
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      id: row.id,
      username: row.username,
      createdAt: row.createdAt,
      passwordHash: row.passwordHash,
      sessionVersion: row.sessionVersion,
    });
  }

  findById(id: string): ReturnType<UserRepository["findById"]> {
    const row = this.db.select().from(usersTable).where(eq(usersTable.id, id)).get();
    if (!row) return Promise.resolve(null);
    return Promise.resolve({ id: row.id, username: row.username, createdAt: row.createdAt, sessionVersion: row.sessionVersion });
  }

  upsertPassword(username: string, hash: string, now: Date, newId: string): Promise<void> {
    this.db
      .insert(usersTable)
      .values({ id: newId, username, passwordHash: hash, sessionVersion: 1, createdAt: now.toISOString() })
      .onConflictDoUpdate({
        target: usersTable.username,
        set: { passwordHash: hash, sessionVersion: sql`${usersTable.sessionVersion} + 1` },
      })
      .run();
    return Promise.resolve();
  }
}
