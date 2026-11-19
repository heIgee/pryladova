import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "pryladova_session";
const SESSION_TTL_MS = 86_400_000;

type SessionPayload = {
  exp: number;
};

const parseSessionPayload = (raw: string): SessionPayload | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("exp" in parsed)) {
      return null;
    }
    const { exp } = parsed;
    if (typeof exp !== "number") {
      return null;
    }
    return { exp };
  } catch {
    // Malformed base64 JSON in the session cookie body is treated as unsigned.
    return null;
  }
};

const signBody = (secret: string, body: string): string =>
  createHmac("sha256", secret).update(body).digest("base64url");

export const createSessionToken = (secret: string, now = Date.now()): string => {
  const payload: SessionPayload = { exp: now + SESSION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signBody(secret, body)}`;
};

export const verifySessionToken = (token: string, secret: string, now = Date.now()): boolean => {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = signBody(secret, body);
  if (signature.length !== expected.length) {
    return false;
  }

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }

  const payload = parseSessionPayload(Buffer.from(body, "base64url").toString("utf8"));
  return payload !== null && payload.exp > now;
};

export const readSessionCookie = (cookieHeader: string | undefined, secret: string): boolean => {
  if (!cookieHeader) {
    return false;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      continue;
    }
    const value = trimmed.slice(SESSION_COOKIE_NAME.length + 1);
    if (value.length === 0) {
      return false;
    }
    try {
      return verifySessionToken(decodeURIComponent(value), secret);
    } catch {
      // decodeURIComponent fails on malformed cookie encoding; treat as signed out.
      return false;
    }
  }

  return false;
};

export const sessionCookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  maxAge: SESSION_TTL_MS,
  path: "/",
});
