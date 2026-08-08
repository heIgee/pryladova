import { describe, expect, it } from "vitest";
import { createSessionToken, readSessionCookie, verifySessionToken } from "./session.js";

describe("session", () => {
  const secret = "test-session-secret-at-least-32-characters";

  it("creates and verifies a session token", () => {
    const token = createSessionToken(secret, 1_000);
    expect(verifySessionToken(token, secret, 1_000)).toBe(true);
  });

  it("rejects expired tokens", () => {
    const token = createSessionToken(secret, 0);
    expect(verifySessionToken(token, secret, 86_400_001)).toBe(false);
  });

  it("reads a valid session cookie header", () => {
    const token = createSessionToken(secret);
    const cookieHeader = `pryladova_session=${token}`;
    expect(readSessionCookie(cookieHeader, secret)).toBe(true);
  });
});
