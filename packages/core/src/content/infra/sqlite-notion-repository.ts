import { and, eq, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { NotionRepository } from "../domain/ports.js";
import type { Notion } from "../domain/types.js";
import { notionsTable } from "./schema.js";

export type ContentDb = ReturnType<typeof drizzle>;

function toNotion(row: typeof notionsTable.$inferSelect): Notion {
  return {
    id: row.id,
    documentId: row.documentId,
    userId: row.userId,
    title: row.title,
    body: row.body,
    difficulty: row.difficulty,
    position: row.position,
    createdAt: row.createdAt,
  };
}

// notions_fts is kept in sync by triggers on the notions table itself
// (apps/api/drizzle/0003_cheerful_joseph.sql, docs/modules/content.md), so
// every write below just writes `notions` — never notions_fts directly.
export class SqliteNotionRepository implements NotionRepository {
  constructor(private readonly db: ContentDb) {}

  replaceNotionsForDocument(userId: string, documentId: string, notions: Notion[]): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(notionsTable).where(and(eq(notionsTable.documentId, documentId), eq(notionsTable.userId, userId))).run();
      for (const notion of notions) {
        tx.insert(notionsTable)
          .values({
            id: notion.id,
            documentId: notion.documentId,
            userId: notion.userId,
            title: notion.title,
            body: notion.body,
            difficulty: notion.difficulty,
            position: notion.position,
            createdAt: notion.createdAt,
          })
          .run();
      }
    });
    return Promise.resolve();
  }

  listNotions(userId: string, documentId: string): Promise<Notion[]> {
    const rows = this.db
      .select()
      .from(notionsTable)
      .where(and(eq(notionsTable.documentId, documentId), eq(notionsTable.userId, userId)))
      .orderBy(notionsTable.position)
      .all();
    return Promise.resolve(rows.map(toNotion));
  }

  findNotion(userId: string, notionId: string): Promise<Notion | null> {
    const row = this.db
      .select()
      .from(notionsTable)
      .where(and(eq(notionsTable.id, notionId), eq(notionsTable.userId, userId)))
      .get();
    return Promise.resolve(row ? toNotion(row) : null);
  }

  async updateNotion(
    userId: string,
    notionId: string,
    patch: { title?: string; body?: string; difficulty?: Notion["difficulty"] },
  ): Promise<Notion | null> {
    const owned = await this.findNotion(userId, notionId);
    if (!owned) return null;

    this.db.update(notionsTable).set(patch).where(and(eq(notionsTable.id, notionId), eq(notionsTable.userId, userId))).run();
    return this.findNotion(userId, notionId);
  }

  reorderNotions(userId: string, documentId: string, positions: { id: string; position: number }[]): Promise<void> {
    // Shift into a negative range first, then back to the target positions:
    // writing target positions directly, row by row, would trip
    // UNIQUE(document_id, position) mid-update on a full reversal
    // (docs/modules/content.md).
    this.db.transaction((tx) => {
      for (const { id } of positions) {
        tx.update(notionsTable)
          .set({ position: sql`-1 - ${notionsTable.position}` })
          .where(and(eq(notionsTable.id, id), eq(notionsTable.userId, userId), eq(notionsTable.documentId, documentId)))
          .run();
      }
      for (const { id, position } of positions) {
        tx.update(notionsTable)
          .set({ position })
          .where(and(eq(notionsTable.id, id), eq(notionsTable.userId, userId), eq(notionsTable.documentId, documentId)))
          .run();
      }
    });
    return Promise.resolve();
  }

  async deleteNotion(userId: string, notionId: string): Promise<Notion | null> {
    const owned = await this.findNotion(userId, notionId);
    if (!owned) return null;

    this.db.delete(notionsTable).where(and(eq(notionsTable.id, notionId), eq(notionsTable.userId, userId))).run();
    return owned;
  }

  searchNotions(userId: string, query: string): Promise<Notion[]> {
    const trimmed = query.trim();
    if (trimmed === "") return Promise.resolve([]);

    // notions_fts is a virtual table with no drizzle-orm representation
    // (schema.ts, apps/api/drizzle/0003_cheerful_joseph.sql): raw SQL is the
    // only way to issue a MATCH query and join back to the owning row.
    // Columns are aliased to camelCase explicitly: unlike the query builder,
    // a raw `sql` result is NOT run through drizzle's column-name mapping,
    // so `document_id` would otherwise come back as `document_id`, not
    // `documentId`.
    const rows = this.db.all<Notion>(sql`
      SELECT n.id, n.document_id AS documentId, n.user_id AS userId, n.title, n.body,
             n.difficulty, n.position, n.created_at AS createdAt
      FROM notions n
      JOIN notions_fts f ON f.rowid = n.rowid
      WHERE notions_fts MATCH ${trimmed} AND n.user_id = ${userId}
      ORDER BY n.document_id, n.position
    `);
    return Promise.resolve(rows);
  }
}
