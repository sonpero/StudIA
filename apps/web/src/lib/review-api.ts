import { apiFetch } from "./api-client.js";
import { startOfTomorrowISO } from "./day-boundary.js";

export type Rating = 1 | 2 | 3 | 4;

export type CardSchedule = {
  cardId: string;
  userId: string;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
};

export type DueCard = {
  cardId: string;
  notionId: string;
  type: "flashcard" | "mcq" | "open";
  state: "active" | "stale";
  question: string;
  answer: string;
  options: string[] | null;
  schedule: CardSchedule | null;
  mastered: boolean;
};

export async function startSession(documentId?: string, notionId?: string): Promise<{ sessionId: string; cards: DueCard[] }> {
  const body: { documentId?: string; notionId?: string; dayBoundary: string } = { dayBoundary: startOfTomorrowISO() };
  if (documentId) body.documentId = documentId;
  if (notionId) body.notionId = notionId;
  const res = await apiFetch("/api/review/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Impossible de démarrer la révision.");
  return res.json() as Promise<{ sessionId: string; cards: DueCard[] }>;
}

export async function submitReview(cardId: string, rating: Rating, elapsedMs: number): Promise<CardSchedule> {
  const res = await apiFetch(`/api/review/cards/${cardId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating, elapsedMs }),
  });
  if (!res.ok) throw new Error("Impossible d'enregistrer ta réponse.");
  return res.json() as Promise<CardSchedule>;
}

export async function abandonSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`/api/review/sessions/${sessionId}/abandon`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de quitter la session.");
}
