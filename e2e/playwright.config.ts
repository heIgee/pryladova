import { defineConfig, devices } from "@playwright/test";
import { ingestSecret } from "./constants.js";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  projects: [
    {
      name: "chromium",
      testMatch: ["**/panel.spec.ts", "**/skeleton.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:5173",
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
      url: "http://127.0.0.1:3000/api/health",
      cwd: "..",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        PORT: "3000",
        SESSION_SECRET: "e2e-session-secret-at-least-32-characters-long",
        PANEL_PASSWORD_HASH: "$2b$10$TtcGsCYSJ53WtzGpi0k7lOXLR3yY2n2jrjAnw0grKQFPV9sCEtQuq",
        INGEST_SECRET: ingestSecret,
        GEMINI_API_KEY: "e2e-stub",
        E2E_CLASSIFICATION_ENABLED: "1",
        E2E_CLASSIFICATION_DELAY_MS: "3000",
      },
    },
    {
      command: "pnpm --filter web exec vite --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      cwd: "..",
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        "pnpm exec turbo run build --filter=web && pnpm --filter web exec vite preview --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      cwd: "..",
      reuseExistingServer: false,
    },
  ],
});
