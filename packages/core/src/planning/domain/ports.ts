import type { Availability } from "./types.js";

export type Deadline = { id: string; documentId: string; userId: string; date: string; label: string | null; createdAt: string };

// Owns only this module's own three tables (deadlines, availability,
// plan_history). Notions and mastery are read through content's and
// review's own public interfaces, never through this port (CLAUDE.md).
export interface PlanningRepository {
  getDeadline(userId: string, documentId: string): Promise<Deadline | null>;
  // Upsert keyed by (userId, documentId): "Set or update" (docs/modules/planning.md's API).
  setDeadline(userId: string, deadline: Deadline): Promise<void>;
  deleteDeadline(userId: string, documentId: string): Promise<void>;
  getAvailability(userId: string): Promise<Availability | null>;
  setAvailability(userId: string, availability: Availability): Promise<void>;
  getHistory(userId: string): Promise<{ date: string; completed: boolean }[]>;
  // Upsert keyed by (userId, date): marking the same day complete twice is a no-op.
  markDayCompleted(userId: string, date: string): Promise<void>;
}
