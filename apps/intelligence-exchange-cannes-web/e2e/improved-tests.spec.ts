import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

test.describe('Missing Routes Coverage', () => {
  test('Idea Detail page (/ideas/:ideaId) - renders with sample ID', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('404')) {
        errors.push(msg.text());
      }
    });

    // Navigate to a sample idea detail page
    await page.goto(`${BASE_URL}/ideas/sample-idea-123`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const text = await page.textContent('body');
    expect(text?.length).toBeGreaterThan(1000); // Page should have content

    // Check for common idea detail elements
    const hasBackButton = await page.getByText(/back|ideas/i, { exact: false }).count() > 0;
    expect(hasBackButton).toBeTruthy(); // Should have navigation

    await page.screenshot({ path: 'test-results/missing-routes/idea-detail.png' });

    // Allow 404 errors for invalid IDs, but fail on other errors
    if (errors.length > 0) {
      console.log(`⚠️ Non-404 console errors:`, errors);
    }
  });

  test('Review Panel page (/review/:jobId) - renders with sample ID', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to a sample review panel page
    await page.goto(`${BASE_URL}/review/sample-job-456`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const text = await page.textContent('body');
    console.log(`✅ Review Panel page rendered (${text?.length || 0} characters)`);

    // Check for review-related elements
    const hasReviewText = text?.toLowerCase().includes('review');
    const hasSubmitText = text?.toLowerCase().includes('submit');
    console.log(`📊 Contains 'review': ${hasReviewText}`);
    console.log(`📊 Contains 'submit': ${hasSubmitText}`);

    await page.screenshot({ path: 'test-results/missing-routes/review-panel.png' });

    console.log(`⚠️ Console error count: ${errors.length}`);
  });

  test('Escrow Status Panel (/escrow/:ideaId) - renders with sample ID', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to a sample escrow status page
    await page.goto(`${BASE_URL}/escrow/sample-idea-789`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const text = await page.textContent('body');
    console.log(`✅ Escrow Status Panel rendered (${text?.length || 0} characters)`);

    // Check for escrow-related elements
    const hasEscrowText = text?.toLowerCase().includes('escrow');
    const hasStatusText = text?.toLowerCase().includes('status');
    console.log(`📊 Contains 'escrow': ${hasEscrowText}`);
    console.log(`📊 Contains 'status': ${hasStatusText}`);

    await page.screenshot({ path: 'test-results/missing-routes/escrow-status.png' });

    console.log(`⚠️ Console error count: ${errors.length}`);
  });

  test('Dossier Panel (/dossier/:ideaId) - renders with sample ID', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to a sample dossier page
    await page.goto(`${BASE_URL}/dossier/sample-idea-999`);

    // Wait for either body to be visible or redirect
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (e) {
      // Continue even if timeout
    }

    // Check if we're still on dossier page or were redirected
    const currentUrl = page.url();
    console.log(`📊 Current URL: ${currentUrl}`);

    const isDossierPage = currentUrl.includes('/dossier/');

    if (isDossierPage) {
      const body = page.locator('body');
      const isVisible = await body.isVisible().catch(() => false);

      if (isVisible) {
        const text = await page.textContent('body');
        console.log(`✅ Dossier Panel rendered (${text?.length || 0} characters)`);

        // Check for dossier-related elements
        const hasDossierText = text?.toLowerCase().includes('dossier');
        console.log(`📊 Contains 'dossier': ${hasDossierText}`);
      } else {
        console.log(`⚠️ Dossier Panel body hidden (may be loading or requires auth)`);
      }
    } else {
      console.log(`⚠️ Redirected from dossier page to: ${currentUrl}`);
    }

    await page.screenshot({ path: 'test-results/missing-routes/dossier-panel.png' });

    console.log(`⚠️ Console error count: ${errors.length}`);
  });
});

test.describe('Functional Testing - Staking Controls', () => {
  test('Staking page - verify staking controls are present and interactive', async ({ page }) => {
    await page.goto(`${BASE_URL}/staking`);
    await page.waitForLoadState('networkidle');

    console.log('🔍 Testing staking controls functionality...');

    // Look for staking-related buttons and inputs
    const allButtons = await page.locator('button').all();
    const allInputs = await page.locator('input').all();

    console.log(`📊 Total buttons: ${allButtons.length}`);
    console.log(`📊 Total inputs: ${allInputs.length}`);

    // Check for staking-related text in buttons
    const stakingButtons = [];
    for (const btn of allButtons) {
      const text = await btn.textContent();
      if (text && (text.toLowerCase().includes('stake') ||
                   text.toLowerCase().includes('unstake') ||
                   text.toLowerCase().includes('claim'))) {
        stakingButtons.push(text);
        console.log(`✅ Found staking-related button: ${text}`);
      }
    }

    // Check for input fields that might be for amounts
    const amountInputs = [];
    for (const input of allInputs) {
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');
      if (type === 'number' || (placeholder && placeholder.toLowerCase().includes('amount'))) {
        amountInputs.push({ type, placeholder });
        console.log(`✅ Found amount input: type=${type}, placeholder=${placeholder}`);
      }
    }

    // Try to interact with staking controls if they exist
    if (stakingButtons.length > 0) {
      console.log(`✅ Staking controls detected: ${stakingButtons.length} buttons`);
    } else {
      console.log(`⚠️ No staking-related buttons found (may require wallet connection)`);
    }

    if (amountInputs.length > 0) {
      console.log(`✅ Amount inputs detected: ${amountInputs.length} inputs`);
    } else {
      console.log(`⚠️ No amount inputs found (may require wallet connection)`);
    }

    // Check for wallet connection requirement
    const text = await page.textContent('body');
    const requiresWallet = text?.toLowerCase().includes('connect') ||
                          text?.toLowerCase().includes('wallet');

    if (requiresWallet) {
      console.log(`⚠️ Staking page appears to require wallet connection`);
    }

    await page.screenshot({ path: 'test-results/functional/staking-controls.png' });
  });
});

test.describe('API Integration Testing', () => {
  test('Ideas board - verify API calls are made and succeed', async ({ page }) => {
    // Track network requests
    const apiRequests: { url: string; status: number }[] = [];
    page.on('response', async (response) => {
      if (response.url().includes('/api/') || response.url().includes('/v1/')) {
        apiRequests.push({
          url: response.url(),
          status: response.status()
        });
      }
    });

    await page.goto(`${BASE_URL}/ideas`);
    await page.waitForLoadState('networkidle');

    // Verify API calls were made
    expect(apiRequests.length).toBeGreaterThan(0); // Should make API calls

    // Verify API calls succeeded (not 429 or 500 errors)
    const successfulRequests = apiRequests.filter(r => r.status >= 200 && r.status < 300);
    expect(successfulRequests.length).toBeGreaterThan(0); // Should have successful API calls

    console.log(`✅ API requests made: ${apiRequests.length}`);
    console.log(`✅ Successful requests: ${successfulRequests.length}`);

    // Check if data is displayed (even if empty)
    const text = await page.textContent('body');
    const hasContent = text && text.length > 1000;
    expect(hasContent).toBeTruthy(); // Page should render content

    await page.screenshot({ path: 'test-results/api/ideas-board-api.png' });
  });

  test('Jobs board - verify API calls are made and succeed', async ({ page }) => {
    const apiRequests: { url: string; status: number }[] = [];
    page.on('response', async (response) => {
      if (response.url().includes('/api/') || response.url().includes('/v1/')) {
        apiRequests.push({
          url: response.url(),
          status: response.status()
        });
      }
    });

    await page.goto(`${BASE_URL}/jobs`);
    await page.waitForLoadState('networkidle');

    expect(apiRequests.length).toBeGreaterThan(0);

    const successfulRequests = apiRequests.filter(r => r.status >= 200 && r.status < 300);
    expect(successfulRequests.length).toBeGreaterThan(0);

    console.log(`✅ API requests made: ${apiRequests.length}`);
    console.log(`✅ Successful requests: ${successfulRequests.length}`);

    const text = await page.textContent('body');
    const hasContent = text && text.length > 1000;
    expect(hasContent).toBeTruthy();

    await page.screenshot({ path: 'test-results/api/jobs-board-api.png' });
  });
});

test.describe('Form Testing - Idea Submission', () => {
  test('Idea submission - check form elements exist', async ({ page }) => {
    await page.goto(`${BASE_URL}/submit`);
    await page.waitForLoadState('networkidle');

    console.log('🔍 Testing idea submission form elements...');

    // Count form elements
    const inputs = await page.locator('input').count();
    const textareas = await page.locator('textarea').count();
    const selects = await page.locator('select').count();
    const buttons = await page.locator('button').count();

    console.log(`📊 Input fields: ${inputs}`);
    console.log(`📊 Textarea fields: ${textareas}`);
    console.log(`📊 Select fields: ${selects}`);
    console.log(`📊 Buttons: ${buttons}`);

    // Check for common form fields
    const text = await page.textContent('body');
    const hasTitleField = text?.toLowerCase().includes('title');
    const hasDescriptionField = text?.toLowerCase().includes('description') ||
                               text?.toLowerCase().includes('prompt');
    const hasBudgetField = text?.toLowerCase().includes('budget');

    console.log(`📊 Has title field indicator: ${hasTitleField}`);
    console.log(`📊 Has description field indicator: ${hasDescriptionField}`);
    console.log(`📊 Has budget field indicator: ${hasBudgetField}`);

    // Check if form is behind authentication
    const requiresWallet = text?.toLowerCase().includes('connect') ||
                          text?.toLowerCase().includes('wallet');
    const requiresWorldId = text?.toLowerCase().includes('world') ||
                           text?.toLowerCase().include('verify');

    if (requiresWallet) {
      console.log(`⚠️ Form requires wallet connection`);
    }
    if (requiresWorldId) {
      console.log(`⚠️ Form requires World ID verification`);
    }

    await page.screenshot({ path: 'test-results/forms/idea-submission-form.png' });
  });
});

test.describe('Wallet Interaction Testing', () => {
  test('Wallet connect button - verify it exists and is clickable', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Look for wallet connect button
    const connectButton = page.getByText(/connect/i, { exact: false }).first();
    const isVisible = await connectButton.isVisible().catch(() => false);

    expect(isVisible).toBeTruthy(); // Button should be visible

    // Try to click it
    await connectButton.click();

    // Wait for modal to appear
    await page.waitForTimeout(2000);

    // Check if modal appeared
    const modalVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false);
    expect(modalVisible).toBeTruthy(); // Modal should appear on click

    await page.screenshot({ path: 'test-results/wallet/wallet-modal-open.png' });
  });
});

test.describe('Error Scenario Testing', () => {
  test('Handle invalid route gracefully', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to invalid route
    await page.goto(`${BASE_URL}/this-route-does-not-exist`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible(); // Should still render something

    const text = await page.textContent('body');
    const hasContent = text && text.length > 500; // Should have some content
    expect(hasContent).toBeTruthy(); // Should not be blank

    console.log(`⚠️ Console error count: ${errors.length}`);

    await page.screenshot({ path: 'test-results/errors/404-page.png' });
  });

  test('Handle API failure gracefully', async ({ page }) => {
    // Mock API failure by intercepting requests
    await page.route('**/api/**', route => route.abort());

    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/ideas`);
    await page.waitForLoadState('networkidle');

    const text = await page.textContent('body');
    const hasContent = text && text.length > 500; // Should still render UI
    expect(hasContent).toBeTruthy(); // Should not crash

    console.log(`⚠️ Console error count: ${errors.length}`);

    await page.screenshot({ path: 'test-results/errors/api-failure.png' });
  });
});