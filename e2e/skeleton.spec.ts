import { expect, test } from "@playwright/test";
import { GITHUB_STATUS_ROUTE, HISTORY_ROUTE, STEAM_STATUS_ROUTE } from "@pryladova/shared";
import { apiBase, ingestSecret } from "./constants.js";
import {
  deadlockTelemetryFixture,
  deadlockTelemetryRefocusFixture,
  hostFixture,
  telemetryFixture,
} from "./fixtures/telemetry.js";
import { sendAgentUpdate } from "./helpers/agent-ws.js";
import {
  expectHistorySkeletonGeometry,
  expectIntegrationSkeletonGeometry,
  expectSkeletonOverlayFillsSlot,
  hangRoute,
  login,
  prepareClassificationDashboard,
  prepareSkeletonPage,
  readBoxHeight,
  resetE2eApiState,
  waitForWindowTile,
} from "./helpers/skeleton-layout.js";

const waitForWindowClassification = async (
  page: import("@playwright/test").Page,
  appName: string,
): Promise<void> => {
  const titleSlot = page.getByTestId("window-tile-title-slot");
  await expect(page.getByRole("heading", { name: appName, level: 2 })).toBeVisible({
    timeout: 10_000,
  });
  await expect(titleSlot).not.toHaveAttribute("aria-busy", "true");
};

test.describe("skeleton layout", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eApiState(page);
    await prepareClassificationDashboard(page);
    await prepareSkeletonPage(page);
  });

  test("deadlock focus shows title skeleton then settles without height change", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page);
    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryFixture, ingestSecret);
    await waitForWindowTile(page);

    const titleSlot = page.getByTestId("window-tile-title-slot");
    await expect(titleSlot).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });
    await expectSkeletonOverlayFillsSlot(titleSlot);

    const skeletonTitleHeight = await readBoxHeight(titleSlot);

    await waitForWindowClassification(page, "Deadlock");

    expect(await readBoxHeight(titleSlot)).toBe(skeletonTitleHeight);
  });

  test("deadlock focus shows subtitle skeleton then settles without height change", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page);
    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryFixture, ingestSecret);
    await waitForWindowTile(page);

    const subtitleSlot = page.getByTestId("window-tile-subtitle-slot");
    const titleSlot = page.getByTestId("window-tile-title-slot");
    await expect(titleSlot).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });
    await expect(subtitleSlot).toBeVisible({ timeout: 5_000 });
    await expectSkeletonOverlayFillsSlot(subtitleSlot);

    const skeletonSubtitleHeight = await readBoxHeight(subtitleSlot);

    await waitForWindowClassification(page, "Deadlock");

    expect(await readBoxHeight(subtitleSlot)).toBe(skeletonSubtitleHeight);
  });

  test("switching focus from code to deadlock keeps names block height stable", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostFixture, telemetryFixture, ingestSecret);
    await waitForWindowTile(page);
    await waitForWindowClassification(page, "Code");

    const namesBlock = page.getByTestId("window-tile-names");
    const settledHeight = await readBoxHeight(namesBlock);

    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryFixture, ingestSecret);

    const titleSlot = page.getByTestId("window-tile-title-slot");
    await expect(titleSlot).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });
    expect(await readBoxHeight(namesBlock)).toBe(settledHeight);

    await waitForWindowClassification(page, "Deadlock");

    expect(await readBoxHeight(namesBlock)).toBe(settledHeight);
  });

  test("window header keeps height when classification chips appear", async ({ page }) => {
    await page.goto("/");
    await login(page);
    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryFixture, ingestSecret);
    await waitForWindowTile(page);

    const header = page.getByTestId("window-tile-header");
    const titleSlot = page.getByTestId("window-tile-title-slot");
    await expect(titleSlot).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });

    const headerHeightDuringSkeleton = await readBoxHeight(header);

    await waitForWindowClassification(page, "Deadlock");
    await expect(page.getByTestId("window-tile-header-chips").getByText("Gaming")).toBeVisible();

    expect(await readBoxHeight(header)).toBe(headerHeightDuringSkeleton);
  });

  test("cached refocus skips skeleton and keeps names block height", async ({ page }) => {
    await page.goto("/");
    await login(page);
    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryFixture, ingestSecret);
    await waitForWindowTile(page);
    await waitForWindowClassification(page, "Deadlock");

    const namesBlock = page.getByTestId("window-tile-names");
    const settledHeight = await readBoxHeight(namesBlock);

    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryRefocusFixture, ingestSecret);

    const titleSlot = page.getByTestId("window-tile-title-slot");
    await expect(titleSlot).not.toHaveAttribute("aria-busy", "true", { timeout: 1_000 });
    expect(await readBoxHeight(namesBlock)).toBe(settledHeight);
  });

  test("github integration skeleton uses exact block geometry", async ({ page }) => {
    await hangRoute(page, `**${GITHUB_STATUS_ROUTE}**`);
    await page.goto("/");
    await login(page);
    await expectIntegrationSkeletonGeometry(page.getByTestId("github-tile"));
  });

  test("steam integration skeleton uses exact block geometry", async ({ page }) => {
    await hangRoute(page, `**${STEAM_STATUS_ROUTE}**`);
    await page.goto("/");
    await login(page);
    await expectIntegrationSkeletonGeometry(page.getByTestId("steam-tile"));
  });

  test("history skeleton rows use exact block geometry", async ({ page }) => {
    await hangRoute(page, `**${HISTORY_ROUTE}**`);
    await page.goto("/");
    await login(page);
    await expectHistorySkeletonGeometry(page.getByTestId("history-tile"));
  });
});
