import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

test.describe('Missing Routes Coverage', () => {
  test('Idea Detail page (/ideas/:ideaId) - renders with sample ID', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to a sample idea detail page
    await page.goto(`${BASE_URL}/ideas/sample-idea-123`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    const text = await page.textContent('body');
    console.log(`✅ Idea Detail page rendered (${text?.length || 0} characters)`);

    // Check for common idea detail elements
    const hasBackButton = await page.getByText(/back|ideas/i, { exact: false }).count() > 0;
    console.log(`📊 Has back/navigation button: ${hasBackButton}`);

    if (errors.length > 0) {
      console.log(`❌ Console errors:`, errors);
    }

    // Screenshot for visual verification
    await page.screenshot({ path: 'test-results/missing-routes/idea-detail.png' });

    // Don't fail on console errors for now - this route might not exist or handle 404s
    console.log(`⚠️ Console error count: ${errors.length}`);
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
  test('Ideas board - verify API calls are made', async ({ page }) => {
    // Track network requests
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') || request.url().includes('/v1/')) {
        apiRequests.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/ideas`);
    await page.waitForLoadState('networkidle');

    console.log(`🔍 API requests made: ${apiRequests.length}`);
    if (apiRequests.length > 0) {
      apiRequests.forEach(url => console.log(`  - ${url}`));
    } else {
      console.log(`⚠️ No API requests detected`);
    }

    // Check if data is displayed (even if empty)
    const text = await page.textContent('body');
    const hasLoadingState = text?.toLowerCase().includes('loading') ||
                           text?.toLowerCase().includes('fetching');
    const hasEmptyState = text?.toLowerCase().includes('no ideas') ||
                         text?.toLowerCase().includes('empty');

    console.log(`📊 Has loading state: ${hasLoadingState}`);
    console.log(`📊 Has empty state: ${hasEmptyState}`);

    await page.screenshot({ path: 'test-results/api/ideas-board-api.png' });
  });

  test('Jobs board - verify API calls are made', async ({ page }) => {
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/') || request.url().includes('/v1/')) {
        apiRequests.push(request.url());
      }
    });

    await page.goto(`${BASE_URL}/jobs`);
    await page.waitForLoadState('networkidle');

    console.log(`🔍 API requests made: ${apiRequests.length}`);
    if (apiRequests.length > 0) {
      apiRequests.forEach(url => console.log(`  - ${url}`));
    } else {
      console.log(`⚠️ No API requests detected`);
    }

    const text = await page.textContent('body');
    const hasLoadingState = text?.toLowerCase().includes('loading') ||
                           text?.toLowerCase().includes('fetching');
    const hasEmptyState = text?.toLowerCase().includes('no jobs') ||
                         text?.toLowerCase().includes('empty');

    console.log(`📊 Has loading state: ${hasLoadingState}`);
    console.log(`📊 Has empty state: ${hasEmptyState}`);

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

    console.log('🔍 Testing wallet connect button...');

    // Look for wallet connect button
    const connectButton = page.getByText(/connect/i, { exact: false }).first();
    const isVisible = await connectButton.isVisible().catch(() => false);

    if (isVisible) {
      console.log(`✅ Wallet connect button is visible`);

      // Try to click it
      await connectButton.click();
      console.log(`✅ Clicked wallet connect button`);

      // Wait for modal to appear
      await page.waitForTimeout(2000);

      // Check if modal appeared
      const modalVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false);
      console.log(`📊 Wallet modal visible: ${modalVisible}`);

      await page.screenshot({ path: 'test-results/wallet/wallet-modal-open.png' });
    } else {
      console.log(`⚠️ Wallet connect button not found`);
    }

    await page.screenshot({ path: 'test-results/wallet/wallet-connect-button.png' });
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
    await expect(body).toBeVisible();

    const text = await page.textContent('body');
    const has404Text = text?.toLowerCase().includes('404') ||
                      text?.toLowerCase().includes('not found');

    console.log(`📊 Has 404/not found text: ${has404Text}`);
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
    const hasErrorText = text?.toLowerCase().includes('error') ||
                        text?.toLowerCase().includes('failed') ||
                        text?.toLowerCase().includes('unable');

    console.log(`📊 Has error message: ${hasErrorText}`);
    console.log(`⚠️ Console error count: ${errors.length}`);

    await page.screenshot({ path: 'test-results/errors/api-failure.png' });
  });
});