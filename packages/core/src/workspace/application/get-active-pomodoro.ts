import { isPomodoroActive } from "../domain/pomodoro.js";
import type { TodoRepository } from "../domain/ports.js";
import type { PomodoroSession } from "../domain/types.js";

export interface GetActivePomodoroDeps {
  repo: TodoRepository;
}

// Backs the reload-resume route. Never writes anything.
export async function getActivePomodoro(deps: GetActivePomodoroDeps, userId: string, now: Date): Promise<PomodoroSession | null> {
  const session = await deps.repo.getLatestOpenPomodoroSession(userId);
  if (session === null) return null;
  return isPomodoroActive(session, now) ? session : null;
}
