import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUTPUT_DIR = './output/playwright/cannes-demo-2026';
const BASE_URL = 'http://localhost:3000';

async function takeScreenshot() {
  console.log('📸 Taking review panel screenshot...');
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  
  const page = await context.newPage();
  const url = `${BASE_URL}/workspace/review`;
  
  try {
    console.log(`   📄 review: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const screenshotPath = `${OUTPUT_DIR}/review.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`      ✅ Saved: ${screenshotPath}`);
  } catch (error) {
    console.error(`      ❌ Error: ${error.message}`);
  } finally {
    await page.close();
    await browser.close();
  }
}

takeScreenshot();
