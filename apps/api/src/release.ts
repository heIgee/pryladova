import { execSync } from "node:child_process";
import { loadConfig } from "./config.js";

let cachedRelease: string | undefined | null = null;

export const resolveRelease = (): string | undefined => {
  if (cachedRelease !== null) {
    return cachedRelease;
  }

  const fromConfig = loadConfig().runtime.sentryRelease;
  if (fromConfig) {
    cachedRelease = fromConfig;
    return fromConfig;
  }

  try {
    cachedRelease = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return cachedRelease;
  } catch {
    // Git is unavailable outside a checkout; release stays unset.
    cachedRelease = undefined;
    return undefined;
  }
};

/** Test-only reset for module-level cache. */
export const resetReleaseCacheForTests = (): void => {
  cachedRelease = null;
};
