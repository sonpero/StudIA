import { apiFetch } from "./api-client.js";

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

export async function generateCardsForDocument(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/generate`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de lancer la création des fiches.");
}

export type GenerationStatus = { done: number; total: number; failed: number };

export async function getGenerationStatus(documentId: string): Promise<GenerationStatus> {
  const res = await apiFetch(`/api/documents/${documentId}/generation-status`);
  if (!res.ok) throw new Error("Impossible de charger l'état de la création des fiches.");
  return res.json() as Promise<GenerationStatus>;
}

export async function getProgress(documentId: string): Promise<{ mastered: number; total: number }> {
  const res = await apiFetch(`/api/documents/${documentId}/progress`);
  if (!res.ok) throw new Error("Impossible de charger la progression.");
  return res.json() as Promise<{ mastered: number; total: number }>;
}
