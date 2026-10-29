/**
 * Capture desktop + mobile screenshots of checkout chrome via DEV preview harness.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CHECKOUT_PREVIEW_BASE || 'http://127.0.0.1:5180';
const OUT = resolve(process.cwd(), '.tmp/checkout-premium-redesign');

const MODES = [
  'review-tour',
  'review-stay',
  'review-rental',
  'confirm-tour',
  'confirm-stay',
  'confirm-rental',
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

async function shot(ctx, mode, suffix) {
  const page = await ctx.newPage();
  const url = `${BASE}/checkout-ui-preview?mode=${mode}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('text=Traverion', { timeout: 30000 });
  await page.waitForTimeout(400);
  const file = resolve(OUT, `${mode}-${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  console.log('wrote', file);
}

for (const mode of MODES) {
  await shot(desktop, mode, 'desktop');
  await shot(mobile, mode, 'mobile');
}

await browser.close();
console.log('done', OUT);
