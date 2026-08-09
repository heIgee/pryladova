export type SteamSessionState = {
  gameId: number | null;
  sessionSec: number;
  lastPolledAtMs: number;
};

export const createSteamSessionState = (): SteamSessionState => ({
  gameId: null,
  sessionSec: 0,
  lastPolledAtMs: 0,
});

export const updateSteamSession = (
  state: SteamSessionState,
  gameId: number | null,
  nowMs: number,
): SteamSessionState => {
  if (gameId === null) {
    return {
      gameId: null,
      sessionSec: 0,
      lastPolledAtMs: nowMs,
    };
  }

  if (state.gameId === null || state.gameId !== gameId) {
    return {
      gameId,
      sessionSec: 0,
      lastPolledAtMs: nowMs,
    };
  }

  if (state.lastPolledAtMs <= 0) {
    return {
      gameId,
      sessionSec: 0,
      lastPolledAtMs: nowMs,
    };
  }

  const elapsedSec = Math.max(0, Math.floor((nowMs - state.lastPolledAtMs) / 1000));
  return {
    gameId,
    sessionSec: state.sessionSec + elapsedSec,
    lastPolledAtMs: nowMs,
  };
};
