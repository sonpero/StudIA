import { describe, expect, it } from "vitest";
import { POMODORO_DURATION_SECONDS, type PomodoroSession } from "../domain/types.js";
import { fakeTodoRepository } from "./fakes.js";
import { getActivePomodoro } from "./get-active-pomodoro.js";

const STARTED_AT = "2026-03-02T09:00:00.000Z";

function aSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return { id: "p1", userId: "u1", todoId: null, startedAt: STARTED_AT, endedAt: null, durationSeconds: POMODORO_DURATION_SECONDS, ...overrides };
}

describe("getActivePomodoro", () => {
  it("returns the open session while its window hasn't elapsed", async () => {
    const repo = fakeTodoRepository({ pomodoroSessions: [aSession()] });
    const tenMinutesIn = new Date(new Date(STARTED_AT).getTime() + 10 * 60_000);

    expect(await getActivePomodoro({ repo }, "u1", tenMinutesIn)).toEqual(aSession());
  });

  it("returns null once the open session's window has elapsed, even though it was never explicitly ended", async () => {
    const repo = fakeTodoRepository({ pomodoroSessions: [aSession()] });
    const anHourLater = new Date(new Date(STARTED_AT).getTime() + 60 * 60_000);

    expect(await getActivePomodoro({ repo }, "u1", anHourLater)).toBeNull();
  });

  it("returns null once the session has been explicitly ended, even mid-window", async () => {
    const repo = fakeTodoRepository({ pomodoroSessions: [aSession({ endedAt: STARTED_AT })] });
    const fiveMinutesIn = new Date(new Date(STARTED_AT).getTime() + 5 * 60_000);

    expect(await getActivePomodoro({ repo }, "u1", fiveMinutesIn)).toBeNull();
  });

  it("returns null when the user has never started a session at all", async () => {
    const repo = fakeTodoRepository();

    expect(await getActivePomodoro({ repo }, "u1", new Date(STARTED_AT))).toBeNull();
  });
});
