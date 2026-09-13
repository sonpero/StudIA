import { formatCountdown, useActivePomodoro } from "../lib/use-active-pomodoro.js";

// Persistent, cross-screen visibility for an active pomodoro session (lot 1
// of 3 — see CLAUDE.md's session history): always mounted in App.tsx's own
// header row regardless of which screen is showing.
//
// Purely a read-only view onto useActivePomodoro since M10 Phase 2, lot 2:
// the tab-title effect this component used to own now lives in
// PomodoroEffects (mounted once, unconditionally, in App.tsx), which is also
// what owns the zero-arrival close call and chime — this widget renders and
// nothing else, so it no longer needs the "stay mounted so the effect keeps
// running while hidden" contortion lot 1 required.
//
// Hidden on Aujourd'hui specifically (`hideOnCurrentView`): PomodoroCard
// already shows the same countdown there, under the same "Terminer" control
// — showing both at once would put two elements on screen reachable by the
// same accessible name, exactly the getByRole ambiguity AppNav.tsx's own
// header comment already warns against for a duplicated nav tree.
export function PomodoroHeaderWidget({ hideOnCurrentView }: { hideOnCurrentView: boolean }) {
  const pomodoro = useActivePomodoro();

  if (hideOnCurrentView) return null;
  if (pomodoro.phase === "idle") return null;

  return (
    <span data-testid="pomodoro-header-widget" className="text-sm font-semibold tabular-nums text-primary">
      {pomodoro.phase === "finished" ? "Séance terminée" : formatCountdown(pomodoro.remainingSeconds)}
    </span>
  );
}
