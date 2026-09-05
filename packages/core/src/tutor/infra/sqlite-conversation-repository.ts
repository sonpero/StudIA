import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type { ConversationRepository } from "../domain/ports.js";
import type { Conversation, Message } from "../domain/types.js";
import { conversationsTable, messagesTable } from "./schema.js";

export type TutorDb = ReturnType<typeof drizzle>;

function toConversation(row: typeof conversationsTable.$inferSelect): Conversation {
  return {
    id: row.id,
    userId: row.userId,
    documentId: row.documentId,
    title: row.title,
    createdAt: row.createdAt,
  };
}

function toMessage(row: typeof messagesTable.$inferSelect): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    citations: row.citationsJson ?? null,
    partial: row.partial,
    createdAt: row.createdAt,
  };
}

// messages carries no user_id of its own (docs/modules/tutor.md): ownership
// is scoped transitively through its parent conversation, so listMessages
// and appendMessages both check conversation ownership first via
// findConversation, the same repository method findConversation itself
// already uses.
export class SqliteConversationRepository implements ConversationRepository {
  constructor(private readonly db: TutorDb) {}

  createConversation(_userId: string, _documentId: string, conversation: Conversation): Promise<void> {
    this.db
      .insert(conversationsTable)
      .values({
        id: conversation.id,
        userId: conversation.userId,
        documentId: conversation.documentId,
        title: conversation.title,
        createdAt: conversation.createdAt,
      })
      .run();
    return Promise.resolve();
  }

  listConversations(userId: string, documentId: string): Promise<Conversation[]> {
    const rows = this.db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.userId, userId), eq(conversationsTable.documentId, documentId)))
      .orderBy(conversationsTable.createdAt)
      .all();
    return Promise.resolve(rows.map(toConversation));
  }

  findConversation(userId: string, conversationId: string): Promise<Conversation | null> {
    const row = this.db
      .select()
      .from(conversationsTable)
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.userId, userId)))
      .get();
    return Promise.resolve(row ? toConversation(row) : null);
  }

  deleteConversation(userId: string, conversationId: string): Promise<void> {
    this.db
      .delete(conversationsTable)
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.userId, userId)))
      .run();
    return Promise.resolve();
  }

  async listMessages(userId: string, conversationId: string): Promise<Message[]> {
    const owned = await this.findConversation(userId, conversationId);
    if (!owned) return [];

    const rows = this.db.select().from(messagesTable).where(eq(messagesTable.conversationId, conversationId)).orderBy(messagesTable.createdAt).all();
    return rows.map(toMessage);
  }

  async appendMessages(userId: string, conversationId: string, messages: Message[]): Promise<void> {
    const owned = await this.findConversation(userId, conversationId);
    if (!owned) return;

    this.db.transaction((tx) => {
      for (const message of messages) {
        tx.insert(messagesTable)
          .values({
            id: message.id,
            conversationId: message.conversationId,
            role: message.role,
            content: message.content,
            citationsJson: message.citations,
            partial: message.partial,
            createdAt: message.createdAt,
          })
          .run();
      }
    });
  }

  setConversationTitle(userId: string, conversationId: string, title: string): Promise<void> {
    this.db
      .update(conversationsTable)
      .set({ title })
      .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.userId, userId)))
      .run();
    return Promise.resolve();
  }
}
