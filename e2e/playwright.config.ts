import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      url: "http://127.0.0.1:3000/api/health",
      cwd: "..",
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: "test",
        PORT: "3000",
      },
    },
    {
      command: "pnpm --filter web exec vite --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      cwd: "..",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
