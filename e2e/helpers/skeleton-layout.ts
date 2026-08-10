import { expect, type Locator, type Page } from "@playwright/test";
import { apiBase, panelPassword } from "../constants.js";

/** Tailwind spacing at default 16px root — must stay aligned with skeletonSize presets. */
const skeletonBlockHeightPx = {
  caption: 16,
  micro: 12,
  stat: 20,
  panel: 56,
  bar: 8,
  duration: 16,
  avatar: 36,
} as const;

const skeletonViewport = { width: 1280, height: 900 } as const;

export const prepareSkeletonPage = async (page: Page): Promise<void> => {
  await page.setViewportSize(skeletonViewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      .animate-pulse { opacity: 0.55 !important; }
    `,
  });
};

export const login = async (page: Page): Promise<void> => {
  await page.getByLabel("Password").fill(panelPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
};

export const prepareClassificationDashboard = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem("pryladova.classificationEnabled", "true");
  });
};

export const waitForWindowTile = async (page: Page): Promise<void> => {
  await expect(page.getByTestId("window-tile")).toBeVisible({ timeout: 10_000 });
};

export const resetE2eApiState = async (page: Page): Promise<void> => {
  const response = await page.request.post(`${apiBase}/api/test/e2e/reset`);
  expect(response.ok()).toBeTruthy();
};

const releaseE2eClassification = async (page: Page): Promise<void> => {
  const response = await page.request.post(`${apiBase}/api/test/e2e/classification/release`);
  expect(response.ok()).toBeTruthy();
};

const waitForWindowClassification = async (page: Page, appName: string): Promise<void> => {
  const titleSlot = page.getByTestId("window-tile-title-slot");
  await expect(page.getByRole("heading", { name: appName, level: 2 })).toBeVisible({
    timeout: 10_000,
  });
  await expect(titleSlot).not.toHaveAttribute("aria-busy", "true");
};

export const settleWindowClassification = async (page: Page, appName: string): Promise<void> => {
  await releaseE2eClassification(page);
  await waitForWindowClassification(page, appName);
};

export const hangRoute = async (page: Page, urlPattern: string | RegExp): Promise<void> => {
  await page.route(urlPattern, async () => {
    await new Promise<void>(() => {});
  });
};

const readBox = async (locator: Locator): Promise<{ width: number; height: number }> => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { width: Math.round(box!.width), height: Math.round(box!.height) };
};

export const readBoxHeight = async (locator: Locator): Promise<number> => {
  const { height } = await readBox(locator);
  return height;
};

const expectExactHeight = async (locator: Locator, heightPx: number): Promise<void> => {
  expect(await readBoxHeight(locator)).toBe(heightPx);
};

const expectExactSize = async (
  locator: Locator,
  sizePx: { width: number; height: number },
): Promise<void> => {
  const box = await readBox(locator);
  expect(box).toEqual(sizePx);
};

export const expectSkeletonOverlayFillsSlot = async (slot: Locator): Promise<void> => {
  const overlay = slot.locator(".animate-pulse");
  await expect(overlay).toBeVisible();
  const slotBox = await readBox(slot);
  const overlayBox = await readBox(overlay);
  expect(overlayBox.height).toBe(slotBox.height);
};

export const expectIntegrationSkeletonGeometry = async (tile: Locator): Promise<void> => {
  const skeleton = tile.getByTestId("integration-tile-skeleton");
  await expect(skeleton).toBeVisible();

  const skeletonBlocks = skeleton.locator(".animate-pulse");
  await expect(skeletonBlocks).toHaveCount(8);

  await expectExactSize(skeletonBlocks.nth(0), {
    width: skeletonBlockHeightPx.avatar,
    height: skeletonBlockHeightPx.avatar,
  });
  await expectExactHeight(skeletonBlocks.nth(1), skeletonBlockHeightPx.caption);
  await expectExactHeight(skeletonBlocks.nth(2), skeletonBlockHeightPx.micro);
  await expectExactHeight(skeletonBlocks.nth(3), skeletonBlockHeightPx.panel);
  await expectExactHeight(skeletonBlocks.nth(4), skeletonBlockHeightPx.panel);
  await expectExactHeight(skeletonBlocks.nth(5), skeletonBlockHeightPx.micro);
  await expectExactHeight(skeletonBlocks.nth(6), skeletonBlockHeightPx.caption);
  await expectExactHeight(skeletonBlocks.nth(7), skeletonBlockHeightPx.caption);
};

export const expectHistorySkeletonGeometry = async (tile: Locator): Promise<void> => {
  const skeleton = tile.getByTestId("history-tile-skeleton");
  await expect(skeleton).toBeVisible();

  const rows = skeleton.locator(":scope > li");
  await expect(rows).toHaveCount(4);

  for (let index = 0; index < 4; index += 1) {
    const row = rows.nth(index);
    const blocks = row.locator(".animate-pulse");
    await expect(blocks).toHaveCount(3);
    await expectExactHeight(blocks.nth(0), skeletonBlockHeightPx.caption);
    await expectExactHeight(blocks.nth(1), skeletonBlockHeightPx.duration);
    await expectExactHeight(blocks.nth(2), skeletonBlockHeightPx.bar);
    await expectExactHeight(row, skeletonBlockHeightPx.stat + skeletonBlockHeightPx.bar + 4);
  }
};
