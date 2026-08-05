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
};

export const loadConfig = (): ApiConfig => {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const ingestSecret = process.env.INGEST_SECRET?.trim() || undefined;
  const sentryDsn = process.env.SENTRY_DSN?.trim() || undefined;

  return { geminiApiKey, geminiModel, ingestSecret, sentryDsn };
};

export const assertProductionIngestSecret = (config: ApiConfig): void => {
  if (process.env.NODE_ENV === "production" && !config.ingestSecret) {
    throw new Error("INGEST_SECRET is required when NODE_ENV=production");
  }
  if (!config.ingestSecret) {
    console.warn("[api] INGEST_SECRET unset — ingest routes are open");
  }
};
