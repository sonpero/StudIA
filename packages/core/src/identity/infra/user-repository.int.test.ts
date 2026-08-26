import { afterEach, describe, expect, it } from "vitest";
import { freshDb } from "../../../../../tests/support/db.js";
import { SqliteUserRepository } from "./user-repository.js";

describe("SqliteUserRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  it("creates a new user on the first upsertPassword", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    const repo = new SqliteUserRepository(db);
    const now = new Date("2026-01-01T00:00:00Z");

    await repo.upsertPassword("alex", "hash1", now, "id-1");

    expect(await repo.findByUsername("alex")).toEqual({
      id: "id-1",
      username: "alex",
      createdAt: now.toISOString(),
      passwordHash: "hash1",
      sessionVersion: 1,
    });
    expect(await repo.findById("id-1")).toEqual({
      id: "id-1",
      username: "alex",
      createdAt: now.toISOString(),
      sessionVersion: 1,
    });
  });

  it("resets the password and increments sessionVersion on a second upsertPassword for the same username", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    const repo = new SqliteUserRepository(db);
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-02-01T00:00:00Z");

    await repo.upsertPassword("alex", "hash1", t1, "id-1");
    await repo.upsertPassword("alex", "hash2", t2, "id-should-be-ignored");

    const row = await repo.findByUsername("alex");
    expect(row).toEqual({
      id: "id-1",
      username: "alex",
      createdAt: t1.toISOString(),
      passwordHash: "hash2",
      sessionVersion: 2,
    });
  });

  it("returns null for an unknown username or id", async () => {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    const repo = new SqliteUserRepository(db);

    expect(await repo.findByUsername("ghost")).toBeNull();
    expect(await repo.findById("ghost")).toBeNull();
  });
});
