export type Deadline = { id: string; documentId: string; userId: string; date: string; label: string | null; createdAt: string };

// Owns only this module's own table (deadlines). Notions and mastery are
// read through content's and review's own public interfaces, never through
// this port (CLAUDE.md).
export interface ProgressRepository {
  getDeadline(userId: string, documentId: string): Promise<Deadline | null>;
  // Upsert keyed by (userId, documentId): "Set or update" (docs/modules/progress.md's API).
  setDeadline(userId: string, deadline: Deadline): Promise<void>;
  deleteDeadline(userId: string, documentId: string): Promise<void>;
}
