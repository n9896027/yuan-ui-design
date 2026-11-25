const assert = require('node:assert/strict');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = __dirname;
if (!process.argv[2]) throw new Error('Usage: node check.cjs OUTPUT_DIRECTORY');
const output = path.resolve(process.argv[2]);

const variants = {
  'tide-a': {
    select: index => '#steps [data-index="' + index + '"]',
    match: '#agreeBtn',
    review: '#reviewBtn',
    undo: '#undoBtn',
    status: '#verdict',
    done: '#doneCount',
    check: '#reviewCount',
    values: ['#writtenValue', '#enteredValue'],
    selected: index => '#steps [data-index="' + index + '"][aria-current="true"]',
    active: (page, decision) => page.locator(decision === 'match' ? '#agreeBtn.active' : '#reviewBtn.active'),
    expectedDone: value => value + ' / 3',
  },
  'tide-b': {
    select: index => '.record-tab[data-index="' + index + '"]',
    match: '[data-decision="match"]',
    review: '[data-decision="check"]',
    undo: '#undo',
    status: '#status',
    done: '#doneCount',
    check: '#checkCount',
    values: ['#handValue', '#entryValue'],
    selected: index => '.record-tab[data-index="' + index + '"][aria-selected="true"]',
    active: (page, decision, index) => page.locator('.record-tab[data-index="' + index + '"] .record-note')
      .filter({ hasText: decision === 'match' ? '一致' : '需回查' }),
    expectedDone: value => String(value),
  },
};
variants.revision = {
  ...variants['tide-b'],
  selected: index => `.record-tab[data-index="${index}"][aria-current="true"]`,
};

async function capture(page, name, variant) {
  await page.screenshot({
    path: path.join(output, variant + '-' + name + '.png'),
    animations: 'disabled',
  });
}

async function assertText(page, selector, expected, name) {
  assert.equal(await page.locator(selector).innerText(), expected, name);
}

async function assertCounts(page, setup, done, check) {
  await assertText(page, setup.done, setup.expectedDone(done), 'completed count');
  await assertText(page, setup.check, String(check), 'review count');
}

async function selectRecord(page, setup, index) {
  await page.locator(setup.select(index)).click();
  assert.equal(await page.locator(setup.selected(index)).count(), 1, 'selected record was not active');
}

async function failNextWrite(page) {
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      Storage.prototype.setItem = write;
      throw new DOMException('One failed write', 'QuotaExceededError');
    };
  });
}

async function checkInitialContent(page, setup) {
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  assert.match(text, /西堤木栈道/);
  assert.match(text, /11 月 16 日|11\.16/);
  const readings = [['07:10', 42, 42], ['07:25', 56, 65], ['07:40', 68, 68]];
  for (const [index, [time, written, entered]] of readings.entries()) {
    assert.match(await page.locator(setup.select(index)).innerText(), new RegExp(time));
    await selectRecord(page, setup, index);
    for (const [selector, value] of [[setup.values[0], written], [setup.values[1], entered]]) {
      assert.match(await page.locator(selector).innerText(), new RegExp('^' + value + '\\s*cm$'));
    }
  }
  await selectRecord(page, setup, 0);
}

async function inspectDesktop(browser, variant, setup) {
  const report = { desktop: { pass: false, issues: [], counts: {} } };
  const context = await browser.newContext({
    offline: true,
    locale: 'zh-CN',
    viewport: { width: 1100, height: 760 },
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = pathToFileURL(path.join(root, variant, 'index.html')).href;
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await capture(page, 'desktop-initial', variant);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1100, 'desktop horizontal overflow');
    await checkInitialContent(page, setup);
    await assertCounts(page, setup, 0, 0);

    await page.locator(setup.match).focus();
    await page.locator(setup.match).press('Enter');
    assert.match(await page.locator(setup.status).innerText(), /一致/);
    assert.equal(await setup.active(page, 'match', 0).count(), 1, 'match has no selected indicator');
    await assertCounts(page, setup, 1, 0);
    report.desktop.counts.afterMatch = { done: 1, check: 0 };

    await page.reload();
    assert.match(await page.locator(setup.status).innerText(), /一致/);
    assert.equal(await setup.active(page, 'match', 0).count(), 1, 'match was not restored after reload');
    await assertCounts(page, setup, 1, 0);
    report.desktop.counts.afterReload = { done: 1, check: 0 };

    await selectRecord(page, setup, 1);
    await page.locator(setup.review).click();
    assert.match(await page.locator(setup.status).innerText(), /需回查/);
    assert.equal(await setup.active(page, 'check', 1).count(), 1, 'review has no selected indicator');
    await assertCounts(page, setup, 2, 1);
    report.desktop.counts.afterReview = { done: 2, check: 1 };

    await page.locator(setup.match).click();
    assert.match(await page.locator(setup.status).innerText(), /一致/);
    assert.equal(await setup.active(page, 'match', 1).count(), 1, 'changed match has no selected indicator');
    await assertCounts(page, setup, 2, 0);
    report.desktop.counts.afterChange = { done: 2, check: 0 };

    await page.locator(setup.undo).click();
    assert.match(await page.locator(setup.status).innerText(), /尚未判断/);
    await assertCounts(page, setup, 1, 0);
    await page.reload();
    await selectRecord(page, setup, 1);
    assert.match(await page.locator(setup.status).innerText(), /尚未判断/);
    await assertCounts(page, setup, 1, 0);

    // Inject a browser-local write error after one confirmed record.
    await failNextWrite(page);
    await page.locator(setup.review).click();
    await assertCounts(page, setup, 2, 1);
    report.desktop.blockedWriteNotice = (await page.locator('[aria-live="polite"]').allTextContents()).join(' ');
    report.desktop.detectedBlockedWrite = /尚未保存|未允许|无法保存/.test(report.desktop.blockedWriteNotice);
    await page.reload();
    await selectRecord(page, setup, 1);
    assert.match(await page.locator(setup.status).innerText(), /尚未判断/);
    await assertCounts(page, setup, 1, 0);
    if (variant === 'revision') {
      assert.equal(report.desktop.detectedBlockedWrite, true);
      await failNextWrite(page);
      await page.locator(setup.review).click();
      await page.getByRole('button', { name: '重试保存' }).click();
      assert.equal(await page.locator('#retry').isVisible(), false);
      await page.reload();
      await selectRecord(page, setup, 1);
      await assertCounts(page, setup, 2, 1);
      assert.match(await page.locator(setup.status).innerText(), /需回查/);
      report.desktop.retryAfterBlockedWrite = true;
    }
    assert.deepEqual(errors, []);
    report.desktop.pass = true;
  } catch (error) {
    report.desktop.issues.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
  return report;
}

async function inspectMobile(browser, variant, setup) {
  const report = { mobile: { pass: false, issues: [] } };
  const context = await browser.newContext({
    offline: true,
    locale: 'zh-CN',
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    const url = pathToFileURL(path.join(root, variant, 'index.html')).href;
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await capture(page, 'mobile-initial', variant);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'mobile horizontal overflow');
    await checkInitialContent(page, setup);
    await selectRecord(page, setup, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, 'mobile-0725', variant);
    const required = [...setup.values, setup.match, setup.review];
    report.mobile.visibleOnFirstScreen = {};
    for (const selector of required) {
      const bounds = await page.locator(selector).boundingBox();
      report.mobile.visibleOnFirstScreen[selector] = Boolean(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    }
    if (variant === 'revision') assert.ok(Object.values(report.mobile.visibleOnFirstScreen).every(Boolean));
    await page.locator(setup.review).tap();
    assert.match(await page.locator(setup.status).innerText(), /需回查/);
    assert.equal(await setup.active(page, 'check', 1).count(), 1, 'touch review has no selected indicator');
    await assertCounts(page, setup, 1, 1);
    report.mobile.pass = true;
  } catch (error) {
    report.mobile.issues.push(error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
  return report;
}

async function inspectVariant(browser, variant) {
  const setup = variants[variant];
  const desktop = await inspectDesktop(browser, variant, setup);
  const mobile = await inspectMobile(browser, variant, setup);
  return {
    variant,
    ...desktop,
    ...mobile,
    pass: desktop.desktop.pass && mobile.mobile.pass,
  };
}

async function main() {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
  });
  try {
    const reports = [];
    for (const variant of Object.keys(variants)) reports.push(await inspectVariant(browser, variant));
    await writeFile(path.join(output, 'check-tide.json'), JSON.stringify({ chromium: browser.version(), reports }, null, 2) + '\n');
    for (const report of reports) {
      console.log(report.variant + ': ' + (report.pass ? 'PASS' : 'FAIL'));
      for (const issue of [...report.desktop.issues, ...report.mobile.issues]) console.error(issue);
    }
    if (reports.some(report => !report.pass)) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
