import type { Result } from "../../shared/index.js";
import type { Difficulty, Notion, SplitNotion } from "./types.js";

export type SplitError =
  | { kind: "model-error"; message: string }
  | { kind: "invalid-notion-count"; message: string };

export interface NotionSplitter {
  split(input: { markdown: string; hint?: { subject?: string; level?: string } }): Promise<Result<SplitNotion[], SplitError>>;
}

// Not in docs/modules/content.md's Ports section (only NotionSplitter is
// listed there), but required by its own Use cases list, same reasoning as
// ingestion's DocumentRepository (packages/core/src/ingestion/domain/ports.ts).
// Every method takes userId and filters on it.
export interface NotionRepository {
  // Idempotent write path for handleSplitJob: deletes existing notions for
  // the document first, then inserts the new set in one call.
  replaceNotionsForDocument(userId: string, documentId: string, notions: Notion[]): Promise<void>;
  listNotions(userId: string, documentId: string): Promise<Notion[]>;
  // Added for `progress`'s listProgress (docs/modules/progress.md): every
  // notion the user owns, across every document, in one query — avoids an
  // N+1 read when aggregating progress across every course.
  listNotionsForUser(userId: string): Promise<Notion[]>;
  findNotion(userId: string, notionId: string): Promise<Notion | null>;
  updateNotion(
    userId: string,
    notionId: string,
    patch: { title?: string; body?: string; difficulty?: Difficulty },
  ): Promise<Notion | null>;
  // Full ordered list of ids, already validated as a permutation by
  // validate-reorder.ts.
  reorderNotions(userId: string, documentId: string, positions: { id: string; position: number }[]): Promise<void>;
  // Returns the deleted notion (so the caller can renumber survivors and
  // tell `generation` which notion's cards are now orphaned), or null if
  // the caller does not own it.
  deleteNotion(userId: string, notionId: string): Promise<Notion | null>;
  searchNotions(userId: string, query: string): Promise<Notion[]>;
}
