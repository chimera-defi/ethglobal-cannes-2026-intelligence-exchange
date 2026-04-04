#!/usr/bin/env node
/**
 * Screenshot script for Intelligence Exchange
 * Takes screenshots of key pages for documentation
 */

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = `${__dirname}/../output/playwright/cannes-demo-2026`;

const BASE_URL = 'http://localhost:3000';

const pages = [
  { path: '/', name: 'landing', fullPage: true },
  { path: '/submit', name: 'submit', fullPage: true },
  { path: '/ideas', name: 'ideas', fullPage: true, waitFor: 'text=DeFi yield' },
  { path: '/ideas/idea-demo-cannes-2026', name: 'idea-detail', fullPage: true, waitFor: 'text=Uniswap v4' },
  { path: '/jobs', name: 'jobs', fullPage: true, waitFor: 'text=Jobs Board' },
  { path: '/agents', name: 'agents', fullPage: true },
];

async function waitForContent(page, config) {
  // Wait for network to be idle
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  
  // Additional wait for specific content if specified
  if (config.waitFor) {
    try {
      await page.waitForSelector(config.waitFor, { timeout: 10000 });
    } catch (e) {
      console.log(`      ⚠️  Content indicator not found: ${config.waitFor}`);
    }
  }
  
  // Extra delay to let React hydrate and render
  await page.waitForTimeout(3000);
}

async function takeScreenshotWithRetry(page, config, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `${BASE_URL}${config.path}`;
      console.log(`   📄 ${config.name}: ${url} (attempt ${attempt}/${maxRetries})`);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForContent(page, config);
      
      const screenshotPath = `${OUTPUT_DIR}/${config.name}.png`;
      await page.screenshot({ 
        path: screenshotPath, 
        fullPage: config.fullPage 
      });
      
      console.log(`      ✅ Saved: ${screenshotPath}`);
      return true;
    } catch (error) {
      console.error(`      ❌ Attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxRetries) {
        console.log(`      🔄 Retrying...`);
        await page.waitForTimeout(2000);
      } else {
        return false;
      }
    }
  }
  return false;
}

async function takeScreenshots() {
  console.log('📸 Taking screenshots...');
  console.log(`   Output: ${OUTPUT_DIR}`);
  
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  
  for (const pageConfig of pages) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    
    try {
      const success = await takeScreenshotWithRetry(page, pageConfig);
      if (!success) {
        console.error(`      ❌ Failed to capture ${pageConfig.name} after all retries`);
      }
    } finally {
      await page.close();
      await context.close();
    }
  }
  
  await browser.close();
  console.log('\n✨ Screenshots complete!');
}

takeScreenshots().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
