import { describe, expect, it } from "vitest";
import { isPomodoroActive, pomodoroDurationSeconds } from "./pomodoro.js";
import { POMODORO_FOCUS_DURATION_SECONDS, POMODORO_LONG_BREAK_DURATION_SECONDS, POMODORO_SHORT_BREAK_DURATION_SECONDS, type PomodoroSession } from "./types.js";

const STARTED_AT = "2026-03-02T09:00:00.000Z";

// type: "focus" added here (M10 Phase 2, lot 3): PomodoroSession gained a
// required field, so every existing literal of this shape needs it to keep
// compiling — "focus" preserves exactly what every test below already
// exercised before the field existed, isPomodoroActive itself is untouched.
function aSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return { id: "p1", userId: "u1", todoId: null, startedAt: STARTED_AT, endedAt: null, durationSeconds: 1500, type: "focus", ...overrides };
}

describe("isPomodoroActive", () => {
  it("is true while now is still within startedAt + durationSeconds", () => {
    const now = new Date("2026-03-02T09:10:00.000Z"); // 10 min into a 25 min session
    expect(isPomodoroActive(aSession(), now)).toBe(true);
  });

  it("is false once now reaches startedAt + durationSeconds exactly — the window is a strict upper bound, not inclusive", () => {
    const now = new Date("2026-03-02T09:25:00.000Z"); // exactly 1500s later
    expect(isPomodoroActive(aSession(), now)).toBe(false);
  });

  it("is false once now is past the planned window — an abandoned session, never explicitly ended, still stops being active on its own", () => {
    const now = new Date("2026-03-02T10:00:00.000Z"); // an hour later, endedAt still null
    expect(isPomodoroActive(aSession(), now)).toBe(false);
  });

  it("is false the instant it's explicitly ended, even if its planned window hasn't elapsed yet", () => {
    const now = new Date("2026-03-02T09:05:00.000Z"); // only 5 min in
    expect(isPomodoroActive(aSession({ endedAt: "2026-03-02T09:05:00.000Z" }), now)).toBe(false);
  });

  it("is true one millisecond before the window closes", () => {
    const now = new Date("2026-03-02T09:24:59.999Z");
    expect(isPomodoroActive(aSession(), now)).toBe(true);
  });
});

// M10 Phase 2, lot 3: durationSeconds is captured on the session at
// creation and never re-read from a constant afterward (domain/types.ts's
// own comment on the field) — pomodoroDurationSeconds is the one place that
// maps a session's own `type` to the right constant, called once by
// startPomodoro and never again. Pure and total over the three-value union,
// so a missing case is a compile error, not a runtime one.
describe("pomodoroDurationSeconds", () => {
  it("maps focus to the 25-minute constant", () => {
    expect(pomodoroDurationSeconds("focus")).toBe(POMODORO_FOCUS_DURATION_SECONDS);
  });

  it("maps shortBreak to the short-break constant", () => {
    expect(pomodoroDurationSeconds("shortBreak")).toBe(POMODORO_SHORT_BREAK_DURATION_SECONDS);
  });

  it("maps longBreak to the long-break constant", () => {
    expect(pomodoroDurationSeconds("longBreak")).toBe(POMODORO_LONG_BREAK_DURATION_SECONDS);
  });

  it("the three durations are all different — a real distinction, not three names for the same number", () => {
    const durations = new Set([pomodoroDurationSeconds("focus"), pomodoroDurationSeconds("shortBreak"), pomodoroDurationSeconds("longBreak")]);
    expect(durations.size).toBe(3);
  });
});
