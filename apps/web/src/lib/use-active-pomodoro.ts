import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { endPomodoro, getActivePomodoro, startPomodoro, type PomodoroSession, type StartPomodoroResult } from "./pomodoro-api.js";

export const POMODORO_ACTIVE_QUERY_KEY = ["pomodoro-active"];

function remainingSeconds(session: PomodoroSession): number {
  const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  return Math.max(0, session.durationSeconds - elapsed);
}

// A cache entry this hook cannot safely compute a countdown from must read
// as "no session", never as "running" with a garbage remainingSeconds
// (NaN:NaN, once formatted) — a production guard, not merely a test-fixture
// concern: `getActivePomodoro`'s own `res.json() as Promise<PomodoroSession>`
// is a type assertion, not real validation, so nothing upstream stops a
// malformed payload from reaching this hook. This also happens to make
// every test fetch stub that answers an unlisted route (`/api/pomodoro/
// active` included) with a bare `[]`/200 — truthy, but not a usable session
// — harmless without having to fix each one individually.
function isUsableSession(session: PomodoroSession): boolean {
  return Number.isFinite(new Date(session.startedAt).getTime()) && Number.isFinite(session.durationSeconds);
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

type PomodoroActions = {
  start: () => Promise<StartPomodoroResult>;
  end: () => Promise<void>;
  starting: boolean;
  ending: boolean;
};

export type UseActivePomodoroResult = PomodoroActions &
  ({ phase: "idle"; session: null; remainingSeconds: null } | { phase: "running"; session: PomodoroSession; remainingSeconds: number });

// The server is already the source of truth for a session (startedAt +
// durationSeconds) — phase and remainingSeconds are derived straight from
// the cached session on every render, never buffered in a parallel
// useState, so any number of simultaneous consumers (PomodoroCard, the
// persistent header widget) read the exact same value and can never
// diverge. Both mutations write the session they get back straight into
// POMODORO_ACTIVE_QUERY_KEY themselves: the query's own staleTime: Infinity
// means nothing else ever refetches it in the background, so this hook is
// the only thing that changes the cache after the very first load. This
// also makes the old initializedRef guard (PomodoroCard's previous
// implementation) dead code, not ported here: that ref existed only to stop
// a later query resolution from overwriting locally-tracked state with
// stale data, a problem that cannot happen any more once the cache itself
// is the only state and the mutations keep it current.
export function useActivePomodoro(): UseActivePomodoroResult {
  const queryClient = useQueryClient();
  // staleTime: Infinity + refetchOnWindowFocus: false carry real behaviour,
  // not a performance tweak: they are what replaces the old initializedRef
  // guard (PomodoroCard's previous implementation, dead code now, not
  // ported here). That guard existed only to stop a later background
  // refetch from overwriting a locally-tracked "running" state with data
  // that had gone stale in the meantime; here there is no local state left
  // to overwrite (phase/session are derived straight from this query's own
  // cache below), so the risk moves instead to the cache itself — a
  // background refetch is the only thing that could still replace a
  // correct, mutation-written session with something older or wrong.
  // Marking this query as never-stale and never-refetch-on-focus removes
  // that path entirely: the cache changes only when this hook's own
  // mutations write to it (below), which is also what makes several
  // simultaneous consumers (PomodoroCard, the header widget) guaranteed to
  // agree — nothing else is racing to overwrite what they both read.
  const activeQuery = useQuery({ queryKey: POMODORO_ACTIVE_QUERY_KEY, queryFn: getActivePomodoro, staleTime: Infinity, refetchOnWindowFocus: false });
  const rawSession = activeQuery.data ?? null;
  const session = rawSession && isUsableSession(rawSession) ? rawSession : null;
  const phase: "idle" | "running" = session ? "running" : "idle";

  // One interval per mounted hook instance, ticking only while that
  // instance's own session is running — not a per-consumer reimplementation
  // of the countdown (docs/TESTING.md's one named exception to "no clock in
  // tests/no implicit timers": a real interval, here, is the point).
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (phase !== "running") return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  const startMutation = useMutation({
    mutationFn: () => startPomodoro(null),
    onSuccess: (result) => queryClient.setQueryData(POMODORO_ACTIVE_QUERY_KEY, result.session),
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => endPomodoro(id),
    onSuccess: () => queryClient.setQueryData(POMODORO_ACTIVE_QUERY_KEY, null),
  });

  const active = session
    ? { phase: "running" as const, session, remainingSeconds: remainingSeconds(session) }
    : { phase: "idle" as const, session: null, remainingSeconds: null };

  return {
    ...active,
    start: () => startMutation.mutateAsync(),
    end: () => (session ? endMutation.mutateAsync(session.id) : Promise.resolve()),
    starting: startMutation.isPending,
    ending: endMutation.isPending,
  };
}
