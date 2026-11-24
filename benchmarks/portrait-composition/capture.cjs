const { chromium } = require('playwright');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const sizes = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'poster', width: 800, height: 1000 },
];

async function capture(browser, candidate, out) {
  const measurements = {};
  const context = await browser.newContext({ offline: true, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const { name, width, height } of sizes) {
      await page.setViewportSize({ width, height });
      const url = pathToFileURL(path.join(__dirname, candidate, 'index.html'));
      if (name === 'poster') url.searchParams.set('format', 'poster');
      await page.goto(url.href);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
      });
      measurements[name] = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        pageHeight: document.documentElement.scrollHeight,
        visibleText: document.body.innerText.replace(/\s+/g, ' ').trim(),
        photos: [...document.images].filter(img => img.getBoundingClientRect().width > 0)
          .map(img => ({ loaded: img.complete && img.naturalWidth > 0, alt: img.alt })),
      }));
      await page.screenshot({ path: path.join(out, candidate + '-' + name + '.png'), animations: 'disabled' });
    }
    measurements.errors = errors;
    return measurements;
  } finally {
    await context.close();
  }
}

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node capture.cjs OUTPUT_DIRECTORY');
  const out = path.resolve(process.argv[2]);
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined });
  try {
    const results = { chromium: browser.version(), candidates: {} };
    for (const candidate of ['A', 'B']) results.candidates[candidate] = await capture(browser, candidate, out);
    await writeFile(path.join(out, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
