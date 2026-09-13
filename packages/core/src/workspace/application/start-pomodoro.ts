import type { IdGenerator } from "../../shared/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import { isPomodoroActive, pomodoroDurationSeconds } from "../domain/pomodoro.js";
import type { TodoRepository } from "../domain/ports.js";
import type { PomodoroSession, PomodoroSessionType } from "../domain/types.js";

export interface StartPomodoroDeps {
  repo: TodoRepository;
  idGenerator: IdGenerator;
}

// todo-on-break (M10 Phase 2, lot 3): a todoId is rejected outright on a
// break, not silently dropped — the same posture todo-not-found already
// takes for a mismatched todoId, rather than a second, differently-behaved
// way of handling bad input. Silently ignoring a caller-supplied todoId
// would hide a bug in whoever sent it instead of surfacing it.
export type StartPomodoroError = { kind: "todo-not-found" } | { kind: "todo-on-break" } | { kind: "already-active"; session: PomodoroSession };

// No new port method for the todoId ownership check: listTodos(userId)
// already reads everything the caller owns in one call, the same
// tolerance docs/modules/workspace.md's own "Assumed limitation" note
// already grants at this app's scale (docs/modules/workspace.md's
// "Pomodoro (M7)" note).
//
// type defaults to "focus": every caller from before M10 Phase 2, lot 3
// (this signature's own third-from-last position keeps every existing call
// site valid unchanged) started exactly this kind of session, and still
// does. Duration is never a parameter here or anywhere upstream — it is
// always pomodoroDurationSeconds(type), which is what makes "the server
// derives duration from type, never from the client" true by construction
// rather than by convention.
export async function startPomodoro(
  deps: StartPomodoroDeps,
  userId: string,
  now: Date,
  todoId: string | null,
  type: PomodoroSessionType = "focus",
): Promise<Result<PomodoroSession, StartPomodoroError>> {
  if (todoId !== null && type !== "focus") return err({ kind: "todo-on-break" });

  if (todoId !== null) {
    const todos = await deps.repo.listTodos(userId);
    if (!todos.some((t) => t.id === todoId)) return err({ kind: "todo-not-found" });
  }

  const existing = await deps.repo.getLatestOpenPomodoroSession(userId);
  if (existing !== null && isPomodoroActive(existing, now)) {
    return err({ kind: "already-active", session: existing });
  }

  const session: PomodoroSession = {
    id: deps.idGenerator.next(),
    userId,
    todoId,
    startedAt: now.toISOString(),
    endedAt: null,
    durationSeconds: pomodoroDurationSeconds(type),
    type,
  };
  await deps.repo.createPomodoroSession(session);
  return ok(session);
}
