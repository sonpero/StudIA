import {
  POMODORO_FOCUS_DURATION_SECONDS,
  POMODORO_LONG_BREAK_DURATION_SECONDS,
  POMODORO_SHORT_BREAK_DURATION_SECONDS,
  type PomodoroSession,
  type PomodoroSessionType,
} from "./types.js";

// The one place a `PomodoroSessionType` becomes a number of seconds
// (M10 Phase 2, lot 3). The route accepts a type, never a duration
// (apps/api/src/routes/workspace.ts's own startPomodoroBodySchema has no
// durationSeconds field at all) — this function is what makes that
// enforceable rather than just asked-for: without it, nothing would stop a
// client from posting a three-second or ten-hour pomodoro.
export function pomodoroDurationSeconds(type: PomodoroSessionType): number {
  switch (type) {
    case "focus":
      return POMODORO_FOCUS_DURATION_SECONDS;
    case "shortBreak":
      return POMODORO_SHORT_BREAK_DURATION_SECONDS;
    case "longBreak":
      return POMODORO_LONG_BREAK_DURATION_SECONDS;
  }
}

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
