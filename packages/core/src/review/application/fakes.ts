// In-memory test doubles for review's own ports (CLAUDE.md rule 3).
import { ok, type Result } from "../../shared/index.js";
import type { Card, CardRepository } from "../../generation/index.js";
import type { DueCard } from "../domain/due-card.js";
import type { AnswerGrader, GradeError, ReviewRepository, Session } from "../domain/ports.js";
import type { CardSchedule, Rating, Review } from "../domain/types.js";

export function fakeReviewRepository(
  seed: { schedules?: CardSchedule[]; reviews?: Review[]; sessions?: Session[]; dueCards?: DueCard[] } = {},
): ReviewRepository & { schedules: CardSchedule[]; reviews: Review[]; sessions: Session[] } {
  const schedules = [...(seed.schedules ?? [])];
  const reviews = [...(seed.reviews ?? [])];
  const sessions = [...(seed.sessions ?? [])];
  const dueCards = seed.dueCards ?? [];

  return {
    schedules,
    reviews,
    sessions,
    findSchedule: (userId, cardId) => Promise.resolve(schedules.find((s) => s.userId === userId && s.cardId === cardId) ?? null),
    submitReview: (userId, review, newSchedule) => {
      reviews.push(review);
      const index = schedules.findIndex((s) => s.userId === userId && s.cardId === newSchedule.cardId);
      if (index === -1) schedules.push(newSchedule);
      else schedules[index] = newSchedule;
      return Promise.resolve();
    },
    getDueCards: (_userId, dayBoundary, filter) =>
      Promise.resolve(dueCards.filter((c) => c.schedule === null || new Date(c.schedule.due) < dayBoundary).slice(0, filter.limit)),
    getProgress: (_userId, _documentId, _dayBoundary) => Promise.resolve({ mastered: 0, total: 0, nextDueDate: null }),
    getNotionsProgress: (_userId, _documentId) => Promise.resolve([]),
    getCardSchedulesForDocument: (_userId, _documentId) => Promise.resolve([]),
    getCardSchedulesForUser: (_userId) => Promise.resolve([]),
    createSession: (userId, session) => {
      sessions.push({ id: session.id, userId, documentId: session.documentId, startedAt: session.startedAt, endedAt: null });
      return Promise.resolve();
    },
    endSession: (userId, sessionId, endedAt) => {
      const session = sessions.find((s) => s.id === sessionId && s.userId === userId);
      if (!session) return Promise.resolve(false);
      session.endedAt = endedAt;
      return Promise.resolve(true);
    },
  };
}

export function fakeAnswerGrader(
  impl: (input: { question: string; expected: string; given: string }) => Promise<Result<{ correct: boolean; feedback: string; suggestedRating: Rating }, GradeError>> = () =>
    Promise.resolve(ok({ correct: true, feedback: "Bonne réponse.", suggestedRating: 3 })),
): AnswerGrader {
  return { grade: impl };
}

// Minimal local stand-in for generation's CardRepository — not a deep import
// of generation's own internal application/fakes.ts (not part of its
// index.ts's public surface), same reasoning as generation's own
// fakeNotionRepositoryForGeneration. Only findCard is exercised by review's
// grading use case.
export function fakeCardRepositoryForReview(cards: Card[]): CardRepository {
  const notImplemented = (method: string) => () => {
    throw new Error(`fakeCardRepositoryForReview: ${method} is not implemented, review does not call it`);
  };
  return {
    listCards: notImplemented("listCards"),
    findCard: (userId, cardId) => Promise.resolve(cards.find((c) => c.id === cardId && c.userId === userId) ?? null),
    applyCardChanges: notImplemented("applyCardChanges"),
    deleteCard: notImplemented("deleteCard"),
    markStale: notImplemented("markStale"),
  };
}
