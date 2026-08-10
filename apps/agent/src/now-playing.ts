import type { HostMedia } from "@pryladova/shared";
import {
  advanceThumbnailBustState,
  createThumbnailBustState,
  mapMediaSession,
  pickCurrentSession,
  shouldRunThumbnailBust,
  type ThumbnailBustState,
  thumbnailBustDelayMs,
  trackMediaKey,
} from "./now-playing-core.js";

export { resolveHostMediaThumbnail } from "./now-playing-core.js";

type MediaSession = Parameters<typeof mapMediaSession>[0];

let smtcErrorLogged = false;
let feedStarted = false;
let onThumbnailReady: ((media: HostMedia) => void) | null = null;
let bustState: ThumbnailBustState | null = null;
let bustTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushedThumbnailKey: string | null = null;

const clearBustTimer = (): void => {
  if (bustTimer !== null) {
    clearTimeout(bustTimer);
    bustTimer = null;
  }
};

const clearThumbnailBust = (): void => {
  clearBustTimer();
  bustState = null;
};

const notifyThumbnailReady = (media: HostMedia): void => {
  const pushKey = `${trackMediaKey(media)}|${media.thumbnailDataUrl}`;
  if (lastPushedThumbnailKey === pushKey) {
    return;
  }
  lastPushedThumbnailKey = pushKey;
  clearThumbnailBust();
  onThumbnailReady?.(media);
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
  if (bustState === null) {
    return;
  }

  const delayMs = thumbnailBustDelayMs(bustState.nextAttemptIndex);
  if (delayMs === null) {
    bustState = null;
    return;
  }

  clearBustTimer();
  const trackKey = bustState.trackKey;
  bustTimer = setTimeout(() => {
    bustTimer = null;
    void runThumbnailBust(trackKey);
  }, delayMs);
};

const runThumbnailBust = async (trackKey: string): Promise<void> => {
  if (bustState?.trackKey !== trackKey) {
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

    const nextState = bustState ? advanceThumbnailBustState(bustState) : null;
    bustState = nextState;
    if (nextState) {
      scheduleNextBust();
    }
  } catch (error: unknown) {
    if (!smtcErrorLogged) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[agent] SMTC thumbnail retry failed: ${message}`);
      smtcErrorLogged = true;
    }
    clearThumbnailBust();
  }
};

const noteMediaThumbnail = (media: HostMedia): void => {
  if (media.thumbnailDataUrl) {
    clearThumbnailBust();
    return;
  }

  const trackKey = trackMediaKey(media);
  if (bustState?.trackKey !== trackKey) {
    lastPushedThumbnailKey = null;
  }
  if (bustState?.trackKey === trackKey && bustTimer !== null) {
    return;
  }

  if (!shouldRunThumbnailBust(bustState, trackKey)) {
    return;
  }

  if (bustState === null || bustState.trackKey !== trackKey) {
    bustState = createThumbnailBustState(trackKey);
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
  if (feedStarted) {
    return;
  }

  feedStarted = true;
  const { onSessionsChanged } = await import("windows-media-sessions");
  onSessionsChanged(handleSessionsChanged);
};

export const setNowPlayingThumbnailListener = (
  listener: ((media: HostMedia) => void) | null,
): void => {
  onThumbnailReady = listener;
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

    smtcErrorLogged = false;
    const media = mapMediaSession(session);
    if (media) {
      noteMediaThumbnail(media);
    }
    return media;
  } catch (error: unknown) {
    if (!smtcErrorLogged) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[agent] SMTC read failed: ${message}`);
      smtcErrorLogged = true;
    }
    return null;
  }
};
