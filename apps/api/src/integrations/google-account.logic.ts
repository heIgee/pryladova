import { z } from "zod";

export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const googleUserInfoSchema = z.object({
  email: z.string().email().optional(),
});

const googleIdTokenPayloadSchema = z.object({
  email: z.string().email().optional(),
});

export const parseGoogleIdTokenEmail = (idToken: string | undefined): string | null => {
  if (!idToken) {
    return null;
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = googleIdTokenPayloadSchema.parse(
      JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")),
    );
    return payload.email ?? null;
  } catch {
    return null;
  }
};

export const fetchGoogleAccountEmail = async (accessToken: string): Promise<string | null> => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo HTTP ${response.status}`);
  }

  const json: unknown = await response.json();
  const parsed = googleUserInfoSchema.parse(json);
  return parsed.email ?? null;
};
