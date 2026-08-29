import { and, eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import { cardsTable } from "../../generation/index.js";
import { notionsTable } from "../../content/index.js";
import type { CardType, CardState } from "../../generation/index.js";
import type { DueCard } from "../domain/due-card.js";
import { MASTERY_REPS_THRESHOLD, MASTERY_STABILITY_DAYS_THRESHOLD } from "../domain/mastery.js";
import type { NotionProgress, ReviewRepository } from "../domain/ports.js";
import type { CardSchedule, Review } from "../domain/types.js";
import { cardSchedulesTable, reviewsTable, sessionsTable } from "./schema.js";

export type ReviewDb = ReturnType<typeof drizzle>;

function toSchedule(row: typeof cardSchedulesTable.$inferSelect): CardSchedule {
  return {
    cardId: row.cardId,
    userId: row.userId,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    lastReviewedAt: row.lastReviewedAt,
  };
}

type DueCardRow = {
  cardId: string;
  notionId: string;
  type: CardType;
  state: CardState;
  question: string;
  answer: string;
  optionsJson: string | null;
  scheduleDue: string | null;
  scheduleStability: number | null;
  scheduleDifficulty: number | null;
  scheduleReps: number | null;
  scheduleLapses: number | null;
  scheduleLastReviewedAt: string | null;
};

function toDueCard(userId: string, row: DueCardRow): DueCard {
  return {
    cardId: row.cardId,
    notionId: row.notionId,
    type: row.type,
    state: row.state,
    question: row.question,
    answer: row.answer,
    options: row.optionsJson ? (JSON.parse(row.optionsJson) as string[]) : null,
    schedule:
      row.scheduleDue === null
        ? null
        : {
            cardId: row.cardId,
            userId,
            due: row.scheduleDue,
            stability: row.scheduleStability!,
            difficulty: row.scheduleDifficulty!,
            reps: row.scheduleReps!,
            lapses: row.scheduleLapses!,
            lastReviewedAt: row.scheduleLastReviewedAt,
          },
  };
}

// getDueCards and getProgress read generation's cards and content's notions
// (via their exported schema tables, not a deep import — see domain/ports.ts)
// to order by notion position and to determine mastery, deliberately not
// duplicating those modules' own repository logic.
export class SqliteReviewRepository implements ReviewRepository {
  constructor(private readonly db: ReviewDb) {}

  findSchedule(userId: string, cardId: string): Promise<CardSchedule | null> {
    const row = this.db
      .select()
      .from(cardSchedulesTable)
      .where(and(eq(cardSchedulesTable.cardId, cardId), eq(cardSchedulesTable.userId, userId)))
      .get();
    return Promise.resolve(row ? toSchedule(row) : null);
  }

  submitReview(userId: string, review: Review, newSchedule: CardSchedule): Promise<void> {
    this.db.transaction((tx) => {
      tx.insert(reviewsTable)
        .values({
          id: review.id,
          cardId: review.cardId,
          userId: review.userId,
          rating: review.rating,
          reviewedAt: review.reviewedAt,
          elapsedMs: review.elapsedMs,
        })
        .run();

      tx.insert(cardSchedulesTable)
        .values({
          cardId: newSchedule.cardId,
          userId: newSchedule.userId,
          due: newSchedule.due,
          stability: newSchedule.stability,
          difficulty: newSchedule.difficulty,
          reps: newSchedule.reps,
          lapses: newSchedule.lapses,
          lastReviewedAt: newSchedule.lastReviewedAt,
        })
        .onConflictDoUpdate({
          target: cardSchedulesTable.cardId,
          set: {
            due: newSchedule.due,
            stability: newSchedule.stability,
            difficulty: newSchedule.difficulty,
            reps: newSchedule.reps,
            lapses: newSchedule.lapses,
            lastReviewedAt: newSchedule.lastReviewedAt,
          },
        })
        .run();
    });
    return Promise.resolve();
  }

  // Dueness is a calendar-day threshold, not an instant (product decision):
  // a card due anywhere before dayBoundary — including later "today" — is
  // due now. dayBoundary is the client's local "start of tomorrow", passed
  // in as an ISO instant; this method never computes "today" itself. Unlike
  // submitReview's `now`, this has nothing to do with FSRS scheduling.
  getDueCards(userId: string, dayBoundary: Date, filter: { documentId?: string; notionId?: string; limit?: number }): Promise<DueCard[]> {
    const documentFilter = filter.documentId ? sql`AND n.document_id = ${filter.documentId}` : sql``;
    const notionFilter = filter.notionId ? sql`AND c.notion_id = ${filter.notionId}` : sql``;
    const limitClause = filter.limit !== undefined ? sql`LIMIT ${filter.limit}` : sql``;

    const rows = this.db.all<DueCardRow>(sql`
      SELECT c.id AS cardId, c.notion_id AS notionId, c.type, c.state, c.question, c.answer,
             c.options_json AS optionsJson,
             s.due AS scheduleDue, s.stability AS scheduleStability, s.difficulty AS scheduleDifficulty,
             s.reps AS scheduleReps, s.lapses AS scheduleLapses, s.last_reviewed_at AS scheduleLastReviewedAt
      FROM ${cardsTable} AS c
      JOIN ${notionsTable} AS n ON n.id = c.notion_id AND n.user_id = c.user_id
      LEFT JOIN card_schedules s ON s.card_id = c.id AND s.user_id = c.user_id
      WHERE c.user_id = ${userId}
        ${documentFilter}
        ${notionFilter}
        AND (s.due IS NULL OR s.due < ${dayBoundary.toISOString()})
      ORDER BY (CASE WHEN s.due IS NULL THEN 1 ELSE 0 END), n.position, c.created_at
      ${limitClause}
    `);

    return Promise.resolve(rows.map((row) => toDueCard(userId, row)));
  }

  // Shared by getProgress (aggregated to notion-level mastery) and
  // getNotionsProgress (returned per notion): one join, one threshold.
  private getNotionCardCounts(userId: string, documentId: string): { notionId: string; activeCount: number; masteredActiveCount: number }[] {
    return this.db.all<{ notionId: string; activeCount: number; masteredActiveCount: number }>(sql`
      SELECT n.id AS notionId,
        COUNT(CASE WHEN c.state = 'active' THEN 1 END) AS activeCount,
        COUNT(CASE WHEN c.state = 'active' AND s.stability >= ${MASTERY_STABILITY_DAYS_THRESHOLD} AND s.reps >= ${MASTERY_REPS_THRESHOLD} THEN 1 END) AS masteredActiveCount
      FROM ${notionsTable} AS n
      LEFT JOIN ${cardsTable} AS c ON c.notion_id = n.id AND c.user_id = n.user_id
      LEFT JOIN card_schedules s ON s.card_id = c.id AND s.user_id = c.user_id
      WHERE n.document_id = ${documentId} AND n.user_id = ${userId}
      GROUP BY n.id
    `);
  }

  getProgress(userId: string, documentId: string, dayBoundary: Date): Promise<{ mastered: number; total: number; nextDueDate: string | null }> {
    const rows = this.getNotionCardCounts(userId, documentId);
    const total = rows.length;
    const mastered = rows.filter((row) => row.activeCount > 0 && row.activeCount === row.masteredActiveCount).length;

    // nextDueDate only looks at "tomorrow or later" (>= dayBoundary): a card
    // due later today is already due now (getDueCards), not upcoming.
    const nextDueRow = this.db.get<{ nextDueDate: string | null }>(sql`
      SELECT MIN(s.due) AS nextDueDate
      FROM ${notionsTable} AS n
      JOIN ${cardsTable} AS c ON c.notion_id = n.id AND c.user_id = n.user_id
      JOIN card_schedules s ON s.card_id = c.id AND s.user_id = c.user_id
      WHERE n.document_id = ${documentId} AND n.user_id = ${userId}
        AND c.state = 'active'
        AND s.due >= ${dayBoundary.toISOString()}
    `);

    return Promise.resolve({ mastered, total, nextDueDate: nextDueRow?.nextDueDate ?? null });
  }

  getNotionsProgress(userId: string, documentId: string): Promise<NotionProgress[]> {
    const rows = this.getNotionCardCounts(userId, documentId);
    return Promise.resolve(rows.map((row) => ({ notionId: row.notionId, masteredCards: row.masteredActiveCount, totalCards: row.activeCount })));
  }

  createSession(userId: string, session: { id: string; documentId: string | null; startedAt: string }): Promise<void> {
    this.db
      .insert(sessionsTable)
      .values({ id: session.id, userId, documentId: session.documentId, startedAt: session.startedAt, endedAt: null })
      .run();
    return Promise.resolve();
  }

  endSession(userId: string, sessionId: string, endedAt: string): Promise<boolean> {
    const owned = this.db
      .select()
      .from(sessionsTable)
      .where(and(eq(sessionsTable.id, sessionId), eq(sessionsTable.userId, userId)))
      .get();
    if (!owned) return Promise.resolve(false);

    this.db.update(sessionsTable).set({ endedAt }).where(eq(sessionsTable.id, sessionId)).run();
    return Promise.resolve(true);
  }

  // `c.state = 'active'` matches getNotionCardCounts's own filter exactly —
  // divergent predicates would give the two callers different active-card
  // counts for the same notion. scheduleCardId (the join's key column, the
  // primary key of card_schedules) is the null sentinel, not an arbitrary
  // payload column like `due`: a payload column could in principle be null
  // on a real row without meaning "no row", the join key cannot.
  getCardSchedulesForDocument(userId: string, documentId: string): Promise<{ notionId: string; cardId: string; schedule: CardSchedule | null }[]> {
    const rows = this.db.all<{
      notionId: string;
      cardId: string;
      scheduleCardId: string | null;
      due: string | null;
      stability: number | null;
      difficulty: number | null;
      reps: number | null;
      lapses: number | null;
      lastReviewedAt: string | null;
    }>(sql`
      SELECT n.id AS notionId, c.id AS cardId, s.card_id AS scheduleCardId,
        s.due AS due, s.stability AS stability, s.difficulty AS difficulty,
        s.reps AS reps, s.lapses AS lapses, s.last_reviewed_at AS lastReviewedAt
      FROM ${notionsTable} AS n
      JOIN ${cardsTable} AS c ON c.notion_id = n.id AND c.user_id = n.user_id
      LEFT JOIN card_schedules s ON s.card_id = c.id AND s.user_id = c.user_id
      WHERE n.document_id = ${documentId} AND n.user_id = ${userId} AND c.state = 'active'
    `);

    return Promise.resolve(
      rows.map((row) => ({
        notionId: row.notionId,
        cardId: row.cardId,
        schedule:
          row.scheduleCardId === null
            ? null
            : {
                cardId: row.cardId,
                userId,
                due: row.due!,
                stability: row.stability!,
                difficulty: row.difficulty!,
                reps: row.reps!,
                lapses: row.lapses!,
                lastReviewedAt: row.lastReviewedAt,
              },
      })),
    );
  }

  // Batched counterpart to getCardSchedulesForDocument — same shape, same
  // null-sentinel, same 'active' filter, minus the document_id filter,
  // plus documentId per row (docs/modules/progress.md's listProgress).
  getCardSchedulesForUser(userId: string): Promise<{ documentId: string; notionId: string; cardId: string; schedule: CardSchedule | null }[]> {
    const rows = this.db.all<{
      documentId: string;
      notionId: string;
      cardId: string;
      scheduleCardId: string | null;
      due: string | null;
      stability: number | null;
      difficulty: number | null;
      reps: number | null;
      lapses: number | null;
      lastReviewedAt: string | null;
    }>(sql`
      SELECT n.document_id AS documentId, n.id AS notionId, c.id AS cardId, s.card_id AS scheduleCardId,
        s.due AS due, s.stability AS stability, s.difficulty AS difficulty,
        s.reps AS reps, s.lapses AS lapses, s.last_reviewed_at AS lastReviewedAt
      FROM ${notionsTable} AS n
      JOIN ${cardsTable} AS c ON c.notion_id = n.id AND c.user_id = n.user_id
      LEFT JOIN card_schedules s ON s.card_id = c.id AND s.user_id = c.user_id
      WHERE n.user_id = ${userId} AND c.state = 'active'
    `);

    return Promise.resolve(
      rows.map((row) => ({
        documentId: row.documentId,
        notionId: row.notionId,
        cardId: row.cardId,
        schedule:
          row.scheduleCardId === null
            ? null
            : {
                cardId: row.cardId,
                userId,
                due: row.due!,
                stability: row.stability!,
                difficulty: row.difficulty!,
                reps: row.reps!,
                lapses: row.lapses!,
                lastReviewedAt: row.lastReviewedAt,
              },
      })),
    );
  }
}
