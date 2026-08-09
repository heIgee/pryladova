import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadConfig panel password hash", () => {
  const envKeys = ["PANEL_PASSWORD_HASH", "PANEL_PASSWORD_HASH_B64"] as const;
  const hash = "$2b$10$TtcGsCYSJ53WtzGpi0k7lOXLR3yY2n2jrjAnw0grKQFPV9sCEtQuq";

  beforeEach(() => {
    vi.resetModules();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  it("reads hash from PANEL_PASSWORD_HASH_B64 when plain env is unset", async () => {
    process.env.PANEL_PASSWORD_HASH_B64 = Buffer.from(hash, "utf8").toString("base64");

    const { loadConfig } = await import("./config.js");
    delete process.env.PANEL_PASSWORD_HASH;
    expect(loadConfig().panelPasswordHash).toBe(hash);
  });

  it("prefers PANEL_PASSWORD_HASH env over base64", async () => {
    process.env.PANEL_PASSWORD_HASH = "$2b$10$fromenv";
    process.env.PANEL_PASSWORD_HASH_B64 = Buffer.from("$2b$10$fromb64", "utf8").toString("base64");

    const { loadConfig } = await import("./config.js");
    expect(loadConfig().panelPasswordHash).toBe("$2b$10$fromenv");
  });
});

describe("normalizeSupabaseUrl", () => {
  it("strips a trailing /rest/v1 path", async () => {
    const { normalizeSupabaseUrl } = await import("./config.js");
    expect(normalizeSupabaseUrl("https://example.supabase.co/rest/v1/")).toBe(
      "https://example.supabase.co",
    );
  });
});
