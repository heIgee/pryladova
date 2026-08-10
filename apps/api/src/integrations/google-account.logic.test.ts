import { describe, expect, it, vi } from "vitest";
import {
  fetchGoogleAccountEmail,
  GOOGLE_USERINFO_URL,
  parseGoogleIdTokenEmail,
} from "./google-account.logic.js";

describe("parseGoogleIdTokenEmail", () => {
  it("returns email from id_token payload", () => {
    const payload = Buffer.from(JSON.stringify({ email: "user@example.com" })).toString(
      "base64url",
    );
    expect(parseGoogleIdTokenEmail(`header.${payload}.sig`)).toBe("user@example.com");
  });
});

describe("fetchGoogleAccountEmail", () => {
  it("returns email from userinfo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(GOOGLE_USERINFO_URL);
        return {
          ok: true,
          json: async () => ({ email: "user@example.com" }),
        };
      }),
    );

    await expect(fetchGoogleAccountEmail("access-token")).resolves.toBe("user@example.com");
  });

  it("returns null when email is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      })),
    );

    await expect(fetchGoogleAccountEmail("access-token")).resolves.toBeNull();
  });
});
