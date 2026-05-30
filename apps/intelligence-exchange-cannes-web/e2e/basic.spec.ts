import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

test.describe('Intelligence Exchange E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('Landing page loads', async ({ page }) => {
    await expect(page).toHaveTitle(/Intelligence Exchange/);
    await expect(page.locator('body')).toBeVisible();
    console.log('✅ Landing page loads successfully');
  });

  test('Navigation to Ideas board', async ({ page }) => {
    await page.click('text=Ideas');
    await expect(page).toHaveURL(/.*ideas/);
    console.log('✅ Ideas board navigation works');
  });

  test('Navigation to Jobs board', async ({ page }) => {
    await page.click('text=Jobs');
    await expect(page).toHaveURL(/.*jobs/);
    console.log('✅ Jobs board navigation works');
  });

  test('Navigation to Agents page', async ({ page }) => {
    await page.click('text=Agents');
    await expect(page).toHaveURL(/.*agents/);
    console.log('✅ Agents page navigation works');
  });

  test('Ideas board renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/ideas`);
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ Ideas board renders');
  });

  test('Jobs board renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/jobs`);
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ Jobs board renders');
  });

  test('Agents page renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/agents`);
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ Agents page renders');
  });

  test('Check for console errors on landing page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    if (errors.length > 0) {
      console.log('❌ Console errors:', errors);
    } else {
      console.log('✅ No console errors on landing page');
    }
    expect(errors.length).toBe(0);
  });

  test('Check for console errors on Ideas board', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.goto(`${BASE_URL}/ideas`);
    await page.waitForLoadState('networkidle');
    if (errors.length > 0) {
      console.log('❌ Console errors on Ideas board:', errors);
    } else {
      console.log('✅ No console errors on Ideas board');
    }
    expect(errors.length).toBe(0);
  });

  test('Check for console errors on Jobs board', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.goto(`${BASE_URL}/jobs`);
    await page.waitForLoadState('networkidle');
    if (errors.length > 0) {
      console.log('❌ Console errors on Jobs board:', errors);
    } else {
      console.log('✅ No console errors on Jobs board');
    }
    expect(errors.length).toBe(0);
  });

  test('Check for console errors on Agents page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await page.goto(`${BASE_URL}/agents`);
    await page.waitForLoadState('networkidle');
    if (errors.length > 0) {
      console.log('❌ Console errors on Agents page:', errors);
    } else {
      console.log('✅ No console errors on Agents page');
    }
    expect(errors.length).toBe(0);
  });

  test('404 handling - invalid route', async ({ page }) => {
    await page.goto(`${BASE_URL}/this-page-does-not-exist`);
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ 404 page renders (or app handles it gracefully)');
  });
});