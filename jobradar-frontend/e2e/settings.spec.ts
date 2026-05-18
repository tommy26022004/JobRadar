import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./helpers";

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    await page.goto("/settings");
    await page.waitForSelector("h1:has-text('Settings')", { timeout: 10000 });
  });

  test("settings page loads correctly", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.locator("text=Current AI Provider")).toBeVisible();
    await expect(page.locator("text=Switch AI Provider")).toBeVisible();
  });

  test("all three AI providers are shown", async ({ page }) => {
    // Provider picker grid — each provider has a button with the provider name
    const grid = page.locator(".grid.grid-cols-3");
    await expect(grid.locator("text=Groq").first()).toBeVisible();
    await expect(grid.locator("text=Google Gemini").first()).toBeVisible();
    await expect(grid.locator("text=OpenAI").first()).toBeVisible();
  });

  test("notification toggle is visible", async ({ page }) => {
    await expect(page.locator("text=Email alerts for strong matches")).toBeVisible();
  });

  test("can toggle email notifications off", async ({ page }) => {
    // Force a known state (ON) via API so the test is deterministic
    const token = await page.evaluate(() => localStorage.getItem("access_token"));
    await page.evaluate(async (token) => {
      await fetch("http://localhost:8000/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email_notifications: true }),
      });
    }, token);
    await page.reload();
    await page.waitForSelector("h1:has-text('Settings')", { timeout: 10000 });
    await page.waitForSelector("text=Current AI Provider", { timeout: 8000 });
    await page.waitForTimeout(500);

    // Confirm toggle is ON, then click to disable
    const toggle = page.locator("button.h-6.w-11");
    await expect(toggle).toHaveClass(/bg-primary/, { timeout: 5000 });
    await toggle.click();
    await expect(page.locator("text=Email notifications disabled")).toBeVisible({ timeout: 5000 });
  });

  test("notification setting persists after reload", async ({ page }) => {
    // Force notifications ON via API, then toggle OFF and verify persists after reload
    const token = await page.evaluate(() => localStorage.getItem("access_token"));
    await page.evaluate(async (token) => {
      await fetch("http://localhost:8000/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email_notifications: true }),
      });
    }, token);

    // Reload page to pick up the server state
    await page.reload();
    await page.waitForSelector("h1:has-text('Settings')", { timeout: 10000 });
    // Wait for async data to load — providers AND notifications
    await page.waitForSelector("text=Current AI Provider", { timeout: 8000 });
    await page.waitForTimeout(500); // brief settle for notification state

    const toggle = page.locator("button.h-6.w-11");
    await expect(toggle).toHaveClass(/bg-primary/, { timeout: 5000 });

    // Click to disable
    await toggle.click();
    await expect(page.locator("text=Email notifications disabled")).toBeVisible({ timeout: 5000 });

    // Reload and check "Notifications off" warning persists
    await page.reload();
    await page.waitForSelector("text=Email alerts for strong matches", { timeout: 10000 });
    await page.waitForTimeout(500);
    await expect(page.locator("text=Notifications off")).toBeVisible({ timeout: 5000 });
  });

  test("quick guide is visible", async ({ page }) => {
    await expect(page.locator("text=Quick Guide")).toBeVisible();
    await expect(page.locator("text=Groq").first()).toBeVisible();
  });
});

test.describe("Settings — AI provider switch", () => {
  test("selecting OpenAI shows paid label", async ({ page }) => {
    await loginViaAPI(page);
    await page.goto("/settings");
    await page.waitForSelector("text=Switch AI Provider", { timeout: 10000 });

    await page.click("button:has-text('OpenAI')");
    // The "Paid" badge appears inside the OpenAI provider button in the provider grid
    const openAIBtn = page.locator(".grid.grid-cols-3 button").filter({ hasText: "OpenAI" });
    await expect(openAIBtn.locator("text=Paid")).toBeVisible({ timeout: 3000 });
  });

  test("selecting Groq shows free tier label", async ({ page }) => {
    await loginViaAPI(page);
    await page.goto("/settings");
    await page.waitForSelector("text=Switch AI Provider", { timeout: 10000 });

    await page.click("button:has-text('Groq')");
    await expect(page.locator("text=Free tier").first()).toBeVisible({ timeout: 3000 });
  });
});
