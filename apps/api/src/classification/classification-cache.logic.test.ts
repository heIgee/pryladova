import { describe, expect, it } from "vitest";
import {
  CLASSIFICATION_CACHE_TTL_MS,
  isClassificationCacheFresh,
  normalizeClassificationCacheTitle,
  parseClassificationCacheRow,
} from "./classification-cache.logic.js";

const classification = {
  category: "Coding" as const,
  displayAppName: "Code",
  workRelated: "yes" as const,
};

describe("normalizeClassificationCacheTitle", () => {
  it("strips parenthetical annotations and app echo", () => {
    const appName = "MyEditor";
    const variants = [
      "notes.md - myrepo - MyEditor",
      "notes.md (Index) (notes.md) - myrepo - MyEditor",
      ".gitignore (Working Tree) (Index) - myrepo - MyEditor",
      "handler.test.ts (Index) (Working Tree) (handler.test.ts) - myrepo - MyEditor",
    ];

    const normalized = variants.map((title) => normalizeClassificationCacheTitle(appName, title));
    expect(new Set(normalized).size).toBe(3);
    expect(normalized[0]).toBe("notes.md - myrepo");
    expect(normalized[1]).toBe("notes.md - myrepo");
    expect(normalized[2]).toBe(".gitignore - myrepo");
    expect(normalized[3]).toBe("handler.test.ts - myrepo");
  });

  it("strips counted overflow suffixes and app echo", () => {
    const appName = "MyBrowser";
    expect(
      normalizeClassificationCacheTitle(
        appName,
        "Dashboard and 26 more pages - Personal - MyBrowser",
      ),
    ).toBe("dashboard - personal");
    expect(normalizeClassificationCacheTitle(appName, "myrepo - Personal - MyBrowser")).toBe(
      "myrepo - personal",
    );
  });

  it("normalizes dash variants, state markers, and case", () => {
    expect(normalizeClassificationCacheTitle("MyEditor", "● Notes.md * — myrepo — MyEditor")).toBe(
      "notes.md - myrepo",
    );
    expect(normalizeClassificationCacheTitle("MyEditor", "Notes.md - myrepo")).toBe(
      normalizeClassificationCacheTitle("MyEditor", "NOTES.MD — myrepo — MyEditor"),
    );
  });

  it("leaves unrelated titles unchanged aside from normalization", () => {
    expect(normalizeClassificationCacheTitle("ShareX", "ShareX 19.0.2")).toBe("sharex 19.0.2");
    expect(normalizeClassificationCacheTitle("SearchHost.exe", "Search")).toBe("search");
  });

  it("returns empty titles unchanged", () => {
    expect(normalizeClassificationCacheTitle("Code", "")).toBe("");
    expect(normalizeClassificationCacheTitle("Code", "   ")).toBe("");
  });

  it("strips leading app echo", () => {
    expect(normalizeClassificationCacheTitle("Code", "Code - app.tsx - myrepo")).toBe(
      "app.tsx - myrepo",
    );
  });

  it("strips bracket annotations", () => {
    expect(
      normalizeClassificationCacheTitle("MyEditor", "file.ts [Unsaved] - myrepo - MyEditor"),
    ).toBe("file.ts - myrepo");
  });

  it("collapses repeated lead tokens", () => {
    expect(normalizeClassificationCacheTitle("MyBrowser", "Tab Tab - Personal - MyBrowser")).toBe(
      "tab - personal",
    );
  });

  it("strips short counted overflow suffixes", () => {
    expect(
      normalizeClassificationCacheTitle("MyBrowser", "Inbox and 3 more - Work - MyBrowser"),
    ).toBe("inbox - work");
  });

  it("escapes regex metacharacters in app names", () => {
    expect(normalizeClassificationCacheTitle("My.App", "doc - myrepo - My.App")).toBe(
      "doc - myrepo",
    );
    expect(normalizeClassificationCacheTitle("(Code)", "(Code) - app.tsx - repo")).toBe(
      "app.tsx - repo",
    );
  });
});

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

  it("rejects invalid updated_at timestamps", () => {
    expect(isClassificationCacheFresh("not-a-date")).toBe(false);
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
