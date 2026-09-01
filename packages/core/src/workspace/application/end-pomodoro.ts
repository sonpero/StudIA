import { err, ok, type Result } from "../../shared/index.js";
import type { TodoRepository } from "../domain/ports.js";
import type { PomodoroSession } from "../domain/types.js";

export interface EndPomodoroDeps {
  repo: TodoRepository;
}

// Sets endedAt whether the countdown reached zero naturally or the person
// stopped it early — one endedAt, no separate completed/abandoned outcome,
// mirroring review.Session's own single endedAt (docs/modules/workspace.md's
// "Pomodoro (M7)" note).
export async function endPomodoro(deps: EndPomodoroDeps, userId: string, sessionId: string, now: Date): Promise<Result<PomodoroSession, "not-found">> {
  const ended = await deps.repo.endPomodoroSession(userId, sessionId, now.toISOString());
  return ended ? ok(ended) : err("not-found");
}
