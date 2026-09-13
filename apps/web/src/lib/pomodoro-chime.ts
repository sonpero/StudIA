// Synthesized, no audio file (M10 Phase 2, lot 2's own constraint). Two
// rules this module exists to keep: the AudioContext must be created by
// unlockChime(), called synchronously from the "Démarrer" click handler —
// one microtask later and the browser's autoplay-unlock rule no longer
// considers it inside the user gesture — and the chime itself is a bonus
// signal, never the alert mechanism (a backgrounded tab throttles timers
// enough that it can arrive late or not at all). Neither function may ever
// throw past its caller: a synthesis failure here must never look like a
// real error to the rest of the app.
let audioContext: AudioContext | null = null;

export function unlockChime(): void {
  try {
    if (!audioContext) audioContext = new AudioContext();
    void audioContext.resume();
  } catch {
    // Web Audio unavailable, or the browser refused the unlock — the chime
    // stays silent, which is fine: it was always a bonus signal.
  }
}

export function playChime(): void {
  const ctx = audioContext;
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
