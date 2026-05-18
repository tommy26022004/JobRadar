import { test, expect } from "@playwright/test";
import { API } from "./helpers";

test.describe("Security — Input Validation", () => {
  test("register with short password fails", async ({ request }) => {
    const r = await request.post(`${API}/auth/register`, {
      data: { email: "short@e2e.dev", password: "Aa1", full_name: "User" },
    });
    expect(r.status()).toBe(422);
  });

  test("register with no uppercase in password fails", async ({ request }) => {
    const r = await request.post(`${API}/auth/register`, {
      data: { email: "noupper@e2e.dev", password: "nouppercase1", full_name: "User" },
    });
    expect(r.status()).toBe(422);
  });

  test("register with no digit in password fails", async ({ request }) => {
    const r = await request.post(`${API}/auth/register`, {
      data: { email: "nodigit@e2e.dev", password: "NoDigitHere", full_name: "User" },
    });
    expect(r.status()).toBe(422);
  });

  test("register with valid password succeeds", async ({ request }) => {
    const unique = `valid_${Date.now()}@e2e.dev`;
    const r = await request.post(`${API}/auth/register`, {
      data: { email: unique, password: "ValidPass1", full_name: "User" },
    });
    expect(r.status()).toBe(201);
  });

  test("health check returns ok", async ({ request }) => {
    const r = await request.get("http://localhost:8000/health");
    expect(r.status()).toBe(200);
    const data = await r.json();
    expect(data.status).toBe("ok");
    expect(data.db).toBe("ok");
    expect(data.version).toBeTruthy();
  });

  test("protected routes return 401 without token", async ({ request }) => {
    const endpoints = ["/jobs/", "/cvs/", "/applications/", "/settings/ai", "/settings/notifications"];
    for (const ep of endpoints) {
      const r = await request.get(`${API}${ep}`);
      expect([401, 403]).toContain(r.status());
    }
  });

  test("refresh token cannot be used as access token", async ({ request }) => {
    // Register + login
    const unique = `tokentest_${Date.now()}@e2e.dev`;
    await request.post(`${API}/auth/register`, {
      data: { email: unique, password: "TokenTest1", full_name: "T" },
    });
    const login = await request.post(`${API}/auth/login`, {
      data: { email: unique, password: "TokenTest1" },
    });
    const { refresh_token } = await login.json();

    // Try refresh token on /auth/me
    const r = await request.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${refresh_token}` },
    });
    expect([401, 403]).toContain(r.status());
  });
});

test.describe("Security — Rate Limiting (smoke)", () => {
  test("API returns proper JSON on 422 validation error", async ({ request }) => {
    const r = await request.post(`${API}/auth/register`, {
      data: { email: "bad@e2e.dev", password: "weak" },
    });
    expect(r.status()).toBe(422);
    const body = await r.json();
    expect(body).toHaveProperty("detail");
  });
});
