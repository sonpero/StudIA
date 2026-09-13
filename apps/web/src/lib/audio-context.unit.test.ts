import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// M10 Phase 2: one AudioContext for the whole app (decision, not an
// oversight) — browsers cap how many contexts can exist at once and Safari
// is strict about it. Shared by the pomodoro chime (lot 2) and the ambient
// sounds card (lot 4). Each test gets its own fresh module instance via
// resetModules(), the same technique pomodoro-chime.unit.test.ts already
// uses for its own (now migrated) singleton.
async function importFresh() {
  vi.resetModules();
  return import("./audio-context.js");
}

class FakeAudioContext {
  state = "suspended";
  resume = vi.fn().mockImplementation(() => {
    this.state = "running";
    return Promise.resolve();
  });
}

describe("audio-context", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("getAudioContext() returns null before unlockAudioContext() has ever been called", async () => {
    const { getAudioContext } = await importFresh();
    expect(getAudioContext()).toBeNull();
  });

  it("unlockAudioContext() creates exactly one AudioContext even when called repeatedly", async () => {
    const ctor = vi.fn(() => new FakeAudioContext());
    vi.stubGlobal("AudioContext", ctor);
    const { unlockAudioContext } = await importFresh();

    unlockAudioContext();
    unlockAudioContext();
    unlockAudioContext();

    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("unlockAudioContext() resumes the context on every call, not just the first", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { unlockAudioContext } = await importFresh();

    unlockAudioContext();
    unlockAudioContext();

    expect(instance.resume).toHaveBeenCalledTimes(2);
  });

  it("getAudioContext() returns the same instance unlockAudioContext() created — the actual sharing this module exists for", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { unlockAudioContext, getAudioContext } = await importFresh();

    const returned = unlockAudioContext();

    expect(returned).toBe(instance);
    expect(getAudioContext()).toBe(instance);
  });

  it("never throws even if the AudioContext constructor itself throws (no Web Audio support)", async () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => {
        throw new Error("no Web Audio in this environment");
      }),
    );
    const { unlockAudioContext, getAudioContext } = await importFresh();

    expect(() => unlockAudioContext()).not.toThrow();
    expect(getAudioContext()).toBeNull();
  });
});
