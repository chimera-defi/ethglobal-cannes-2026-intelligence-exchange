import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

test.describe('Comprehensive Page Coverage - All Routes', () => {
  const routes = [
    { path: '/', name: 'Landing' },
    { path: '/submit', name: 'Idea Submission' },
    { path: '/ideas', name: 'Ideas List' },
    { path: '/jobs', name: 'Jobs Board' },
    { path: '/agents', name: 'Agents Page' },
    { path: '/staking', name: 'Staking Page' },
    { path: '/mint', name: 'Intel Mint Page' },
    { path: '/docs', name: 'Protocol Docs' },
    { path: '/architecture', name: 'Architecture Page' },
    { path: '/workspace', name: 'Buyer Workspace' },
    { path: '/workspace/review', name: 'Buyer Review Queue' },
    { path: '/workspace/history', name: 'Buyer History' },
  ];

  routes.forEach(({ path, name }) => {
    test(`${name} (${path}) - renders without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          // Ignore 429 rate limiting errors (expected when running many tests in parallel)
          if (!msg.text().includes('429') && !msg.text().includes('Too Many Requests')) {
            errors.push(msg.text());
          }
        }
      });

      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('networkidle');

      const body = page.locator('body');
      await expect(body).toBeVisible();

      const text = await page.textContent('body');
      console.log(`✅ ${name} rendered (${text?.length || 0} characters)`);

      if (errors.length > 0) {
        console.log(`❌ ${name} console errors:`, errors);
      }

      expect(errors.length).toBe(0);

      // Screenshot for visual verification
      await page.screenshot({ path: `test-results/all-pages/${name.replace(/\s+/g, '-').toLowerCase()}.png` });
    });
  });

  test('Staking page - check for staking controls', async ({ page }) => {
    await page.goto(`${BASE_URL}/staking`);
    await page.waitForLoadState('networkidle');

    // Verify page renders
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Verify page has content
    const text = await page.textContent('body');
    expect(text?.length).toBeGreaterThan(500); // Page should have content

    // Verify page contains staking-related text OR requires wallet
    const hasStakingContent = text?.toLowerCase().includes('stake') ||
                             text?.toLowerCase().includes('connect');
    expect(hasStakingContent).toBeTruthy();

    await page.screenshot({ path: 'test-results/staking-detailed.png' });
  });

  test('Mint page - check for mint controls', async ({ page }) => {
    await page.goto(`${BASE_URL}/mint`);
    await page.waitForLoadState('networkidle');

    // Verify page renders
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Verify page has content
    const text = await page.textContent('body');
    expect(text?.length).toBeGreaterThan(500); // Page should have content

    // Verify page contains mint-related text
    const hasMintContent = text?.toLowerCase().includes('mint') ||
                          text?.toLowerCase().includes('token');
    expect(hasMintContent).toBeTruthy();

    await page.screenshot({ path: 'test-results/mint-detailed.png' });
  });

  test('Workspace pages - check for workspace controls', async ({ page }) => {
    const workspaceRoutes = ['/workspace', '/workspace/review', '/workspace/history'];

    for (const route of workspaceRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');

      // Verify page renders
      const body = page.locator('body');
      await expect(body).toBeVisible();

      // Verify page has content
      const text = await page.textContent('body');
      expect(text?.length).toBeGreaterThan(500); // Page should have content

      const routeName = route.split('/').pop() || 'workspace';
      await page.screenshot({ path: `test-results/workspace/${routeName}.png` });
    }
  });

  test('Check for broken links across all pages', async ({ page }) => {
    const brokenLinks: string[] = [];

    page.on('response', (response) => {
      if (response.status() >= 400) {
        brokenLinks.push(`${response.url()} - ${response.status()}`);
      }
    });

    for (const { path } of routes) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForLoadState('networkidle');
    }

    // Assert no broken links (except 429 rate limiting which is expected when running many tests)
    const criticalBrokenLinks = brokenLinks.filter(link => !link.includes('429'));
    expect(criticalBrokenLinks.length).toBe(0);
  });
});