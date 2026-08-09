import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const DEFAULT_DEV_API_URL = "http://localhost:3000";
const DEFAULT_POLL_INTERVAL_MS = 2000;
const AGENT_ID_MAX_LENGTH = 253;

type AgentProfile = "local" | "remote";

export type AgentConfig = {
  profile: AgentProfile;
  apiUrl: string;
  pollIntervalMs: number;
  blockedApps: string[];
  ingestSecret: string | undefined;
  agentId: string;
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

const resolveAgentId = (): string => {
  const fromEnv = process.env.AGENT_ID?.trim();
  const candidate = fromEnv && fromEnv.length > 0 ? fromEnv : hostname().trim();
  if (!candidate) {
    throw new Error("AGENT_ID must be a non-empty string");
  }
  if (candidate.length > AGENT_ID_MAX_LENGTH) {
    throw new Error(`AGENT_ID must be at most ${AGENT_ID_MAX_LENGTH} characters`);
  }
  return candidate;
};

export const loadConfig = (): AgentConfig => {
  const profile = parseProfile();
  const apiUrl = resolveApiUrl(profile);
  const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  const blockedApps = parseBlockedApps(process.env.BLOCKED_APPS);
  const ingestSecret = process.env.INGEST_SECRET?.trim() || undefined;
  const agentId = resolveAgentId();

  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 500) {
    throw new Error("POLL_INTERVAL_MS must be a number >= 500");
  }

  if (profile === "remote" && !ingestSecret) {
    throw new Error(
      "INGEST_SECRET is required when agent targets remote API (--remote or AGENT_PROFILE=remote)",
    );
  }

  return { profile, apiUrl, pollIntervalMs, blockedApps, ingestSecret, agentId };
};
