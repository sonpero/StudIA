import { useEffect, useRef } from "react";
import { createAmbientSoundGraph, type AmbientSoundGraph } from "../lib/ambient-sound-graph.js";
import { getAudioContext } from "../lib/audio-context.js";
import { useAmbientSound } from "../lib/use-ambient-sound.js";

// M10 Phase 2, lot 4: the single carrier for the ambient sound's Web Audio
// graph, mounted once in App.tsx, on the exact model PomodoroEffects
// already established (M10 Phase 2, lot 2). StudySoundsCard and the
// header's stop control both call useAmbientSound too, but only to derive
// what they render and to trigger actions — the graph itself (a noise
// buffer, a filter, a gain) lives only here, so it survives a screen
// change regardless of which of those two happens to be mounted at any
// given moment. No visible render of its own.
export function AmbientSoundEffects() {
  const { kind, playing, volume } = useAmbientSound();
  const graphRef = useRef<AmbientSoundGraph | null>(null);

  // Torn down on unmount even if a sound is still playing — a noise
  // generator left running past this point is a leak and a battery drain
  // no test would otherwise catch. Not expected to fire in production
  // (this carrier is meant to outlive every screen), but App.tsx tearing
  // down (logout, or the app itself unmounting) must still stop it.
  useEffect(() => {
    return () => {
      graphRef.current?.dispose();
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      graphRef.current?.stop();
      return;
    }
    // Not yet unlocked (no user gesture has happened): nothing to play.
    // useAmbientSound's own play() already unlocks it synchronously from
    // the same click that sets playing true, so in practice this only
    // guards an environment with no Web Audio support at all.
    const ctx = getAudioContext();
    if (!ctx) return;
    if (!graphRef.current) graphRef.current = createAmbientSoundGraph(ctx, volume);
    graphRef.current.start(kind);
    // volume is deliberately not a dependency here: changing it must not
    // restart the source (the effect below handles it live, on the
    // existing gain node), only a kind change or a fresh play() should.
  }, [playing, kind]);

  useEffect(() => {
    graphRef.current?.setVolume(volume);
  }, [volume]);

  return null;
}
