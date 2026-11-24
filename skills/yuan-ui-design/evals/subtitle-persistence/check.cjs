'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function withPage(browser, fixture, check) {
  const context = await browser.newContext({ offline: true });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.join(__dirname, fixture)).href);
    await check(page);
    assert.deepEqual(errors, [], 'no script errors during the scenario');
  } finally {
    await context.close();
  }
}

async function checkReference(page) {
  const copy = page.locator('#copy');
  const save = page.locator('#save');
  const select = id => page.locator('[data-segment="' + id + '"]').click();
  const state = () => page.locator('#notice').getAttribute('data-state');
  const store = () => page.evaluate(() => window.subtitlePersistence.readCommitted());
  const waitSaved = () => page.waitForFunction(() => document.querySelector('#notice').dataset.state === 'saved');

  // Seed existing data before entering the editor, including a field it does not edit.
  const old = { a: '从旧版导入。', b: '旧片段 B。', c: '', locale: 'zh' };
  await page.evaluate(record => localStorage.setItem(window.subtitlePersistence.storageKey, JSON.stringify(record)), old);
  await page.reload();
  assert.equal(await copy.inputValue(), old.a);
  await save.click();
  await page.reload();
  assert.deepEqual(await store(), old, 'untouched save preserves existing data and extra fields');

  await select('b');
  await copy.fill('');
  await select('a');
  await select('b');
  assert.equal(await copy.inputValue(), '', 'an intentional empty draft survives switching');
  await save.click();
  await waitSaved();
  await page.reload();
  await select('b');
  assert.equal(await copy.inputValue(), '', 'an intentional clear survives reload');

  // Pause and release actual requests so the interleaving is independent of machine speed.
  await page.evaluate(() => window.subtitlePersistence.hold());
  await select('a');
  await copy.fill('A 已提交');
  await save.click();
  await select('c');
  await copy.fill('C 草稿');
  await page.evaluate(() => window.subtitlePersistence.release());
  assert.equal((await store()).a, 'A 已提交');
  assert.equal(await copy.inputValue(), 'C 草稿');
  assert.equal(await state(), 'dirty');

  await save.click();
  await copy.fill('C 继续编辑');
  await page.evaluate(() => window.subtitlePersistence.release());
  assert.equal((await store()).c, 'C 草稿');
  assert.equal(await copy.inputValue(), 'C 继续编辑');
  assert.equal(await state(), 'dirty');

  await copy.press('Control+Enter');
  await copy.fill('C 最终');
  await copy.press('Meta+Enter');
  await page.evaluate(() => window.subtitlePersistence.release(1));
  await page.evaluate(() => window.subtitlePersistence.release());
  await page.reload();
  await select('c');
  assert.equal(await copy.inputValue(), 'C 最终', 'an older completion cannot overwrite the newer save');
  assert.equal((await store()).locale, 'zh');

  await page.evaluate(() => localStorage.setItem(window.subtitlePersistence.storageKey, '{damaged'));
  await page.reload();
  assert.equal(await save.isDisabled(), true, 'unreadable data is protected');
  assert.equal(await state(), 'error');
}

async function witnessBroken(page) {
  const copy = page.locator('#copy');
  assert.equal(await copy.inputValue(), '');
  await page.locator('#save').click();
  await page.evaluate(() => window.finishBrokenSave());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('yuan-ui-subtitle-broken')).a), '');
  await page.locator('[data-segment="b"]').click();
  await copy.fill('第一次');
  await page.locator('#save').click();
  await copy.fill('第二次');
  await page.evaluate(() => window.finishBrokenSave());
  assert.equal(await copy.inputValue(), '第一次', 'stale response really did overwrite newer typing');
}

async function main() {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined });
  try {
    await withPage(browser, 'regression-broken.html', witnessBroken);
    console.log('WITNESS initial data loss and stale receipt reproduced');
    await withPage(browser, 'reference/index.html', checkReference);
    console.log('PASS existing and empty records, metadata, no-op, cross-record drafts, reordered saves, keyboard, reload, corrupt input');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
