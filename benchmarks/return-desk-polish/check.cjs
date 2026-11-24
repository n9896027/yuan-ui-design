const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function inspect(browser, variant, output) {
  const context = await browser.newContext({ offline: true, locale: 'zh-CN', deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = pathToFileURL(path.join(__dirname, variant, 'index.html')).href;
    for (const [size, width, height] of [['desktop', 1100, 760], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await page.screenshot({ path: path.join(output, variant + '-' + size + '.png') });
    }
    const button = page.locator('[data-id="D-17"]');
    await button.focus();
    await page.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    await page.reload();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    const afterSave = await page.locator('#total').innerText();
    const headingAfterSave = await page.getByText(/本班待办/).allTextContents();
    const savedIds = await page.evaluate(() => JSON.parse(localStorage.getItem('nanqiao-returns')));
    assert.deepEqual(savedIds, ['D-17']);
    await button.click();
    await page.reload();
    assert.equal(await button.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nanqiao-returns'))), []);
    const afterUndo = await page.locator('#total').innerText();
    assert.notEqual(afterSave, afterUndo);
    assert.deepEqual(errors, []);
    return { afterSave, afterUndo, headingAfterSave, errors };
  } finally {
    await context.close();
  }
}

async function main() {
  if (!process.argv[2]) throw new Error('Usage: node check.cjs OUTPUT_DIRECTORY');
  const out = path.resolve(process.argv[2]);
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined });
  try {
    const result = { chromium: browser.version(), trials: {} };
    for (const variant of ['original','huashu','yuan']) {
      result.trials[variant] = await inspect(browser, variant, out);
    }
    await writeFile(path.join(out, 'check.json'), JSON.stringify(result, null, 2) + '\n');
    console.log('Verified layout, keyboard check-in, undo and reload for three versions');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
