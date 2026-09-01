import { describe, expect, it } from "vitest";
import { isPomodoroActive } from "./pomodoro.js";
import type { PomodoroSession } from "./types.js";

const STARTED_AT = "2026-03-02T09:00:00.000Z";

function aSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return { id: "p1", userId: "u1", todoId: null, startedAt: STARTED_AT, endedAt: null, durationSeconds: 1500, ...overrides };
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
