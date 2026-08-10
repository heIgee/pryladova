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
  expectUniformBentoHeaderHeights,
  hangRoute,
  login,
  prepareClassificationDashboard,
  prepareSkeletonPage,
  readBoxHeight,
  resetE2eApiState,
  settleWindowClassification,
  waitForWindowTile,
} from "./helpers/skeleton-layout.js";

test.describe("skeleton layout", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eApiState(page);
    await prepareClassificationDashboard(page);
    await prepareSkeletonPage(page);
  });

  test("deadlock cold load keeps slot and header height through classification and chips", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page);
    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryFixture, ingestSecret);
    await waitForWindowTile(page);

    const header = page.getByTestId("window-tile-header");
    const titleSlot = page.getByTestId("window-tile-title-slot");
    const subtitleSlot = page.getByTestId("window-tile-subtitle-slot");
    await expect(titleSlot).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });
    await expectSkeletonOverlayFillsSlot(titleSlot);
    await expect(subtitleSlot).toBeVisible({ timeout: 5_000 });
    await expectSkeletonOverlayFillsSlot(subtitleSlot);

    const skeletonTitleHeight = await readBoxHeight(titleSlot);
    const skeletonSubtitleHeight = await readBoxHeight(subtitleSlot);
    const headerHeightDuringSkeleton = await readBoxHeight(header);

    await settleWindowClassification(page, "Deadlock");
    await expect(page.getByTestId("window-tile-header-chips").getByText("Gaming")).toBeVisible();

    expect(await readBoxHeight(titleSlot)).toBe(skeletonTitleHeight);
    expect(await readBoxHeight(subtitleSlot)).toBe(skeletonSubtitleHeight);
    expect(await readBoxHeight(header)).toBe(headerHeightDuringSkeleton);

    const namesBlock = page.getByTestId("window-tile-names");
    const settledHeight = await readBoxHeight(namesBlock);

    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryRefocusFixture, ingestSecret);

    await expect(titleSlot).not.toHaveAttribute("aria-busy", "true", { timeout: 1_000 });
    expect(await readBoxHeight(namesBlock)).toBe(settledHeight);
  });

  test("switching focus from code to deadlock keeps names block height stable", async ({
    page,
  }) => {
    await page.goto("/");
    await login(page);

    await sendAgentUpdate(apiBase, hostFixture, telemetryFixture, ingestSecret);
    await waitForWindowTile(page);
    await settleWindowClassification(page, "Code");

    const namesBlock = page.getByTestId("window-tile-names");
    const settledHeight = await readBoxHeight(namesBlock);

    await sendAgentUpdate(apiBase, hostFixture, deadlockTelemetryFixture, ingestSecret);

    const titleSlot = page.getByTestId("window-tile-title-slot");
    await expect(titleSlot).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });
    expect(await readBoxHeight(namesBlock)).toBe(settledHeight);

    await settleWindowClassification(page, "Deadlock");

    expect(await readBoxHeight(namesBlock)).toBe(settledHeight);
  });

  test("integration and history tiles use exact skeleton block geometry", async ({ page }) => {
    await hangRoute(page, `**${GITHUB_STATUS_ROUTE}**`);
    await hangRoute(page, `**${STEAM_STATUS_ROUTE}**`);
    await hangRoute(page, `**${HISTORY_ROUTE}**`);
    await page.goto("/");
    await login(page);
    await sendAgentUpdate(apiBase, hostFixture, telemetryFixture, ingestSecret);
    await waitForWindowTile(page);

    await expectIntegrationSkeletonGeometry(page.getByTestId("github-tile"));
    await expectIntegrationSkeletonGeometry(page.getByTestId("steam-tile"));
    await expectHistorySkeletonGeometry(page.getByTestId("history-tile"));
  });

  test("bento tile headers share one height", async ({ page }) => {
    await page.goto("/");
    await login(page);
    await sendAgentUpdate(apiBase, hostFixture, telemetryFixture, ingestSecret);
    await waitForWindowTile(page);
    await settleWindowClassification(page, "Code");

    await expectUniformBentoHeaderHeights(page);
  });
});
