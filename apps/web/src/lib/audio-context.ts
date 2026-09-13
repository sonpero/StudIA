// One AudioContext for the whole app (M10 Phase 2), module-level, shared by
// the pomodoro chime (lot 2, pomodoro-chime.ts) and the ambient sounds card
// (lot 4, ambient-sound-graph.ts) — browsers cap how many contexts can
// exist at once and Safari is strict about it, so nothing in this app
// creates a second one. Created lazily on the first user gesture: whichever
// of the two callers unlocks it first wins, the other just reuses and
// resumes the same instance. Never throws past its caller — Web Audio being
// unavailable, or the browser refusing the unlock, must never look like a
// real error to the rest of the app.
let audioContext: AudioContext | null = null;

export function unlockAudioContext(): AudioContext | null {
  try {
    if (!audioContext) audioContext = new AudioContext();
    void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

export function getAudioContext(): AudioContext | null {
  return audioContext;
}
