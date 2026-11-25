#!/usr/bin/env node
/* Verify the declared protected region survives all browser-delivered frames. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = __dirname;
const out = path.join(root, 'output');
const programme = JSON.parse(fs.readFileSync(path.join(root, 'programme.json'), 'utf8'));
const url = name => pathToFileURL(path.join(out, name)).href;

async function inspect(page, pageUrl, viewport, selectorFor, films) {
  await page.setViewportSize(viewport);
  await page.goto(pageUrl, { waitUntil: 'load' });
  return page.evaluate(({ selectorFor, films }) => films.map(film => {
    const image = document.querySelector(selectorFor.replace('{id}', film.id));
    if (!image) throw new Error(`Missing image for ${film.id}`);
    const frame = image.closest('.image-frame,figure');
    const copy = image.closest('.film')?.querySelector('.film-copy');
    const style = getComputedStyle(image);
    const r = node => node ? node.getBoundingClientRect().toJSON() : null;
    const intersects = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const imageLabel = document.querySelector('.image-label');
    return {
      id: film.id, natural: [image.naturalWidth, image.naturalHeight], fit: style.objectFit,
      region: image.dataset.protectedRegion, intent: image.dataset.compositionIntent,
      frame: r(frame), imageBox: r(image), copy: r(copy), imageLabel: r(imageLabel),
      copyOverlaps: intersects(r(frame), r(copy)), labelOverlaps: intersects(r(frame), r(imageLabel)),
    };
  }), { selectorFor, films });
}

function assertProtected(results, expected, context) {
  for (const result of results) {
    const film = expected.find(item => item.id === result.id);
    assert(result.natural[0] && result.natural[1], `${context}/${result.id}: source image did not load`);
    assert.equal(result.fit, 'contain', `${context}/${result.id}: protected image must be completely visible`);
    assert(result.imageBox.left >= result.frame.left - .1 && result.imageBox.top >= result.frame.top - .1
      && result.imageBox.right <= result.frame.right + .1 && result.imageBox.bottom <= result.frame.bottom + .1,
    `${context}/${result.id}: rendered image box escaped its fixed frame`);
    assert.deepEqual(JSON.parse(result.region), film.composition.protectedRegion, `${context}/${result.id}: protected region drifted`);
    assert.equal(result.intent, film.composition.intent, `${context}/${result.id}: composition intent drifted`);
    assert.notEqual(result.copyOverlaps, true, `${context}/${result.id}: programme text overlays protected image`);
    assert.notEqual(result.labelOverlaps, true, `${context}/${result.id}: image label overlays protected image`);
  }
}

async function main() {
  const options = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  else if (process.env.PLAYWRIGHT_CHROMIUM_CHANNEL) options.channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage();
    const desktop = await inspect(page, url('programme.html'), { width: 1280, height: 1000 }, '[data-film-id="{id}"] img', programme.films);
    assertProtected(desktop, programme.films, 'desktop');
    const mobile = await inspect(page, url('programme.html'), { width: 390, height: 1200 }, '[data-film-id="{id}"] img', programme.films);
    assertProtected(mobile, programme.films, '390px');
    for (const film of programme.films) {
      const social = await inspect(page, url(`social-${film.id}.html`), { width: 1200, height: 1500 }, '[data-film-id="{id}"] img', [film]);
      assertProtected(social, [film], `social/${film.id}`);
    }
    console.log('PASS protected composition: 3 images × desktop, 390px, social');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
