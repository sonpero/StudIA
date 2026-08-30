import { apiFetch } from "./api-client.js";

export type CalendarEntry = {
  kind: "deadline" | "todo";
  id: string;
  title: string;
  documentId: string | null;
  colour: string | null;
  done: boolean | null;
};

export type CalendarDay = {
  date: string;
  entries: CalendarEntry[];
};

export type CalendarView = {
  start: string;
  end: string;
  days: CalendarDay[];
};

export async function getCalendar(start: string, end: string): Promise<CalendarView> {
  const res = await apiFetch(`/api/calendar?start=${start}&end=${end}`);
  if (!res.ok) throw new Error("Impossible de charger le calendrier.");
  return res.json() as Promise<CalendarView>;
}
