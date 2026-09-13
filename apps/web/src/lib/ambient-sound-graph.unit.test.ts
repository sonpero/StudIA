import { describe, expect, it, vi } from "vitest";
import { createAmbientSoundGraph } from "./ambient-sound-graph.js";

// M10 Phase 2, lot 4: a synthesized noise buffer, a filter (colours it into
// white/pink/brown), a gain (volume) — the exact shape the spec names, no
// audio file, no third-party source. This suite is about the graph's own
// lifecycle (start/stop/dispose, exactly the nodes it says it creates and
// tears down), not about proving the resulting sound is spectrally correct
// pink or brown noise — that's a real, audible, subjective judgement no
// unit test can make.
class FakeAudioParam {
  value = 0;
  setValueAtTime = vi.fn();
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
  createGain = vi.fn(() => new FakeGainNode());
  createBiquadFilter = vi.fn(() => new FakeBiquadFilterNode());
  createBufferSource = vi.fn(() => new FakeBufferSourceNode());
  createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => new FakeAudioBuffer(channels, length, sampleRate));
}

function fakeCtx() {
  return new FakeAudioContext() as unknown as AudioContext;
}

describe("createAmbientSoundGraph", () => {
  it("start() creates a looping noise source through a filter into the shared gain, then destination", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);

    graph.start("white");

    const source = (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBufferSourceNode;
    const filter = (ctx.createBiquadFilter as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBiquadFilterNode;
    expect(source.loop).toBe(true);
    expect(source.buffer).not.toBeNull();
    expect(source.start).toHaveBeenCalledTimes(1);
    expect(source.connect).toHaveBeenCalledWith(filter);
    expect(filter.connect).toHaveBeenCalled();
  });

  it("start() with different kinds sets different filter parameters — a real distinction, not the same number three times", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);

    graph.start("white");
    const whiteFilter = (ctx.createBiquadFilter as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBiquadFilterNode;
    graph.start("pink");
    const pinkFilter = (ctx.createBiquadFilter as ReturnType<typeof vi.fn>).mock.results[1]!.value as FakeBiquadFilterNode;
    graph.start("brown");
    const brownFilter = (ctx.createBiquadFilter as ReturnType<typeof vi.fn>).mock.results[2]!.value as FakeBiquadFilterNode;

    const frequencies = new Set([whiteFilter.frequency.value, pinkFilter.frequency.value, brownFilter.frequency.value]);
    expect(frequencies.size).toBe(3);
  });

  it("start() called again stops the previous source before starting a new one — never two sources playing at once", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);

    graph.start("white");
    const firstSource = (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBufferSourceNode;
    graph.start("pink");

    expect(firstSource.stop).toHaveBeenCalledTimes(1);
    expect(firstSource.disconnect).toHaveBeenCalledTimes(1);
  });

  it("stop() stops and disconnects the source and filter, and is a harmless no-op when nothing is playing", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);
    graph.start("white");
    const source = (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBufferSourceNode;
    const filter = (ctx.createBiquadFilter as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBiquadFilterNode;

    graph.stop();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(filter.disconnect).toHaveBeenCalledTimes(1);

    expect(() => graph.stop()).not.toThrow();
  });

  it("setVolume() changes the shared gain node's own value, not a new node per call", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);
    const gain = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeGainNode;

    graph.setVolume(0.2);

    expect(gain.gain.value).toBe(0.2);
    expect((ctx.createGain as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  // The explicit lot requirement: a noise generator left running is a leak
  // and a battery drain no test would otherwise catch.
  it("dispose() stops the source and disconnects the gain node itself, not just the source/filter", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);
    graph.start("white");
    const source = (ctx.createBufferSource as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeBufferSourceNode;
    const gain = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeGainNode;

    graph.dispose();

    expect(source.stop).toHaveBeenCalledTimes(1);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });

  it("dispose() while nothing is playing still disconnects the gain node, and never throws", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);
    const gain = (ctx.createGain as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeGainNode;

    expect(() => graph.dispose()).not.toThrow();
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
  });

  // Decision 1: "durée infinie sans jointure de boucle audible" — not
  // literally testable as "audible" in a unit test, but the buffer must at
  // least be long enough that a loop seam has room to be inaudible, not a
  // handful of samples that would repeat several times a second.
  it("the noise buffer is several seconds long, not a tiny loop that would repeat audibly", () => {
    const ctx = fakeCtx();
    const graph = createAmbientSoundGraph(ctx, 0.5);

    graph.start("white");

    const buffer = (ctx.createBuffer as ReturnType<typeof vi.fn>).mock.results[0]!.value as FakeAudioBuffer;
    expect(buffer.length / buffer.sampleRate).toBeGreaterThanOrEqual(2);
  });
});
