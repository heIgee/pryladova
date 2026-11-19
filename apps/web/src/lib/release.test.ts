import { describe, expect, it } from "vitest";
import { resolveDisplayedRelease } from "./release";

describe("resolveDisplayedRelease", () => {
  it("uses the build release until health syncs", () => {
    expect(
      resolveDisplayedRelease("builddeadbeef", { healthSynced: false, apiRelease: "apideadbeef" }),
    ).toBe("builddeadbeef");
  });

  it("uses the API release after health syncs", () => {
    expect(
      resolveDisplayedRelease("builddeadbeef", { healthSynced: true, apiRelease: "apideadbeef" }),
    ).toBe("apideadbeef");
  });

  it("uses an empty string when health omits release", () => {
    expect(
      resolveDisplayedRelease("builddeadbeef", { healthSynced: true, apiRelease: undefined }),
    ).toBe("");
  });
});
