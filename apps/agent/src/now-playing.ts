import type { HostMedia } from "@pryladova/shared";
import {
  advanceThumbnailBustState,
  createThumbnailBustState,
  mapMediaSession,
  pickCurrentSession,
  shouldRunThumbnailBust,
  thumbnailBustDelayMs,
  trackMediaKey,
} from "./now-playing-core.js";
import { getNowPlayingRuntime, resetNowPlayingRuntimeForHotReload } from "./now-playing-runtime.js";

export { resolveHostMediaThumbnail } from "./now-playing-core.js";

resetNowPlayingRuntimeForHotReload();

type MediaSession = Parameters<typeof mapMediaSession>[0];

const runtime = getNowPlayingRuntime;

const clearBustTimer = (): void => {
  const state = runtime();
  if (state.bustTimer !== null) {
    clearTimeout(state.bustTimer);
    state.bustTimer = null;
  }
};

const clearThumbnailBust = (): void => {
  clearBustTimer();
  runtime().bustState = null;
};

const notifyThumbnailReady = (media: HostMedia): void => {
  const state = runtime();
  const pushKey = `${trackMediaKey(media)}|${media.thumbnailDataUrl}`;
  if (state.lastPushedThumbnailKey === pushKey) {
    return;
  }
  state.lastPushedThumbnailKey = pushKey;
  clearThumbnailBust();
  state.onThumbnailReady?.(media);
};

const readSessions = async (): Promise<readonly MediaSession[]> => {
  const { getAllSessions } = await import("windows-media-sessions");
  return getAllSessions();
};

const restartSmtcBackend = async (): Promise<readonly MediaSession[]> => {
  const { shutdown } = await import("windows-media-sessions");
  await shutdown();
  return readSessions();
};

const mapCurrentMedia = (sessions: readonly MediaSession[]): HostMedia | null => {
  const session = pickCurrentSession(sessions);
  return session ? mapMediaSession(session) : null;
};

const scheduleNextBust = (): void => {
  const state = runtime();
  if (state.bustState === null) {
    return;
  }

  const delayMs = thumbnailBustDelayMs(state.bustState.nextAttemptIndex);
  if (delayMs === null) {
    state.bustState = null;
    return;
  }

  clearBustTimer();
  const trackKey = state.bustState.trackKey;
  state.bustTimer = setTimeout(() => {
    runtime().bustTimer = null;
    void runThumbnailBust(trackKey);
  }, delayMs);
};

const runThumbnailBust = async (trackKey: string): Promise<void> => {
  const state = runtime();
  if (state.bustState?.trackKey !== trackKey) {
    return;
  }

  try {
    const sessions = await restartSmtcBackend();
    const media = mapCurrentMedia(sessions);

    if (!media || trackMediaKey(media) !== trackKey) {
      clearThumbnailBust();
      return;
    }

    if (media.thumbnailDataUrl) {
      notifyThumbnailReady(media);
      return;
    }

    const nextState = state.bustState ? advanceThumbnailBustState(state.bustState) : null;
    state.bustState = nextState;
    if (nextState) {
      scheduleNextBust();
    }
  } catch (error: unknown) {
    if (!state.smtcErrorLogged) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[agent] SMTC thumbnail retry failed: ${message}`);
      state.smtcErrorLogged = true;
    }
    clearThumbnailBust();
  }
};

const noteMediaThumbnail = (media: HostMedia): void => {
  const state = runtime();
  if (media.thumbnailDataUrl) {
    clearThumbnailBust();
    return;
  }

  const trackKey = trackMediaKey(media);
  if (state.bustState?.trackKey !== trackKey) {
    state.lastPushedThumbnailKey = null;
  }
  if (state.bustState?.trackKey === trackKey && state.bustTimer !== null) {
    return;
  }

  if (!shouldRunThumbnailBust(state.bustState, trackKey)) {
    return;
  }

  if (state.bustState === null || state.bustState.trackKey !== trackKey) {
    state.bustState = createThumbnailBustState(trackKey);
  }

  scheduleNextBust();
};

const handleSessionsChanged = (sessions: readonly MediaSession[]): void => {
  const media = mapCurrentMedia(sessions);
  if (media?.thumbnailDataUrl) {
    notifyThumbnailReady(media);
  }
};

const ensureFeed = async (): Promise<void> => {
  const state = runtime();
  if (state.feedUnsubscribe) {
    return;
  }

  const { onSessionsChanged } = await import("windows-media-sessions");
  state.feedUnsubscribe = onSessionsChanged(handleSessionsChanged);
};

export const setNowPlayingThumbnailListener = (
  listener: ((media: HostMedia) => void) | null,
): void => {
  runtime().onThumbnailReady = listener;
};

export const readNowPlaying = async (): Promise<HostMedia | null> => {
  try {
    await ensureFeed();
    const sessions = await readSessions();
    const session = pickCurrentSession(sessions);
    if (!session) {
      clearThumbnailBust();
      return null;
    }

    runtime().smtcErrorLogged = false;
    const media = mapMediaSession(session);
    if (media) {
      noteMediaThumbnail(media);
    }
    return media;
  } catch (error: unknown) {
    const state = runtime();
    if (!state.smtcErrorLogged) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[agent] SMTC read failed: ${message}`);
      state.smtcErrorLogged = true;
    }
    return null;
  }
};
