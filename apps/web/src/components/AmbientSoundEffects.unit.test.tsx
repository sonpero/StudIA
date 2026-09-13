// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";

// M10 Phase 2, lot 4: the single carrier for the ambient sound's Web Audio
// graph, mounted once in App.tsx, on the exact model PomodoroEffects
// already established — StudySoundsCard and the header's stop control both
// call useAmbientSound too, but only to derive what they render and to
// trigger actions, never to touch the graph directly.
//
// audio-context.ts holds its AudioContext in a module-level singleton, by
// design (one shared context for the whole app) — so, exactly like
// pomodoro-chime.unit.test.ts, each test here gets a fresh module graph via
// resetModules() rather than relying on test order. useAmbientSound and
// AmbientSoundEffects are imported dynamically together so both sides of
// the pair share the same freshly-reset audio-context.js underneath.
async function importFresh() {
  vi.resetModules();
  const [{ useAmbientSound }, { AmbientSoundEffects }] = await Promise.all([import("../lib/use-ambient-sound.js"), import("./AmbientSoundEffects.js")]);
  return { useAmbientSound, AmbientSoundEffects };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

class FakeAudioParam {
  value = 0;
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBiquadFilterNode {
  type = "lowpass";
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioBuffer {
  data: Float32Array;
  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.data = new Float32Array(length);
  }
  getChannelData() {
    return this.data;
  }
}

class FakeBufferSourceNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeAudioContext {
  sampleRate = 44_100;
  currentTime = 0;
  destination = {};
  state = "suspended";
  resume = vi.fn().mockImplementation(() => {
    this.state = "running";
    return Promise.resolve();
  });
  createGain = vi.fn(() => new FakeGainNode());
  createBiquadFilter = vi.fn(() => new FakeBiquadFilterNode());
  createBufferSource = vi.fn(() => new FakeBufferSourceNode());
  createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => new FakeAudioBuffer(channels, length, sampleRate));
}

describe("AmbientSoundEffects", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts the noise graph once play() is called, using the currently selected kind", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { useAmbientSound, AmbientSoundEffects } = await importFresh();
    const queryClient = new QueryClient();
    const w = wrapper(queryClient);
    render(<AmbientSoundEffects />, { wrapper: w });
    const { result } = renderHook(() => useAmbientSound(), { wrapper: w });

    act(() => result.current.select("brown"));
    await waitFor(() => expect(result.current.kind).toBe("brown"));
    act(() => result.current.play());

    await waitFor(() => expect(instance.createBufferSource).toHaveBeenCalledTimes(1));
    const filter = (instance.createBiquadFilter as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBiquadFilterNode;
    // brown noise's own cutoff (ambient-sound-graph.ts) — proves the graph
    // was actually started with the selected kind, not always the default.
    expect(filter.frequency.value).toBe(200);
  });

  it("stops the graph when pause() is called, without disposing it — a later play() resumes cleanly", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { useAmbientSound, AmbientSoundEffects } = await importFresh();
    const queryClient = new QueryClient();
    const w = wrapper(queryClient);
    render(<AmbientSoundEffects />, { wrapper: w });
    const { result } = renderHook(() => useAmbientSound(), { wrapper: w });

    act(() => result.current.play());
    await waitFor(() => expect(instance.createBufferSource).toHaveBeenCalledTimes(1));
    const firstSource = (instance.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBufferSourceNode;

    act(() => result.current.pause());

    await waitFor(() => expect(firstSource.stop).toHaveBeenCalledTimes(1));

    act(() => result.current.play());
    await waitFor(() => expect(instance.createBufferSource).toHaveBeenCalledTimes(2));
  });

  it("switching the selected kind while already playing restarts the graph with the new kind, without a second play() call", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { useAmbientSound, AmbientSoundEffects } = await importFresh();
    const queryClient = new QueryClient();
    const w = wrapper(queryClient);
    render(<AmbientSoundEffects />, { wrapper: w });
    const { result } = renderHook(() => useAmbientSound(), { wrapper: w });

    act(() => result.current.play());
    await waitFor(() => expect(instance.createBufferSource).toHaveBeenCalledTimes(1));

    act(() => result.current.select("pink"));

    await waitFor(() => expect(instance.createBufferSource).toHaveBeenCalledTimes(2));
    const secondFilter = (instance.createBiquadFilter as ReturnType<typeof vi.fn>).mock.results[1]!.value as FakeBiquadFilterNode;
    expect(secondFilter.frequency.value).toBe(800);
  });

  it("volume changes reach the graph's own gain node without restarting the source", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { useAmbientSound, AmbientSoundEffects } = await importFresh();
    const queryClient = new QueryClient();
    const w = wrapper(queryClient);
    render(<AmbientSoundEffects />, { wrapper: w });
    const { result } = renderHook(() => useAmbientSound(), { wrapper: w });

    act(() => result.current.play());
    await waitFor(() => expect(instance.createBufferSource).toHaveBeenCalledTimes(1));
    const gain = (instance.createGain as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeGainNode;

    act(() => result.current.setVolume(0.1));

    await waitFor(() => expect(gain.gain.value).toBe(0.1));
    expect(instance.createBufferSource).toHaveBeenCalledTimes(1);
  });

  // The explicit lot requirement: a noise generator left running on
  // unmount is a leak and a battery drain no test would otherwise catch.
  it("stops and disposes the graph on unmount, even while a sound is still playing", async () => {
    const instance = new FakeAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(() => instance),
    );
    const { useAmbientSound, AmbientSoundEffects } = await importFresh();
    const queryClient = new QueryClient();
    const w = wrapper(queryClient);
    const { unmount } = render(<AmbientSoundEffects />, { wrapper: w });
    const { result } = renderHook(() => useAmbientSound(), { wrapper: w });

    act(() => result.current.play());
    await waitFor(() => expect(instance.createBufferSource).toHaveBeenCalledTimes(1));
    const source = (instance.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBufferSourceNode;
    const gain = (instance.createGain as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeGainNode;

    unmount();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });

  it("renders nothing — no visible DOM output of its own", async () => {
    const { AmbientSoundEffects } = await importFresh();
    const queryClient = new QueryClient();
    const { container } = render(<AmbientSoundEffects />, { wrapper: wrapper(queryClient) });
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing if play() is called before the audio context is ever unlocked (no Web Audio support)", async () => {
    // No AudioContext stub at all — jsdom has none by default, matching a
    // real environment without Web Audio support.
    const { useAmbientSound, AmbientSoundEffects } = await importFresh();
    const queryClient = new QueryClient();
    const w = wrapper(queryClient);
    render(<AmbientSoundEffects />, { wrapper: w });
    const { result } = renderHook(() => useAmbientSound(), { wrapper: w });

    expect(() => act(() => result.current.play())).not.toThrow();
  });
});
