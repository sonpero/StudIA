import type { PomodoroSession } from "./types.js";

// Pure, never a stored flag (docs/modules/workspace.md's "Pomodoro (M7)"
// note): a session whose planned window has elapsed simply stops being
// reported as active, whether or not the client ever called the end
// route — no cleanup job needed for a tab closed mid-pomodoro. The upper
// bound is strict: reaching startedAt + durationSeconds exactly ends the
// window, it does not still count as the last active instant.
export function isPomodoroActive(session: PomodoroSession, now: Date): boolean {
  if (session.endedAt !== null) return false;
  return now.getTime() - new Date(session.startedAt).getTime() < session.durationSeconds * 1000;
}
