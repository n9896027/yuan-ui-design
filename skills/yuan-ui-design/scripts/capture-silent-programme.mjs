import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const out = path.resolve(process.argv[2]);
const require = createRequire(pathToFileURL(path.join(process.cwd(), 'package.json')));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(out, 'programme.html')).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(out, 'programme.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.setViewportSize({ width: 1200, height: 1500 });
  const { social_pages: pages } = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(out, 'manifest.json'), 'utf8'));
  for (const name of pages) {
    await page.goto(pathToFileURL(path.join(out, `${name}.html`)).href, { waitUntil: 'load' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  }
} finally { await browser.close(); }
