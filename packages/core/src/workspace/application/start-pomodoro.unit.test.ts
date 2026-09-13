import { describe, expect, it } from "vitest";
import {
  POMODORO_FOCUS_DURATION_SECONDS,
  POMODORO_LONG_BREAK_DURATION_SECONDS,
  POMODORO_SHORT_BREAK_DURATION_SECONDS,
  type PomodoroSession,
  type Todo,
} from "../domain/types.js";
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

// type: "focus" added here (M10 Phase 2, lot 3): PomodoroSession gained a
// required field. Every test below started this application function the
// same way it always did (no type argument) — startPomodoro defaults to
// "focus" (see start-pomodoro.ts), so none of their own calls needed to
// change, only this builder's literal and the two expectations below that
// spell the created session out by hand.
function aSession(overrides: Partial<PomodoroSession> = {}): PomodoroSession {
  return { id: "p0", userId: "u1", todoId: null, startedAt: NOW.toISOString(), endedAt: null, durationSeconds: POMODORO_FOCUS_DURATION_SECONDS, type: "focus", ...overrides };
}

describe("startPomodoro", () => {
  it("creates a session with a fresh id, no todo, started now, not yet ended, the fixed duration", async () => {
    const repo = fakeTodoRepository();
    const idGenerator = fakeIdGenerator(["p1"]);

    const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, null);

    expect(result).toEqual({
      ok: true,
      value: { id: "p1", userId: "u1", todoId: null, startedAt: NOW.toISOString(), endedAt: null, durationSeconds: POMODORO_FOCUS_DURATION_SECONDS, type: "focus" },
    });
    expect(repo.pomodoroSessions).toEqual([
      { id: "p1", userId: "u1", todoId: null, startedAt: NOW.toISOString(), endedAt: null, durationSeconds: POMODORO_FOCUS_DURATION_SECONDS, type: "focus" },
    ]);
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

  // M10 Phase 2, lot 3: the route accepts a type, never a duration
  // (apps/api/src/routes/workspace.ts's startPomodoroBodySchema has no
  // durationSeconds field) — this is the application-layer half of that
  // guarantee: whatever type is asked for, the stored durationSeconds is
  // always domain/pomodoro.ts's own pomodoroDurationSeconds(type), nothing
  // this function's caller could otherwise influence.
  describe("duration derived from type", () => {
    it("defaults to focus (the fixed duration) when no type is given, unchanged from before this lot", async () => {
      const repo = fakeTodoRepository();
      const idGenerator = fakeIdGenerator(["p1"]);

      const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, null);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.type).toBe("focus");
      expect(result.value.durationSeconds).toBe(POMODORO_FOCUS_DURATION_SECONDS);
    });

    it("a shortBreak session gets the short-break duration, not the focus one", async () => {
      const repo = fakeTodoRepository();
      const idGenerator = fakeIdGenerator(["p1"]);

      const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, null, "shortBreak");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.type).toBe("shortBreak");
      expect(result.value.durationSeconds).toBe(POMODORO_SHORT_BREAK_DURATION_SECONDS);
    });

    it("a longBreak session gets the long-break duration", async () => {
      const repo = fakeTodoRepository();
      const idGenerator = fakeIdGenerator(["p1"]);

      const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, null, "longBreak");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.type).toBe("longBreak");
      expect(result.value.durationSeconds).toBe(POMODORO_LONG_BREAK_DURATION_SECONDS);
    });
  });

  // Décision 5: a todoId on a break is rejected, not silently dropped — the
  // same posture "todo-not-found" already takes for a mismatched todoId,
  // rather than a second, differently-behaved way of handling bad input.
  // Silently ignoring it would hide a caller's bug instead of surfacing it.
  describe("a todoId on a non-focus session", () => {
    it("is rejected for a short break, without creating a session", async () => {
      const repo = fakeTodoRepository({ todos: [aTodo({ id: "t1", userId: "u1" })] });
      const idGenerator = fakeIdGenerator(["p1"]);

      const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, "t1", "shortBreak");

      expect(result).toEqual({ ok: false, error: { kind: "todo-on-break" } });
      expect(repo.pomodoroSessions).toEqual([]);
    });

    it("is rejected for a long break, without creating a session", async () => {
      const repo = fakeTodoRepository({ todos: [aTodo({ id: "t1", userId: "u1" })] });
      const idGenerator = fakeIdGenerator(["p1"]);

      const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, "t1", "longBreak");

      expect(result).toEqual({ ok: false, error: { kind: "todo-on-break" } });
      expect(repo.pomodoroSessions).toEqual([]);
    });

    it("is rejected before checking whether the todo even exists — the type/todoId mismatch alone is enough", async () => {
      const repo = fakeTodoRepository();
      const idGenerator = fakeIdGenerator(["p1"]);

      const result = await startPomodoro({ repo, idGenerator }, "u1", NOW, "nonexistent", "shortBreak");

      expect(result).toEqual({ ok: false, error: { kind: "todo-on-break" } });
    });
  });

  // The 409 rule itself (décision 4) is untouched — these are the same
  // scenarios the three "already-active"/"elapsed"/"ended" tests above
  // already cover; a break must refuse to start over a still-active
  // session exactly the same way a focus session does; getLatestOpenPomodoroSession
  // and isPomodoroActive are not type-aware and were not touched for this lot.
  it("refuses to start a break while a focus session is still active — same 409 rule, no type exception", async () => {
    const existing = aSession({ id: "p-active", startedAt: NOW.toISOString() });
    const repo = fakeTodoRepository({ pomodoroSessions: [existing] });
    const idGenerator = fakeIdGenerator(["p2"]);
    const fiveMinutesLater = new Date(NOW.getTime() + 5 * 60_000);

    const result = await startPomodoro({ repo, idGenerator }, "u1", fiveMinutesLater, null, "shortBreak");

    expect(result).toEqual({ ok: false, error: { kind: "already-active", session: existing } });
    expect(repo.pomodoroSessions).toEqual([existing]);
  });
});
