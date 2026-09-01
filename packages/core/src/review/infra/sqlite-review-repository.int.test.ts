import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import type { CardSchedule, Review } from "../domain/types.js";
import { SqliteReviewRepository } from "./sqlite-review-repository.js";

const now = new Date("2026-01-10T00:00:00.000Z");
// Dueness is a calendar-day threshold (product decision), never an instant:
// a card due anywhere before dayBoundary — including later "today" — counts
// as due now. dayBoundary is what the client computes as "start of
// tomorrow" and is unrelated to submitReview's own real clock. Deliberately
// a day after `now` (not the same instant): aSchedule()'s default `due`
// uses `now`, and a same-value dayBoundary would put that default exactly
// on the boundary, hiding real bugs behind an edge case.
const dayBoundary = new Date("2026-01-11T00:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${now.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, 'Cours', 'photo', 'done', '#F87171', ${now.toISOString()})`);
}

function seedNotion(db: Db, id: string, documentId: string, userId: string, position: number): void {
  db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
      VALUES (${id}, ${documentId}, ${userId}, ${`Notion ${id}`}, 'Corps.', 'medium', ${position}, ${now.toISOString()})`);
}

function seedCard(db: Db, id: string, notionId: string, userId: string, state: "active" | "stale" = "active"): void {
  db.run(sql`INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at)
      VALUES (${id}, ${notionId}, ${userId}, 'flashcard', ${state}, ${`Question ${id} ?`}, 'Réponse', NULL, ${now.toISOString()})`);
}

function aSchedule(overrides: Partial<CardSchedule> = {}): CardSchedule {
  return {
    cardId: "c1",
    userId: "u1",
    due: now.toISOString(),
    stability: 2.3065,
    difficulty: 2.1181,
    reps: 1,
    lapses: 0,
    lastReviewedAt: now.toISOString(),
    ...overrides,
  };
}

function aReview(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    cardId: "c1",
    userId: "u1",
    rating: 3,
    reviewedAt: now.toISOString(),
    elapsedMs: 5000,
    ...overrides,
  };
}

describe("SqliteReviewRepository", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    seedUser(db, "u1");
    seedUser(db, "u2");
    seedDocument(db, "doc-1", "u1");
    seedNotion(db, "n1", "doc-1", "u1", 0);
    seedNotion(db, "n2", "doc-1", "u1", 1);
    return { db, repo: new SqliteReviewRepository(db) };
  }

  it("submitReview writes the review and the schedule together, findSchedule reads it back scoped to the owner", async () => {
    const { db, repo } = setup();
    seedCard(db, "c1", "n1", "u1");

    await repo.submitReview("u1", aReview(), aSchedule());

    expect(await repo.findSchedule("u1", "c1")).toEqual(aSchedule());
    expect(await repo.findSchedule("u2", "c1")).toBeNull();
  });

  it("getDueCards returns a new card (no schedule) and a due card, but not a not-yet-due one", async () => {
    const { db, repo } = setup();
    seedCard(db, "new-card", "n1", "u1");
    seedCard(db, "due-card", "n1", "u1");
    seedCard(db, "future-card", "n1", "u1");
    await repo.submitReview("u1", aReview({ id: "r-due", cardId: "due-card" }), aSchedule({ cardId: "due-card", due: "2026-01-09T00:00:00.000Z" }));
    await repo.submitReview(
      "u1",
      aReview({ id: "r-future", cardId: "future-card" }),
      aSchedule({ cardId: "future-card", due: "2026-02-01T00:00:00.000Z" }),
    );

    const due = await repo.getDueCards("u1", dayBoundary, {});

    expect(due.map((c) => c.cardId).sort()).toEqual(["due-card", "new-card"]);
  });

  it("getDueCards includes a card due later the same day (before dayBoundary), and excludes one due exactly at it", async () => {
    const { db, repo } = setup();
    seedCard(db, "due-later-today", "n1", "u1");
    seedCard(db, "due-tomorrow", "n1", "u1");
    // dayBoundary is the exclusive start of tomorrow: a card due one
    // millisecond before it is still "today" and must be revisable now.
    await repo.submitReview(
      "u1",
      aReview({ id: "r-today", cardId: "due-later-today" }),
      aSchedule({ cardId: "due-later-today", due: new Date(dayBoundary.getTime() - 1).toISOString() }),
    );
    await repo.submitReview("u1", aReview({ id: "r-tomorrow", cardId: "due-tomorrow" }), aSchedule({ cardId: "due-tomorrow", due: dayBoundary.toISOString() }));

    const due = await repo.getDueCards("u1", dayBoundary, {});

    expect(due.map((c) => c.cardId)).toEqual(["due-later-today"]);
  });

  it("getDueCards orders due cards before new cards, and by notion position within each group", async () => {
    const { db, repo } = setup();
    seedCard(db, "new-in-n2", "n2", "u1");
    seedCard(db, "new-in-n1", "n1", "u1");
    seedCard(db, "due-in-n2", "n2", "u1");
    await repo.submitReview("u1", aReview({ id: "r1", cardId: "due-in-n2" }), aSchedule({ cardId: "due-in-n2", due: "2026-01-01T00:00:00.000Z" }));

    const due = await repo.getDueCards("u1", dayBoundary, {});

    expect(due.map((c) => c.cardId)).toEqual(["due-in-n2", "new-in-n1", "new-in-n2"]);
  });

  it("getDueCards filters by documentId and respects limit", async () => {
    const { db, repo } = setup();
    seedDocument(db, "doc-2", "u1");
    seedNotion(db, "n3", "doc-2", "u1", 0);
    seedCard(db, "c-doc1", "n1", "u1");
    seedCard(db, "c-doc2", "n3", "u1");

    const filtered = await repo.getDueCards("u1", dayBoundary, { documentId: "doc-1" });
    expect(filtered.map((c) => c.cardId)).toEqual(["c-doc1"]);

    const limited = await repo.getDueCards("u1", dayBoundary, { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it("getDueCards filters by notionId, to review a single notion", async () => {
    const { db, repo } = setup();
    seedCard(db, "c-in-n1", "n1", "u1");
    seedCard(db, "c-in-n2", "n2", "u1");

    const filtered = await repo.getDueCards("u1", dayBoundary, { notionId: "n1" });

    expect(filtered.map((c) => c.cardId)).toEqual(["c-in-n1"]);
  });

  it("getDueCards includes stale cards, marked as such, and never a card whose notion was deleted", async () => {
    const { db, repo } = setup();
    seedCard(db, "stale-card", "n1", "u1", "stale");
    seedCard(db, "orphan-card", "n2", "u1");
    db.run(sql`DELETE FROM notions WHERE id = 'n2'`);

    const due = await repo.getDueCards("u1", dayBoundary, {});

    expect(due.map((c) => c.cardId)).toEqual(["stale-card"]);
    expect(due[0]?.state).toBe("stale");
  });

  it("getDueCards never returns another user's cards", async () => {
    const { db, repo } = setup();
    seedDocument(db, "doc-u2", "u2");
    seedNotion(db, "n-u2", "doc-u2", "u2", 0);
    seedCard(db, "c-u2", "n-u2", "u2");

    expect(await repo.getDueCards("u1", dayBoundary, {})).toEqual([]);
  });

  it("getProgress counts a notion as mastered only once all its active cards clear the threshold", async () => {
    const { db, repo } = setup();
    seedCard(db, "mastered-card", "n1", "u1");
    await repo.submitReview(
      "u1",
      aReview({ id: "r1", cardId: "mastered-card" }),
      aSchedule({ cardId: "mastered-card", stability: 30, reps: 5 }),
    );
    seedCard(db, "not-mastered-card", "n2", "u1");
    await repo.submitReview(
      "u1",
      aReview({ id: "r2", cardId: "not-mastered-card" }),
      aSchedule({ cardId: "not-mastered-card", stability: 1, reps: 1 }),
    );

    expect(await repo.getProgress("u1", "doc-1", dayBoundary)).toEqual({ mastered: 1, total: 2, nextDueDate: null });
  });

  it("getProgress counts a notion with no cards yet toward the total, but never as mastered", async () => {
    const { repo } = setup();

    expect(await repo.getProgress("u1", "doc-1", dayBoundary)).toEqual({ mastered: 0, total: 2, nextDueDate: null });
  });

  it("getProgress's nextDueDate is null when the document has no cards at all", async () => {
    const { repo } = setup();

    expect((await repo.getProgress("u1", "doc-1", dayBoundary)).nextDueDate).toBeNull();
  });

  it("getProgress's nextDueDate is null when every card is already due, not scheduled in the future", async () => {
    const { db, repo } = setup();
    seedCard(db, "due-card", "n1", "u1");
    await repo.submitReview("u1", aReview({ id: "r1", cardId: "due-card" }), aSchedule({ cardId: "due-card", due: "2026-01-09T00:00:00.000Z" }));

    expect((await repo.getProgress("u1", "doc-1", dayBoundary)).nextDueDate).toBeNull();
  });

  it("getProgress's nextDueDate ignores a card due later today: it's already due now, not upcoming", async () => {
    const { db, repo } = setup();
    seedCard(db, "due-later-today", "n1", "u1");
    await repo.submitReview(
      "u1",
      aReview({ id: "r1", cardId: "due-later-today" }),
      aSchedule({ cardId: "due-later-today", due: new Date(dayBoundary.getTime() - 1).toISOString() }),
    );

    expect((await repo.getProgress("u1", "doc-1", dayBoundary)).nextDueDate).toBeNull();
  });

  it("getProgress's nextDueDate counts a card due exactly at dayBoundary as tomorrow, not today", async () => {
    const { db, repo } = setup();
    seedCard(db, "due-tomorrow", "n1", "u1");
    await repo.submitReview("u1", aReview({ id: "r1", cardId: "due-tomorrow" }), aSchedule({ cardId: "due-tomorrow", due: dayBoundary.toISOString() }));

    expect((await repo.getProgress("u1", "doc-1", dayBoundary)).nextDueDate).toBe(dayBoundary.toISOString());
  });

  it("getProgress's nextDueDate picks the closest future due date among a mix of due and future cards", async () => {
    const { db, repo } = setup();
    seedCard(db, "already-due", "n1", "u1");
    await repo.submitReview("u1", aReview({ id: "r1", cardId: "already-due" }), aSchedule({ cardId: "already-due", due: "2026-01-09T00:00:00.000Z" }));
    seedCard(db, "soon", "n1", "u1");
    await repo.submitReview("u1", aReview({ id: "r2", cardId: "soon" }), aSchedule({ cardId: "soon", due: "2026-01-12T00:00:00.000Z" }));
    seedCard(db, "later", "n2", "u1");
    await repo.submitReview("u1", aReview({ id: "r3", cardId: "later" }), aSchedule({ cardId: "later", due: "2026-01-20T00:00:00.000Z" }));

    expect((await repo.getProgress("u1", "doc-1", dayBoundary)).nextDueDate).toBe("2026-01-12T00:00:00.000Z");
  });

  it("getNotionsProgress reports mastered/total cards per notion, sharing getProgress's threshold and join", async () => {
    const { db, repo } = setup();
    seedCard(db, "mastered-card", "n1", "u1");
    await repo.submitReview(
      "u1",
      aReview({ id: "r1", cardId: "mastered-card" }),
      aSchedule({ cardId: "mastered-card", stability: 30, reps: 5 }),
    );
    seedCard(db, "not-mastered-card", "n2", "u1");
    await repo.submitReview(
      "u1",
      aReview({ id: "r2", cardId: "not-mastered-card" }),
      aSchedule({ cardId: "not-mastered-card", stability: 1, reps: 1 }),
    );

    const progress = await repo.getNotionsProgress("u1", "doc-1");

    expect(progress.sort((a, b) => a.notionId.localeCompare(b.notionId))).toEqual([
      { notionId: "n1", masteredCards: 1, totalCards: 1, cardsWithEnoughReps: 1, cardsWithEnoughStability: 1 },
      { notionId: "n2", masteredCards: 0, totalCards: 1, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0 },
    ]);
  });

  // The regression this pair of counts exists to rule out (docs/modules/
  // review.md's "Which of the two criteria is missing" note): a card short
  // on reps but already past the stability threshold must still count in
  // cardsWithEnoughStability. An earlier, deficiency-shaped version of this
  // pair only counted a card's stability once its reps were already enough,
  // so this exact card would have been invisible to the stability count —
  // read as "hasn't crossed 21 days" when it plainly had.
  it("getNotionsProgress counts reps and stability independently: a card short on reps but already past the stability threshold still counts toward cardsWithEnoughStability", async () => {
    const { db, repo } = setup();
    seedCard(db, "short-on-reps-only", "n1", "u1");
    await repo.submitReview(
      "u1",
      aReview({ id: "r1", cardId: "short-on-reps-only" }),
      aSchedule({ cardId: "short-on-reps-only", stability: 25, reps: 1 }),
    );

    const progress = await repo.getNotionsProgress("u1", "doc-1");
    const n1 = progress.find((p) => p.notionId === "n1");

    expect(n1).toEqual({ notionId: "n1", masteredCards: 0, totalCards: 1, cardsWithEnoughReps: 0, cardsWithEnoughStability: 1 });
  });

  it("getNotionsProgress reports a notion with no cards yet as 0/0, with both criteria counts at 0 too", async () => {
    const { repo } = setup();

    const progress = await repo.getNotionsProgress("u1", "doc-1");

    expect(progress.sort((a, b) => a.notionId.localeCompare(b.notionId))).toEqual([
      { notionId: "n1", masteredCards: 0, totalCards: 0, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0 },
      { notionId: "n2", masteredCards: 0, totalCards: 0, cardsWithEnoughReps: 0, cardsWithEnoughStability: 0 },
    ]);
  });

  it("createSession then endSession round-trips, and rejects another user's session", async () => {
    const { repo } = setup();

    await repo.createSession("u1", { id: "s1", documentId: "doc-1", startedAt: now.toISOString() });

    expect(await repo.endSession("u2", "s1", now.toISOString())).toBe(false);
    expect(await repo.endSession("u1", "s1", now.toISOString())).toBe(true);
  });

  it("deleting a card cascades to its schedule and reviews", async () => {
    const { db, repo } = setup();
    seedCard(db, "c1", "n1", "u1");
    await repo.submitReview("u1", aReview(), aSchedule());

    db.run(sql`DELETE FROM cards WHERE id = 'c1'`);

    expect(await repo.findSchedule("u1", "c1")).toBeNull();
    expect(db.all(sql`SELECT * FROM reviews WHERE card_id = 'c1'`)).toEqual([]);
  });

  // Added for `progress` (docs/modules/progress.md): a coupling point the
  // spec calls out explicitly. One row per active card, schedule null vs.
  // populated read off the same query's join-key column — never a second
  // read, never a partial object (some schedule fields present, others
  // missing) if the null check is wrong.
  it("getCardSchedulesForDocument returns one row per active card, schedule null when never reviewed, populated when it has, excludes stale cards", async () => {
    const { db, repo } = setup();
    seedCard(db, "reviewed", "n1", "u1");
    seedCard(db, "never-reviewed", "n1", "u1");
    seedCard(db, "stale-card", "n2", "u1", "stale");
    await repo.submitReview("u1", aReview({ id: "r1", cardId: "reviewed" }), aSchedule({ cardId: "reviewed" }));

    const rows = await repo.getCardSchedulesForDocument("u1", "doc-1");

    expect(rows).toHaveLength(2);
    const byCardId = new Map(rows.map((row) => [row.cardId, row]));
    expect(byCardId.get("reviewed")).toEqual({ notionId: "n1", cardId: "reviewed", schedule: aSchedule({ cardId: "reviewed" }) });
    expect(byCardId.get("never-reviewed")).toEqual({ notionId: "n1", cardId: "never-reviewed", schedule: null });
    expect(byCardId.has("stale-card")).toBe(false);
  });

  it("getCardSchedulesForDocument is scoped by user and document", async () => {
    const { db, repo } = setup();
    seedDocument(db, "doc-2", "u1");
    seedNotion(db, "n3", "doc-2", "u1", 0);
    seedCard(db, "c-doc1", "n1", "u1");
    seedCard(db, "c-doc2", "n3", "u1");

    expect((await repo.getCardSchedulesForDocument("u1", "doc-1")).map((row) => row.cardId)).toEqual(["c-doc1"]);
    expect(await repo.getCardSchedulesForDocument("u2", "doc-1")).toEqual([]);
  });

  // Added for `progress`'s listProgress (docs/modules/progress.md): every
  // active card's schedule across every document the user owns, in one
  // query — the batched counterpart to getCardSchedulesForDocument, same
  // null-sentinel and same 'active' filter, plus documentId per row so the
  // caller can group without a second read per document.
  it("getCardSchedulesForUser returns one row per active card across every document, with documentId, scoped by user", async () => {
    const { db, repo } = setup();
    seedDocument(db, "doc-2", "u1");
    seedNotion(db, "n3", "doc-2", "u1", 0);
    seedCard(db, "c1", "n1", "u1");
    seedCard(db, "c3", "n3", "u1");
    seedCard(db, "stale-card", "n2", "u1", "stale");
    await repo.submitReview("u1", aReview({ id: "r1", cardId: "c1" }), aSchedule({ cardId: "c1" }));

    const rows = await repo.getCardSchedulesForUser("u1");

    expect(rows).toHaveLength(2);
    const byCardId = new Map(rows.map((row) => [row.cardId, row]));
    expect(byCardId.get("c1")).toEqual({ documentId: "doc-1", notionId: "n1", cardId: "c1", schedule: aSchedule({ cardId: "c1" }) });
    expect(byCardId.get("c3")).toEqual({ documentId: "doc-2", notionId: "n3", cardId: "c3", schedule: null });
    expect(byCardId.has("stale-card")).toBe(false);
  });

  it("getCardSchedulesForUser is empty for a user with no cards", async () => {
    const { repo } = setup();
    expect(await repo.getCardSchedulesForUser("u2")).toEqual([]);
  });
});
