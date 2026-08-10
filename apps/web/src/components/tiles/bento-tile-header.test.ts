import { describe, expect, it } from "vitest";
import {
  bentoTileHeaderClassName,
  bentoTileHeaderRowClassName,
  bentoTileHeaderTestIdSuffix,
} from "./bento-tile-header-layout.js";

describe("bento-tile-header-layout", () => {
  it("uses one fixed-height row with shared padding", () => {
    expect(bentoTileHeaderRowClassName).toContain("h-5");
    expect(bentoTileHeaderRowClassName).toContain("flex");
    expect(bentoTileHeaderRowClassName).not.toContain("flex-wrap");
    expect(bentoTileHeaderClassName).toContain("py-2.5");
    expect(bentoTileHeaderClassName).toContain("border-b");
  });

  it("uses a shared tile header test id suffix", () => {
    expect(bentoTileHeaderTestIdSuffix).toBe("-tile-header");
  });
});
