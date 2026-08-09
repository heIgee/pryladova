import { expect, type Page, test } from "@playwright/test";
import { apiBase, ingestSecret, panelPassword } from "./constants.js";
import { hostFixture, redactedTelemetryFixture, telemetryFixture } from "./fixtures/telemetry.js";
import { sendAgentUpdate } from "./helpers/agent-ws.js";

const login = async (page: Page): Promise<void> => {
  await page.getByLabel("Password").fill(panelPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
};

test.describe("panel", () => {
  test("shows login before authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows dashboard before ingest", async ({ page }) => {
    await page.goto("/");
    await login(page);
    await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
    await expect(page.getByText("GitHub", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Steam", { exact: true })).toBeVisible();
    await expect(page.getByText("Waiting for host metrics…")).toBeVisible();
  });

  test("shows ingested window after agent update", async ({ page }) => {
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostFixture, telemetryFixture, ingestSecret);

    await expect(page.getByRole("heading", { name: "Code", level: 2 })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("app.tsx — pryladova")).toBeVisible();
  });

  test("shows redacted secure payload", async ({ page }) => {
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostFixture, redactedTelemetryFixture, ingestSecret);

    await expect(page.getByRole("heading", { name: "Secure", level: 2 })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Redacted")).toBeVisible();
  });
});
