import { expect, type Locator, type Page, test } from "@playwright/test";
import { panelPassword } from "./constants.js";
import { resetE2eApiState } from "./helpers/skeleton-layout.js";

const DASHBOARD_LAYOUT_KEY = "pryladova.dashboardLayout";
const DEFAULT_GAP_PX = 16;

const login = async (page: Page): Promise<void> => {
  await page.getByLabel("Password").fill(panelPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
};

const prepareLayoutPage = async (
  page: Page,
  layoutSeed?: Record<string, unknown>,
): Promise<void> => {
  await page.goto("/");
  await page.evaluate(
    ({ storageKey, seed }) => {
      localStorage.removeItem(storageKey);
      if (seed) {
        localStorage.setItem(storageKey, JSON.stringify(seed));
      }
    },
    {
      storageKey: DASHBOARD_LAYOUT_KEY,
      seed: layoutSeed ?? null,
    },
  );
  await login(page);
  await expect(page.getByTestId("dashboard-grid")).toBeVisible();
};

const defaultLayoutSeed = {
  version: 1,
  order: ["window", "machine", "history", "github", "calendar", "tasks", "steam"],
  colSpan: {
    window: 12,
    machine: 6,
    history: 8,
    github: 4,
    steam: 4,
    calendar: 4,
    tasks: 4,
  },
  rowSpan: {
    window: 2,
    machine: 2,
    history: 2,
    github: 2,
    steam: 2,
    calendar: 2,
    tasks: 2,
  },
  gap: 16,
};

const visibleShellOrder = async (page: Page): Promise<string[]> =>
  page
    .locator("[data-testid^='dashboard-tile-shell-']")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-testid")?.replace("dashboard-tile-shell-", "") ?? "")
        .filter(Boolean),
    );

const dragHeaderTo = async (source: Locator, target: Locator): Promise<void> => {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Missing drag target bounds");
  }

  const page = source.page();
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + targetBox.width / 2;
  const endY = targetBox.y + targetBox.height / 2;

  await source.hover();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 16 });
  await page.waitForTimeout(100);
  await page.mouse.up();
};

test.describe("dashboard layout", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eApiState(page);
  });

  test("resize handle steps column span and persists without changing gap", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page, {
      ...defaultLayoutSeed,
      order: ["window", "machine", "github", "steam", "calendar", "tasks", "history"],
    });

    const historyShell = page.getByTestId("dashboard-tile-shell-history");
    await expect(historyShell).toBeVisible();
    await expect(historyShell).toHaveAttribute("data-col-span", "8");
    await expect(page.getByTestId("dashboard-grid")).toHaveCSS("gap", `${DEFAULT_GAP_PX}px`);

    const handle = historyShell.getByTestId("dashboard-tile-resize-handle");
    await handle.hover();
    await handle.press("ArrowRight");
    await expect(historyShell).toHaveAttribute("data-col-span", "12");
    await handle.press("Enter");
    await expect(historyShell).toHaveAttribute("data-col-span", "12");

    await expect(page.getByTestId("dashboard-grid")).toHaveCSS("gap", `${DEFAULT_GAP_PX}px`);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
    await expect(page.getByTestId("dashboard-tile-shell-history")).toHaveAttribute(
      "data-col-span",
      "12",
    );
  });

  test("bottom resize handle steps row span and persists across reload", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page, defaultLayoutSeed);

    const historyShell = page.getByTestId("dashboard-tile-shell-history");
    await expect(historyShell).toHaveAttribute("data-row-span", "2");

    const handle = historyShell.getByTestId("dashboard-tile-resize-handle-bottom");
    await handle.hover();
    await handle.press("ArrowDown");
    await expect(historyShell).toHaveAttribute("data-row-span", "3");
    await handle.press("Enter");
    await expect(historyShell).toHaveAttribute("data-row-span", "3");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
    await expect(page.getByTestId("dashboard-tile-shell-history")).toHaveAttribute(
      "data-row-span",
      "3",
    );
  });

  test("shared vertical boundary steps both row spans", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page, {
      version: 1,
      order: ["window", "github", "steam"],
      colSpan: { window: 12, github: 12, steam: 12 },
      rowSpan: { window: 2, github: 3, steam: 3 },
      gap: 16,
    });

    const githubShell = page.getByTestId("dashboard-tile-shell-github");
    const steamShell = page.getByTestId("dashboard-tile-shell-steam");
    await expect(githubShell).toHaveAttribute("data-row-span", "3");
    await expect(steamShell).toHaveAttribute("data-row-span", "3");

    const handle = githubShell.getByTestId("dashboard-tile-resize-handle-bottom");
    await handle.hover();
    await handle.press("ArrowDown");
    await expect(githubShell).toHaveAttribute("data-row-span", "4");
    await expect(steamShell).toHaveAttribute("data-row-span", "2");
    await handle.press("Enter");
    await expect(githubShell).toHaveAttribute("data-row-span", "4");
    await expect(steamShell).toHaveAttribute("data-row-span", "2");
  });

  test("row-end span-4 tile shows left resize handle", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page);

    const githubShell = page.getByTestId("dashboard-tile-shell-github");
    await expect(githubShell).toHaveAttribute("data-col-span", "4");
    await githubShell.hover();
    await expect(githubShell.getByTestId("dashboard-tile-resize-handle-left")).toHaveCount(1);
    await expect(githubShell.getByTestId("dashboard-tile-resize-handle")).toHaveCount(1);
  });

  test("span-12 tile shows resize handle so it can shrink", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page);

    const windowShell = page.getByTestId("dashboard-tile-shell-window");
    await expect(windowShell).toHaveAttribute("data-col-span", "12");
    await windowShell.hover();
    await expect(windowShell.getByTestId("dashboard-tile-resize-handle")).toHaveCount(1);
  });

  test("header drag swaps tile grid positions and persists across reload", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page, defaultLayoutSeed);

    await expect(page.getByTestId("dashboard-tile-shell-steam")).toBeVisible();
    await expect(page.getByTestId("dashboard-tile-shell-tasks")).toBeVisible();

    const steamShell = page.getByTestId("dashboard-tile-shell-steam");
    const tasksShell = page.getByTestId("dashboard-tile-shell-tasks");
    const steamColBefore = await steamShell.getAttribute("data-grid-col");
    const tasksColBefore = await tasksShell.getAttribute("data-grid-col");
    expect(steamColBefore).toBeTruthy();
    expect(tasksColBefore).toBeTruthy();
    expect(steamColBefore).not.toBe(tasksColBefore);

    await dragHeaderTo(
      tasksShell.getByTestId("dashboard-tile-drag-handle"),
      steamShell.getByTestId("dashboard-tile-drag-handle"),
    );

    await expect
      .poll(async () => await steamShell.getAttribute("data-grid-col"), { timeout: 10_000 })
      .toBe(tasksColBefore);
    await expect(tasksShell).toHaveAttribute("data-grid-col", steamColBefore ?? "");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
    await expect(page.getByTestId("dashboard-tile-shell-steam")).toHaveAttribute(
      "data-grid-col",
      tasksColBefore ?? "",
    );
    await expect(page.getByTestId("dashboard-tile-shell-tasks")).toHaveAttribute(
      "data-grid-col",
      steamColBefore ?? "",
    );
  });

  test("row band handle steps all tiles in the row", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page, {
      version: 1,
      order: ["window", "machine", "history", "github"],
      colSpan: { window: 12, machine: 6, history: 6, github: 6 },
      rowSpan: { window: 2, machine: 2, history: 2, github: 2 },
      gap: 16,
    });

    const machineShell = page.getByTestId("dashboard-tile-shell-machine");
    const historyShell = page.getByTestId("dashboard-tile-shell-history");
    await expect(machineShell).toHaveAttribute("data-row-span", "2");
    await expect(historyShell).toHaveAttribute("data-row-span", "2");

    const bandHandle = page.getByTestId("dashboard-row-band-handle-3");
    await bandHandle.hover();
    await bandHandle.press("ArrowDown");
    await expect(machineShell).toHaveAttribute("data-row-span", "3");
    await expect(historyShell).toHaveAttribute("data-row-span", "3");
    await bandHandle.press("Enter");
    await expect(machineShell).toHaveAttribute("data-row-span", "3");
    await expect(historyShell).toHaveAttribute("data-row-span", "3");
  });

  test("reset layout restores defaults", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await prepareLayoutPage(page, {
      ...defaultLayoutSeed,
      rowSpan: { ...defaultLayoutSeed.rowSpan, history: 5 },
    });

    const historyShell = page.getByTestId("dashboard-tile-shell-history");
    await expect(historyShell).toHaveAttribute("data-row-span", "5");

    await page.getByTestId("dashboard-layout-reset").click();
    await expect(historyShell).toHaveAttribute("data-row-span", "6");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
    await expect(page.getByTestId("dashboard-tile-shell-history")).toHaveAttribute(
      "data-row-span",
      "6",
    );
  });

  test("mobile uses full-width tiles, hides width handles, keeps height resize", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareLayoutPage(page, {
      version: 1,
      order: ["window", "history"],
      colSpan: { window: 12, history: 12 },
      rowSpan: { window: 2, history: 2 },
      gap: 16,
    });

    const historyShell = page.getByTestId("dashboard-tile-shell-history");
    await expect(historyShell).toHaveAttribute("data-col-span", "12");
    await expect(page.getByTestId("dashboard-tile-resize-handle")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-tile-resize-handle-left")).toHaveCount(0);

    await expect(historyShell.getByTestId("dashboard-tile-resize-handle-bottom")).toHaveCount(1);
    const handle = historyShell.getByTestId("dashboard-tile-resize-handle-bottom");
    await handle.focus();
    await page.keyboard.press("ArrowDown");
    await expect(historyShell).toHaveAttribute("data-row-span", "3");
    await page.keyboard.press("Enter");
    await expect(historyShell).toHaveAttribute("data-row-span", "3");
  });
});
