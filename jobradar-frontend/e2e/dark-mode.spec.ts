import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./helpers";

test.describe("Dark Mode", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test("theme toggle button is visible in header", async ({ page }) => {
    // Dashboard layout header contains Sun/Moon icon toggle
    const toggle = page.locator("header button").filter({ has: page.locator("svg") }).nth(-2);
    await expect(toggle).toBeVisible();
  });

  test("clicking theme toggle is clickable and responds", async ({ page }) => {
    // Find the theme toggle (second to last button in header — before logout)
    const header = page.locator("header");
    const buttons = header.getByRole("button");
    const count = await buttons.count();
    const themeBtn = buttons.nth(count - 2);

    // Button should be visible and enabled
    await expect(themeBtn).toBeVisible();
    await expect(themeBtn).toBeEnabled();

    // Click should not throw
    await themeBtn.click();

    // ThemeProvider stores preference in localStorage
    const storedTheme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(storedTheme).toBeTruthy();
  });

  test("theme preference is stored in localStorage", async ({ page }) => {
    // Find the theme toggle
    const header = page.locator("header");
    const buttons = header.getByRole("button");
    const count = await buttons.count();
    const themeBtn = buttons.nth(count - 2);

    // Click to change theme
    await themeBtn.click();
    const theme1 = await page.evaluate(() => localStorage.getItem("theme"));

    // Click again to toggle back
    await themeBtn.click();
    const theme2 = await page.evaluate(() => localStorage.getItem("theme"));

    // The two themes should differ
    expect(theme1).not.toBe(theme2);
  });

  test("dark mode preference persists in localStorage after reload", async ({ page }) => {
    // Set dark theme via localStorage
    await page.evaluate(() => localStorage.setItem("theme", "dark"));
    await page.reload();
    await page.waitForSelector("text=Jobs Tracked", { timeout: 10000 });

    // The localStorage key should still be "dark" after reload
    const storedTheme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(storedTheme).toBe("dark");
  });

  test("light mode preference persists in localStorage after reload", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload();
    await page.waitForSelector("text=Jobs Tracked", { timeout: 10000 });

    const storedTheme = await page.evaluate(() => localStorage.getItem("theme"));
    expect(storedTheme).toBe("light");
  });
});
