import { apiFetch } from "./api-client.js";
import { todayDateKey } from "./day-boundary.js";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type Availability = Record<Weekday, number>;

export type PlanEntry = { kind: "learn" | "review"; notionId: string; estimatedMinutes: number };
export type PlanDay = { date: string; entries: PlanEntry[]; estimatedMinutes: number };
export type Plan = { days: PlanDay[]; feasible: boolean; shortfallMinutes: number };

export type ProgressInputErrorKind = "deadline-in-past" | "no-capacity" | "no-usable-day";

// The server returns 422 for a malformed request (no availability set yet,
// a deadline that can never be reached) and 200 for a legitimate plan that
// simply doesn't fit (feasible: false) — distinct cases, per
// docs/modules/progress.md. Modeled as a discriminated result rather than a
// thrown error, so React Query's error state stays reserved for genuine
// network/server failures.
export type PlanResult = { kind: "ok"; plan: Plan } | { kind: "input-error"; error: ProgressInputErrorKind };

export async function getPlanForDocument(documentId: string): Promise<PlanResult> {
  const res = await apiFetch(`/api/documents/${documentId}/plan?today=${todayDateKey()}`);
  if (res.status === 422) {
    const body = (await res.json()) as { error: ProgressInputErrorKind };
    return { kind: "input-error", error: body.error };
  }
  if (!res.ok) throw new Error("Impossible de charger le plan.");
  return { kind: "ok", plan: (await res.json()) as Plan };
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

export async function setAvailability(availability: Availability): Promise<void> {
  const res = await apiFetch("/api/availability", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(availability),
  });
  if (!res.ok) throw new Error("Impossible d'enregistrer tes disponibilités.");
}

export async function markDayCompleted(date: string): Promise<void> {
  const res = await apiFetch(`/api/plan/days/${date}/complete`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible d'enregistrer ce jour comme fait.");
}

export type TodayEntry = PlanEntry & { documentId: string };

export async function getToday(): Promise<TodayEntry[]> {
  const res = await apiFetch(`/api/plan/today?today=${todayDateKey()}`);
  if (!res.ok) throw new Error("Impossible de charger les tâches du jour.");
  return res.json() as Promise<TodayEntry[]>;
}
