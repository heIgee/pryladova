import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DEFAULT_DEV_API_URL = "http://localhost:3000";
const DEFAULT_POLL_INTERVAL_MS = 2000;

type AgentProfile = "local" | "remote";

export type AgentConfig = {
  profile: AgentProfile;
  apiUrl: string;
  pollIntervalMs: number;
  blockedApps: string[];
  ingestSecret: string | undefined;
};

const parseProfile = (): AgentProfile => {
  if (process.argv.includes("--remote")) {
    return "remote";
  }
  const raw = process.env.AGENT_PROFILE?.trim().toLowerCase();
  if (raw === "remote") {
    return "remote";
  }
  return "local";
};

const stripTrailingSlashes = (url: string): string => url.replace(/\/+$/, "");

const resolveApiUrl = (profile: AgentProfile): string => {
  if (profile === "remote") {
    const apiUrl = process.env.API_URL?.trim();
    if (!apiUrl) {
      throw new Error(
        "API_URL is required when agent targets remote API (--remote or AGENT_PROFILE=remote)",
      );
    }
    return stripTrailingSlashes(apiUrl);
  }
  return stripTrailingSlashes(process.env.DEV_API_URL?.trim() || DEFAULT_DEV_API_URL);
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
  const profile = parseProfile();
  const apiUrl = resolveApiUrl(profile);
  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  const blockedApps = parseBlockedApps(process.env.BLOCKED_APPS);
  const ingestSecret = process.env.INGEST_SECRET?.trim() || undefined;

  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 500) {
    throw new Error("POLL_INTERVAL_MS must be a number >= 500");
  }

  if (profile === "remote" && !ingestSecret) {
    throw new Error(
      "INGEST_SECRET is required when agent targets remote API (--remote or AGENT_PROFILE=remote)",
    );
  }

  return { profile, apiUrl, pollIntervalMs, blockedApps, ingestSecret };
};
