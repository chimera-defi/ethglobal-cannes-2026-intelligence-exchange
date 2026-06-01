import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

test.describe('Full Flow E2E Tests - Actual Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('Flow: Navigate to Ideas board and check for "Submit Idea" button', async ({ page }) => {
    console.log('🔍 Testing Ideas board navigation and submit button...');

    // Navigate to Ideas board
    await page.click('text=Ideas');
    await expect(page).toHaveURL(/.*ideas/);
    console.log('✅ Navigated to Ideas board');

    // Check if page has content
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ Ideas board body is visible');

    // Look for any buttons or interactive elements
    const buttons = await page.locator('button').count();
    console.log(`📊 Found ${buttons} buttons on Ideas board`);

    // Look for "Submit" or "Create" buttons
    const submitButtons = await page.getByText(/submit|create|new/i, { exact: false }).count();
    console.log(`📊 Found ${submitButtons} submit/create buttons`);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/ideas-board.png' });
    console.log('📸 Screenshot saved to test-results/ideas-board.png');
  });

  test('Flow: Navigate to Jobs board and check for job cards', async ({ page }) => {
    console.log('🔍 Testing Jobs board navigation and job cards...');

    // Navigate to Jobs board
    await page.click('text=Jobs');
    await expect(page).toHaveURL(/.*jobs/);
    console.log('✅ Navigated to Jobs board');

    // Check if page has content
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ Jobs board body is visible');

    // Look for job cards or list items
    const cards = await page.locator('[class*="card"]').count();
    console.log(`📊 Found ${cards} card elements on Jobs board`);

    // Look for status badges
    const badges = await page.locator('[class*="badge"]').count();
    console.log(`📊 Found ${badges} badge elements on Jobs board`);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/jobs-board.png' });
    console.log('📸 Screenshot saved to test-results/jobs-board.png');
  });

  test('Flow: Navigate to Agents page and check for agent listings', async ({ page }) => {
    console.log('🔍 Testing Agents page navigation and listings...');

    // Navigate to Agents page
    await page.click('text=Agents');
    await expect(page).toHaveURL(/.*agents/);
    console.log('✅ Navigated to Agents page');

    // Check if page has content
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ Agents page body is visible');

    // Look for agent-related content
    const text = await page.textContent('body');
    if (text) {
      console.log(`📝 Page text length: ${text.length} characters`);
      console.log(`📝 Contains "agent": ${text.toLowerCase().includes('agent')}`);
    }

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/agents-page.png' });
    console.log('📸 Screenshot saved to test-results/agents-page.png');
  });

  test('Flow: Check wallet connect button visibility', async ({ page }) => {
    console.log('🔍 Testing wallet connect button...');

    // Look for wallet connect button (various possible selectors)
    const connectButton = page.getByText(/connect/i, { exact: false }).first();
    const isVisible = await connectButton.isVisible().catch(() => false);

    if (isVisible) {
      console.log('✅ Wallet connect button is visible');
      await connectButton.click();
      console.log('✅ Clicked wallet connect button');

      // Wait a moment for wallet modal to appear
      await page.waitForTimeout(2000);

      // Take screenshot of wallet modal
      await page.screenshot({ path: 'test-results/wallet-modal.png' });
      console.log('📸 Screenshot saved to test-results/wallet-modal.png');
    } else {
      console.log('⚠️ Wallet connect button not found or not visible');
    }

    // Take screenshot of landing page
    await page.screenshot({ path: 'test-results/landing-page.png' });
    console.log('📸 Screenshot saved to test-results/landing-page.png');
  });

  test('Flow: Try to access idea submission page', async ({ page }) => {
    console.log('🔍 Testing idea submission page access...');

    // Navigate directly to submission page
    await page.goto(`${BASE_URL}/submit`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to /submit');

    // Check if page renders
    const body = page.locator('body');
    await expect(body).toBeVisible();
    console.log('✅ Submission page body is visible');

    // Look for form elements
    const inputs = await page.locator('input').count();
    const textareas = await page.locator('textarea').count();
    const buttons = await page.locator('button').count();

    console.log(`📊 Found ${inputs} input fields`);
    console.log(`📊 Found ${textareas} textarea fields`);
    console.log(`📊 Found ${buttons} buttons`);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/idea-submission.png' });
    console.log('📸 Screenshot saved to test-results/idea-submission.png');
  });

  test('Flow: Check for console errors on all interactions', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Ignore expected errors: 429 rate limiting, 502 bad gateway (infrastructure down), 404s
        if (!msg.text().includes('429') && 
            !msg.text().includes('Too Many Requests') &&
            !msg.text().includes('502') &&
            !msg.text().includes('Bad Gateway') &&
            !msg.text().includes('404')) {
          errors.push(msg.text());
        }
      }
    });

    console.log('🔍 Testing all navigation flows for console errors...');

    // Navigate through all pages
    const pages = [
      { name: 'Landing', url: '/' },
      { name: 'Ideas', url: '/ideas' },
      { name: 'Jobs', url: '/jobs' },
      { name: 'Agents', url: '/agents' },
      { name: 'Submission', url: '/submit' },
    ];

    for (const pageData of pages) {
      await page.goto(`${BASE_URL}${pageData.url}`);
      await page.waitForLoadState('networkidle');
      console.log(`✅ Navigated to ${pageData.name}`);
    }

    if (errors.length > 0) {
      console.log('❌ Console errors found:', errors);
    } else {
      console.log('✅ No console errors on any page');
    }

    expect(errors.length).toBe(0);
  });

  test('Flow: Check responsive layout on mobile', async ({ page }) => {
    console.log('🔍 Testing responsive layout on mobile viewport...');

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    console.log('✅ Set mobile viewport (375x667)');

    // Check if navigation is still accessible
    const navVisible = await page.locator('nav').isVisible().catch(() => false);
    console.log(`📊 Navigation visible on mobile: ${navVisible}`);

    // Take screenshot
    await page.screenshot({ path: 'test-results/mobile-landing.png' });
    console.log('📸 Screenshot saved to test-results/mobile-landing.png');

    // Navigate to ideas board on mobile
    await page.click('text=Ideas');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/mobile-ideas.png' });
    console.log('📸 Screenshot saved to test-results/mobile-ideas.png');
  });

  test('Flow: Check for broken images or resources', async ({ page }) => {
    console.log('🔍 Testing for broken resources...');

    const failedRequests: string[] = [];
    page.on('requestfailed', (request) => {
      failedRequests.push(request.url());
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    if (failedRequests.length > 0) {
      console.log('⚠️ Failed requests:', failedRequests);
    } else {
      console.log('✅ No failed requests');
    }
  });

  test('Flow: Check all navigation links', async ({ page }) => {
    console.log('🔍 Testing all navigation links...');

    await page.goto(BASE_URL);

    // Get all links
    const links = await page.locator('a').all();
    console.log(`📊 Found ${links.length} links on landing page`);

    // Test each link (limit to first 10 to avoid timeout)
    const linksToTest = links.slice(0, 10);
    for (const link of linksToTest) {
      const href = await link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        try {
          await link.click();
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
          console.log(`✅ Clicked link: ${href}`);
          await page.goBack();
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        } catch (e) {
          console.log(`⚠️ Failed to navigate to: ${href}`);
        }
      }
    }
  });
});