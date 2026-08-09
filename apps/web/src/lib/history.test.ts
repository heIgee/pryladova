import type { HistoryEntry } from "@pryladova/shared";
import { describe, expect, it, vi } from "vitest";
import {
  fetchHistory,
  formatDurationSec,
  HISTORY_VISIBLE_LIMIT,
  localDayUtcRange,
  partitionHistoryEntries,
  summarizeHistoryEntries,
} from "./history.js";

const entry = (appName: string, durationSec: number): HistoryEntry => ({ appName, durationSec });

const manyEntries = (): HistoryEntry[] =>
  Array.from({ length: 12 }, (_, index) => entry(`App ${index + 1}`, 100 - index * 5));

describe("history helpers", () => {
  it("formats durations for display", () => {
    expect(formatDurationSec(45)).toBe("45s");
    expect(formatDurationSec(120)).toBe("2m");
    expect(formatDurationSec(3720)).toBe("1h 2m");
    expect(formatDurationSec(7200)).toBe("2h");
  });

  it("builds local calendar day bounds as UTC instants", () => {
    const { from, to } = localDayUtcRange(new Date("2026-08-08T15:30:00"));
    expect(from.endsWith("Z")).toBe(true);
    expect(to.endsWith("Z")).toBe(true);
    expect(Date.parse(to) - Date.parse(from)).toBe(24 * 60 * 60 * 1000);
  });

  it("summarizes total duration and app count", () => {
    expect(
      summarizeHistoryEntries([entry("Edge", 3600), entry("Cursor", 2280), entry("Telegram", 60)]),
    ).toEqual({ totalDurationSec: 5940, appCount: 3 });
  });
});

describe("partitionHistoryEntries", () => {
  it("returns all entries when within the visible limit", () => {
    const entries = Array.from({ length: 5 }, (_, index) => entry(`App ${index}`, 60 - index));
    expect(partitionHistoryEntries(entries)).toEqual({ visible: entries, other: null });
  });

  it("partitions long lists into visible rows and an other bucket", () => {
    const entries = manyEntries();
    const { visible, other } = partitionHistoryEntries(entries);

    expect(visible).toHaveLength(HISTORY_VISIBLE_LIMIT);
    expect(other).toEqual({ appCount: 4, durationSec: 210 });
  });

  it("keeps the active app visible when it falls outside the top slice", () => {
    const entries = manyEntries();
    const activeAppName = "App 11";

    const { visible, other } = partitionHistoryEntries(entries, { activeAppName });

    expect(visible.some((row) => row.appName === activeAppName)).toBe(true);
    expect(visible).toHaveLength(HISTORY_VISIBLE_LIMIT);
    expect(other?.appCount).toBe(4);
  });

  it("returns all entries when expanded", () => {
    const entries = manyEntries();
    expect(partitionHistoryEntries(entries, { expanded: true })).toEqual({
      visible: entries,
      other: null,
    });
  });
});

describe("fetchHistory", () => {
  it("returns parsed history entries on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          entries: [{ appName: "Code", durationSec: 120 }],
        }),
      }),
    );

    await expect(
      fetchHistory("2026-08-08T00:00:00.000Z", "2026-08-09T00:00:00.000Z"),
    ).resolves.toEqual({
      entries: [{ appName: "Code", durationSec: 120 }],
    });

    vi.unstubAllGlobals();
  });

  it("throws with API error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: "Database schema not applied" }),
      }),
    );

    await expect(
      fetchHistory("2026-08-08T00:00:00.000Z", "2026-08-09T00:00:00.000Z"),
    ).rejects.toThrow("Database schema not applied");

    vi.unstubAllGlobals();
  });
});
