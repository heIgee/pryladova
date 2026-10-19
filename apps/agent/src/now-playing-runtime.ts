import type { ThumbnailBustState } from "./now-playing-core.js";

export type NowPlayingRuntime = {
  smtcErrorLogged: boolean;
  feedUnsubscribe: (() => void) | null;
  onThumbnailReady: ((media: import("@pryladova/shared").HostMedia) => void) | null;
  bustState: ThumbnailBustState | null;
  bustTimer: ReturnType<typeof setTimeout> | null;
  lastPushedThumbnailKey: string | null;
};

const RUNTIME_KEY = Symbol.for("pryladova.agent.nowPlaying");

export const getNowPlayingRuntime = (): NowPlayingRuntime => {
  const root = globalThis as typeof globalThis & { [key: symbol]: NowPlayingRuntime | undefined };
  if (!root[RUNTIME_KEY]) {
    root[RUNTIME_KEY] = {
      smtcErrorLogged: false,
      feedUnsubscribe: null,
      onThumbnailReady: null,
      bustState: null,
      bustTimer: null,
      lastPushedThumbnailKey: null,
    };
  }
  return root[RUNTIME_KEY];
};

/** Cancel orphaned thumbnail bust timers/subscriptions after tsx hot reload. */
export const resetNowPlayingRuntimeForHotReload = (): void => {
  const state = getNowPlayingRuntime();
  if (state.bustTimer !== null) {
    clearTimeout(state.bustTimer);
    state.bustTimer = null;
  }
  state.bustState = null;
  state.feedUnsubscribe?.();
  state.feedUnsubscribe = null;
};

resetNowPlayingRuntimeForHotReload();
