import { VolumeX } from "lucide-react";
import { ICON_SIZE_INLINE, ICON_STROKE_WIDTH } from "../lib/icons.js";
import { useAmbientSound } from "../lib/use-ambient-sound.js";

// M10 Phase 2, lot 4: decision 3's own direct consequence — a sound that
// survives navigation (its graph lives in AmbientSoundEffects, mounted
// once in App.tsx) must be stoppable without navigating back to
// Aujourd'hui to reach StudySoundsCard's own pause button. Same discretion
// as PomodoroHeaderWidget: rendered nowhere at all (not just styled
// invisible) when nothing is playing, and hidden specifically on
// Aujourd'hui, where StudySoundsCard already carries an identical action
// under a different name.
export function AmbientSoundHeaderControl({ hideOnCurrentView }: { hideOnCurrentView: boolean }) {
  const { playing, pause } = useAmbientSound();

  if (hideOnCurrentView) return null;
  if (!playing) return null;

  return (
    <button
      type="button"
      aria-label="Couper le son d'ambiance"
      onClick={() => pause()}
      className="flex h-11 w-11 shrink-0 items-center justify-center text-text-muted"
    >
      <VolumeX aria-hidden="true" focusable="false" size={ICON_SIZE_INLINE} strokeWidth={ICON_STROKE_WIDTH} />
    </button>
  );
}
