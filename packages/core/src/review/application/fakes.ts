// In-memory test double for review's own port (CLAUDE.md rule 3).
import type { DueCard } from "../domain/due-card.js";
import type { ReviewRepository, Session } from "../domain/ports.js";
import type { CardSchedule, Review } from "../domain/types.js";

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
    getDueCards: (_userId, now, filter) =>
      Promise.resolve(dueCards.filter((c) => c.schedule === null || new Date(c.schedule.due) <= now).slice(0, filter.limit)),
    getProgress: (_userId, _documentId, _now) => Promise.resolve({ mastered: 0, total: 0, nextDueDate: null }),
    getNotionsProgress: (_userId, _documentId) => Promise.resolve([]),
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
