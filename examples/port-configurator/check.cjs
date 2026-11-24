const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const url = pathToFileURL(path.join(__dirname, 'index.html')).href;

async function frameHash(page) {
  return page.locator('#scene').evaluate(canvas => {
    const gl = canvas.getContext('webgl');
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 127) hash = Math.imul(hash ^ data[i], 16777619);
    return hash >>> 0;
  });
}

async function normalPath(browser) {
  const context = await browser.newContext({ offline: true, viewport: { width: 1280, height: 850 } });
  try {
    const page = await context.newPage();
    await page.goto(url);
    assert.match(await page.locator('#runtime').innerText(), /實際繪製機殼與 3 個開孔/);
    assert.equal(await page.locator('#scene').isVisible(), true);
    assert.equal(await page.locator('#scene').evaluate(canvas => Boolean(canvas.getContext('webgl'))), true);

    const initialConfig = await page.locator('#power').inputValue();
    await page.getByRole('button', { name: '向右轉' }).click();
    const rotatedFrame = await frameHash(page);
    await page.getByRole('button', { name: '復位視角' }).click();
    const resetFrame = await frameHash(page);
    assert.notEqual(resetFrame, rotatedFrame, 'reset must redraw a different camera view');
    await page.getByRole('button', { name: '向左轉' }).click();
    assert.notEqual(await frameHash(page), resetFrame, 'rotation must redraw the WebGL canvas');
    await page.getByRole('button', { name: '復位視角' }).click();
    assert.equal(await frameHash(page), resetFrame, 'reset must deterministically restore its camera view');
    assert.equal(await page.locator('#power').inputValue(), initialConfig, 'camera reset must not change configuration');

    await page.locator('#power').selectOption('power');
    await page.getByRole('button', { name: '套用到草稿' }).click();
    await page.getByRole('button', { name: '儲存配置' }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('yuan-port-configurator-v1')), '{"power":"power","hdmi0":"blank","hdmi1":"blank"}');
    await page.reload();
    assert.equal(await page.locator('#power').inputValue(), 'power');
    assert.match(await page.locator('#status').innerText(), /已讀回/);

    await page.locator('#hdmi0').selectOption('power');
    await page.getByRole('button', { name: '套用到草稿' }).click();
    assert.match(await page.locator('#status').innerText(), /不相容/);
    assert.equal(await page.getByRole('button', { name: '改成相容配置' }).isVisible(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('yuan-port-configurator-v1')), '{"power":"power","hdmi0":"blank","hdmi1":"blank"}', 'rejected option must not overwrite saved configuration');
    await page.getByRole('button', { name: '改成相容配置' }).click();
    assert.equal(await page.locator('#hdmi0').inputValue(), 'video');
    await page.getByRole('button', { name: '撤銷上一項' }).click();
    assert.equal(await page.locator('#hdmi0').inputValue(), 'blank');
  } finally {
    await context.close();
  }
}

async function noWebglPath(browser) {
  const context = await browser.newContext({ offline: true, viewport: { width: 390, height: 844 } });
  try {
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type === 'webgl' || type === 'experimental-webgl') return null;
        return original.call(this, type, ...args);
      };
    });
    const page = await context.newPage();
    await page.goto(url);
    assert.equal(await page.locator('#scene').isVisible(), false);
    assert.equal(await page.locator('#fallback').isVisible(), true);
    assert.match(await page.locator('#runtime').innerText(), /context 不可用/);
    assert.equal(await page.getByRole('button', { name: '向右轉' }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#hdmi1').selectOption('video');
    await page.getByRole('button', { name: '套用到草稿' }).click();
    assert.match(await page.locator('#status').innerText(), /草稿已套用/);
  } finally {
    await context.close();
  }
}

async function main() {
  const requestedChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
  const browser = await chromium.launch({ headless: true, ...(requestedChannel ? { channel: requestedChannel } : {}) });
  try {
    await normalPath(browser);
    await noWebglPath(browser);
  } finally {
    await browser.close();
  }
  console.log('PASS WebGL draw/rotation/reset, local persistence, incompatible replacement/undo, and addInitScript WebGL-null fallback');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
