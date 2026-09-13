// M10 Phase 2, lot 4: synthesized ambient noise, no audio file, no
// third-party embed — a noise buffer, a filter, a gain, exactly the shape
// the spec names. All three "colours" share one graph shape (buffer ->
// filter -> gain -> destination); only the lowpass filter's own frequency
// and Q differ per kind. This is a deliberately simple approximation, not
// a spectrally accurate pink/brown noise implementation — a single biquad
// filter cannot produce the true -3dB/-6dB-per-octave rolloff either colour
// name technically describes. Good enough for an ambient backdrop; a
// scientifically precise implementation was never the point.
export type AmbientSoundKind = "white" | "pink" | "brown";

// The order the selector list has always shown them in.
export const AMBIENT_SOUND_KINDS: AmbientSoundKind[] = ["white", "pink", "brown"];

// Several seconds, not a fraction of one: white/pink/brown noise has no
// periodic content, so a loop seam in a broadband noise buffer this long is
// not perceptible against the continuous signal, unlike a tonal loop would
// be — this is what lets a single fixed buffer play back "infinitely" (the
// spec's own word) without an audible seam.
const NOISE_BUFFER_SECONDS = 4;

const FILTER_PARAMS: Record<AmbientSoundKind, { frequency: number; Q: number }> = {
  // ~20kHz sits at the edge of human hearing — the filter is present for
  // every kind (one uniform graph shape), but at this cutoff it leaves
  // white noise essentially unshaped.
  white: { frequency: 20_000, Q: 0.707 },
  pink: { frequency: 800, Q: 0.5 },
  brown: { frequency: 200, Q: 0.5 },
};

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export interface AmbientSoundGraph {
  start(kind: AmbientSoundKind): void;
  stop(): void;
  setVolume(volume: number): void;
  // Tears down the gain node itself, not just the source/filter — for the
  // carrier component's own unmount (App.tsx tearing down, or a test
  // remounting it). A noise generator left running past this point is a
  // leak and a battery drain no test would otherwise catch.
  dispose(): void;
}

// One graph instance per mounted carrier (AmbientSoundEffects), holding the
// one GainNode for as long as the carrier lives — start()/stop() replace
// only the source and filter underneath it, so volume changes never need
// to reach for a node that might not exist yet.
export function createAmbientSoundGraph(ctx: AudioContext, initialVolume: number): AmbientSoundGraph {
  const gain = ctx.createGain();
  gain.gain.value = initialVolume;
  gain.connect(ctx.destination);

  let source: AudioBufferSourceNode | null = null;
  let filter: BiquadFilterNode | null = null;

  function stop(): void {
    if (source) {
      source.stop();
      source.disconnect();
      source = null;
    }
    if (filter) {
      filter.disconnect();
      filter = null;
    }
  }

  function start(kind: AmbientSoundKind): void {
    stop();
    const newSource = ctx.createBufferSource();
    newSource.buffer = createNoiseBuffer(ctx);
    newSource.loop = true;
    const newFilter = ctx.createBiquadFilter();
    newFilter.type = "lowpass";
    const params = FILTER_PARAMS[kind];
    newFilter.frequency.value = params.frequency;
    newFilter.Q.value = params.Q;
    newSource.connect(newFilter);
    newFilter.connect(gain);
    newSource.start();
    source = newSource;
    filter = newFilter;
  }

  function setVolume(volume: number): void {
    gain.gain.value = volume;
  }

  function dispose(): void {
    stop();
    gain.disconnect();
  }

  return { start, stop, setVolume, dispose };
}
