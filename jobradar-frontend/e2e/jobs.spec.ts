import { test, expect } from "@playwright/test";
import { loginViaAPI, createCV, API } from "./helpers";

const JD = `Senior Full Stack Engineer — Remote
Company: TechCorp Global
Requirements: Python, FastAPI, React, TypeScript, PostgreSQL
Salary: $80,000 - $120,000/year
We are looking for an experienced engineer to join our remote team.`;

test.describe("Jobs & Kanban", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    // Now on /dashboard with auth confirmed
  });

  test("add job via Add Job button", async ({ page }) => {
    const token = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "e2e_test@jobradar.dev", password: "E2eTest1234!" }),
    }).then(r => r.json()).then(d => d.access_token);
    await createCV(token);

    // Navigate to /jobs/new
    await page.click('a:has-text("Add Job")');
    await expect(page).toHaveURL(/jobs\/new/, { timeout: 5000 });

    // Fill JD
    await page.locator("#jd").fill(JD);

    // Click Analyze
    await page.click('button:has-text("Analyze with AI")');

    // Wait for step "done" — "View Job Detail" button appears
    await expect(page.locator('button:has-text("View Job Detail")')).toBeVisible({ timeout: 30000 });
  });

  test("dashboard shows kanban board", async ({ page }) => {
    await expect(page.locator("text=Application Board")).toBeVisible();
    await expect(page.locator("text=Saved").first()).toBeVisible();
    await expect(page.locator("text=Applied").first()).toBeVisible();
    await expect(page.locator("text=Interview").first()).toBeVisible();
  });

  test("stat cards visible on dashboard", async ({ page }) => {
    await expect(page.locator("text=Jobs Tracked")).toBeVisible();
    await expect(page.locator("text=Avg Match Score")).toBeVisible();
    await expect(page.locator("text=AI Quota")).toBeVisible();
  });

  test("new matches panel visible", async ({ page }) => {
    await expect(page.locator("text=New Matches For You")).toBeVisible();
  });
});
