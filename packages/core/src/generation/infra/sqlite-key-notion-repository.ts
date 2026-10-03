import { and, asc, count, eq, inArray } from "drizzle-orm";
import { notionsTable } from "../../content/index.js";
import type { KeyNotionRepository } from "../domain/ports.js";
import type { Card, KeyNotion, KeyNotionCardLink } from "../domain/types.js";
import { cardsTable, keyNotionCardsTable, keyNotionSourcesTable, keyNotionsTable } from "./schema.js";
import type { GenerationDb } from "./sqlite-card-repository.js";

// better-sqlite3 runs the transaction synchronously, so a refused write
// throws; turned into a rejection here, like any other failed port call.
function inTransaction(write: () => void): Promise<void> {
  try {
    write();
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export class SqliteKeyNotionRepository implements KeyNotionRepository {
  constructor(private readonly db: GenerationDb) {}

  listKeyNotions(userId: string, documentId: string): Promise<KeyNotion[]> {
    const rows = this.db
      .select()
      .from(keyNotionsTable)
      .where(and(eq(keyNotionsTable.documentId, documentId), eq(keyNotionsTable.userId, userId)))
      .orderBy(asc(keyNotionsTable.position))
      .all();
    if (rows.length === 0) return Promise.resolve([]);

    const sources = this.db
      .select({
        keyNotionId: keyNotionSourcesTable.keyNotionId,
        notionId: keyNotionSourcesTable.notionId,
      })
      .from(keyNotionSourcesTable)
      .innerJoin(notionsTable, eq(notionsTable.id, keyNotionSourcesTable.notionId))
      .where(
        and(
          eq(keyNotionSourcesTable.userId, userId),
          inArray(
            keyNotionSourcesTable.keyNotionId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(notionsTable.position))
      .all();

    return Promise.resolve(
      rows.map((row) => ({
        id: row.id,
        documentId: row.documentId,
        userId: row.userId,
        title: row.title,
        summary: row.summary,
        importance: row.importance,
        isSynthesis: row.isSynthesis,
        section: row.section,
        position: row.position,
        readingNotionIds: sources.filter((source) => source.keyNotionId === row.id).map((source) => source.notionId),
        createdAt: row.createdAt,
      })),
    );
  }

  // The ownership checks run inside the write transaction and throw, which
  // rolls back everything already inserted: a save is all or nothing.
  saveKeyNotions(userId: string, keyNotions: KeyNotion[]): Promise<void> {
    return inTransaction(() =>
      this.db.transaction((tx) => {
        for (const keyNotion of keyNotions) {
          if (keyNotion.userId !== userId) throw new Error(`Key notion ${keyNotion.id} does not belong to user ${userId}`);
          const owned = tx
            .select({ id: notionsTable.id })
            .from(notionsTable)
            .where(
              and(
                eq(notionsTable.userId, userId),
                eq(notionsTable.documentId, keyNotion.documentId),
                inArray(notionsTable.id, keyNotion.readingNotionIds),
              ),
            )
            .all();
          if (keyNotion.readingNotionIds.length === 0 || owned.length !== keyNotion.readingNotionIds.length) {
            throw new Error(`Key notion ${keyNotion.id} covers a reading notion outside document ${keyNotion.documentId}`);
          }

          tx.insert(keyNotionsTable)
            .values({
              id: keyNotion.id,
              documentId: keyNotion.documentId,
              userId,
              title: keyNotion.title,
              summary: keyNotion.summary,
              importance: keyNotion.importance,
              isSynthesis: keyNotion.isSynthesis,
              section: keyNotion.section,
              position: keyNotion.position,
              createdAt: keyNotion.createdAt,
            })
            .run();
          for (const notionId of keyNotion.readingNotionIds) {
            tx.insert(keyNotionSourcesTable).values({ keyNotionId: keyNotion.id, notionId, userId }).run();
          }
        }
      }),
    );
  }

  countCardsForDocument(userId: string, documentId: string): Promise<number> {
    const [row] = this.db
      .select({ total: count() })
      .from(cardsTable)
      .innerJoin(notionsTable, eq(notionsTable.id, cardsTable.notionId))
      .where(and(eq(cardsTable.userId, userId), eq(notionsTable.documentId, documentId)))
      .all();
    return Promise.resolve(row?.total ?? 0);
  }

  saveCourseCards(userId: string, cards: Card[], links: KeyNotionCardLink[]): Promise<void> {
    return inTransaction(() =>
      this.db.transaction((tx) => {
        for (const card of cards) {
          if (card.userId !== userId) throw new Error(`Card ${card.id} does not belong to user ${userId}`);
          const notion = tx
            .select({ id: notionsTable.id })
            .from(notionsTable)
            .where(and(eq(notionsTable.id, card.notionId), eq(notionsTable.userId, userId)))
            .get();
          if (!notion) throw new Error(`Card ${card.id} points to notion ${card.notionId}, not owned by user ${userId}`);
          tx.insert(cardsTable)
            .values({
              id: card.id,
              notionId: card.notionId,
              userId,
              type: card.type,
              state: card.state,
              question: card.question,
              answer: card.answer,
              optionsJson: card.options,
              createdAt: card.createdAt,
            })
            .run();
        }
        for (const link of links) {
          const keyNotion = tx
            .select({ id: keyNotionsTable.id })
            .from(keyNotionsTable)
            .where(and(eq(keyNotionsTable.id, link.keyNotionId), eq(keyNotionsTable.userId, userId)))
            .get();
          if (!keyNotion) throw new Error(`Key notion ${link.keyNotionId} not found for user ${userId}`);
          tx.insert(keyNotionCardsTable)
            .values({
              cardId: link.cardId,
              keyNotionId: link.keyNotionId,
              userId,
            })
            .run();
        }
      }),
    );
  }
}
