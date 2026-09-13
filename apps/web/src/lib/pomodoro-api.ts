import { apiFetch } from "./api-client.js";

// "focus" | "shortBreak" | "longBreak", mirroring packages/core/src/
// workspace/domain/types.ts's own PomodoroSessionType exactly (M10 Phase 2,
// lot 3) — kept as a plain string union here rather than importing the
// domain type across the API boundary, the same arm's-length relationship
// this file's PomodoroSession already has with its own domain counterpart.
export type PomodoroSessionType = "focus" | "shortBreak" | "longBreak";

export type PomodoroSession = {
  id: string;
  userId: string;
  todoId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  type: PomodoroSessionType;
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
// schema is `z.object({ todoId: z.string().optional(), ... })`
// (apps/api/src/routes/workspace.ts), which rejects null. type is always
// sent explicitly, unlike todoId: TodayScreen's own radio group has always
// resolved a concrete choice by the time this is called (defaulting to
// "focus"), so there is no "absent" case to omit, and sending it
// explicitly means this request never depends on an implicit default
// agreeing between client and server.
export async function startPomodoro(todoId: string | null, type: PomodoroSessionType = "focus"): Promise<StartPomodoroResult> {
  const res = await apiFetch("/api/pomodoro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(todoId ? { todoId } : {}), type }),
  });
  if (res.status === 201) return { status: "started", session: (await res.json()) as PomodoroSession };
  if (res.status === 409) return { status: "already-active", session: (await res.json()) as PomodoroSession };
  throw new Error("Impossible de démarrer la séance.");
}

// A 403 here is the route's own domain error (apps/api/src/routes/
// workspace.ts), but that single HTTP status covers two different real
// situations indistinguishably at the domain layer: the repository's own
// endPomodoroSession (packages/core/src/workspace/infra/
// sqlite-todo-repository.ts) filters by `id AND userId` in one query, so a
// session that is genuinely already closed (or never existed) and a session
// id belonging to someone else entirely both come back as the same
// "not-found". Only the first is safe to swallow — a race between the
// effects carrier's auto-close and a manual "Terminer" click, or a retry
// after a dropped response, must never surface an error for a session
// that's already gone — so this checks the route's own tagged body
// (`{error: "not-found"}`), not just the status code: any other 403 (a real
// authorization failure, or any future domain error this route might one
// day map here too) surfaces exactly like a 500 would.
export async function endPomodoro(id: string): Promise<void> {
  const res = await apiFetch(`/api/pomodoro/${id}/end`, { method: "POST" });
  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "not-found") return;
    throw new Error("Impossible de terminer la séance.");
  }
  if (!res.ok) throw new Error("Impossible de terminer la séance.");
}
