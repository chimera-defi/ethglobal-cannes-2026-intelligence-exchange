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
          errors.push(msg.text());
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

    console.log('🔍 Testing staking page controls...');

    // Look for staking-related elements
    const buttons = await page.locator('button').count();
    const inputs = await page.locator('input').count();
    const text = await page.textContent('body');

    console.log(`📊 Staking page: ${buttons} buttons, ${inputs} inputs`);
    console.log(`📝 Contains "stake": ${text?.toLowerCase().includes('stake')}`);
    console.log(`📝 Contains "unstake": ${text?.toLowerCase().includes('unstake')}`);
    console.log(`📝 Contains "reward": ${text?.toLowerCase().includes('reward')}`);

    await page.screenshot({ path: 'test-results/staking-detailed.png' });
  });

  test('Mint page - check for mint controls', async ({ page }) => {
    await page.goto(`${BASE_URL}/mint`);
    await page.waitForLoadState('networkidle');

    console.log('🔍 Testing mint page controls...');

    const buttons = await page.locator('button').count();
    const inputs = await page.locator('input').count();
    const text = await page.textContent('body');

    console.log(`📊 Mint page: ${buttons} buttons, ${inputs} inputs`);
    console.log(`📝 Contains "mint": ${text?.toLowerCase().includes('mint')}`);
    console.log(`📝 Contains "token": ${text?.toLowerCase().includes('token')}`);

    await page.screenshot({ path: 'test-results/mint-detailed.png' });
  });

  test('Workspace pages - check for workspace controls', async ({ page }) => {
    const workspaceRoutes = ['/workspace', '/workspace/review', '/workspace/history'];

    for (const route of workspaceRoutes) {
      await page.goto(`${BASE_URL}${route}`);
      await page.waitForLoadState('networkidle');

      const buttons = await page.locator('button').count();
      const text = await page.textContent('body');
      const routeName = route.split('/').pop() || 'workspace';

      console.log(`📊 ${routeName}: ${buttons} buttons, ${text?.length || 0} chars`);

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

    if (brokenLinks.length > 0) {
      console.log('⚠️ Broken links found:', brokenLinks);
    } else {
      console.log('✅ No broken links found');
    }
  });
});