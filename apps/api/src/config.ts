import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export type ApiRuntime = {
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;
  port: number;
  e2eClassificationEnabled: boolean;
  sentryRelease: string | undefined;
};

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
  googleClientId: string | undefined;
  googleClientSecret: string | undefined;
  googleRedirectUri: string | undefined;
  googleRefreshToken: string | undefined;
  integrationEncryptionKey: string | undefined;
  runtime: ApiRuntime;
};

const defaultTestRuntime = (): ApiRuntime => ({
  nodeEnv: "test",
  isProduction: false,
  isTest: true,
  port: 3000,
  e2eClassificationEnabled: false,
  sentryRelease: undefined,
});

export const testApiConfig = (overrides: Partial<ApiConfig> = {}): ApiConfig => ({
  geminiApiKey: undefined,
  geminiModel: DEFAULT_GEMINI_MODEL,
  ingestSecret: undefined,
  sentryDsn: undefined,
  sessionSecret: undefined,
  panelPasswordHash: undefined,
  supabaseUrl: undefined,
  supabaseSecretKey: undefined,
  githubToken: undefined,
  githubUsername: undefined,
  steamApiKey: undefined,
  steamId: undefined,
  googleClientId: undefined,
  googleClientSecret: undefined,
  googleRedirectUri: undefined,
  googleRefreshToken: undefined,
  integrationEncryptionKey: undefined,
  ...overrides,
  runtime: { ...defaultTestRuntime(), ...overrides.runtime },
});

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
    // Invalid base64 in PANEL_PASSWORD_HASH_B64 is ignored; plain-text hash may still be set.
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

const readRuntime = (): ApiRuntime => {
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const portRaw = process.env.PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3000;
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT must be a positive number");
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    isTest: nodeEnv === "test",
    port,
    e2eClassificationEnabled: nodeEnv === "test" && process.env.E2E_CLASSIFICATION_ENABLED === "1",
    sentryRelease: process.env.SENTRY_RELEASE?.trim() || undefined,
  };
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
  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || undefined;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
  const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || undefined;
  const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim() || undefined;
  const integrationEncryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || undefined;

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
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
    googleRefreshToken,
    integrationEncryptionKey,
    runtime: readRuntime(),
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
  if (config.runtime.isProduction && !config.ingestSecret) {
    throw new Error("INGEST_SECRET is required when NODE_ENV=production");
  }
};
