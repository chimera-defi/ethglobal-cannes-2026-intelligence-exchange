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
  { path: '/ideas', name: 'ideas', fullPage: true },
  { path: '/ideas/idea-demo-cannes-2026', name: 'idea-detail', fullPage: true },
  { path: '/jobs', name: 'jobs', fullPage: true },
  { path: '/agents', name: 'agents', fullPage: true },
];

async function takeScreenshots() {
  console.log('📸 Taking screenshots...');
  console.log(`   Output: ${OUTPUT_DIR}`);
  
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  
  for (const pageConfig of pages) {
    const page = await context.newPage();
    const url = `${BASE_URL}${pageConfig.path}`;
    
    try {
      console.log(`   📄 ${pageConfig.name}: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for content to load
      await page.waitForTimeout(2000);
      
      const screenshotPath = `${OUTPUT_DIR}/${pageConfig.name}.png`;
      await page.screenshot({ 
        path: screenshotPath, 
        fullPage: pageConfig.fullPage 
      });
      
      console.log(`      ✅ Saved: ${screenshotPath}`);
    } catch (error) {
      console.error(`      ❌ Error: ${error.message}`);
    } finally {
      await page.close();
    }
  }
  
  await browser.close();
  console.log('\n✨ Screenshots complete!');
}

takeScreenshots().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
