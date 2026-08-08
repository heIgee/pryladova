import { execSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetReleaseCacheForTests, resolveRelease } from "./release.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("resolveRelease", () => {
  afterEach(() => {
    resetReleaseCacheForTests();
    vi.unstubAllEnvs();
    vi.mocked(execSync).mockReset();
  });

  it("returns SENTRY_RELEASE from env without calling git", () => {
    vi.stubEnv("SENTRY_RELEASE", "release-from-env");

    expect(resolveRelease()).toBe("release-from-env");
    expect(resolveRelease()).toBe("release-from-env");
    expect(execSync).not.toHaveBeenCalled();
  });

  it("caches git rev-parse after the first lookup", () => {
    vi.mocked(execSync).mockReturnValue("abc123\n");

    expect(resolveRelease()).toBe("abc123");
    expect(resolveRelease()).toBe("abc123");
    expect(execSync).toHaveBeenCalledTimes(1);
  });
});
