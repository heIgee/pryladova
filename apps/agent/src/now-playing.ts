import type { HostMedia } from "@pryladova/shared";
import { mapMediaSession, pickCurrentSession } from "./now-playing-core.js";

export type { MediaSession, SmtcPlaybackStatus } from "./now-playing-core.js";
export { mapMediaSession, pickCurrentSession, trackMediaKey } from "./now-playing-core.js";

export const readNowPlaying = async (): Promise<HostMedia | null> => {
  try {
    const { getAllSessions } = await import("windows-media-sessions");
    const sessions = await getAllSessions();
    const session = pickCurrentSession(sessions);
    if (!session) {
      return null;
    }
    return mapMediaSession(session);
  } catch {
    return null;
  }
};
