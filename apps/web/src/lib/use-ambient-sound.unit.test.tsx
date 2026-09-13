// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PropsWithChildren } from "react";
import { getAudioContext } from "./audio-context.js";
import { AMBIENT_SOUND_QUERY_KEY, useAmbientSound } from "./use-ambient-sound.js";

class FakeAudioContext {
  state = "suspended";
  resume = vi.fn().mockImplementation(() => {
    this.state = "running";
    return Promise.resolve();
  });
}

// M10 Phase 2, lot 4: the card only reads state and triggers actions — the
// actual Web Audio graph lives in AmbientSoundEffects, mounted once in
// App.tsx, on the exact model useActivePomodoro/PomodoroEffects already
// established. This hook is the read/act half of that pair: state lives in
// the shared QueryClient cache (same mechanism as the pomodoro hook), never
// component-local, which is what lets it survive a screen change without
// the carrier needing to stay mounted anywhere in particular.
function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useAmbientSound", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to white noise selected, not playing, on a fresh mount — no auto-resume, ever", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAmbientSound(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.kind).toBe("white"));
    expect(result.current.playing).toBe(false);
  });

  // The same fresh-mount guarantee stated explicitly for what a real reload
  // does: nothing here is read from anywhere persistent (no localStorage,
  // no server), so a brand new QueryClient — what a real page reload
  // produces (App()'s own `useState(() => new QueryClient())`) — can only
  // ever start silent, never resume whatever was playing before.
  it("a brand new QueryClient (what a real reload produces) never carries over a previous playing state", async () => {
    const firstClient = new QueryClient();
    const first = renderHook(() => useAmbientSound(), { wrapper: wrapper(firstClient) });
    act(() => first.result.current.play());
    await waitFor(() => expect(first.result.current.playing).toBe(true));

    const freshClient = new QueryClient();
    const { result } = renderHook(() => useAmbientSound(), { wrapper: wrapper(freshClient) });

    expect(result.current.playing).toBe(false);
  });

  it("select() changes which sound is chosen without starting playback", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAmbientSound(), { wrapper: wrapper(queryClient) });

    act(() => result.current.select("brown"));

    await waitFor(() => expect(result.current.kind).toBe("brown"));
    expect(result.current.playing).toBe(false);
  });

  it("play() starts playback of the currently selected sound", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAmbientSound(), { wrapper: wrapper(queryClient) });

    act(() => result.current.select("pink"));
    await waitFor(() => expect(result.current.kind).toBe("pink"));
    act(() => result.current.play());

    await waitFor(() => expect(result.current.playing).toBe(true));
    expect(result.current.kind).toBe("pink");
  });

  it("pause() stops playback but keeps the selected sound", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAmbientSound(), { wrapper: wrapper(queryClient) });

    act(() => result.current.select("brown"));
    await waitFor(() => expect(result.current.kind).toBe("brown"));
    act(() => result.current.play());
    await waitFor(() => expect(result.current.playing).toBe(true));
    act(() => result.current.pause());

    await waitFor(() => expect(result.current.playing).toBe(false));
    expect(result.current.kind).toBe("brown");
  });

  it("setVolume() changes the volume, independent of play/pause state", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAmbientSound(), { wrapper: wrapper(queryClient) });

    act(() => result.current.setVolume(0.2));

    await waitFor(() => expect(result.current.volume).toBe(0.2));
  });

  // Proves the state is genuinely shared (the QueryClient cache, not
  // component-local useState) — the same "two simultaneous consumers never
  // diverge" property useActivePomodoro's own test suite already
  // establishes for the pomodoro session, here for the ambient sound: this
  // is exactly what lets a screen change survive without losing what's
  // playing (StudySoundsCard mounts fresh on every visit to Aujourd'hui,
  // the header's stop control mounts on every other screen).
  it("two simultaneous consumers sharing one QueryClient never diverge: playing from one is immediately visible in the other", async () => {
    const queryClient = new QueryClient();
    const w = wrapper(queryClient);
    const consumerA = renderHook(() => useAmbientSound(), { wrapper: w });
    const consumerB = renderHook(() => useAmbientSound(), { wrapper: w });

    act(() => consumerA.result.current.select("brown"));
    act(() => consumerA.result.current.play());

    await waitFor(() => expect(consumerB.result.current.playing).toBe(true));
    expect(consumerB.result.current.kind).toBe("brown");
  });

  it("exposes its query key for the carrier component to read the same cache entry", () => {
    expect(AMBIENT_SOUND_QUERY_KEY).toEqual(expect.any(Array));
  });

  // The shared AudioContext (audio-context.ts, M10 Phase 2, lot 4) is what
  // decision 4 requires: one for the whole app, reused by the pomodoro
  // chime and this card alike. play() is where it gets unlocked, since
  // that is the function actually invoked from the "Lecture" click.
  it("play() unlocks the shared AudioContext synchronously", () => {
    const ctor = vi.fn(() => new FakeAudioContext());
    vi.stubGlobal("AudioContext", ctor);
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useAmbientSound(), { wrapper: wrapper(queryClient) });

    act(() => result.current.play());

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(getAudioContext()).not.toBeNull();
  });
});
