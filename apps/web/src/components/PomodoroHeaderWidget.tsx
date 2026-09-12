import { useEffect, useRef } from "react";
import { formatCountdown, useActivePomodoro } from "../lib/use-active-pomodoro.js";

// Persistent, cross-screen visibility for an active pomodoro session (lot 1
// of 3 — see CLAUDE.md's session history for lots 2/3, out of scope here):
// always mounted in App.tsx's own header row regardless of which screen is
// showing, so the tab-title effect below keeps running everywhere too, not
// just while this snippet happens to be visible.
//
// Hidden on Aujourd'hui specifically (`hideOnCurrentView`): PomodoroCard
// already shows the same countdown there, under the same "Terminer" control
// — showing both at once would put two elements on screen reachable by the
// same accessible name, exactly the getByRole ambiguity AppNav.tsx's own
// header comment already warns against for a duplicated nav tree.
export function PomodoroHeaderWidget({ hideOnCurrentView }: { hideOnCurrentView: boolean }) {
  const pomodoro = useActivePomodoro();
  // Captured once, from whatever apps/web/index.html's own <title> set
  // before React ever mounted — never a hardcoded "StudIA" string here.
  const originalTitleRef = useRef(document.title);

  useEffect(() => {
    document.title = pomodoro.phase === "running" ? `${formatCountdown(pomodoro.remainingSeconds)} · ${originalTitleRef.current}` : originalTitleRef.current;
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

  if (pomodoro.phase !== "running" || hideOnCurrentView) return null;

  return (
    <span data-testid="pomodoro-header-widget" className="text-sm font-semibold tabular-nums text-primary">
      {formatCountdown(pomodoro.remainingSeconds)}
    </span>
  );
}
