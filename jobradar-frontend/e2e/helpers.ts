import { Page } from "@playwright/test";

export const TEST_USER = {
  email: "e2e_test@jobradar.dev",
  password: "E2eTest1234!",
  name: "E2E Test User",
};

export const API = "http://localhost:8000/api";

async function ensureRegistered(): Promise<void> {
  await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password, full_name: TEST_USER.name }),
  });
}

/**
 * Login via UI — slow but guaranteed to work with React auth context.
 * Returns after /dashboard is fully loaded.
 */
export async function registerAndLogin(page: Page): Promise<void> {
  await ensureRegistered();
  await page.goto("/login");
  await page.fill("#email", TEST_USER.email);
  await page.fill("#password", TEST_USER.password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  // Wait for dashboard content to appear (auth fully resolved)
  await page.waitForSelector("text=Jobs Tracked", { timeout: 15000 });
}

/**
 * Faster login: submit login form via API, inject token via localStorage,
 * then navigate to /dashboard and wait for auth to resolve.
 */
export async function loginViaAPI(page: Page): Promise<string> {
  await ensureRegistered();

  // Get token from API
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
  });
  const data = await r.json();
  const token = data.access_token as string;

  if (!token) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  // Use the login form UI to fully authenticate (ensures auth context is populated)
  await page.goto("/login");
  await page.fill("#email", TEST_USER.email);
  await page.fill("#password", TEST_USER.password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  await page.waitForSelector("text=Jobs Tracked", { timeout: 15000 });

  return token;
}

export async function createCV(token: string, name = "E2E CV"): Promise<void> {
  await fetch(`${API}/cvs/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name,
      content: "Python FastAPI React TypeScript PostgreSQL Docker 3 years software engineer full-stack development",
    }),
  });
}
