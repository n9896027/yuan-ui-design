const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const parts = [['power', 'USB-C'], ['hdmi', 'HDMI 0'], ['hdmi2', 'HDMI 1']];

async function inspect(context, viewport) {
  const page = await context.newPage();
  try {
    await page.setViewportSize(viewport);
    await page.goto(url);
    assert.equal(await page.locator('#photo').evaluate(image => image.naturalWidth), 1480);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (const [key, expected] of parts) {
      const hotspot = page.locator('.hotspot[data-part="' + key + '"]');
      await hotspot.click();
      assert.ok((await page.locator('#inspect-title').innerText()).includes(expected));
      assert.equal(await hotspot.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#crop').isVisible(), true);
    }
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined });
  try {
    const context = await browser.newContext({ offline: true });
    try {
      await inspect(context, { width: 390, height: 844 });
      await inspect(context, { width: 1280, height: 850 });
      await context.route('**/*.jpg', route => route.abort());
      const page = await context.newPage();
      await page.goto(url);
      assert.equal(await page.locator('#fallback').isVisible(), true);
      const listOption = page.locator('.part-list [data-part="hdmi2"]');
      await listOption.focus();
      await page.keyboard.press('Enter');
      assert.ok((await page.locator('#inspect-title').innerText()).includes('HDMI 1'));
      assert.equal(await page.locator('.hotspot:visible').count(), 0);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log('PASS three photo hotspots at two sizes, offline assets and keyboard-only missing-photo path');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
