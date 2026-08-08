import type { HostMedia } from "@pryladova/shared";
import { mapMediaSession, pickCurrentSession } from "./now-playing-core.js";

export { trackMediaKey } from "./now-playing-core.js";

let smtcErrorLogged = false;

export const readNowPlaying = async (): Promise<HostMedia | null> => {
  try {
    const { getAllSessions } = await import("windows-media-sessions");
    const sessions = await getAllSessions();
    const session = pickCurrentSession(sessions);
    if (!session) {
      return null;
    }
    smtcErrorLogged = false;
    return mapMediaSession(session);
  } catch (error: unknown) {
    if (!smtcErrorLogged) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[agent] SMTC read failed: ${message}`);
      smtcErrorLogged = true;
    }
    return null;
  }
};
