import { defineConfig, devices } from "@playwright/test";
import { e2eApiPort, e2eWebPort, ingestSecret } from "./constants.js";

const e2eWebServerEnv = {
  E2E_API_PORT: String(e2eApiPort),
  // Classification e2e holds the window longer than a short stale hint.
  VITE_AGENT_HINT_AFTER_MS: "30000",
};

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  projects: [
    {
      name: "chromium",
      testMatch: ["**/panel.spec.ts", "**/skeleton.spec.ts", "**/layout.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${e2eWebPort}`,
        trace: "on-first-retry",
      },
    },
    {
      name: "chromium-prod",
      testMatch: "**/panel-prod.spec.ts",
      dependencies: ["chromium"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4173",
        trace: "on-first-retry",
      },
    },
  ],
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      url: `http://127.0.0.1:${e2eApiPort}/api/health`,
      cwd: "..",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: String(e2eApiPort),
        SESSION_SECRET: "e2e-session-secret-at-least-32-characters-long",
        PANEL_PASSWORD_HASH: "$2b$10$TtcGsCYSJ53WtzGpi0k7lOXLR3yY2n2jrjAnw0grKQFPV9sCEtQuq",
        INGEST_SECRET: ingestSecret,
        GEMINI_API_KEY: "e2e-stub",
        E2E_CLASSIFICATION_ENABLED: "1",
      },
    },
    {
      command: `pnpm --filter web exec vite --host 127.0.0.1 --port ${e2eWebPort}`,
      url: `http://127.0.0.1:${e2eWebPort}`,
      cwd: "..",
      reuseExistingServer: false,
      env: e2eWebServerEnv,
    },
    {
      command:
        "pnpm exec turbo run build --filter=web && pnpm --filter web exec vite preview --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      cwd: "..",
      reuseExistingServer: false,
      env: {
        E2E_API_PORT: String(e2eApiPort),
      },
    },
  ],
});
