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
};

export async function getToday(): Promise<TodayView> {
  const res = await apiFetch(`/api/today?today=${todayDateKey()}&dayBoundary=${encodeURIComponent(startOfTomorrowISO())}`);
  if (!res.ok) throw new Error("Impossible de charger ta journée.");
  return res.json() as Promise<TodayView>;
}
