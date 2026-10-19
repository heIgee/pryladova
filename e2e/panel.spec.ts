import { expect, type Page, test } from "@playwright/test";
import { apiBase, ingestSecret, panelPassword } from "./constants.js";
import {
  hostFixture,
  hostWithMediaFixture,
  redactedTelemetryFixture,
  telemetryFixture,
} from "./fixtures/telemetry.js";
import { sendAgentHostUpdate, sendAgentUpdate } from "./helpers/agent-ws.js";
import { resetE2eApiState, settleWindowClassification } from "./helpers/skeleton-layout.js";

const login = async (page: Page): Promise<void> => {
  await page.getByLabel("Password").fill(panelPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
};

test.describe("panel", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eApiState(page);
  });

  test("shows login before authenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows clean dashboard before agent connects", async ({ page }) => {
    await page.goto("/");
    await login(page);

    await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
    await expect(
      page.getByText("Not receiving updates. Check that the agent is running."),
    ).toBeVisible();
    await expect(page.getByTestId("window-tile-placeholder")).toContainText("No active window");
    await expect(page.getByTestId("machine-tile-empty")).toContainText(
      "Metrics appear when the agent connects.",
    );
    await expect(page.getByTestId("history-tile")).toBeVisible();
    await expect(page.getByText("GitHub", { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Steam", { exact: true })).toBeVisible();
    await expect(page.getByText("Calendar", { exact: true })).toBeVisible();
    await expect(page.getByText("Tasks", { exact: true })).toBeVisible();

    await expect(page.getByText("agentId is required")).toHaveCount(0);
    await expect(page.getByText(/^(Evaporating|Waiting for host)/)).toHaveCount(0);
  });

  test("shows single stale hint after agent disconnect window", async ({ page }) => {
    await page.goto("/");
    await login(page);

    await expect(
      page.getByText("Not receiving updates. Check that the agent is running."),
    ).toBeVisible();
    await expect(page.getByText("Check that the agent is running.")).toHaveCount(1);
    await expect(page.getByTestId("history-tile")).toBeVisible();
    await expect(page.getByText("agentId is required")).toHaveCount(0);
  });

  test("shows ingested window after agent update", async ({ page }) => {
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostFixture, telemetryFixture, ingestSecret);
    await settleWindowClassification(page, "Code");

    await expect(page.getByTestId("window-tile")).toBeVisible();
    await expect(page.getByTestId("window-tile-title-slot")).toContainText("Code");
    await expect(page.getByText("app.tsx — pryladova")).toBeVisible();
  });

  test("shows redacted secure payload", async ({ page }) => {
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostFixture, redactedTelemetryFixture, ingestSecret);

    await expect(page.getByTestId("window-tile")).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => page.getByTestId("window-tile-title-slot").textContent(), {
        timeout: 10_000,
      })
      .toContain("Secure");
    await expect(page.getByTestId("window-tile-subtitle-slot")).toContainText("Redacted");
  });

  test("shows media tile content on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostWithMediaFixture, telemetryFixture, ingestSecret);

    const mediaTile = page.getByTestId("media-tile");
    await expect(mediaTile).toBeVisible({ timeout: 5_000 });
    await expect(mediaTile).toContainText("Test Track");
    await expect(mediaTile).toContainText("Test Artist");
    await expect(mediaTile).toContainText("Paused");
  });

  test("preserves media tile after host-only metrics tick", async ({ page }) => {
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostWithMediaFixture, telemetryFixture, ingestSecret);

    const mediaTile = page.getByTestId("media-tile");
    await expect(mediaTile).toBeVisible({ timeout: 5_000 });
    await expect(mediaTile).toContainText("Test Track");
    await expect(mediaTile).toContainText("Test Artist");

    await sendAgentHostUpdate(
      apiBase,
      {
        ...hostFixture,
        cpuPercent: 99,
        capturedAt: "2026-01-01T12:01:00.000Z",
        media: null,
      },
      ingestSecret,
    );

    await expect(mediaTile).toContainText("Test Track");
    await expect(mediaTile).toContainText("Test Artist");
    await expect(mediaTile).not.toContainText("Nothing playing");
  });

  test("steps the history day and stops at the ends", async ({ page }) => {
    await page.goto("/");
    await login(page);

    const label = page.getByTestId("history-day-label");
    const previous = page.getByTestId("history-day-previous");
    const next = page.getByTestId("history-day-next");
    await expect(label).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();

    const today = (await label.textContent()) ?? "";
    expect(today.length).toBeGreaterThan(0);

    await previous.click();
    await expect(label).not.toHaveText(today);
    await next.click();
    await expect(label).toHaveText(today);
    await expect(next).toBeDisabled();

    for (let step = 0; step < 6; step += 1) {
      const before = (await label.textContent()) ?? "";
      await previous.click();
      await expect(label).not.toHaveText(before);
    }

    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
  });
});
