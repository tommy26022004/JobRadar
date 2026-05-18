import { test, expect } from "@playwright/test";
import { loginViaAPI, createCV, API } from "./helpers";

const JD = `Senior Full Stack Engineer — Remote
Company: TechCorp Global
Requirements: Python, FastAPI, React, TypeScript, PostgreSQL
Salary: $80,000–$120,000/year`;

async function getToken(page: import("@playwright/test").Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem("access_token"))) as string;
}

async function createJobAndApp(token: string): Promise<{ jobId: number; appId: number }> {
  const jobRes = await fetch(`${API}/jobs/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ raw_jd: JD, title: "Test Engineer" }),
  });
  if (!jobRes.ok) throw new Error(`Job creation failed: ${jobRes.status} ${await jobRes.text()}`);
  const job = await jobRes.json();

  const cvRes = await fetch(`${API}/cvs/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!cvRes.ok) throw new Error(`CV list failed: ${cvRes.status}`);
  const cvList = await cvRes.json();
  if (!cvList.length) throw new Error("No CVs found — beforeEach createCV may have failed");

  const appRes = await fetch(`${API}/applications/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ job_id: job.id, cv_id: cvList[0].id }),
  });
  if (!appRes.ok) throw new Error(`Application creation failed: ${appRes.status} ${await appRes.text()}`);
  const app = await appRes.json();

  return { jobId: job.id, appId: app.id };
}

test.describe("Interview Date & Notes", () => {
  test.beforeEach(async ({ page }) => {
    const token = await loginViaAPI(page);
    await createCV(token);
  });

  test("job detail page has Interview & Notes card", async ({ page }) => {
    const token = await getToken(page);
    const { jobId } = await createJobAndApp(token);

    await page.goto(`/jobs/${jobId}`);
    await page.waitForSelector("text=Test Engineer", { timeout: 8000 });
    await expect(page.locator("text=Interview & Notes")).toBeVisible({ timeout: 8000 });
  });

  test("datetime input is visible when status is interview", async ({ page }) => {
    const token = await getToken(page);
    const { jobId } = await createJobAndApp(token);

    await page.goto(`/jobs/${jobId}`);
    await expect(page.locator("text=Interview Date")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("input[type='datetime-local']")).toBeVisible();
  });

  test("can set interview date and save", async ({ page }) => {
    const token = await getToken(page);
    const { jobId } = await createJobAndApp(token);

    await page.goto(`/jobs/${jobId}`);
    await page.waitForSelector("input[type='datetime-local']", { timeout: 8000 });

    // Set a future interview date
    await page.fill("input[type='datetime-local']", "2026-08-01T10:00");
    await page.click("button:has-text('Save')");

    // Toast should appear
    await expect(page.locator("text=Saved")).toBeVisible({ timeout: 5000 });
  });

  test("can write notes and save", async ({ page }) => {
    const token = await getToken(page);
    const { jobId } = await createJobAndApp(token);

    await page.goto(`/jobs/${jobId}`);
    await page.waitForSelector("textarea", { timeout: 8000 });

    const notesText = "Follow up with recruiter on Friday.";
    await page.fill("textarea", notesText);
    await page.click("button:has-text('Save')");

    await expect(page.locator("text=Saved")).toBeVisible({ timeout: 5000 });
  });

  test("notes persist after page reload", async ({ page }) => {
    const token = await getToken(page);
    const { jobId } = await createJobAndApp(token);

    // Save notes via API directly
    const apps = await fetch(`${API}/applications/`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json());
    const appId = apps.find((a: { job_id: number }) => a.job_id === jobId)?.id;

    await fetch(`${API}/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes: "Persistent notes text" }),
    });

    await page.goto(`/jobs/${jobId}`);
    await page.waitForSelector("textarea", { timeout: 8000 });
    const notesValue = await page.locator("textarea").inputValue();
    expect(notesValue).toBe("Persistent notes text");
  });
});
