import { apiFetch } from "./api-client.js";
import { startOfTomorrowISO, todayDateKey } from "./day-boundary.js";

export type Todo = {
  id: string;
  label: string;
  dueDate: string | null;
  documentId: string | null;
  done: boolean;
  source: "manual" | "photo";
  createdAt: string;
};

export type TodayView = {
  date: string;
  dueCards: { documentId: string; documentTitle: string; colour: string; count: number }[];
  notionsBelowTarget: { documentId: string; documentTitle: string; colour: string; count: number }[];
  todos: Todo[];
  upcomingDeadlines: { documentId: string; title: string; deadlineDate: string; deadlineLabel: string | null; daysAway: number }[];
  // M9 (docs/UI.md's Aujourd'hui — streak note): consecutive calendar days,
  // ending today or yesterday, with at least one FSRS review. 0 is a
  // legitimate value, read fresh on every load, never stored client-side.
  streak: number;
};

export async function getToday(): Promise<TodayView> {
  const res = await apiFetch(`/api/today?today=${todayDateKey()}&dayBoundary=${encodeURIComponent(startOfTomorrowISO())}`);
  if (!res.ok) throw new Error("Impossible de charger ta journée.");
  return res.json() as Promise<TodayView>;
}

export async function toggleTodo(id: string, done: boolean): Promise<void> {
  const res = await apiFetch(`/api/todos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }) });
  if (!res.ok) throw new Error("Impossible de mettre à jour ce todo.");
}

export async function createTodo(input: { label: string; dueDate: string | null; documentId: string | null }): Promise<Todo> {
  const res = await apiFetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error("Impossible d'ajouter ce todo.");
  return res.json() as Promise<Todo>;
}

export async function deleteTodo(id: string): Promise<void> {
  const res = await apiFetch(`/api/todos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Impossible de supprimer ce todo.");
}
