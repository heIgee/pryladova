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
};

export const loadConfig = (): ApiConfig => {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  return { geminiApiKey, geminiModel };
};
