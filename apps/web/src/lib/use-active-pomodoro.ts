import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { endPomodoro, getActivePomodoro, startPomodoro, type PomodoroSession, type StartPomodoroResult } from "./pomodoro-api.js";

export const POMODORO_ACTIVE_QUERY_KEY = ["pomodoro-active"];

function remainingSeconds(session: PomodoroSession): number {
  const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  return Math.max(0, session.durationSeconds - elapsed);
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
  const activeQuery = useQuery({ queryKey: POMODORO_ACTIVE_QUERY_KEY, queryFn: getActivePomodoro, staleTime: Infinity, refetchOnWindowFocus: false });
  const session = activeQuery.data ?? null;
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
