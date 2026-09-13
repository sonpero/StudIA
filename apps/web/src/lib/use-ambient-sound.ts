import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AmbientSoundKind } from "./ambient-sound-graph.js";
import { unlockAudioContext } from "./audio-context.js";

export const AMBIENT_SOUND_QUERY_KEY = ["ambient-sound"];

export type AmbientSoundState = {
  kind: AmbientSoundKind;
  playing: boolean;
  volume: number;
};

const DEFAULT_STATE: AmbientSoundState = { kind: "white", playing: false, volume: 0.5 };

// French labels, sentence case — "Bruit blanc"/"Bruit rose"/"Bruit brun",
// never a mood name like "Pluie" or "Café": the sound really is filtered
// noise, not a field recording, and naming it as one would be a promise
// synthesis cannot keep (M10 Phase 2, lot 4's own explicit decision).
export function ambientSoundLabel(kind: AmbientSoundKind): string {
  switch (kind) {
    case "white":
      return "Bruit blanc";
    case "pink":
      return "Bruit rose";
    case "brown":
      return "Bruit brun";
  }
}

export type UseAmbientSoundResult = AmbientSoundState & {
  select: (kind: AmbientSoundKind) => void;
  play: () => void;
  pause: () => void;
  setVolume: (volume: number) => void;
};

// The read/act half of the pair AmbientSoundEffects completes (M10 Phase 2,
// lot 4), on the exact model useActivePomodoro/PomodoroEffects already
// established: this hook never touches the Web Audio graph itself, only
// derives state from — and writes intent into — the shared QueryClient
// cache, so StudySoundsCard and the header's stop control (mounted on
// different screens, at different times) always agree, and neither has to
// stay mounted for the sound to keep playing across a screen change.
//
// No persistence anywhere (decision 5): this cache entry lives only in the
// QueryClient instance App() creates once per page load
// (`useState(() => new QueryClient())`) — a reload always produces a fresh
// one, so there is no path by which a sound could resume automatically
// without a new user gesture.
export function useAmbientSound(): UseAmbientSoundResult {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: AMBIENT_SOUND_QUERY_KEY,
    queryFn: () => DEFAULT_STATE,
    initialData: DEFAULT_STATE,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  // Reads the cache's own current value at call time, never the `data`
  // closed over by this render — two actions called back to back in the
  // same tick (e.g. select() immediately followed by play(), before React
  // re-renders in between) would otherwise both build their patch from the
  // same stale snapshot, and the second call's write would silently
  // overwrite whatever the first one had just changed.
  function write(patch: Partial<AmbientSoundState>) {
    const current = queryClient.getQueryData<AmbientSoundState>(AMBIENT_SOUND_QUERY_KEY) ?? DEFAULT_STATE;
    queryClient.setQueryData(AMBIENT_SOUND_QUERY_KEY, { ...current, ...patch });
  }

  return {
    ...data,
    select: (kind) => write({ kind }),
    // unlockAudioContext() must run synchronously here, not inside the
    // carrier's own effect that reacts to `playing` becoming true: this is
    // the last point still guaranteed to be in the same call stack as
    // whatever click invoked play(), which is what the browser's
    // autoplay-unlock rule requires (the same reasoning start() already
    // carries in use-active-pomodoro.ts for the pomodoro chime).
    play: () => {
      unlockAudioContext();
      write({ playing: true });
    },
    pause: () => write({ playing: false }),
    setVolume: (volume) => write({ volume }),
  };
}
