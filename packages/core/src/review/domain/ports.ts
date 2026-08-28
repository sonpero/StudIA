import type { DueCard } from "./due-card.js";
import type { CardSchedule, Review } from "./types.js";

export type Session = {
  id: string;
  userId: string;
  documentId: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type NotionProgress = { notionId: string; masteredCards: number; totalCards: number };

// Not in docs/modules/review.md's Ports section (M3 has no LLM port at all),
// but required by its own Use cases list, same reasoning as every other
// module's repository port. Every method takes userId and filters on it.
// Owns all three of review's own tables (card_schedules, reviews, sessions);
// getDueCards/getProgress additionally read generation's cards and content's
// notions (via their exported schema tables) to order by notion position and
// to exclude cards whose notion was deleted — a real cross-module SQL join,
// not a deep import: cardsTable/notionsTable are already part of those
// modules' index.ts surface.
export interface ReviewRepository {
  findSchedule(userId: string, cardId: string): Promise<CardSchedule | null>;
  // One short transaction: the review row and the recomputed schedule are
  // both written together, or neither is (docs/modules/review.md).
  submitReview(userId: string, review: Review, newSchedule: CardSchedule): Promise<void>;
  // Dueness is a calendar-day threshold, not an instant (product decision):
  // a card due later "today" is due now. dayBoundary is the client's local
  // "start of tomorrow" as an ISO instant — never computed server-side in a
  // fixed timezone. This is a different clock from submitReview's `now`
  // (FSRS scheduling, untouched by this rule): don't conflate the two.
  getDueCards(userId: string, dayBoundary: Date, filter: { documentId?: string; notionId?: string; limit?: number }): Promise<DueCard[]>;
  // nextDueDate is the earliest due date at or after dayBoundary (i.e.
  // tomorrow or later) among the document's active cards, or null if none.
  getProgress(userId: string, documentId: string, dayBoundary: Date): Promise<{ mastered: number; total: number; nextDueDate: string | null }>;
  // Same threshold and join as getProgress, factored so both share one
  // source of truth (docs/modules/review.md's mastery rule).
  getNotionsProgress(userId: string, documentId: string): Promise<NotionProgress[]>;
  createSession(userId: string, session: { id: string; documentId: string | null; startedAt: string }): Promise<void>;
  endSession(userId: string, sessionId: string, endedAt: string): Promise<boolean>;
}
