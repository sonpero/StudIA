import { describe, expect, it } from "vitest";
import { POMODORO_DURATION_SECONDS, type PomodoroSession } from "../domain/types.js";
import { endPomodoro } from "./end-pomodoro.js";
import { fakeTodoRepository } from "./fakes.js";

const STARTED_AT = "2026-03-02T09:00:00.000Z";
const NOW = new Date("2026-03-02T09:10:00.000Z");

function aSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return { id: "p1", userId: "u1", todoId: null, startedAt: STARTED_AT, endedAt: null, durationSeconds: POMODORO_DURATION_SECONDS, ...overrides };
}

describe("endPomodoro", () => {
  it("sets endedAt on the caller's own session and returns it", async () => {
    const repo = fakeTodoRepository({ pomodoroSessions: [aSession()] });

    const result = await endPomodoro({ repo }, "u1", "p1", NOW);

    expect(result).toEqual({ ok: true, value: { id: "p1", userId: "u1", todoId: null, startedAt: STARTED_AT, endedAt: NOW.toISOString(), durationSeconds: POMODORO_DURATION_SECONDS } });
    expect(repo.pomodoroSessions[0]!.endedAt).toBe(NOW.toISOString());
  });

  it("ends a session before its window has elapsed just as well as after — no distinct 'completed vs abandoned' outcome", async () => {
    const repo = fakeTodoRepository({ pomodoroSessions: [aSession()] });
    const fiveMinutesIn = new Date(new Date(STARTED_AT).getTime() + 5 * 60_000);

    const result = await endPomodoro({ repo }, "u1", "p1", fiveMinutesIn);

    expect(result.ok).toBe(true);
  });

  it("returns 'not-found' for a session id that doesn't exist", async () => {
    const repo = fakeTodoRepository();

    const result = await endPomodoro({ repo }, "u1", "nonexistent", NOW);

    expect(result).toEqual({ ok: false, error: "not-found" });
  });

  it("returns 'not-found' for another user's session, without ending it", async () => {
    const repo = fakeTodoRepository({ pomodoroSessions: [aSession({ userId: "someone-else" })] });

    const result = await endPomodoro({ repo }, "u1", "p1", NOW);

    expect(result).toEqual({ ok: false, error: "not-found" });
    expect(repo.pomodoroSessions[0]!.endedAt).toBeNull();
  });
});
