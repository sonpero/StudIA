import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Web Audio, no audio file (M10 Phase 2, lot 2's own constraint). Two rules
// this suite exists to enforce, not geometry: unlockChime() must create the
// AudioContext eagerly (so it is called directly from the "Démarrer" click's
// own call stack, still inside the user gesture — a call one microtask later
// would already be too late for the browser's autoplay-unlock rule), and
// neither function may ever throw past the caller. A background tab can
// throttle timers enough that the chime lands late or a context can already
// be closed — the chime is a bonus signal (the spec's own words), never the
// alert mechanism, so a synthesis failure must not read as a real error.
class FakeGainNode {
  gain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  connect = vi.fn();
}

class FakeOscillatorNode {
  type = "sine";
  frequency = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  resume = vi.fn().mockImplementation(() => {
    this.state = "running";
    return Promise.resolve();
  });
  close = vi.fn().mockResolvedValue(undefined);
  createGain = vi.fn(() => new FakeGainNode());
  createOscillator = vi.fn(() => new FakeOscillatorNode());
}

// The module holds its AudioContext in a singleton, by design (one shared
// context, not one per call) — so each test gets its own fresh module
// instance via resetModules(), rather than relying on test order to keep
// "before any unlockChime()" meaningful.
async function importFresh() {
  vi.resetModules();
  return import("./pomodoro-chime.js");
}

describe("pomodoro-chime", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("unlockChime() creates and resumes an AudioContext synchronously (still inside the caller's own call stack)", async () => {
    const instance = new FakeAudioContext();
    const ctor = vi.fn(() => instance);
    vi.stubGlobal("AudioContext", ctor);
    const { unlockChime } = await importFresh();

    unlockChime();

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(instance.resume).toHaveBeenCalledTimes(1);
  });

  it("playChime() after unlockChime() plays a short tone without throwing", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { playChime, unlockChime } = await importFresh();

    unlockChime();
    expect(() => playChime()).not.toThrow();
    expect(instance.createOscillator).toHaveBeenCalled();
  });

  it("playChime() before any unlockChime() call is a silent no-op, never a throw", async () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => new FakeAudioContext()),
    );
    const { playChime } = await importFresh();

    expect(() => playChime()).not.toThrow();
  });

  it("never throws even if the AudioContext constructor itself throws (no Web Audio support)", async () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        throw new Error("no Web Audio in this environment");
      }),
    );
    const { playChime, unlockChime } = await importFresh();

    expect(() => unlockChime()).not.toThrow();
    expect(() => playChime()).not.toThrow();
  });
});
