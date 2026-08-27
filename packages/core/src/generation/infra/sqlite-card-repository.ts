import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { CardRepository } from "../domain/ports.js";
import type { Card } from "../domain/types.js";
import { cardsTable } from "./schema.js";

export type GenerationDb = ReturnType<typeof drizzle>;

function toCard(row: typeof cardsTable.$inferSelect): Card {
  return {
    id: row.id,
    notionId: row.notionId,
    userId: row.userId,
    type: row.type,
    state: row.state,
    question: row.question,
    answer: row.answer,
    options: row.optionsJson ?? null,
    createdAt: row.createdAt,
  };
}

export class SqliteCardRepository implements CardRepository {
  constructor(private readonly db: GenerationDb) {}

  listCards(userId: string, notionId: string): Promise<Card[]> {
    const rows = this.db
      .select()
      .from(cardsTable)
      .where(and(eq(cardsTable.notionId, notionId), eq(cardsTable.userId, userId)))
      .all();
    return Promise.resolve(rows.map(toCard));
  }

  findCard(userId: string, cardId: string): Promise<Card | null> {
    const row = this.db
      .select()
      .from(cardsTable)
      .where(and(eq(cardsTable.id, cardId), eq(cardsTable.userId, userId)))
      .get();
    return Promise.resolve(row ? toCard(row) : null);
  }

  applyCardChanges(userId: string, notionId: string, upsert: Card[], deleteIds: string[]): Promise<void> {
    this.db.transaction((tx) => {
      for (const id of deleteIds) {
        tx.delete(cardsTable).where(and(eq(cardsTable.id, id), eq(cardsTable.userId, userId))).run();
      }
      for (const card of upsert) {
        tx.insert(cardsTable)
          .values({
            id: card.id,
            notionId: card.notionId,
            userId: card.userId,
            type: card.type,
            state: card.state,
            question: card.question,
            answer: card.answer,
            optionsJson: card.options,
            createdAt: card.createdAt,
          })
          .onConflictDoUpdate({
            target: cardsTable.id,
            set: {
              type: card.type,
              state: card.state,
              question: card.question,
              answer: card.answer,
              optionsJson: card.options,
            },
          })
          .run();
      }
    });
    return Promise.resolve();
  }

  async deleteCard(userId: string, cardId: string): Promise<boolean> {
    const owned = await this.findCard(userId, cardId);
    if (!owned) return false;
    this.db.delete(cardsTable).where(and(eq(cardsTable.id, cardId), eq(cardsTable.userId, userId))).run();
    return true;
  }

  markStale(userId: string, notionId: string): Promise<void> {
    this.db
      .update(cardsTable)
      .set({ state: "stale" })
      .where(and(eq(cardsTable.notionId, notionId), eq(cardsTable.userId, userId), eq(cardsTable.state, "active")))
      .run();
    return Promise.resolve();
  }
}
