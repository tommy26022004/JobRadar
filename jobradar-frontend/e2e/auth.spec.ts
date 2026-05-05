import { test, expect } from "@playwright/test";
import { TEST_USER, loginViaAPI } from "./helpers";

test.describe("Auth", () => {
  test("register new account", async ({ page }) => {
    const unique = `e2e_${Date.now()}@jobradar.dev`;
    await page.goto("/register");
    await page.fill("#name", "Test User");
    await page.fill("#email", unique);
    await page.fill("#password", TEST_USER.password);
    await page.click('button:has-text("Create account")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test("login with valid credentials", async ({ page }) => {
    await fetch("http://localhost:8000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password, full_name: TEST_USER.name }),
    });

    await page.goto("/login");
    await page.fill("#email", TEST_USER.email);
    await page.fill("#password", TEST_USER.password);
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", TEST_USER.email);
    await page.fill("#password", "wrongpassword");
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/login/);
  });

  test("protected routes redirect to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });

  test("logout redirects to login", async ({ page }) => {
    // loginViaAPI already navigates to /dashboard and waits for auth
    await loginViaAPI(page);
    // Dashboard layout header has LogOut icon button (last button in header)
    await page.locator('header').getByRole('button').last().click();
    await expect(page).toHaveURL(/login/, { timeout: 5000 });
  });
});
