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
// retryExtraction is that one).
export async function retryNotionSplit(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/notions/retry`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de relancer la création des notions.");
}

export type CardType = "flashcard" | "mcq" | "open";

// types is optional: omitting it keeps the server's flashcard-only default
// (docs/modules/generation.md's open question — "user choice in M4").
export async function generateCardsForDocument(documentId: string, types?: CardType[]): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(types ? { types } : {}),
  });
  if (!res.ok) throw new Error("Impossible de lancer la création des fiches.");
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
