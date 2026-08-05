import { execSync } from "node:child_process";

export const resolveRelease = (): string | undefined => {
  const fromEnv = process.env.SENTRY_RELEASE?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};
