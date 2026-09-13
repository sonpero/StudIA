import { getAudioContext, unlockAudioContext } from "./audio-context.js";

// Synthesized, no audio file (M10 Phase 2, lot 2's own constraint). Two
// rules this module exists to keep: the AudioContext must be unlocked by
// unlockChime(), called synchronously from the "Démarrer" click handler —
// one microtask later and the browser's autoplay-unlock rule no longer
// considers it inside the user gesture — and the chime itself is a bonus
// signal, never the alert mechanism (a backgrounded tab throttles timers
// enough that it can arrive late or not at all). Neither function may ever
// throw past its caller: a synthesis failure here must never look like a
// real error to the rest of the app.
//
// The AudioContext itself lives in audio-context.ts (M10 Phase 2, lot 4),
// not here: it is shared with the ambient sounds card, one context for the
// whole app rather than one per feature.
export function unlockChime(): void {
  unlockAudioContext();
}

export function playChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.4);
  } catch {
    // Bonus signal only — never let a synthesis failure surface as an error.
  }
}
