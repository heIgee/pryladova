import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_CACHE_TTL_MS,
  isClassificationCacheFresh,
  parseClassificationCacheRow,
} from "./classification-cache.logic.js";

const classification = {
  category: "Coding" as const,
  displayAppName: "Code",
  workRelated: "yes" as const,
};

describe("isClassificationCacheFresh", () => {
  it("accepts rows within the 90-day ttl", () => {
    const nowMs = Date.parse("2026-08-09T12:00:00.000Z");
    const updatedAt = new Date(nowMs - CLASSIFICATION_CACHE_TTL_MS + 1).toISOString();

    expect(isClassificationCacheFresh(updatedAt, nowMs)).toBe(true);
  });

  it("rejects rows older than the ttl", () => {
    const nowMs = Date.parse("2026-08-09T12:00:00.000Z");
    const updatedAt = new Date(nowMs - CLASSIFICATION_CACHE_TTL_MS - 1).toISOString();

    expect(isClassificationCacheFresh(updatedAt, nowMs)).toBe(false);
  });
});

describe("parseClassificationCacheRow", () => {
  it("parses stored classification json", () => {
    expect(
      parseClassificationCacheRow({
        app_name: "Code",
        window_title: "app.tsx",
        classification,
        updated_at: "2026-08-09T12:00:00.000Z",
      }),
    ).toEqual(classification);
  });

  it("returns null for expired rows", () => {
    expect(
      parseClassificationCacheRow(
        {
          app_name: "Code",
          window_title: "app.tsx",
          classification,
          updated_at: "2026-01-01T12:00:00.000Z",
        },
        Date.parse("2026-08-09T12:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("returns null for invalid stored classification", () => {
    expect(
      parseClassificationCacheRow({
        app_name: "Code",
        window_title: "app.tsx",
        classification: { category: "NotReal" },
        updated_at: "2026-08-09T12:00:00.000Z",
      }),
    ).toBeNull();
  });
});
