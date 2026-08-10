import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Cursor sets NO_COLOR; Playwright sets FORCE_COLOR — drop NO_COLOR before workers spawn.
delete process.env.NO_COLOR;

const require = createRequire(import.meta.url);
const playwrightCli = join(dirname(require.resolve("@playwright/test/package.json")), "cli.js");

const result = spawnSync(
  process.execPath,
  [playwrightCli, "test", "-c", "e2e/playwright.config.ts"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

process.exit(result.status ?? 1);
