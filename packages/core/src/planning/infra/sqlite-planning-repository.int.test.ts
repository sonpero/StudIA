import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { Availability } from "../domain/types.js";
import { SqlitePlanningRepository } from "./sqlite-planning-repository.js";

const now = new Date("2026-03-02T09:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

function anAvailability(over: Partial<Availability> = {}): Availability {
  return { mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 0, sun: 0, ...over };
}

describe("SqlitePlanningRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    seedDocument(db, "doc-2", "u1");
    return { db, repo: new SqlitePlanningRepository(db) };
  }

  it("getDeadline returns null when none is set", async () => {
    const { repo } = setup();
    expect(await repo.getDeadline("u1", "doc-1")).toBeNull();
  });

  it("setDeadline creates a deadline, scoped by user and document", async () => {
    const { repo } = setup();
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-20", label: "Contrôle", createdAt: now.toISOString() });

    expect(await repo.getDeadline("u1", "doc-1")).toEqual({
      id: "d1",
      documentId: "doc-1",
      userId: "u1",
      date: "2026-03-20",
      label: "Contrôle",
      createdAt: now.toISOString(),
    });
    expect(await repo.getDeadline("u1", "doc-2")).toBeNull();
    expect(await repo.getDeadline("u2", "doc-1")).toBeNull();
  });

  it("setDeadline upserts by document: a second call replaces the first, same id", async () => {
    const { repo } = setup();
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-10", label: null, createdAt: now.toISOString() });
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-25", label: "Rattrapage", createdAt: now.toISOString() });

    const deadline = await repo.getDeadline("u1", "doc-1");
    expect(deadline?.date).toBe("2026-03-25");
    expect(deadline?.label).toBe("Rattrapage");
  });

  it("deleteDeadline removes only the targeted document's deadline", async () => {
    const { repo } = setup();
    await repo.setDeadline("u1", { id: "d1", documentId: "doc-1", userId: "u1", date: "2026-03-20", label: null, createdAt: now.toISOString() });
    await repo.setDeadline("u1", { id: "d2", documentId: "doc-2", userId: "u1", date: "2026-03-21", label: null, createdAt: now.toISOString() });

    await repo.deleteDeadline("u1", "doc-1");

    expect(await repo.getDeadline("u1", "doc-1")).toBeNull();
    expect(await repo.getDeadline("u1", "doc-2")).not.toBeNull();
  });

  it("getAvailability returns null before setAvailability has ever been called", async () => {
    const { repo } = setup();
    expect(await repo.getAvailability("u1")).toBeNull();
  });

  it("setAvailability round-trips minutes per weekday, scoped by user", async () => {
    const { repo } = setup();
    const availability = anAvailability({ sat: 45 });
    await repo.setAvailability("u1", availability);

    expect(await repo.getAvailability("u1")).toEqual(availability);
    expect(await repo.getAvailability("u2")).toBeNull();
  });

  it("setAvailability upserts: a second call overwrites the first for the same user", async () => {
    const { repo } = setup();
    await repo.setAvailability("u1", anAvailability({ mon: 10 }));
    await repo.setAvailability("u1", anAvailability({ mon: 60 }));

    expect((await repo.getAvailability("u1"))?.mon).toBe(60);
  });

  it("getHistory is empty before any day is marked complete", async () => {
    const { repo } = setup();
    expect(await repo.getHistory("u1")).toEqual([]);
  });

  it("markDayCompleted records history, scoped by user, and is idempotent for the same date", async () => {
    const { repo } = setup();
    await repo.markDayCompleted("u1", "2026-03-02");
    await repo.markDayCompleted("u1", "2026-03-02");
    await repo.markDayCompleted("u1", "2026-03-03");

    expect(await repo.getHistory("u1")).toEqual([
      { date: "2026-03-02", completed: true },
      { date: "2026-03-03", completed: true },
    ]);
    expect(await repo.getHistory("u2")).toEqual([]);
  });
});
