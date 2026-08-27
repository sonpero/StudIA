// In-memory test doubles for generation's ports (CLAUDE.md rule 3).
import { ok, type Result } from "../../shared/index.js";
import type { Notion, NotionRepository } from "../../content/index.js";
import type { Job, JobQueue } from "../../jobs/index.js";
import type { Card, CardType, GeneratedCard } from "../domain/types.js";
import type { CardGenerator, CardRepository, GenerationError } from "../domain/ports.js";

// A minimal local JobQueue fake, not a deep import of another module's own
// internal application/fakes.ts (not part of its index.ts's public surface,
// same reasoning as ingestion's fakeJobQueueForIngestion and content's
// fakeDocumentRepositoryForContent).
export function fakeJobQueueForGeneration(seed: Job[] = []): JobQueue & { rows: Job[] } {
  const rows = [...seed];
  let counter = 0;
  return {
    rows,
    enqueue: (userId, type, payload, now) => {
      const id = `job-${String(counter++)}`;
      const nowIso = now.toISOString();
      rows.push({
        id,
        userId,
        type,
        payload,
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        lastError: null,
        runAfter: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      return Promise.resolve(id);
    },
    claimNext: () => Promise.resolve(null),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
    recoverStale: () => Promise.resolve(0),
    listJobs: (userId, type, createdAfter) =>
      Promise.resolve(
        rows
          .filter((row) => row.userId === userId && row.type === type && (!createdAfter || row.createdAt > createdAfter))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((row) => ({ id: row.id, status: row.status, payload: row.payload, lastError: row.lastError })),
      ),
  };
}

export function fakeCardRepository(seed: Card[] = []): CardRepository & { cards: Card[] } {
  const cards = [...seed];
  const own = (userId: string, cardId: string) => cards.find((c) => c.id === cardId && c.userId === userId);

  return {
    cards,
    listCards: (userId, notionId) => Promise.resolve(cards.filter((c) => c.userId === userId && c.notionId === notionId)),
    findCard: (userId, cardId) => Promise.resolve(own(userId, cardId) ?? null),
    applyCardChanges: (userId, notionId, upsert, deleteIds) => {
      for (const id of deleteIds) {
        const index = cards.findIndex((c) => c.id === id && c.userId === userId && c.notionId === notionId);
        if (index !== -1) cards.splice(index, 1);
      }
      for (const card of upsert) {
        const index = cards.findIndex((c) => c.id === card.id && c.userId === userId);
        if (index === -1) cards.push(card);
        else cards[index] = card;
      }
      return Promise.resolve();
    },
    deleteCard: (userId, cardId) => {
      const index = cards.findIndex((c) => c.id === cardId && c.userId === userId);
      if (index === -1) return Promise.resolve(false);
      cards.splice(index, 1);
      return Promise.resolve(true);
    },
    markStale: (userId, notionId) => {
      for (const card of cards) {
        if (card.userId === userId && card.notionId === notionId && card.state === "active") card.state = "stale";
      }
      return Promise.resolve();
    },
  };
}

export function fakeCardGenerator(
  impl: (types: CardType[]) => Promise<Result<GeneratedCard[], GenerationError>> = (types) =>
    Promise.resolve(ok(types.map((type) => ({ type, question: `Question sur ${type} ?`, answer: "Réponse", options: null })))),
): CardGenerator {
  return { generate: (input) => impl(input.types) };
}

// Minimal local stand-in for content's NotionRepository — not a deep import
// of content's own internal fakes.ts, same reasoning as content's
// fakeDocumentRepositoryForContent. Only findNotion is exercised by
// generation's use cases.
export function fakeNotionRepositoryForGeneration(notion: Notion | null): NotionRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeNotionRepositoryForGeneration: ${method} is not implemented, generation does not call it`);
  };
  return {
    replaceNotionsForDocument: notImplemented("replaceNotionsForDocument"),
    listNotions: notImplemented("listNotions"),
    findNotion: () => Promise.resolve(notion),
    updateNotion: notImplemented("updateNotion"),
    reorderNotions: notImplemented("reorderNotions"),
    deleteNotion: notImplemented("deleteNotion"),
    searchNotions: notImplemented("searchNotions"),
  };
}
