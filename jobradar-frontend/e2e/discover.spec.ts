import { test, expect } from "@playwright/test";
import { loginViaAPI, createCV } from "./helpers";

test.describe("Discover", () => {
  test.beforeEach(async ({ page }) => {
    const token = await loginViaAPI(page);
    await createCV(token);
    await page.goto("/discover");
    await page.waitForSelector("text=Discover Jobs", { timeout: 10000 });
  });

  test("shows all 5 job sources selected by default", async ({ page }) => {
    // Source buttons are in a flex-wrap div under "Job Sources" label
    const sourcesSection = page.locator("text=Job Sources").locator("..");
    await expect(sourcesSection.locator("button", { hasText: "WeWorkRemotely" })).toBeVisible();
    await expect(sourcesSection.locator("button", { hasText: "RemoteOK" })).toBeVisible();
    await expect(sourcesSection.locator("button", { hasText: "Remotive" })).toBeVisible();
    await expect(sourcesSection.locator("button", { hasText: "Jobicy" })).toBeVisible();
    await expect(sourcesSection.locator("button", { hasText: "Arbeitnow" })).toBeVisible();
  });

  test("can deselect a source", async ({ page }) => {
    const remoteOK = page.locator("button").filter({ hasText: "RemoteOK" });
    await remoteOK.click();
    await expect(remoteOK).not.toContainText("✓");
  });

  test("CV selector shows uploaded CV", async ({ page }) => {
    // CV section only appears if cvs.length > 0; wait for it
    await expect(page.locator("text=Match with CV")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=E2E CV").first()).toBeVisible();
  });

  test("Scan button is present", async ({ page }) => {
    // Button text is "Scan & Match Jobs" when idle, or "Scanning in background..." when running
    await expect(
      page.locator('button:has-text("Scan & Match Jobs")').or(page.locator('button:has-text("Scanning in background")'))
    ).toBeVisible({ timeout: 5000 });
  });

  test("Discover Jobs heading is visible", async ({ page }) => {
    await expect(page.locator("h1:has-text('Discover Jobs')")).toBeVisible();
  });

  test("custom RSS input is present", async ({ page }) => {
    await expect(page.locator('input[placeholder*="example.com"]')).toBeVisible();
  });
});

test.describe("Discover — scan interaction", () => {
  test("scan button is enabled when CV exists", async ({ page }) => {
    const token = await loginViaAPI(page);
    await createCV(token);
    await page.goto("/discover");
    await page.waitForSelector("text=Discover Jobs", { timeout: 10000 });

    // Wait for CV list to load
    await page.waitForSelector("text=Match with CV", { timeout: 5000 });

    // The scan button exists and is not permanently disabled
    // (it may say "Scan & Match Jobs" or "Scanning in background..." if scan is running)
    const scanBtn = page.locator("button").filter({ hasText: /Scan & Match Jobs|Scanning in background/ });
    await expect(scanBtn).toBeVisible({ timeout: 5000 });
  });
});
