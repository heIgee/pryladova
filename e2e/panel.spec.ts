import { expect, test } from "@playwright/test";
import { hostFixture, redactedTelemetryFixture, telemetryFixture } from "./fixtures/telemetry.js";

const apiBase = "http://127.0.0.1:3000";

test.describe("panel", () => {
  test("shows empty state before ingest", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/…$/)).toBeVisible();
  });

  test("shows ingested window after POST", async ({ page, request }) => {
    await page.goto("/");

    await request.post(`${apiBase}/api/host`, { data: hostFixture });
    await request.post(`${apiBase}/api/telemetry`, { data: telemetryFixture });

    await expect(page.getByRole("heading", { name: "Code", level: 2 })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("app.tsx — pryladova")).toBeVisible();
  });

  test("shows redacted secure payload", async ({ page, request }) => {
    await page.goto("/");

    await request.post(`${apiBase}/api/telemetry`, { data: redactedTelemetryFixture });

    await expect(page.getByRole("heading", { name: "Secure", level: 2 })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText("Redacted")).toBeVisible();
  });
});
