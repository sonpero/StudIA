import { describe, expect, it } from "vitest";
import { POMODORO_DURATION_SECONDS, type PomodoroSession, type Todo } from "../domain/types.js";
import { fakeTodoRepository } from "./fakes.js";
import { startPomodoro } from "./start-pomodoro.js";

const NOW = new Date("2026-03-02T09:00:00.000Z");

function fakeIdGenerator(ids: string[]) {
  let i = 0;
  return { next: () => ids[i++] ?? `id-${i}` };
}

function aTodo(overrides: Partial<Todo> = {}): Todo {
  return { id: "t1", userId: "u1", label: "Devoir", dueDate: null, documentId: null, done: false, source: "manual", createdAt: NOW.toISOString(), ...overrides };
}

function aSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return { id: "p0", userId: "u1", todoId: null, startedAt: NOW.toISOString(), endedAt: null, durationSeconds: POMODORO_DURATION_SECONDS, ...overrides };
}

describe("startPomodoro", () => {
  it("creates a session with a fresh id, no todo, started now, not yet ended, the fixed duration", async () => {
    const repo = fakeTodoRepository();
    const idGenerator = fakeIdGenerator(["p1"]);

    const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, null);

    expect(result).toEqual({ ok: true, value: { id: "p1", userId: "u1", todoId: null, startedAt: NOW.toISOString(), endedAt: null, durationSeconds: POMODORO_DURATION_SECONDS } });
    expect(repo.pomodoroSessions).toEqual([{ id: "p1", userId: "u1", todoId: null, startedAt: NOW.toISOString(), endedAt: null, durationSeconds: POMODORO_DURATION_SECONDS }]);
  });

  it("attaches the given todoId when it belongs to the caller", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo({ id: "t1", userId: "u1" })] });
    const idGenerator = fakeIdGenerator(["p1"]);

    const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, "t1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.todoId).toBe("t1");
  });

  it("rejects a todoId that belongs to another user, without creating a session", async () => {
    const repo = fakeTodoRepository({ todos: [aTodo({ id: "t1", userId: "someone-else" })] });
    const idGenerator = fakeIdGenerator(["p1"]);

    const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, "t1");

    expect(result).toEqual({ ok: false, error: { kind: "todo-not-found" } });
    expect(repo.pomodoroSessions).toEqual([]);
  });

  it("rejects a todoId that does not exist at all, without creating a session", async () => {
    const repo = fakeTodoRepository();
    const idGenerator = fakeIdGenerator(["p1"]);

    const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, "nonexistent");

    expect(result).toEqual({ ok: false, error: { kind: "todo-not-found" } });
    expect(repo.pomodoroSessions).toEqual([]);
  });

  it("refuses to start a second session while one is still active — returns the existing one, creates no new row", async () => {
    const existing = aSession({ id: "p-active", startedAt: NOW.toISOString() });
    const repo = fakeTodoRepository({ pomodoroSessions: [existing] });
    const idGenerator = fakeIdGenerator(["p2"]);
    const fiveMinutesLater = new Date(NOW.getTime() + 5 * 60_000);

    const result = await startPomodoro({ repo, idGenerator }, "u1", fiveMinutesLater, null);

    expect(result).toEqual({ ok: false, error: { kind: "already-active", session: existing } });
    expect(repo.pomodoroSessions).toEqual([existing]);
  });

  it("allows starting a new session once the previous one's window has elapsed, even though it was never explicitly ended", async () => {
    const elapsed = aSession({ id: "p-old", startedAt: NOW.toISOString() });
    const repo = fakeTodoRepository({ pomodoroSessions: [elapsed] });
    const idGenerator = fakeIdGenerator(["p2"]);
    const anHourLater = new Date(NOW.getTime() + 60 * 60_000);

    const result = await startPomodoro({ repo, idGenerator }, "u1", anHourLater, null);

    expect(result.ok).toBe(true);
    expect(repo.pomodoroSessions).toHaveLength(2);
  });

  it("allows starting a new session once the previous one was explicitly ended, even mid-window", async () => {
    const ended = aSession({ id: "p-ended", startedAt: NOW.toISOString(), endedAt: NOW.toISOString() });
    const repo = fakeTodoRepository({ pomodoroSessions: [ended] });
    const idGenerator = fakeIdGenerator(["p2"]);
    const oneMinuteLater = new Date(NOW.getTime() + 60_000);

    const result = await startPomodoro({ repo, idGenerator }, "u1", oneMinuteLater, null);

    expect(result.ok).toBe(true);
    expect(repo.pomodoroSessions).toHaveLength(2);
  });

  it("only checks the caller's own open session, never another user's", async () => {
    const othersSession = aSession({ id: "p-other", userId: "someone-else", startedAt: NOW.toISOString() });
    const repo = fakeTodoRepository({ pomodoroSessions: [othersSession] });
    const idGenerator = fakeIdGenerator(["p1"]);

    const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, null);

    expect(result.ok).toBe(true);
  });
});
