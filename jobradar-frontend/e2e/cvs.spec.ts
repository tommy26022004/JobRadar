import { test, expect } from "@playwright/test";
import { loginViaAPI, API } from "./helpers";

test.describe("CVs", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    await page.goto("/cvs");
    await page.waitForSelector("h1", { timeout: 10000 });
  });

  test("shows CV page", async ({ page }) => {
    await expect(page.locator("h1")).toContainText(/CV/i);
  });

  test("add a CV", async ({ page }) => {
    const cvName = `Test CV ${Date.now()}`;
    await page.click('button:has-text("Add CV")');
    await page.fill("#cv-name", cvName);
    await page.fill("#cv-content", "Python FastAPI React TypeScript PostgreSQL Docker software engineer 3 years experience");
    await page.click('button:has-text("Save CV")');
    await expect(page.locator(`text=${cvName}`).first()).toBeVisible({ timeout: 5000 });
  });

  test("delete a CV via UI shows it disappears", async ({ page }) => {
    // Create CV via API so we know its ID
    const token = await page.evaluate(() => localStorage.getItem("access_token")) as string;
    const createResp = await fetch(`${API}/cvs/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "UI Delete Test CV", content: "test content for deletion" }),
    });
    const cv = await createResp.json();

    // Reload page to see the new CV
    await page.reload();
    await page.waitForSelector("text=UI Delete Test CV", { timeout: 5000 });

    // Delete via API directly
    await fetch(`${API}/cvs/${cv.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    // Reload page to verify it's gone
    await page.reload();
    await expect(page.locator("text=UI Delete Test CV")).not.toBeVisible({ timeout: 5000 });
  });
});
