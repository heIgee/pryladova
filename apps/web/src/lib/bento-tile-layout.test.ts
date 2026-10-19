import { describe, expect, it } from "vitest";
import { bentoSizeKey, pickBentoLayout } from "./bento-tile-layout.js";
import { integrationListCap, pickGithubLayout, pickMediaLayout } from "./bento-tile-variants.js";

describe("bento-tile-layout", () => {
  it("formats size keys", () => {
    expect(bentoSizeKey({ col: 6, row: 3 })).toBe("6x3");
  });

  it("prefers exact keys over rules", () => {
    const variant = pickBentoLayout(
      { "4x3": "spacious" },
      [{ minRow: 3, variant: "default" }],
      { col: 4, row: 3 },
      "default",
    );
    expect(variant).toBe("spacious");
  });

  it("picks highest-scoring matching rule", () => {
    const variant = pickBentoLayout(
      {},
      [
        { minRow: 2, variant: "default" },
        { minRow: 3, variant: "compact" },
      ],
      { col: 6, row: 3 },
      "default",
    );
    expect(variant).toBe("compact");
  });
});

describe("tile layout variants", () => {
  it("media hero at 6x3", () => {
    expect(pickMediaLayout({ col: 6, row: 3 })).toBe("hero");
  });

  it("media stack at 3x3", () => {
    expect(pickMediaLayout({ col: 3, row: 3 })).toBe("stack");
  });

  it("media split at 6x2", () => {
    expect(pickMediaLayout({ col: 6, row: 2 })).toBe("split");
  });

  it("github spacious at h4", () => {
    expect(pickGithubLayout({ col: 4, row: 4 })).toBe("spacious");
    expect(pickGithubLayout({ col: 4, row: 3 })).toBe("default");
  });

  it("integration list cap grows with row span", () => {
    expect(integrationListCap(2)).toBe(3);
    expect(integrationListCap(3)).toBe(4);
    expect(integrationListCap(4)).toBe(6);
    expect(integrationListCap(6)).toBe(10);
    expect(integrationListCap(12)).toBe(22);
  });
});
