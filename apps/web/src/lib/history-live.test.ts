import { describe, expect, it } from "vitest";
import {
  applyFocusBoundary,
  applyTelemetryUpdate,
  createHistorySession,
  createLiveHistoryTracker,
  projectLiveHistory,
  resolveHistoryLiveCapMs,
  setActiveWindow,
} from "./history-live.js";

describe("history-live", () => {
  it("extends the active app from snapshot time", () => {
    const tracker = createLiveHistoryTracker(
      [{ appName: "Cursor", durationSec: 120 }],
      Date.parse("2026-08-08T12:00:00.000Z"),
      "Cursor",
      "2026-08-08T11:58:00.000Z",
    );

    expect(projectLiveHistory(tracker, Date.parse("2026-08-08T12:00:20.000Z"))).toEqual([
      { appName: "Cursor", durationSec: 140 },
    ]);
  });

  it("commits a focus boundary without double-counting the snapshot tail", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    let tracker = createLiveHistoryTracker(
      [{ appName: "Cursor", durationSec: 120 }],
      snapshotAt,
      "Cursor",
      "2026-08-08T11:58:00.000Z",
    );

    tracker = applyFocusBoundary(tracker, "Terminal", "2026-08-08T12:00:30.000Z");

    expect(tracker.totals.Cursor).toBe(150);
    expect(projectLiveHistory(tracker, Date.parse("2026-08-08T12:01:00.000Z"))).toEqual([
      { appName: "Cursor", durationSec: 150 },
      { appName: "Terminal", durationSec: 30 },
    ]);
  });

  it("seeds a session from snapshot entries and live telemetry", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    const session = createHistorySession([{ appName: "Cursor", durationSec: 60 }], snapshotAt, {
      appName: "Cursor",
      capturedAt: "2026-08-08T11:59:00.000Z",
    });

    expect(session.lastCapturedAt).toBe("2026-08-08T11:59:00.000Z");
    expect(projectLiveHistory(session.tracker, Date.parse("2026-08-08T12:00:10.000Z"))).toEqual([
      { appName: "Cursor", durationSec: 70 },
    ]);
  });

  it("ignores duplicate capturedAt when the active window is already set", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    const session = createHistorySession([{ appName: "Cursor", durationSec: 60 }], snapshotAt, {
      appName: "Cursor",
      capturedAt: "2026-08-08T11:59:00.000Z",
    });

    const next = applyTelemetryUpdate(session, {
      appName: "Cursor",
      capturedAt: "2026-08-08T11:59:00.000Z",
    });

    expect(next).toBe(session);
  });

  it("sets active window on duplicate capturedAt when snapshot had no focus", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    const session = createHistorySession([], snapshotAt, null);

    const next = applyTelemetryUpdate(session, {
      appName: "Terminal",
      capturedAt: "2026-08-08T12:00:00.000Z",
    });

    expect(next.lastCapturedAt).toBe("2026-08-08T12:00:00.000Z");
    expect(next.tracker.activeApp).toBe("Terminal");
    expect(projectLiveHistory(next.tracker, Date.parse("2026-08-08T12:00:05.000Z"))).toEqual([
      { appName: "Terminal", durationSec: 5 },
    ]);
  });

  it("commits a focus boundary on the first telemetry change after snapshot", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    const session = createHistorySession([{ appName: "Cursor", durationSec: 120 }], snapshotAt, {
      appName: "Cursor",
      capturedAt: "2026-08-08T11:58:00.000Z",
    });

    const next = applyTelemetryUpdate(session, {
      appName: "Terminal",
      capturedAt: "2026-08-08T12:00:30.000Z",
    });

    expect(next.lastCapturedAt).toBe("2026-08-08T12:00:30.000Z");
    expect(projectLiveHistory(next.tracker, Date.parse("2026-08-08T12:01:00.000Z"))).toEqual([
      { appName: "Cursor", durationSec: 150 },
      { appName: "Terminal", durationSec: 30 },
    ]);
  });

  it("accumulates local time for apps that appear after the snapshot", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    let tracker = createLiveHistoryTracker([], snapshotAt, null, null);
    tracker = setActiveWindow(tracker, "Terminal", "2026-08-08T12:00:00.000Z");

    tracker = applyFocusBoundary(tracker, "Cursor", "2026-08-08T12:00:02.000Z");

    expect(projectLiveHistory(tracker, Date.parse("2026-08-08T12:00:10.000Z"))).toEqual([
      { appName: "Cursor", durationSec: 8 },
      { appName: "Terminal", durationSec: 2 },
    ]);
  });

  it("does not extend live history beyond a stale cap", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    const tracker = createLiveHistoryTracker(
      [{ appName: "Microsoft Edge", durationSec: 300 }],
      snapshotAt,
      "Microsoft Edge",
      "2026-08-08T11:59:00.000Z",
    );
    const capNowMs = Date.parse("2026-08-08T12:00:20.000Z");

    expect(projectLiveHistory(tracker, Date.parse("2026-08-08T13:00:00.000Z"), capNowMs)).toEqual([
      { appName: "Microsoft Edge", durationSec: 320 },
    ]);
  });

  describe("downtime attribution", () => {
    it("caps live history at last input when idle exceeds threshold", () => {
      const snapshotAt = Date.parse("2026-08-09T09:00:00.000Z");
      const tracker = createLiveHistoryTracker(
        [{ appName: "Cursor", durationSec: 300 }],
        snapshotAt,
        "Cursor",
        "2026-08-08T22:00:00.000Z",
      );
      const nowMs = Date.parse("2026-08-09T09:05:00.000Z");
      const capMs = resolveHistoryLiveCapMs(
        {
          capturedAt: "2026-08-09T09:00:00.000Z",
          idleMs: 11 * 60 * 60 * 1000,
        },
        null,
        false,
      );

      expect(capMs).toBe(Date.parse("2026-08-08T22:00:00.000Z"));
      expect(projectLiveHistory(tracker, nowMs)).toEqual([{ appName: "Cursor", durationSec: 600 }]);
      expect(projectLiveHistory(tracker, nowMs, capMs ?? undefined)).toEqual([
        { appName: "Cursor", durationSec: 300 },
      ]);
    });

    it("does not cap live history when idle is below threshold", () => {
      expect(
        resolveHistoryLiveCapMs(
          { capturedAt: "2026-08-08T12:05:00.000Z", idleMs: 2 * 60 * 1000 },
          null,
          false,
        ),
      ).toBeNull();
    });

    it("uses the earlier of idle cap and agent last-seen when both apply", () => {
      const lastInputMs = Date.parse("2026-08-08T22:00:00.000Z");
      const agentCapMs = Date.parse("2026-08-08T21:55:00.000Z");
      const host = {
        capturedAt: "2026-08-09T09:00:00.000Z",
        idleMs: 11 * 60 * 60 * 1000,
      };

      expect(resolveHistoryLiveCapMs(host, agentCapMs, true)).toBe(agentCapMs);
      expect(resolveHistoryLiveCapMs(host, lastInputMs + 60_000, true)).toBe(lastInputMs);
    });
  });

  it("ignores blank app names in snapshot and live telemetry", () => {
    const snapshotAt = Date.parse("2026-08-08T12:00:00.000Z");
    const session = createHistorySession(
      [
        { appName: "SearchHost.exe", durationSec: 10 },
        { appName: "   ", durationSec: 4 },
      ],
      snapshotAt,
      null,
    );

    expect(projectLiveHistory(session.tracker, snapshotAt)).toEqual([
      { appName: "SearchHost.exe", durationSec: 10 },
    ]);

    const next = applyTelemetryUpdate(session, {
      appName: "   ",
      capturedAt: "2026-08-08T12:00:05.000Z",
    });

    expect(next).toBe(session);
  });
});
