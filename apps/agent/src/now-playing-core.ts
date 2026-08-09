import { type HostMedia, type PlaybackStatus, trackMediaKey } from "@pryladova/shared";

export { trackMediaKey };

type SmtcPlaybackStatus = "playing" | "paused" | "stopped" | "opened" | "changing" | "closed";

type MediaSession = {
  id: string;
  sourceAppUserModelId: string;
  title?: string;
  artist?: string;
  albumTitle?: string;
  playbackStatus: SmtcPlaybackStatus;
  thumbnail?: string;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asThumbnailDataUrl = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:image/")) {
    return null;
  }
  return trimmed;
};

const mapPlaybackStatus = (value: SmtcPlaybackStatus): PlaybackStatus => {
  switch (value) {
    case "playing":
      return "playing";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    default:
      return "unknown";
  }
};

const playbackRank = (status: SmtcPlaybackStatus): number => {
  switch (status) {
    case "playing":
      return 0;
    case "paused":
      return 1;
    case "opened":
      return 2;
    case "changing":
      return 3;
    case "stopped":
      return 4;
    case "closed":
      return 5;
    default:
      return 6;
  }
};

export const pickCurrentSession = (sessions: readonly MediaSession[]): MediaSession | null => {
  const candidates = sessions.filter((session) => asNonEmptyString(session.title));
  if (candidates.length === 0) {
    return null;
  }

  return (
    [...candidates].sort(
      (left, right) => playbackRank(left.playbackStatus) - playbackRank(right.playbackStatus),
    )[0] ?? null
  );
};

export const mapMediaSession = (session: MediaSession): HostMedia | null => {
  const title = asNonEmptyString(session.title);
  if (!title) {
    return null;
  }

  return {
    title,
    artist: asNonEmptyString(session.artist),
    albumTitle: asNonEmptyString(session.albumTitle),
    appName: asNonEmptyString(session.sourceAppUserModelId),
    playbackStatus: mapPlaybackStatus(session.playbackStatus),
    thumbnailDataUrl: asThumbnailDataUrl(session.thumbnail),
  };
};

export type HostMediaThumbnailState = {
  lastTrackKey: string;
  cachedThumbnail: string | null;
};

export const resolveHostMediaThumbnail = (
  media: HostMedia,
  state: HostMediaThumbnailState,
): HostMediaThumbnailState & { thumbnailDataUrl: string | null } => {
  const newTrackKey = trackMediaKey(media);
  const trackChanged = newTrackKey !== state.lastTrackKey;
  const nextCached = trackChanged
    ? media.thumbnailDataUrl
    : (state.cachedThumbnail ?? media.thumbnailDataUrl);
  const shouldSendThumbnail =
    trackChanged || (state.cachedThumbnail === null && media.thumbnailDataUrl !== null);

  return {
    lastTrackKey: newTrackKey,
    cachedThumbnail: nextCached,
    thumbnailDataUrl: shouldSendThumbnail
      ? (media.thumbnailDataUrl ?? state.cachedThumbnail)
      : null,
  };
};
