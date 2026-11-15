import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatPercent,
  formatPlaybackStatus,
  formatPlaytimeMinutes,
  formatPresence,
  IDLE_ACTIVE_THRESHOLD_MS,
} from "./format.js";

describe("formatDuration", () => {
  it.each([
    [-5, "0s"],
    [0, "0s"],
    [59.9, "59s"],
    [60, "1m"],
    [3599, "59m"],
    [3600, "1h"],
    [3660, "1h 1m"],
    [90_000, "25h"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatPlaytimeMinutes", () => {
  it("formats whole minutes and clamps negatives", () => {
    expect(formatPlaytimeMinutes(125.7)).toBe("2h 5m");
    expect(formatPlaytimeMinutes(-1)).toBe("0s");
  });
});

describe("formatPresence", () => {
  it("is active below the idle threshold and away above it", () => {
    expect(formatPresence(IDLE_ACTIVE_THRESHOLD_MS - 1)).toBe("Active");
    expect(formatPresence(IDLE_ACTIVE_THRESHOLD_MS)).toBe("Away 30s");
    expect(formatPresence(5 * 60_000)).toBe("Away 5m");
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(42.4)).toBe("42%");
    expect(formatPercent(42.5)).toBe("43%");
  });
});

describe("formatPlaybackStatus", () => {
  it.each([
    ["playing", "Playing"],
    ["paused", "Paused"],
    ["stopped", "Stopped"],
    ["unknown", "Unknown"],
  ] as const)("labels %s", (status, label) => {
    expect(formatPlaybackStatus(status)).toBe(label);
  });
});
