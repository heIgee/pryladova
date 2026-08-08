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

export const loadConfig = (): ApiConfig => {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const ingestSecret = process.env.INGEST_SECRET?.trim() || undefined;
  const sentryDsn = process.env.SENTRY_DSN?.trim() || undefined;
  const sessionSecret = process.env.SESSION_SECRET?.trim() || undefined;
  const panelPasswordHash = readPanelPasswordHash();

  return { geminiApiKey, geminiModel, ingestSecret, sentryDsn, sessionSecret, panelPasswordHash };
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
