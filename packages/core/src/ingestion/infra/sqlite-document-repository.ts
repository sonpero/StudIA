import { and, count, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { DocumentRepository } from "../domain/ports.js";
import type { Document, Extraction, Page } from "../domain/types.js";
import { documentsTable, extractionsTable, pagesTable } from "./schema.js";

export type IngestionDb = ReturnType<typeof drizzle>;

function toPage(row: typeof pagesTable.$inferSelect): Page {
  return { documentId: row.documentId, index: row.pageIndex, sha256: row.sha256, storedPath: row.storedPath, sizeBytes: row.sizeBytes };
}

export class SqliteDocumentRepository implements DocumentRepository {
  constructor(private readonly db: IngestionDb) {}

  createDocument(document: Document): Promise<void> {
    this.db
      .insert(documentsTable)
      .values({
        id: document.id,
        userId: document.userId,
        title: document.title,
        sourceType: document.sourceType,
        status: document.status,
        colour: document.colour,
        createdAt: document.createdAt,
      })
      .run();
    return Promise.resolve();
  }

  countDocuments(userId: string): Promise<number> {
    const row = this.db.select({ value: count() }).from(documentsTable).where(eq(documentsTable.userId, userId)).get();
    return Promise.resolve(row?.value ?? 0);
  }

  findDocument(userId: string, documentId: string): Promise<Document | null> {
    const row = this.db
      .select()
      .from(documentsTable)
      .where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)))
      .get();
    if (!row) return Promise.resolve(null);

    const pageCountRow = this.db.select({ value: count() }).from(pagesTable).where(eq(pagesTable.documentId, documentId)).get();
    return Promise.resolve({ ...row, pageCount: pageCountRow?.value ?? 0 });
  }

  listDocuments(userId: string): Promise<Document[]> {
    const rows = this.db.select().from(documentsTable).where(eq(documentsTable.userId, userId)).all();
    return Promise.resolve(
      rows.map((row) => {
        const pageCountRow = this.db.select({ value: count() }).from(pagesTable).where(eq(pagesTable.documentId, row.id)).get();
        return { ...row, pageCount: pageCountRow?.value ?? 0 };
      }),
    );
  }

  async addPage(userId: string, page: Page): Promise<void> {
    const owned = await this.findDocument(userId, page.documentId);
    if (!owned) return;
    this.db
      .insert(pagesTable)
      .values({ documentId: page.documentId, pageIndex: page.index, sha256: page.sha256, storedPath: page.storedPath, sizeBytes: page.sizeBytes })
      .run();
  }

  async listPages(userId: string, documentId: string): Promise<Page[]> {
    const owned = await this.findDocument(userId, documentId);
    if (!owned) return [];
    const rows = this.db.select().from(pagesTable).where(eq(pagesTable.documentId, documentId)).orderBy(pagesTable.pageIndex).all();
    return rows.map(toPage);
  }

  async findPageBySha256(userId: string, documentId: string, sha256: string): Promise<Page | null> {
    const owned = await this.findDocument(userId, documentId);
    if (!owned) return null;
    const row = this.db
      .select()
      .from(pagesTable)
      .where(and(eq(pagesTable.documentId, documentId), eq(pagesTable.sha256, sha256)))
      .get();
    return row ? toPage(row) : null;
  }

  async getPage(userId: string, documentId: string, index: number): Promise<Page | null> {
    const owned = await this.findDocument(userId, documentId);
    if (!owned) return null;
    const row = this.db
      .select()
      .from(pagesTable)
      .where(and(eq(pagesTable.documentId, documentId), eq(pagesTable.pageIndex, index)))
      .get();
    return row ? toPage(row) : null;
  }

  async upsertExtraction(userId: string, documentId: string, markdown: string, now: Date): Promise<void> {
    const owned = await this.findDocument(userId, documentId);
    if (!owned) return;
    const nowIso = now.toISOString();
    this.db.transaction((tx) => {
      tx.delete(extractionsTable).where(eq(extractionsTable.documentId, documentId)).run();
      tx.insert(extractionsTable).values({ documentId, markdown, extractedAt: nowIso }).run();
    });
  }

  async getExtraction(userId: string, documentId: string): Promise<Extraction | null> {
    const owned = await this.findDocument(userId, documentId);
    if (!owned) return null;
    const row = this.db.select().from(extractionsTable).where(eq(extractionsTable.documentId, documentId)).get();
    return row ? { documentId: row.documentId, markdown: row.markdown, extractedAt: row.extractedAt } : null;
  }

  async deleteDocument(userId: string, documentId: string): Promise<Page[] | null> {
    const owned = await this.findDocument(userId, documentId);
    if (!owned) return null;
    const pages = await this.listPages(userId, documentId);
    // ON DELETE CASCADE removes pages/extractions rows.
    this.db.delete(documentsTable).where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId))).run();
    return pages;
  }
}
