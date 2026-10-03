import { apiFetch } from "./api-client.js";
import { startOfTomorrowISO } from "./day-boundary.js";

export type Difficulty = "easy" | "medium" | "hard";

export type Notion = {
  id: string;
  documentId: string;
  userId: string;
  title: string;
  body: string;
  difficulty: Difficulty;
  position: number;
  createdAt: string;
};

export async function listNotions(documentId: string): Promise<Notion[]> {
  const res = await apiFetch(`/api/documents/${documentId}/notions`);
  if (!res.ok) throw new Error("Impossible de charger les notions.");
  return res.json() as Promise<Notion[]>;
}

// The notion-creation step's own status per course (content module, derived
// from its latest split-notions job). A course with no entry has not reached
// that step yet: its extraction status already says what is happening.
export type NotionStepStatus = "pending" | "ready" | "failed";

export async function listNotionStatuses(): Promise<Map<string, NotionStepStatus>> {
  const res = await apiFetch("/api/notions/statuses");
  if (!res.ok) throw new Error("Impossible de charger l'état des notions.");
  const rows = (await res.json()) as { documentId?: unknown; status?: unknown }[];
  const statuses = new Map<string, NotionStepStatus>();
  for (const row of rows) {
    if (typeof row.documentId === "string" && (row.status === "pending" || row.status === "ready" || row.status === "failed")) {
      statuses.set(row.documentId, row.status);
    }
  }
  return statuses;
}

// Relaunches notion creation only — never the extraction (documents-api's
// retryExtraction is that one). A 409 (step no longer failed, or notions
// already there) is not a failure to send: the caller's view is stale and
// only needs refreshing, so it resolves like a success.
export async function retryNotionSplit(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/notions/retry`, { method: "POST" });
  if (!res.ok && res.status !== 409) throw new Error("Impossible de relancer la création des notions.");
}

// M11 (docs/reports/notions-cles-conception.md): one course-level job
// creates every card type at once from the course's key notions — no type
// choice, no body. Both 409s are a stale view, not a failure to send: an
// "in-progress" job is already doing the work, and "has-cards" means the
// course already has its cards (an existing course is never regenerated).
export type CourseCardsRequestOutcome = "started" | "in-progress" | "has-cards";

export async function generateCourseCards(documentId: string): Promise<CourseCardsRequestOutcome> {
  const res = await apiFetch(`/api/documents/${documentId}/cards/generate`, { method: "POST" });
  if (res.ok) return "started";
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (body?.error === "in-progress") return "in-progress";
    if (body?.error === "has-cards") return "has-cards";
  }
  throw new Error("Impossible de lancer la création des fiches.");
}

export type GenerationStatus = { done: number; total: number; failed: number };

export async function getGenerationStatus(documentId: string): Promise<GenerationStatus> {
  const res = await apiFetch(`/api/documents/${documentId}/generation-status`);
  if (!res.ok) throw new Error("Impossible de charger l'état de la création des fiches.");
  return res.json() as Promise<GenerationStatus>;
}

export async function getProgress(documentId: string): Promise<{ mastered: number; total: number; nextDueDate: string | null }> {
  const res = await apiFetch(`/api/documents/${documentId}/progress?dayBoundary=${encodeURIComponent(startOfTomorrowISO())}`);
  if (!res.ok) throw new Error("Impossible de charger la progression.");
  return res.json() as Promise<{ mastered: number; total: number; nextDueDate: string | null }>;
}

// cardsWithEnoughReps/cardsWithEnoughStability each measure one of
// isMastered's two conditions alone (docs/modules/review.md's "Which of the
// two criteria is missing" note) — independent counts, not a partition.
// reps/nextDueDate (M9's own Notions redesign) are composed server-side
// from the notion's own cards (packages/core/src/review's
// getNotionsProgress) — reps is a sum across every active card, nextDueDate
// the earliest upcoming one, same "not yet due" rule as getProgress's own.
export type NotionProgress = {
  notionId: string;
  masteredCards: number;
  totalCards: number;
  cardsWithEnoughReps: number;
  cardsWithEnoughStability: number;
  reps: number;
  nextDueDate: string | null;
  dueNow: boolean;
};

export async function getNotionsProgress(documentId: string): Promise<NotionProgress[]> {
  const res = await apiFetch(`/api/documents/${documentId}/notions-progress?dayBoundary=${encodeURIComponent(startOfTomorrowISO())}`);
  if (!res.ok) throw new Error("Impossible de charger la progression par notion.");
  return res.json() as Promise<NotionProgress[]>;
}
