import type { IdGenerator } from "../../shared/index.js";
import { err, ok, type Result } from "../../shared/index.js";
import { isPomodoroActive } from "../domain/pomodoro.js";
import type { TodoRepository } from "../domain/ports.js";
import { POMODORO_DURATION_SECONDS, type PomodoroSession } from "../domain/types.js";

export interface StartPomodoroDeps {
  repo: TodoRepository;
  idGenerator: IdGenerator;
}

export type StartPomodoroError = { kind: "todo-not-found" } | { kind: "already-active"; session: PomodoroSession };

// No new port method for the todoId ownership check: listTodos(userId)
// already reads everything the caller owns in one call, the same
// tolerance docs/modules/workspace.md's own "Assumed limitation" note
// already grants at this app's scale (docs/modules/workspace.md's
// "Pomodoro (M7)" note).
export async function startPomodoro(deps: StartPomodoroDeps, userId: string, now: Date, todoId: string | null): Promise<Result<PomodoroSession, StartPomodoroError>> {
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
    durationSeconds: POMODORO_DURATION_SECONDS,
  };
  await deps.repo.createPomodoroSession(session);
  return ok(session);
}
