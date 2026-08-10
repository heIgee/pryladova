import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
].join(" ");
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

const oauthStatePayloadSchema = z.object({
  nonce: z.string().min(1),
  exp: z.number().int().positive(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  token_type: z.string().optional(),
});

const tokenErrorSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
});

export type GooglePkcePair = {
  codeVerifier: string;
  codeChallenge: string;
};

export type GoogleOAuthStateCookie = {
  state: string;
  codeVerifier: string;
};

export type GoogleTokenResponse = z.infer<typeof tokenResponseSchema>;

export type GoogleTokenError = z.infer<typeof tokenErrorSchema>;

const signPayload = (secret: string, body: string): string =>
  createHmac("sha256", secret).update(body).digest("base64url");

export const generatePkcePair = (): GooglePkcePair => {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
};

export const createOAuthStateToken = (secret: string, now = Date.now()): string => {
  const payload = {
    nonce: randomBytes(16).toString("base64url"),
    exp: now + OAUTH_STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signPayload(secret, body)}`;
};

export const verifyOAuthStateToken = (token: string, secret: string, now = Date.now()): boolean => {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = signPayload(secret, body);
  if (signature.length !== expected.length) {
    return false;
  }
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }

  try {
    const payload = oauthStatePayloadSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    return payload.exp > now;
  } catch {
    return false;
  }
};

export const buildGoogleAuthUrl = (params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  promptConsent: boolean;
}): string => {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES);
  url.searchParams.set("state", params.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.promptConsent) {
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
};

export const encodeOAuthStateCookie = (
  secret: string,
  value: GoogleOAuthStateCookie,
  now = Date.now(),
): string => {
  const payload = { ...value, exp: now + OAUTH_STATE_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signPayload(secret, body)}`;
};

const oauthStateCookieSchema = z.object({
  state: z.string().min(1),
  codeVerifier: z.string().min(1),
  exp: z.number().int().positive(),
});

export const decodeOAuthStateCookie = (
  token: string | undefined,
  secret: string,
  now = Date.now(),
): GoogleOAuthStateCookie | null => {
  if (!token) {
    return null;
  }

  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = signPayload(secret, body);
  if (signature.length !== expected.length) {
    return null;
  }
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const parsed = oauthStateCookieSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    if (parsed.exp <= now) {
      return null;
    }
    return { state: parsed.state, codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
};

export const parseGoogleTokenResponse = (json: unknown): GoogleTokenResponse =>
  tokenResponseSchema.parse(json);

export const parseGoogleTokenError = (json: unknown): GoogleTokenError | null => {
  const parsed = tokenErrorSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
};

export const isInvalidGrantError = (error: GoogleTokenError | null): boolean =>
  error?.error === "invalid_grant";

export const oauthStateCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  maxAge: OAUTH_STATE_TTL_MS,
  path: "/",
});

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
