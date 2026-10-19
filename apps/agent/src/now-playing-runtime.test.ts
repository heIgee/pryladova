import { afterEach, describe, expect, it, vi } from "vitest";
import { getNowPlayingRuntime, resetNowPlayingRuntimeForHotReload } from "./now-playing-runtime.js";

describe("now-playing runtime hot reload", () => {
  afterEach(() => {
    resetNowPlayingRuntimeForHotReload();
    vi.useRealTimers();
  });

  it("clears an orphaned thumbnail bust timer on hot reload reset", () => {
    vi.useFakeTimers();
    const shutdown = vi.fn();
    const state = getNowPlayingRuntime();
    state.bustTimer = setTimeout(() => {
      void shutdown();
    }, 1_500);

    resetNowPlayingRuntimeForHotReload();

    expect(state.bustTimer).toBeNull();
    expect(state.bustState).toBeNull();
    expect(state.feedUnsubscribe).toBeNull();
    vi.advanceTimersByTime(1_500);
    expect(shutdown).not.toHaveBeenCalled();
  });

  it("unsubscribes the previous sessions feed on hot reload reset", () => {
    const unsubscribe = vi.fn();
    const state = getNowPlayingRuntime();
    state.feedUnsubscribe = unsubscribe;

    resetNowPlayingRuntimeForHotReload();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(state.feedUnsubscribe).toBeNull();
  });
});
