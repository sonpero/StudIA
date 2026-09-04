import { apiFetch } from "./api-client.js";

export type PomodoroSession = {
  id: string;
  userId: string;
  todoId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
};

// Two success shapes, not one: a 409 body is the same PomodoroSession shape
// as a 201, but the caller (PomodoroCard) treats "started" and "resumed
// someone else's already-running session" differently (docs/UI.md's
// Aujourd'hui — pomodoro note: the resync notice only prints for the
// second case).
export type StartPomodoroResult = { status: "started"; session: PomodoroSession } | { status: "already-active"; session: PomodoroSession };

export async function getActivePomodoro(): Promise<PomodoroSession | null> {
  const res = await apiFetch("/api/pomodoro/active");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Impossible de récupérer la séance en cours.");
  return res.json() as Promise<PomodoroSession>;
}

// todoId omitted entirely when absent, never sent as null: the route's own
// schema is `z.object({ todoId: z.string().optional() })`
// (apps/api/src/routes/workspace.ts), which rejects null.
export async function startPomodoro(todoId: string | null): Promise<StartPomodoroResult> {
  const res = await apiFetch("/api/pomodoro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(todoId ? { todoId } : {}),
  });
  if (res.status === 201) return { status: "started", session: (await res.json()) as PomodoroSession };
  if (res.status === 409) return { status: "already-active", session: (await res.json()) as PomodoroSession };
  throw new Error("Impossible de démarrer la séance.");
}

export async function endPomodoro(id: string): Promise<void> {
  const res = await apiFetch(`/api/pomodoro/${id}/end`, { method: "POST" });
  if (!res.ok) throw new Error("Impossible de terminer la séance.");
}
