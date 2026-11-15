import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "./safe-url.js";

describe("safeHttpUrl", () => {
  it("keeps http and https urls", () => {
    expect(safeHttpUrl("https://github.com/octocat")).toBe("https://github.com/octocat");
    expect(safeHttpUrl("http://example.com/a")).toBe("http://example.com/a");
  });

  it("drops non-http schemes and garbage", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:image/svg+xml,<svg></svg>")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
