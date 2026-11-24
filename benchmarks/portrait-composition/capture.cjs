const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { mkdir, writeFile, access } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const sizes = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'poster', width: 800, height: 1000 },
];

async function checkPhone(browser, url) {
  const viewport = { width: 390, height: 844 };
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, offline: true });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    const firstScreen = {};
    for (const item of ['facts', 'portrait', 'eye', 'cap', 'ribbons', 'reveal']) {
      const box = await page.locator('.site .' + item).boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0, item + ' must be visible');
      assert.ok(box.y >= 0 && box.y + box.height <= viewport.height, item + ' must fit the first screen');
      firstScreen[item] = { top: box.y, bottom: box.y + box.height };
    }
    const button = page.locator('[aria-controls="answer"]');
    const answer = page.locator('#answer');
    for (const expanded of [true, false]) {
      await button.tap();
      assert.equal(await button.getAttribute('aria-expanded'), String(expanded));
      assert.equal(await answer.isVisible(), expanded);
    }
    return { viewport, firstScreen, tapToRevealAndHide: true };
  } finally {
    await context.close();
  }
}

async function capture(browser, candidate, out) {
  const measurements = {};
  const context = await browser.newContext({ offline: true, deviceScaleFactor: 1, locale: 'zh-CN', reducedMotion: 'reduce' });
  try {
    const errors = [];
    context.on('weberror', event => errors.push(event.error().message));
    for (const { name, width, height } of sizes) {
      const page = await context.newPage();
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
        documentText: document.body.innerText.replace(/\s+/g, ' ').trim(),
        photos: [...document.images].filter(img => img.getBoundingClientRect().width > 0)
          .map(img => ({ loaded: img.complete && img.naturalWidth > 0, alt: img.alt })),
      }));
      const stem = path.join(out, candidate + '-' + name);
      await page.screenshot({ path: stem + '.png', animations: 'disabled' });
      await page.screenshot({ path: stem + '.jpg', quality: 88, animations: 'disabled' });
      await page.close();
    }
    if (candidate === 'C') {
      const page = await context.newPage();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(pathToFileURL(path.join(__dirname, 'C', 'index.html')).href);
      const reveal = page.getByRole('button', { name: /揭晓|揭曉|查看姓名|打开姓名/ }).first();
      const body = page.locator('body');
      assert.doesNotMatch(await body.ariaSnapshot(), /Grace Hopper|格蕾丝[·・]霍珀/i);
      await reveal.focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('[aria-controls="answer"]').getAttribute('aria-expanded'), 'true');
      assert.match(await body.ariaSnapshot(), /Grace Hopper/i);
      assert.match(await body.ariaSnapshot(), /格蕾丝[·・]霍珀/);
      await page.keyboard.press('Space');
      assert.doesNotMatch(await body.ariaSnapshot(), /Grace Hopper|格蕾丝[·・]霍珀/i);
      for (const width of [320, 390, 768, 900, 1100, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'Horizontal overflow at ' + width);
      }
      measurements.reveal = 'Name hidden initially, revealed with Enter and hidden again with Space';
      measurements.phone = await checkPhone(browser, page.url());
    }
    for (const { name, width } of sizes) {
      assert.equal(measurements[name].pageWidth, width);
      assert.ok(measurements[name].photos.every(photo => photo.loaded));
    }
    assert.deepEqual(errors, []);
    measurements.errors = errors;
    return measurements;
  } finally {
    await context.close();
  }
}

async function ensureCandidate(candidate) {
  try {
    await access(path.join(__dirname, candidate, 'index.html'));
  } catch {
    throw new Error(`Missing ${candidate}/index.html. Create the revision before capturing all three versions.`);
  }
}

function parseOutput(argv) {
  const value = argv[0] === '--out' ? argv[1] : argv[0];
  if (!value || argv.length > (argv[0] === '--out' ? 2 : 1)) {
    throw new Error('Usage: node capture.cjs OUTPUT_DIRECTORY\\n   or: node capture.cjs --out OUTPUT_DIRECTORY');
  }
  return path.resolve(value);
}

async function main() {
  const out = parseOutput(process.argv.slice(2));
  const candidates = ['A', 'B', 'C'];
  await Promise.all(candidates.map(ensureCandidate));
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined });
  try {
    const results = { chromium: browser.version(), candidates: {} };
    for (const candidate of candidates) results.candidates[candidate] = await capture(browser, candidate, out);
    await writeFile(path.join(out, 'measurements-abc.json'), JSON.stringify(results, null, 2) + '\n');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
