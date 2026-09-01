import { apiFetch } from "./api-client.js";
import { todayDateKey } from "./day-boundary.js";

export type CourseProgress = {
  coverage: number;
  readiness: number;
  status: "ahead" | "on-track" | "behind" | "no-deadline" | "deadline-in-past";
  behindByNotions: number;
  recentlyAddedUnreviewed: number;
};

// Named ProgressListItem/listProgress to match packages/core/src/progress
// (docs/modules/progress.md) — a different concept from notions-api.ts's
// getProgress, which is review's own per-document mastery summary. A
// lapsed deadline is progress.status === "deadline-in-past", not a
// separate kind/error branch (revised: computeProgress can't fail, so
// coverage/readiness are always present, even past the deadline).
export type ProgressListItem = { documentId: string; title: string; colour: string; deadlineDate: string | null; deadlineLabel: string | null; progress: CourseProgress };

export async function listProgress(): Promise<ProgressListItem[]> {
  const res = await apiFetch(`/api/course-progress?today=${todayDateKey()}`);
  if (!res.ok) throw new Error("Impossible de charger ta progression.");
  return res.json() as Promise<ProgressListItem[]>;
}

export async function setDeadline(documentId: string, date: string, label?: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/deadline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(label ? { date, label } : { date }),
  });
  if (!res.ok) throw new Error("Impossible d'enregistrer l'échéance.");
}

export async function deleteDeadline(documentId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${documentId}/deadline`, { method: "DELETE" });
  if (!res.ok) throw new Error("Impossible de supprimer l'échéance.");
}
