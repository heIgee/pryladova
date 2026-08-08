import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "pryladova_session";
const SESSION_TTL_MS = 86_400_000;

type SessionPayload = {
  exp: number;
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

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    return typeof payload.exp === "number" && payload.exp > now;
  } catch {
    return false;
  }
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
    return verifySessionToken(decodeURIComponent(value), secret);
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
