import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadConfig", () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
  });

  it("requires INGEST_SECRET for remote profile", async () => {
    process.argv = ["node", "agent"];
    vi.stubEnv("AGENT_PROFILE", "remote");
    vi.stubEnv("API_URL", "https://example.com");
    vi.stubEnv("INGEST_SECRET", "");

    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow(/INGEST_SECRET/);
  });

  it("strips trailing slash from remote API URL", async () => {
    process.argv = ["node", "agent"];
    vi.stubEnv("AGENT_PROFILE", "remote");
    vi.stubEnv("API_URL", "https://example.com/");
    vi.stubEnv("INGEST_SECRET", "secret");

    const { loadConfig } = await import("./config.js");
    expect(loadConfig().apiUrl).toBe("https://example.com");
  });

  it("allows local profile without INGEST_SECRET", async () => {
    process.argv = ["node", "agent"];
    vi.stubEnv("AGENT_PROFILE", "local");
    vi.stubEnv("INGEST_SECRET", "");

    const { loadConfig } = await import("./config.js");
    expect(loadConfig().profile).toBe("local");
    expect(loadConfig().ingestSecret).toBeUndefined();
  });
});
