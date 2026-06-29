import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DEFAULT_API_URL = "http://localhost:3000";
const DEFAULT_POLL_INTERVAL_MS = 2000;

export type AgentConfig = {
  apiUrl: string;
  pollIntervalMs: number;
  blockedApps: string[];
};

const parseBlockedApps = (value: string | undefined): string[] => {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const loadConfig = (): AgentConfig => {
  const apiUrl = process.env.API_URL ?? DEFAULT_API_URL;
  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  const blockedApps = parseBlockedApps(process.env.BLOCKED_APPS);

  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 500) {
    throw new Error("POLL_INTERVAL_MS must be a number >= 500");
  }

  return { apiUrl, pollIntervalMs, blockedApps };
};
