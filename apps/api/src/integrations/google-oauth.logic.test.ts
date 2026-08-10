import { describe, expect, it } from "vitest";
import {
  buildGoogleAuthUrl,
  createOAuthStateToken,
  decodeOAuthStateCookie,
  encodeOAuthStateCookie,
  generatePkcePair,
  isInvalidGrantError,
  parseGoogleTokenError,
  verifyOAuthStateToken,
} from "./google-oauth.logic.js";

const secret = "test-session-secret-at-least-32-characters";

describe("google-oauth.logic", () => {
  it("generates PKCE pairs with S256 challenge", () => {
    const pair = generatePkcePair();
    expect(pair.codeVerifier.length).toBeGreaterThan(20);
    expect(pair.codeChallenge.length).toBeGreaterThan(20);
    expect(pair.codeVerifier).not.toBe(pair.codeChallenge);
  });

  it("builds auth URL with offline access and PKCE", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: "client-id",
        redirectUri: "http://localhost:5173/api/integrations/google/callback",
        state: "state-token",
        codeChallenge: "challenge",
        promptConsent: false,
      }),
    );

    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("prompt")).toBeNull();
    expect(url.searchParams.get("scope")).toContain("calendar.events.readonly");
    expect(url.searchParams.get("scope")).toContain("tasks.readonly");
  });

  it("adds prompt=consent on reconnect", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: "client-id",
        redirectUri: "http://localhost:5173/callback",
        state: "state-token",
        codeChallenge: "challenge",
        promptConsent: true,
      }),
    );

    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("round-trips oauth state cookie", () => {
    const state = createOAuthStateToken(secret);
    const cookie = encodeOAuthStateCookie(secret, {
      state,
      codeVerifier: "verifier-value",
    });
    const decoded = decodeOAuthStateCookie(cookie, secret);
    expect(decoded).toEqual({ state, codeVerifier: "verifier-value" });
  });

  it("rejects expired oauth state tokens", () => {
    const state = createOAuthStateToken(secret, Date.now() - 10 * 60 * 1000);
    expect(verifyOAuthStateToken(state, secret)).toBe(false);
  });

  it("detects invalid_grant token errors", () => {
    expect(isInvalidGrantError(parseGoogleTokenError({ error: "invalid_grant" }))).toBe(true);
    expect(isInvalidGrantError(parseGoogleTokenError({ error: "server_error" }))).toBe(false);
  });
});
