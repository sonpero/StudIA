import { sql } from "drizzle-orm";
import { SqliteDocumentRepository } from "../../ingestion/index.js";
import { SqliteNotionRepository } from "../../content/index.js";
import { SqliteReviewRepository } from "../../review/index.js";
import { afterEach, describe, expect, it } from "vitest";
import { freshDb, type Db } from "../../../../../tests/support/db.js";
import { SqliteProgressRepository } from "../infra/sqlite-progress-repository.js";
import { listProgress } from "./list-progress.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

function seedUser(db: Db, id: string): void {
  db.run(sql`INSERT INTO users (id, username, password_hash, session_version, created_at)
      VALUES (${id}, ${`user-${id}`}, 'x', 1, ${NOW.toISOString()})`);
}

function seedDocument(db: Db, id: string, userId: string, title: string): void {
  db.run(sql`INSERT INTO documents (id, user_id, title, source_type, status, colour, created_at)
      VALUES (${id}, ${userId}, ${title}, 'photo', 'done', '#F87171', ${NOW.toISOString()})`);
}

function seedNotion(db: Db, id: string, documentId: string, userId: string, position: number): void {
  db.run(sql`INSERT INTO notions (id, document_id, user_id, title, body, difficulty, position, created_at)
      VALUES (${id}, ${documentId}, ${userId}, ${`Notion ${id}`}, 'Corps.', 'medium', ${position}, ${NOW.toISOString()})`);
}

function seedCard(db: Db, id: string, notionId: string, userId: string): void {
  db.run(sql`INSERT INTO cards (id, notion_id, user_id, type, state, question, answer, options_json, created_at)
      VALUES (${id}, ${notionId}, ${userId}, 'flashcard', 'active', ${`Question ${id} ?`}, 'Réponse', NULL, ${NOW.toISOString()})`);
}

describe("listProgress — cross-document isolation (mandatory integration coverage)", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    return {
      db,
      deps: {
        repo: new SqliteProgressRepository(db),
        documentRepo: new SqliteDocumentRepository(db),
        notionRepo: new SqliteNotionRepository(db),
        reviewRepo: new SqliteReviewRepository(db),
      },
    };
  }

  // The failure mode this guards against does not throw and does not
  // violate any bound: a Map keyed wrong (or not keyed by documentId at
  // all) still produces numbers in [0, 1] that satisfy readiness <=
  // coverage — they would just describe the wrong course. Two notions per
  // document, one course fully covered and one course fully uncovered, so
  // a leak shows up as a *specific*, wrong number (0.5 instead of 1 or 0)
  // rather than something a bounds check would ever catch.
  it("two documents, one fully covered and one fully uncovered: neither's numbers leak into the other's, in either direction", async () => {
    const { db, deps } = setup();
    seedUser(db, "u1");
    seedDocument(db, "doc-covered", "u1", "Cours couvert");
    seedDocument(db, "doc-uncovered", "u1", "Cours non couvert");
    seedNotion(db, "n-cov-1", "doc-covered", "u1", 0);
    seedNotion(db, "n-cov-2", "doc-covered", "u1", 1);
    seedNotion(db, "n-unc-1", "doc-uncovered", "u1", 0);
    seedNotion(db, "n-unc-2", "doc-uncovered", "u1", 1);
    seedCard(db, "c-cov-1", "n-cov-1", "u1");
    seedCard(db, "c-cov-2", "n-cov-2", "u1");
    seedCard(db, "c-unc-1", "n-unc-1", "u1");
    seedCard(db, "c-unc-2", "n-unc-2", "u1");
    await deps.reviewRepo.submitReview(
      "u1",
      { id: "r1", cardId: "c-cov-1", userId: "u1", rating: 3, reviewedAt: NOW.toISOString(), elapsedMs: 1000 },
      { cardId: "c-cov-1", userId: "u1", due: "2026-04-01T00:00:00.000Z", stability: 20, difficulty: 3, reps: 2, lapses: 0, lastReviewedAt: NOW.toISOString() },
    );
    await deps.reviewRepo.submitReview(
      "u1",
      { id: "r2", cardId: "c-cov-2", userId: "u1", rating: 3, reviewedAt: NOW.toISOString(), elapsedMs: 1000 },
      { cardId: "c-cov-2", userId: "u1", due: "2026-04-01T00:00:00.000Z", stability: 20, difficulty: 3, reps: 2, lapses: 0, lastReviewedAt: NOW.toISOString() },
    );
    // n-unc-1/n-unc-2's cards are never reviewed.

    const items = await listProgress(deps, "u1", NOW);
    const byDocumentId = new Map(items.map((item) => [item.documentId, item]));
    const covered = byDocumentId.get("doc-covered");
    const uncovered = byDocumentId.get("doc-uncovered");

    expect(covered?.kind).toBe("ok");
    expect(uncovered?.kind).toBe("ok");
    if (covered?.kind !== "ok" || uncovered?.kind !== "ok") return;

    // Direction 1: the covered course must show its own full coverage,
    // not diluted by the other course's zero.
    expect(covered.progress.coverage).toBe(1);
    // Direction 2: the uncovered course must show its own zero, not
    // inflated by the other course's full coverage.
    expect(uncovered.progress.coverage).toBe(0);
  });

  it("two documents with distinct deadlines: each entry carries its own document's deadline, not the other's", async () => {
    const { db, deps } = setup();
    seedUser(db, "u1");
    seedDocument(db, "doc-a", "u1", "Cours A");
    seedDocument(db, "doc-b", "u1", "Cours B");
    await deps.repo.setDeadline("u1", { id: "d-a", documentId: "doc-a", userId: "u1", date: "2026-04-01", label: "Contrôle A", createdAt: NOW.toISOString() });
    await deps.repo.setDeadline("u1", { id: "d-b", documentId: "doc-b", userId: "u1", date: "2026-05-01", label: "Contrôle B", createdAt: NOW.toISOString() });

    const items = await listProgress(deps, "u1", NOW);
    const byDocumentId = new Map(items.map((item) => [item.documentId, item]));

    expect(byDocumentId.get("doc-a")?.deadlineDate).toBe("2026-04-01");
    expect(byDocumentId.get("doc-a")?.deadlineLabel).toBe("Contrôle A");
    expect(byDocumentId.get("doc-b")?.deadlineDate).toBe("2026-05-01");
    expect(byDocumentId.get("doc-b")?.deadlineLabel).toBe("Contrôle B");
  });
});

describe("listProgress — iterates over listDocuments, never over the notion/schedule/deadline buckets", () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => cleanup?.());

  function setup() {
    const { db, cleanup: c } = freshDb();
    cleanup = c;
    return {
      db,
      deps: {
        repo: new SqliteProgressRepository(db),
        documentRepo: new SqliteDocumentRepository(db),
        notionRepo: new SqliteNotionRepository(db),
        reviewRepo: new SqliteReviewRepository(db),
      },
    };
  }

  // A document with zero notions is absent from every one of the three
  // batched reads (it contributes no rows to notionsByDocument,
  // cardRowsByDocument, or — here — deadlineByDocument). If the
  // implementation ever iterated over one of those Maps' keys instead of
  // over documentRepo.listDocuments, this document would silently vanish
  // from the list instead of showing up at coverage 0 / readiness 0.
  it("a document with no notions at all still produces an entry at coverage 0 and readiness 0, not a missing row", async () => {
    const { db, deps } = setup();
    seedUser(db, "u1");
    seedDocument(db, "doc-empty", "u1", "Cours vide");
    seedDocument(db, "doc-with-notion", "u1", "Cours avec fiche");
    seedNotion(db, "n1", "doc-with-notion", "u1", 0);
    seedCard(db, "c1", "n1", "u1");

    const items = await listProgress(deps, "u1", NOW);

    expect(items).toHaveLength(2);
    const empty = items.find((item) => item.documentId === "doc-empty");
    expect(empty).toBeDefined();
    expect(empty?.kind).toBe("ok");
    if (empty?.kind !== "ok") return;
    expect(empty.progress.coverage).toBe(0);
    expect(empty.progress.readiness).toBe(0);
    expect(empty.title).toBe("Cours vide");
  });
});
