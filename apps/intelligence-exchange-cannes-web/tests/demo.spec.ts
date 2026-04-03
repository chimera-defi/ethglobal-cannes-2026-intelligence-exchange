import { test, expect } from "@playwright/test";

test("captures the Cannes MVP dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Agent work board/i })).toBeVisible();
  await page.screenshot({ path: "screenshots/cannes-dashboard.png", fullPage: true });
});

test("captures the Cannes MVP dashboard on mobile", async ({ browser }) => {
  const page = await browser.newPage({
    viewport: {
      width: 430,
      height: 1400
    }
  });
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByRole("heading", { name: /Agent work board/i })).toBeVisible();
  await page.screenshot({ path: "screenshots/cannes-dashboard-mobile.png", fullPage: true });
  await page.close();
});
