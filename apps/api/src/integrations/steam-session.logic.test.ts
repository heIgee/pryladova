import { describe, expect, it } from "vitest";
import { createSteamSessionState, updateSteamSession } from "./steam-session.logic.js";

describe("updateSteamSession", () => {
  it("clears session when not in game", () => {
    const state = updateSteamSession(
      { gameId: 570, sessionSec: 120, lastPolledAtMs: 1_000 },
      null,
      2_000,
    );
    expect(state).toEqual({ gameId: null, sessionSec: 0, lastPolledAtMs: 2_000 });
  });

  it("starts a new session when game changes", () => {
    const state = updateSteamSession(
      { gameId: 570, sessionSec: 120, lastPolledAtMs: 1_000 },
      730,
      2_000,
    );
    expect(state).toEqual({ gameId: 730, sessionSec: 0, lastPolledAtMs: 2_000 });
  });

  it("accumulates elapsed time for the same game", () => {
    const initial = createSteamSessionState();
    const started = updateSteamSession(initial, 570, 1_000);
    const continued = updateSteamSession(started, 570, 61_000);
    expect(continued.sessionSec).toBe(60);
  });

  it("does not accumulate on first poll for a game", () => {
    const state = updateSteamSession(createSteamSessionState(), 570, 5_000);
    expect(state.sessionSec).toBe(0);
  });
});
