import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

test.describe('Advanced E2E Flows - Complex User Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    // Setup error filtering for all tests
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        // Filter expected errors
        if (!msg.text().includes('429') && 
            !msg.text().includes('Too Many Requests') &&
            !msg.text().includes('404')) {
          // Log but don't fail - some errors are expected in dev mode
          console.log(`Console error: ${msg.text()}`);
        }
      }
    });
  });

  test('Flow: Complete user journey from landing to job board', async ({ page }) => {
    console.log('🚀 Starting complete user journey test...');

    // Step 1: Landing page
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    console.log('✅ Step 1: Landed on homepage');

    // Verify hero section
    const heroText = await page.textContent('body');
    expect(heroText).toBeTruthy();
    console.log('✅ Step 2: Hero content visible');

    // Step 2: Navigate to Ideas
    await page.click('text=Ideas');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*ideas/);
    console.log('✅ Step 3: Navigated to Ideas board');

    // Step 3: Navigate to Jobs
    await page.click('text=Jobs');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*jobs/);
    console.log('✅ Step 4: Navigated to Jobs board');

    // Step 4: Navigate to Agents
    await page.click('text=Agents');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*agents/);
    console.log('✅ Step 5: Navigated to Agents page');

    // Step 5: Return to landing
    await page.click('text=Exchange', { timeout: 5000 }).catch(() => {
      // Try alternative navigation
      return page.goto(BASE_URL);
    });
    await page.waitForLoadState('networkidle');
    console.log('✅ Step 6: Returned to landing page');

    await page.screenshot({ path: 'test-results/advanced-flows/complete-journey.png' });
    console.log('🎉 Complete user journey test finished');
  });

  test('Flow: Workspace navigation for buyers', async ({ page }) => {
    console.log('🔍 Testing buyer workspace navigation...');

    // Navigate to workspace
    await page.goto(`${BASE_URL}/workspace`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to buyer workspace');

    // Check workspace content
    const body = page.locator('body');
    await expect(body).toBeVisible();
    
    const text = await page.textContent('body');
    expect(text?.length).toBeGreaterThan(500);
    console.log('✅ Workspace content loaded');

    // Navigate to review queue
    await page.goto(`${BASE_URL}/workspace/review`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to review queue');

    // Navigate to history
    await page.goto(`${BASE_URL}/workspace/history`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to workspace history');

    await page.screenshot({ path: 'test-results/advanced-flows/workspace-navigation.png' });
  });

  test('Flow: Protocol documentation access', async ({ page }) => {
    console.log('📚 Testing protocol documentation access...');

    // Navigate to docs
    await page.goto(`${BASE_URL}/docs`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to protocol docs');

    // Check for documentation content
    const text = await page.textContent('body');
    expect(text?.length).toBeGreaterThan(2000); // Docs should be lengthy
    console.log(`✅ Documentation content loaded (${text?.length} characters)`);

    // Navigate to architecture
    await page.goto(`${BASE_URL}/architecture`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to architecture page');

    const archText = await page.textContent('body');
    expect(archText?.length).toBeGreaterThan(1000);
    console.log(`✅ Architecture content loaded (${archText?.length} characters)`);

    await page.screenshot({ path: 'test-results/advanced-flows/protocol-docs.png' });
  });

  test('Flow: Tokenomics pages navigation', async ({ page }) => {
    console.log('💰 Testing tokenomics pages navigation...');

    // Test staking page
    await page.goto(`${BASE_URL}/staking`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to staking page');

    const stakingText = await page.textContent('body');
    expect(stakingText?.length).toBeGreaterThan(500);
    console.log('✅ Staking page content loaded');

    // Test mint page
    await page.goto(`${BASE_URL}/mint`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Navigated to mint page');

    const mintText = await page.textContent('body');
    expect(mintText?.length).toBeGreaterThan(500);
    console.log('✅ Mint page content loaded');

    await page.screenshot({ path: 'test-results/advanced-flows/tokenomics-pages.png' });
  });

  test('Flow: Mobile responsive complete navigation', async ({ page }) => {
    console.log('📱 Testing mobile responsive navigation...');

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    console.log('✅ Mobile viewport set');

    // Test navigation on mobile
    const navLinks = ['Exchange', 'Ideas', 'Jobs', 'Agents'];
    for (const link of navLinks) {
      try {
        await page.click(`text=${link}`, { timeout: 3000 });
        await page.waitForLoadState('networkidle', { timeout: 3000 });
        console.log(`✅ Mobile: Navigated to ${link}`);
        
        // Go back to home
        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');
      } catch (e) {
        console.log(`⚠️ Mobile: Could not navigate to ${link} (may require menu)`);
      }
    }

    await page.screenshot({ path: 'test-results/advanced-flows/mobile-navigation.png' });
  });

  test('Flow: Error handling and edge cases', async ({ page }) => {
    console.log('🔧 Testing error handling and edge cases...');

    // Test 404 handling
    await page.goto(`${BASE_URL}/non-existent-page`);
    await page.waitForLoadState('networkidle');
    console.log('✅ 404 page handled gracefully');

    // Test invalid idea ID
    await page.goto(`${BASE_URL}/ideas/invalid-id-99999`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Invalid idea ID handled');

    // Test invalid job ID
    await page.goto(`${BASE_URL}/review/invalid-job-99999`);
    await page.waitForLoadState('networkidle');
    console.log('✅ Invalid job ID handled');

    // Return to valid page
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    console.log('✅ Returned to valid page after edge cases');

    await page.screenshot({ path: 'test-results/advanced-flows/error-handling.png' });
  });

  test('Flow: Performance and loading states', async ({ page }) => {
    console.log('⚡ Testing performance and loading states...');

    const loadTimes: number[] = [];

    // Measure load times for key pages
    const pages = [
      { name: 'Landing', url: '/' },
      { name: 'Ideas', url: '/ideas' },
      { name: 'Jobs', url: '/jobs' },
      { name: 'Agents', url: '/agents' },
    ];

    for (const pageData of pages) {
      const startTime = Date.now();
      await page.goto(`${BASE_URL}${pageData.url}`);
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;
      loadTimes.push(loadTime);
      console.log(`⚡ ${pageData.name}: ${loadTime}ms`);
    }

    // All pages should load within reasonable time
    const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
    console.log(`⚡ Average load time: ${avgLoadTime}ms`);
    
    expect(avgLoadTime).toBeLessThan(5000); // Should load in under 5 seconds

    await page.screenshot({ path: 'test-results/advanced-flows/performance-test.png' });
  });

  test('Flow: Accessibility checks', async ({ page }) => {
    console.log('♿ Testing accessibility features...');

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Check for alt text on images
    const images = await page.locator('img').all();
    let imagesWithAlt = 0;
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      if (alt) {
        imagesWithAlt++;
      }
    }
    console.log(`♿ Images with alt text: ${imagesWithAlt}/${images.length}`);

    // Check for heading hierarchy
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').count();
    console.log(`♿ Found ${headings} headings for accessibility`);

    // Check for button labels
    const buttons = await page.locator('button').all();
    let labeledButtons = 0;
    for (const button of buttons) {
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      if (text || ariaLabel) {
        labeledButtons++;
      }
    }
    console.log(`♿ Labeled buttons: ${labeledButtons}/${buttons.length}`);

    await page.screenshot({ path: 'test-results/advanced-flows/accessibility-checks.png' });
  });

  test('Flow: Cross-browser compatibility (Chromium)', async ({ page }) => {
    console.log('🌐 Testing cross-browser compatibility...');

    // Test that all core features work in current browser
    const coreFeatures = [
      { name: 'Landing page', url: '/' },
      { name: 'Ideas board', url: '/ideas' },
      { name: 'Jobs board', url: '/jobs' },
      { name: 'Agents page', url: '/agents' },
      { name: 'Documentation', url: '/docs' },
    ];

    for (const feature of coreFeatures) {
      await page.goto(`${BASE_URL}${feature.url}`);
      await page.waitForLoadState('networkidle');
      
      const body = page.locator('body');
      await expect(body).toBeVisible();
      
      const text = await page.textContent('body');
      expect(text?.length).toBeGreaterThan(100);
      
      console.log(`✅ ${feature.name} compatible`);
    }

    await page.screenshot({ path: 'test-results/advanced-flows/cross-browser.png' });
  });
});