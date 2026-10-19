import { describe, expect, it } from "vitest";
import {
  advanceHeartbeatMemory,
  buildHistorySpans,
  computeIntervalSegmentDurationSec,
  createHeartbeatMemoryFromDb,
  createSerializedRunner,
  HEARTBEAT_PERSIST_MS,
  isStaleHeartbeatGap,
  mapIntervalSummaryRows,
  parseCloseAndOpenResult,
  parseIntervalSummaryRpcResult,
  resolveIdleResumeCloseAt,
  resolveLastActiveAt,
  resolveOpenSegmentEndAt,
  resolveStaleCloseBoundary,
  resolveStaleSegmentEndAt,
} from "./segment.logic.js";

describe("segment.logic", () => {
  it("detects stale heartbeat gaps over five minutes", () => {
    expect(isStaleHeartbeatGap("2026-01-01T12:00:00.000Z", "2026-01-01T12:04:59.000Z")).toBe(false);
    expect(isStaleHeartbeatGap("2026-01-01T12:00:00.000Z", "2026-01-01T12:05:01.000Z")).toBe(true);
  });

  it("resolves stale close boundary from persisted heartbeat", () => {
    expect(resolveStaleCloseBoundary("2026-01-01T12:00:00.000Z", "2026-01-01T12:05:01.000Z")).toBe(
      "2026-01-01T12:00:00.000Z",
    );
    expect(
      resolveStaleCloseBoundary("2026-01-01T12:00:00.000Z", "2026-01-01T12:04:00.000Z"),
    ).toBeNull();
    expect(resolveStaleCloseBoundary(null, "2026-01-01T12:05:01.000Z")).toBeNull();
  });

  it("closes an idle gap at the previous last_active, not at the resume time", () => {
    expect(resolveIdleResumeCloseAt("2026-01-01T12:00:00.000Z", "2026-01-01T18:00:00.000Z")).toBe(
      "2026-01-01T12:00:00.000Z",
    );
    expect(
      resolveIdleResumeCloseAt("2026-01-01T12:00:00.000Z", "2026-01-01T12:04:00.000Z"),
    ).toBeNull();
    expect(resolveIdleResumeCloseAt(null, "2026-01-01T18:00:00.000Z")).toBeNull();
  });

  it("ends a segment at its start when the heartbeat predates it", () => {
    const startedAt = "2026-08-27T15:41:57.906Z";
    expect(resolveStaleSegmentEndAt(startedAt, "2026-08-27T15:00:00.000Z")).toBe(startedAt);
    expect(resolveStaleSegmentEndAt(startedAt, "2026-08-27T16:00:00.000Z")).toBe(
      "2026-08-27T16:00:00.000Z",
    );
  });

  it("resolves last active time from idle duration", () => {
    expect(resolveLastActiveAt("2026-01-01T18:00:00.000Z", 5 * 60 * 1000)).toBe(
      "2026-01-01T17:55:00.000Z",
    );
    expect(resolveLastActiveAt("2026-01-01T18:00:00.000Z", 30_000)).toBe(
      "2026-01-01T18:00:00.000Z",
    );
  });

  describe("downtime attribution", () => {
    const dayStart = "2026-08-09T00:00:00.000Z";
    const dayEnd = "2026-08-10T00:00:00.000Z";
    const range = { start: dayStart, end: dayEnd };

    it("does not count overnight idle as open-segment time when last_active_at is stale", () => {
      const segment = {
        startedAt: "2026-08-08T22:00:00.000Z",
        endedAt: null,
      };
      const heartbeat = {
        lastSeenAt: "2026-08-09T09:00:00.000Z",
        lastActiveAt: "2026-08-08T22:05:00.000Z",
      };

      expect(computeIntervalSegmentDurationSec(segment, heartbeat, range)).toBe(0);
    });

    it("counts active time within the day when last_active_at is recent", () => {
      const segment = {
        startedAt: "2026-08-09T08:00:00.000Z",
        endedAt: null,
      };
      const heartbeat = {
        lastSeenAt: "2026-08-09T09:00:00.000Z",
        lastActiveAt: "2026-08-09T08:55:00.000Z",
      };

      expect(computeIntervalSegmentDurationSec(segment, heartbeat, range)).toBe(3300);
    });

    it("shows how heartbeat-only capping would inflate cursor downtime", () => {
      const segment = {
        startedAt: "2026-08-08T22:00:00.000Z",
        endedAt: null,
      };
      const heartbeatSeenOnly = {
        lastSeenAt: "2026-08-09T09:00:00.000Z",
        lastActiveAt: null,
      };

      expect(computeIntervalSegmentDurationSec(segment, heartbeatSeenOnly, range)).toBe(32_400);
    });

    it("prefers last_active_at over last_seen_at for open segments", () => {
      expect(
        resolveOpenSegmentEndAt(
          { startedAt: "2026-08-08T22:00:00.000Z", endedAt: null },
          {
            lastSeenAt: "2026-08-09T09:00:00.000Z",
            lastActiveAt: "2026-08-08T22:05:00.000Z",
          },
        ),
      ).toBe("2026-08-08T22:05:00.000Z");
    });

    it("keeps closed segment end times independent of heartbeat", () => {
      const segment = {
        startedAt: "2026-08-09T08:00:00.000Z",
        endedAt: "2026-08-09T08:30:00.000Z",
      };
      const heartbeat = {
        lastSeenAt: "2026-08-09T09:00:00.000Z",
        lastActiveAt: "2026-08-09T08:05:00.000Z",
      };

      expect(computeIntervalSegmentDurationSec(segment, heartbeat, range)).toBe(1800);
    });

    it("tracks idleMs into last_active_at while last_seen_at advances", () => {
      const walkAway = advanceHeartbeatMemory(
        createHeartbeatMemoryFromDb(
          "2026-08-08T22:00:00.000Z",
          "2026-08-08T22:00:00.000Z",
          "2026-08-08T22:00:00.000Z",
          Date.parse("2026-08-08T22:00:00.000Z"),
        ),
        "2026-08-09T09:00:00.000Z",
        Date.parse("2026-08-09T09:00:00.000Z"),
        { idleMs: 11 * 60 * 60 * 1000 },
      );

      expect(walkAway.memory.lastSeenAt).toBe("2026-08-09T09:00:00.000Z");
      expect(walkAway.memory.lastActiveAt).toBe("2026-08-08T22:00:00.000Z");
    });
  });

  it("debounces heartbeat persistence until the interval elapses", () => {
    const bootAt = Date.parse("2026-01-01T12:00:00.000Z");
    const bootstrapped = createHeartbeatMemoryFromDb(
      "2026-01-01T12:00:00.000Z",
      "2026-01-01T12:00:00.000Z",
      "2026-01-01T12:00:02.000Z",
      bootAt,
    );

    const first = advanceHeartbeatMemory(
      bootstrapped,
      "2026-01-01T12:00:02.000Z",
      bootAt + HEARTBEAT_PERSIST_MS - 1,
    );
    expect(first.shouldPersist).toBe(false);

    const second = advanceHeartbeatMemory(
      first.memory,
      "2026-01-01T12:00:04.000Z",
      bootAt + HEARTBEAT_PERSIST_MS,
    );
    expect(second.shouldPersist).toBe(true);
    expect(second.memory.lastPersistedAt).toBe("2026-01-01T12:00:04.000Z");
  });

  it("forces heartbeat persistence on shutdown flush", () => {
    const bootstrapped = createHeartbeatMemoryFromDb(
      "2026-01-01T12:00:00.000Z",
      "2026-01-01T12:00:00.000Z",
      "2026-01-01T12:00:02.000Z",
      0,
    );

    const flushed = advanceHeartbeatMemory(bootstrapped, "2026-01-01T12:00:04.000Z", 1, {
      forcePersist: true,
    });

    expect(flushed.shouldPersist).toBe(true);
    expect(flushed.memory.lastPersistedAt).toBe("2026-01-01T12:00:04.000Z");
  });

  it("parses close_and_open_segment RPC results", () => {
    expect(parseCloseAndOpenResult({ action: "noop" })).toEqual({ action: "noop" });
    expect(parseCloseAndOpenResult({ action: "opened", segment_id: "abc" })).toEqual({
      action: "opened",
      segment_id: "abc",
    });
    expect(parseCloseAndOpenResult({ action: "opened" })).toBeNull();
  });

  it("builds day spans from overlapping segments", () => {
    const range = { start: "2026-08-08T00:00:00.000Z", end: "2026-08-09T00:00:00.000Z" };

    expect(
      buildHistorySpans(
        [
          {
            app_name: "Cursor",
            started_at: "2026-08-07T23:00:00.000Z",
            ended_at: "2026-08-08T01:00:00.000Z",
          },
          {
            app_name: "Cursor",
            started_at: "2026-08-08T01:00:00.000Z",
            ended_at: "2026-08-08T01:30:00.000Z",
          },
          {
            app_name: "Cursor",
            started_at: "2026-08-08T01:30:01.000Z",
            ended_at: "2026-08-08T01:40:00.000Z",
          },
          {
            app_name: "Edge",
            started_at: "2026-08-08T03:00:00.000Z",
            ended_at: "2026-08-08T03:05:00.000Z",
          },
          {
            app_name: "   ",
            started_at: "2026-08-08T04:00:00.000Z",
            ended_at: "2026-08-08T04:05:00.000Z",
          },
          {
            app_name: "Cursor",
            started_at: "2026-08-08T12:00:00.000Z",
            ended_at: null,
          },
        ],
        { lastActiveAt: "2026-08-08T12:40:00.000Z", lastSeenAt: "2026-08-08T12:40:00.000Z" },
        range,
      ),
    ).toEqual([
      {
        appName: "Cursor",
        startedAt: "2026-08-08T00:00:00.000Z",
        endedAt: "2026-08-08T01:40:00.000Z",
      },
      {
        appName: "Edge",
        startedAt: "2026-08-08T03:00:00.000Z",
        endedAt: "2026-08-08T03:05:00.000Z",
      },
      {
        appName: "Cursor",
        startedAt: "2026-08-08T12:00:00.000Z",
        endedAt: "2026-08-08T12:40:00.000Z",
        open: true,
      },
    ]);
  });

  it("ends a still-open segment at midnight on a past day", () => {
    expect(
      buildHistorySpans(
        [
          {
            app_name: "Cursor",
            started_at: "2026-08-07T23:00:00.000Z",
            ended_at: null,
          },
        ],
        { lastActiveAt: "2026-08-08T12:00:00.000Z", lastSeenAt: "2026-08-08T12:00:00.000Z" },
        { start: "2026-08-07T00:00:00.000Z", end: "2026-08-08T00:00:00.000Z" },
      ),
    ).toEqual([
      {
        appName: "Cursor",
        startedAt: "2026-08-07T23:00:00.000Z",
        endedAt: "2026-08-08T00:00:00.000Z",
      },
    ]);
  });

  it("keeps a real gap between two visits to the same app", () => {
    expect(
      buildHistorySpans(
        [
          {
            app_name: "Cursor",
            started_at: "2026-08-08T01:00:00.000Z",
            ended_at: "2026-08-08T01:10:00.000Z",
          },
          {
            app_name: "Cursor",
            started_at: "2026-08-08T01:10:01.001Z",
            ended_at: "2026-08-08T01:20:00.000Z",
          },
        ],
        null,
        { start: "2026-08-08T00:00:00.000Z", end: "2026-08-09T00:00:00.000Z" },
      ),
    ).toEqual([
      {
        appName: "Cursor",
        startedAt: "2026-08-08T01:00:00.000Z",
        endedAt: "2026-08-08T01:10:00.000Z",
      },
      {
        appName: "Cursor",
        startedAt: "2026-08-08T01:10:01.001Z",
        endedAt: "2026-08-08T01:20:00.000Z",
      },
    ]);
  });

  it("maps interval summary rows to shared shape", () => {
    expect(
      mapIntervalSummaryRows([
        { app_name: "Code", duration_sec: 120, switch_count: 4 },
        { app_name: "Firefox", duration_sec: 45, switch_count: 0 },
      ]),
    ).toEqual([
      { appName: "Code", durationSec: 120, switchCount: 4 },
      { appName: "Firefox", durationSec: 45 },
    ]);
  });

  it("drops interval summary rows with blank app names", () => {
    expect(
      mapIntervalSummaryRows([
        { app_name: "   ", duration_sec: 4, switch_count: 1 },
        { app_name: "SearchHost.exe", duration_sec: 10, switch_count: 0 },
      ]),
    ).toEqual([{ appName: "SearchHost.exe", durationSec: 10 }]);
  });

  it("parses get_interval_summary RPC rows", () => {
    expect(parseIntervalSummaryRpcResult([{ app_name: "Code", duration_sec: "120" }])).toEqual([
      { app_name: "Code", duration_sec: 120, switch_count: 0 },
    ]);
    expect(
      parseIntervalSummaryRpcResult([{ app_name: "Code", duration_sec: 120, switch_count: "3" }]),
    ).toEqual([{ app_name: "Code", duration_sec: 120, switch_count: 3 }]);
    expect(parseIntervalSummaryRpcResult(null)).toEqual([]);
    expect(parseIntervalSummaryRpcResult([{ app_name: "Code" }])).toEqual([]);
  });

  it("runs serialized jobs in order per key", async () => {
    const run = createSerializedRunner();
    const order: number[] = [];

    await Promise.all([
      run("agent-a", async () => {
        order.push(1);
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
        order.push(2);
      }),
      run("agent-a", async () => {
        order.push(3);
      }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("does not block the queue after a rejected job", async () => {
    const run = createSerializedRunner();

    await expect(
      run("agent-a", async () => {
        throw new Error("fail");
      }),
    ).rejects.toThrow("fail");

    await expect(run("agent-a", async () => "ok")).resolves.toBe("ok");
  });

  it("serializes independently per key", async () => {
    const run = createSerializedRunner();
    const order: string[] = [];

    await Promise.all([
      run("agent-a", async () => {
        order.push("a-start");
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
        order.push("a-end");
      }),
      run("agent-b", async () => {
        order.push("b");
      }),
    ]);

    expect(order).toEqual(["a-start", "b", "a-end"]);
  });
});
