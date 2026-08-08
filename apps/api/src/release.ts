import { execSync } from "node:child_process";

let cachedRelease: string | undefined | null = null;

export const resolveRelease = (): string | undefined => {
  if (cachedRelease !== null) {
    return cachedRelease;
  }

  const fromEnv = process.env.SENTRY_RELEASE?.trim();
  if (fromEnv) {
    cachedRelease = fromEnv;
    return fromEnv;
  }

  try {
    cachedRelease = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return cachedRelease;
  } catch {
    cachedRelease = undefined;
    return undefined;
  }
};

/** Test-only reset for module-level cache. */
export const resetReleaseCacheForTests = (): void => {
  cachedRelease = null;
};
