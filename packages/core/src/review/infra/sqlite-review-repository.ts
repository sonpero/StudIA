import { and, eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import { cardsTable } from "../../generation/index.js";
import { notionsTable } from "../../content/index.js";
import type { CardType, CardState } from "../../generation/index.js";
import type { DueCard } from "../domain/due-card.js";
import { MASTERY_REPS_THRESHOLD, MASTERY_STABILITY_DAYS_THRESHOLD } from "../domain/mastery.js";
import type { ReviewRepository } from "../domain/ports.js";
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

  getDueCards(userId: string, now: Date, filter: { documentId?: string; limit?: number }): Promise<DueCard[]> {
    const documentFilter = filter.documentId ? sql`AND n.document_id = ${filter.documentId}` : sql``;
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
        AND (s.due IS NULL OR s.due <= ${now.toISOString()})
      ORDER BY (CASE WHEN s.due IS NULL THEN 1 ELSE 0 END), n.position, c.created_at
      ${limitClause}
    `);

    return Promise.resolve(rows.map((row) => toDueCard(userId, row)));
  }

  getProgress(userId: string, documentId: string): Promise<{ mastered: number; total: number }> {
    const rows = this.db.all<{ activeCount: number; masteredActiveCount: number }>(sql`
      SELECT
        COUNT(CASE WHEN c.state = 'active' THEN 1 END) AS activeCount,
        COUNT(CASE WHEN c.state = 'active' AND s.stability >= ${MASTERY_STABILITY_DAYS_THRESHOLD} AND s.reps >= ${MASTERY_REPS_THRESHOLD} THEN 1 END) AS masteredActiveCount
      FROM ${notionsTable} AS n
      LEFT JOIN ${cardsTable} AS c ON c.notion_id = n.id AND c.user_id = n.user_id
      LEFT JOIN card_schedules s ON s.card_id = c.id AND s.user_id = c.user_id
      WHERE n.document_id = ${documentId} AND n.user_id = ${userId}
      GROUP BY n.id
    `);

    const total = rows.length;
    const mastered = rows.filter((row) => row.activeCount > 0 && row.activeCount === row.masteredActiveCount).length;
    return Promise.resolve({ mastered, total });
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
}
