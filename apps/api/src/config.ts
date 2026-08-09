import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export type ApiConfig = {
  geminiApiKey: string | undefined;
  geminiModel: string;
  ingestSecret: string | undefined;
  sentryDsn: string | undefined;
  sessionSecret: string | undefined;
  panelPasswordHash: string | undefined;
  supabaseUrl: string | undefined;
  supabaseSecretKey: string | undefined;
  githubToken: string | undefined;
  githubUsername: string | undefined;
  steamApiKey: string | undefined;
  steamId: string | undefined;
};

export const requirePanelAuth = (
  config: ApiConfig,
): { sessionSecret: string; panelPasswordHash: string } => {
  if (!config.sessionSecret || !config.panelPasswordHash) {
    throw new Error("Panel auth is not configured");
  }

  return {
    sessionSecret: config.sessionSecret,
    panelPasswordHash: config.panelPasswordHash,
  };
};

const decodePanelPasswordHashB64 = (encoded: string): string | undefined => {
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8").trim();
    return decoded || undefined;
  } catch {
    return undefined;
  }
};

const readPanelPasswordHash = (): string | undefined => {
  const fromEnv = process.env.PANEL_PASSWORD_HASH?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const b64 = process.env.PANEL_PASSWORD_HASH_B64?.trim();
  if (!b64) {
    return undefined;
  }

  return decodePanelPasswordHashB64(b64);
};

export const normalizeSupabaseUrl = (url: string | undefined): string | undefined => {
  if (!url) {
    return undefined;
  }
  const trimmed = url.replace(/\/+$/, "");
  const withoutRestPath = trimmed.replace(/\/rest\/v1$/i, "");
  return withoutRestPath || undefined;
};

export const loadConfig = (): ApiConfig => {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const ingestSecret = process.env.INGEST_SECRET?.trim() || undefined;
  const sentryDsn = process.env.SENTRY_DSN?.trim() || undefined;
  const sessionSecret = process.env.SESSION_SECRET?.trim() || undefined;
  const panelPasswordHash = readPanelPasswordHash();
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL?.trim());
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim() || undefined;
  const githubToken = process.env.GITHUB_TOKEN?.trim() || undefined;
  const githubUsername = process.env.GITHUB_USERNAME?.trim() || undefined;
  const steamApiKey = process.env.STEAM_API_KEY?.trim() || undefined;
  const steamId = process.env.STEAM_ID?.trim() || undefined;

  return {
    geminiApiKey,
    geminiModel,
    ingestSecret,
    sentryDsn,
    sessionSecret,
    panelPasswordHash,
    supabaseUrl,
    supabaseSecretKey,
    githubToken,
    githubUsername,
    steamApiKey,
    steamId,
  };
};

export const assertPanelAuthConfig = (config: ApiConfig): void => {
  if (!config.sessionSecret) {
    throw new Error("SESSION_SECRET is required");
  }
  if (!config.panelPasswordHash) {
    throw new Error("PANEL_PASSWORD_HASH or PANEL_PASSWORD_HASH_B64 is required");
  }
};

export const assertProductionIngestSecret = (config: ApiConfig): void => {
  if (process.env.NODE_ENV === "production" && !config.ingestSecret) {
    throw new Error("INGEST_SECRET is required when NODE_ENV=production");
  }
  if (!config.ingestSecret) {
    console.warn("[api] INGEST_SECRET unset — ingest routes are open");
  }
};
