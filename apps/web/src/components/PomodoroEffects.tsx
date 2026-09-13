import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { endPomodoro } from "../lib/pomodoro-api.js";
import { playChime } from "../lib/pomodoro-chime.js";
import { formatCountdown, pomodoroFinishedLabel, POMODORO_ACTIVE_QUERY_KEY, sessionType, useActivePomodoro } from "../lib/use-active-pomodoro.js";

// M10 Phase 2, lot 2's ÉTAPE 1: the single carrier for every pomodoro side
// effect. PomodoroCard and PomodoroHeaderWidget both call useActivePomodoro
// too, but only to derive what they render — the hook itself is read-only
// (it only exposes click-triggered actions, start/end). Mounted exactly once
// in App.tsx, unconditionally, with no visible render of its own: this is
// what lets the header widget stop needing to stay mounted-while-hidden, and
// is the only thing that keeps the auto-close call from firing once per
// consumer once several are mounted at the same time.
export function PomodoroEffects() {
  const queryClient = useQueryClient();
  const pomodoro = useActivePomodoro();
  // Captured once, from whatever apps/web/index.html's own <title> set
  // before React ever mounted — never a hardcoded "StudIA" string here.
  const originalTitleRef = useRef(document.title);

  useEffect(() => {
    if (pomodoro.phase === "running") {
      document.title = `${formatCountdown(pomodoro.remainingSeconds)} · ${originalTitleRef.current}`;
    } else if (pomodoro.phase === "finished") {
      // docs/UI.md's Aujourd'hui — pomodoro note's own argued reversal: the
      // countdown itself stays colourless and non-escalating right up to
      // zero, but zero itself is now a distinct, named state everywhere,
      // title included. Type-aware since M10 Phase 2, lot 3: a finished
      // break is not "a session".
      document.title = `${pomodoroFinishedLabel(sessionType(pomodoro.session))} · ${originalTitleRef.current}`;
    } else {
      document.title = originalTitleRef.current;
    }
  }, [pomodoro.phase, pomodoro.remainingSeconds]);

  // Belt-and-braces restore on unmount (logout, or the app tearing down):
  // the effect above already restores the title the instant a session ends,
  // but this covers the case where the component itself goes away first.
  useEffect(() => {
    const originalTitle = originalTitleRef.current;
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // The domain's own strict upper bound (packages/core/src/workspace/domain/
  // pomodoro.ts's isPomodoroActive) means the server never closes a session
  // on its own — reaching zero is purely a client-side fact, so closing it
  // is this carrier's job, exactly once. The ref guards against the effect
  // re-running on every unrelated re-render once already closed for this
  // session id (not against StrictMode double-invocation, which this app
  // does not use) — and calls the raw endPomodoro API directly, bypassing
  // the hook's own endMutation, whose onSuccess nulls the cache immediately:
  // that would erase the finished state client-side the instant it appears.
  // Instead, the cache is only cleared here, once the close call itself
  // (idempotent: a 403 not-found reads as already-closed, see
  // pomodoro-api.ts) has actually completed.
  const closedSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (pomodoro.phase !== "finished") return;
    const sessionId = pomodoro.session.id;
    if (closedSessionIdRef.current === sessionId) return;
    closedSessionIdRef.current = sessionId;

    playChime();
    void endPomodoro(sessionId).then(() => {
      queryClient.setQueryData(POMODORO_ACTIVE_QUERY_KEY, null);
    });
  }, [pomodoro.phase, pomodoro.session, queryClient]);

  return null;
}
