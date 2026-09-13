import { formatCountdown, pomodoroFinishedLabel, pomodoroSessionTypeLabel, sessionType, useActivePomodoro } from "../lib/use-active-pomodoro.js";

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
// M10 Phase 2, lot 3: "04:12" alone doesn't say whether a session is work
// or rest, so the type is named too — in a sibling span, not folded into
// the countdown's own text. Two existing exact-match assertions
// (App.unit.test.tsx, e2e/pomodoro-persistent.spec.ts) already pin
// data-testid="pomodoro-header-widget" down to being exactly the countdown
// text and nothing else; splitting the type out like this satisfies the
// new requirement without touching either one.
export function PomodoroHeaderWidget({ hideOnCurrentView }: { hideOnCurrentView: boolean }) {
  const pomodoro = useActivePomodoro();

  if (hideOnCurrentView) return null;
  if (pomodoro.phase === "idle") return null;

  const type = sessionType(pomodoro.session);

  return (
    <span className="flex items-center gap-1 text-sm font-semibold tabular-nums text-primary">
      <span className="font-normal text-text-muted">{pomodoroSessionTypeLabel(type)} ·</span>
      <span data-testid="pomodoro-header-widget">{pomodoro.phase === "finished" ? pomodoroFinishedLabel(type) : formatCountdown(pomodoro.remainingSeconds)}</span>
    </span>
  );
}
