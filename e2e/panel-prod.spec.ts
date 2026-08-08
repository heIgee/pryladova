import { expect, test } from "@playwright/test";
import { panelPassword } from "./constants.js";

const errorBoundaryText = "Something went wrong loading the panel.";
test.describe("panel production bundle", () => {
  test("loads the panel shell without an error-boundary crash", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/");
    await page.getByLabel("Password").fill(panelPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Pryladova", level: 1 })).toBeVisible();
    await expect(page.getByText(errorBoundaryText)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reload" })).toHaveCount(0);

    const shellMarker = page
      .getByText("Live desktop presence")
      .or(page.getByText("Not receiving updates. Check that the agent is running."))
      .or(page.getByText(/…$/));
    await expect(shellMarker.first()).toBeVisible({ timeout: 5_000 });

    const clientErrors = consoleErrors.filter((line) => line.includes("[web:client-error]"));
    expect(clientErrors).toEqual([]);
  });
});
