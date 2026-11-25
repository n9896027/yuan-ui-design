#!/usr/bin/env node
/* Exercise shareable repair-desk states without touching the normal demo key. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const source = path.join(__dirname, 'index.html');
const outputFlag = process.argv.indexOf('--out');
const output = outputFlag === -1 ? null : path.resolve(process.argv[outputFlag + 1] || '');
if (outputFlag !== -1 && !process.argv[outputFlag + 1]) throw new Error('--out needs a directory');

const route = state => {
  const url = pathToFileURL(source);
  if (state) url.searchParams.set('state', state);
  return url.href;
};

async function pageFor(context, state) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route(state));
  return page;
}

async function storedNote(page, state) {
  return page.evaluate(state => {
    const key = state ? 'yuan-ui-repair-desk-demo-scenario-' + state + '-v1' : 'yuan-ui-repair-desk-demo-v1';
    return JSON.parse(localStorage.getItem(key) || 'null')?.note ?? null;
  }, state);
}

async function main() {
  if (output) fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  try {
    const context = await browser.newContext();
    try {
      // Ordinary route persists through a genuine submit and reload.
      let page = await pageFor(context, null);
      await page.locator('#reset').click();
      await page.locator('#note').fill('正常入口真的保存这条备注。');
      await page.locator('#save').click();
      await page.locator('#status[data-state="saved"]').waitFor();
      await page.reload();
      assert.equal(await page.locator('#note').inputValue(), '正常入口真的保存这条备注。');
      assert.equal(await page.locator('#status').getAttribute('data-state'), 'saved');
      await page.close();

      // Named long text route uses a different key and never overwrites normal data.
      page = await pageFor(context, 'long-name');
      assert.match(await page.locator('#device').inputValue(), /连续观测站二号/);
      assert.equal(await page.locator('#save').isVisible(), true);
      assert.equal(await storedNote(page, null), '正常入口真的保存这条备注。');
      if (output) await page.screenshot({ path: path.join(output, 'long-name.png'), fullPage: true });
      await page.close();

      // Saving route is a real unresolved callback. Later typing remains a dirty draft.
      page = await pageFor(context, 'saving');
      await page.locator('#status[data-state="saving"]').waitFor();
      assert.equal(await page.locator('#save').isDisabled(), true);
      assert.equal(await page.locator('#finish-save').isVisible(), true);
      const submitted = await page.locator('#note').inputValue();
      assert.notEqual(await storedNote(page, 'saving'), submitted);
      if (output) await page.screenshot({ path: path.join(output, 'saving.png'), fullPage: true });
      await page.locator('#note').fill('保存中输入的后来草稿。');
      await page.locator('#finish-save').click();
      await page.locator('#save').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#status').getAttribute('data-state'), 'dirty');
      assert.equal(await page.locator('#note').inputValue(), '保存中输入的后来草稿。');

      assert.equal(await storedNote(page, 'saving'), submitted);

      // Reopening the named link restarts its fixture. Reset then cancels that response.
      await page.locator('.scenario-links a[href="?state=saving"]').click();
      await page.locator('#status[data-state="saving"]').waitFor();
      await page.locator('#reset').click();
      assert.equal(await page.locator('#finish-save').isVisible(), false);
      assert.equal(await page.locator('#status').getAttribute('data-state'), 'idle');
      assert.equal(await page.locator('#save').isDisabled(), false);
      assert.equal(await storedNote(page, 'saving'), null);
      await page.close();

      // Retry the failed write using the real button and the keyboard.
      page = await pageFor(context, 'failure');
      await page.locator('#status[data-state="error"]').waitFor();
      const failedNote = await page.locator('#note').inputValue();
      assert.match(failedNote, /保存失败/);
      assert.notEqual(await storedNote(page, 'failure'), failedNote);
      assert.equal(await page.locator('#status').getAttribute('data-state'), 'error');
      if (output) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
      await page.locator('#save').focus();
      await page.keyboard.press('Enter');
      await page.locator('#status[data-state="saved"]').waitFor();
      await page.reload();
      assert.equal(await page.locator('#note').inputValue(), failedNote);
      assert.equal(await storedNote(page, 'failure'), failedNote);
      await page.close();

      // The saved deep link is stored first and restored after an actual page reload.
      page = await pageFor(context, 'saved');
      await page.locator('#status[data-state="saved"]').waitFor();
      assert.equal(await page.locator('#status').getAttribute('data-state'), 'saved');
      await page.waitForFunction(() => performance.getEntriesByType('navigation')[0]?.type === 'reload');
      const savedNote = await page.locator('#note').inputValue();
      assert.match(savedNote, /经由同一保存操作/);
      assert.equal(await storedNote(page, 'saved'), savedNote);
      assert.equal(await storedNote(page, null), '正常入口真的保存这条备注。');
      await page.reload();
      assert.equal(await page.locator('#note').inputValue(), savedNote);
      if (output) await page.screenshot({ path: path.join(output, 'saved.png'), fullPage: true });
      await page.close();
      console.log('PASS repair desk: normal save/reload, four named states, retry, and in-flight edit retention');
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
