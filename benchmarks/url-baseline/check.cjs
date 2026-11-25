#!/usr/bin/env node
/*
 * End-to-end contract for url-baseline.cjs.  It intentionally uses a local
 * origin so the test neither scrapes nor changes a third-party website.
 */
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const tool = process.env.YUAN_BASELINE_SCRIPT || path.join(root, 'skills/yuan-ui-design/scripts/url-baseline.cjs');
const temp = mkdtempSync(path.join(os.tmpdir(), 'yuan-url-baseline-'));

function fixture(name) {
  const directory = path.join(temp, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'font.ttf'), readFileSync(path.join(__dirname, 'fixture.ttf')));
  writeFileSync(path.join(directory, 'art.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96"><rect width="240" height="96" fill="#9b542f"/><circle cx="48" cy="48" r="28" fill="#f6e3a5"/><text x="90" y="58" font-size="28" fill="white">ARCHIVE</text></svg>');
  writeFileSync(path.join(directory, 'app.css'), '@font-face{font-family:BaselineFixture;src:url(font.ttf)}body{margin:0;background:#f8f1df;color:#172018;font-family:BaselineFixture,serif}.card{width:680px;margin:32px auto;border:4px solid #172018;padding:24px}.spacer{height:880px}.poster{display:block;width:240px;height:96px}');
  const dynamic = name === 'dynamic';
  const missing = name === 'missing';
  const opening = name === 'static' ? '<meta charset="utf-8">' : '<!doctype html><meta charset="utf-8">';
  const runtimeFont = name === 'runtime-font' ? `<script>
    const sessionFont = new FontFace('SessionFace', 'url(font.ttf)');
    document.fonts.add(sessionFont);
    document.body.style.fontFamily = 'SessionFace, serif';
    sessionFont.load();
  </script>` : '';
  const canvas = dynamic ? '<canvas id="paint" width="240" height="96"></canvas><script>const c=document.querySelector("canvas").getContext("2d");c.fillStyle="#17736d";c.fillRect(0,0,240,96);c.fillStyle="#fff";c.font="28px serif";c.fillText("CANVAS",28,58)</script>' : '';
  writeFileSync(path.join(directory, 'index.html'), `${opening}<title>${name} baseline</title><link rel="stylesheet" href="app.css"><main class="card"><h1>AAA BASELINE</h1><p contenteditable="true">可编辑的静态文本</p>${canvas}${runtimeFont}<div class="spacer"></div><img class="poster" loading="lazy" src="${missing ? 'not-found.svg' : 'art.svg'}" alt="archive artwork"></main>`);
  return directory;
}

function launchArguments(url, output) {
  return [tool, url, '--out', output, '--width', '800', '--height', '700'];
}

async function run(url, output) {
  await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, launchArguments(url, output), {
      cwd: root,
      env: process.env,
    }, error => error ? reject(error) : resolve());
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
  for (const name of ['before.png', 'index.html', 'replay.png', 'manifest.json']) {
    assert.ok(readFileSync(path.join(output, name)).length > 0, `missing generated ${name}`);
  }
  return JSON.parse(readFileSync(path.join(output, 'manifest.json'), 'utf8'));
}

function assertManifest(manifest, expectedStatus) {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.status, expectedStatus);
  assert.equal(manifest.viewport.width, 800);
  assert.equal(manifest.viewport.height, 700);
  assert.equal(typeof manifest.diff.changedPixelRatio, 'number');
  assert.equal(typeof manifest.diff.meanChannelDelta, 'number');
  assert.ok(manifest.assets && Number.isInteger(manifest.assets.captured));
  assert.ok(manifest.assets && Array.isArray(manifest.assets.missing));
  assert.ok(manifest.limitations && typeof manifest.limitations === 'object');
  assert.ok(manifest.capture && Number.isInteger(manifest.capture.httpStatus));
}

async function renderOffline(browser, output) {
  const context = await browser.newContext({ offline: true });
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 800, height: 700 });
    await page.goto(pathToFileURL(path.join(output, 'index.html')).href, { waitUntil: 'load' });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const state = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      return {
        editable: document.querySelector('[contenteditable="true"]')?.textContent,
        imageLoaded: document.querySelector('img')?.naturalWidth > 0,
        fontFaces: [...document.fonts].map(face => ({ family: face.family.replaceAll('"', ''), status: face.status })),
      };
    });
    assert.equal(state.editable, '可编辑的静态文本');
    assert.equal(state.imageLoaded, true);
    assert.ok(state.fontFaces.some(face => face.family === 'BaselineFixture' && face.status === 'loaded'));
    await page.evaluate(() => scrollTo(0, 0));
    return await page.screenshot();
  } finally {
    await context.close();
  }
}

async function main() {
  assert.ok(readFileSync(tool, 'utf8').includes('url-baseline'), 'url-baseline script was not installed');
  const directories = ['static', 'dynamic', 'missing', 'runtime-font'].map(fixture);
  const server = http.createServer((request, response) => {
    const source = directories.find(directory => request.url.startsWith(`/${path.basename(directory)}/`));
    if (!source) { response.writeHead(404); response.end('missing fixture'); return; }
    const filename = path.basename(request.url);
    const target = path.join(source, filename || 'index.html');
    try {
      const body = readFileSync(target);
      response.writeHead(200, { 'Content-Type': filename.endsWith('.css') ? 'text/css' : filename.endsWith('.svg') ? 'image/svg+xml' : filename.endsWith('.ttf') ? 'font/ttf' : 'text/html' });
      response.end(body);
    } catch {
      response.writeHead(404); response.end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const staticOutput = path.join(temp, 'out-static');
    const staticManifest = await run(`http://127.0.0.1:${port}/static/index.html`, staticOutput);
    assertManifest(staticManifest, 'match');
    assert.ok(staticManifest.assets.captured >= 2, 'stylesheet and lazy image should be captured');
    assert.equal(staticManifest.assets.missing.length, 0);
    assert.ok(staticManifest.diff.changedPixelRatio < .002, 'static replay should remain visually stable');
    await assert.rejects(run(`http://127.0.0.1:${port}/static/index.html`, staticOutput), /Command failed/, 'non-empty output must be refused');
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    });
    try {
      const offlineOriginal = await renderOffline(browser, staticOutput);
      writeFileSync(path.join(staticOutput, 'index.html'), readFileSync(path.join(staticOutput, 'index.html'), 'utf8').replace('AAA BASELINE', 'MISSING TITLE'));
      const offlineChanged = await renderOffline(browser, staticOutput);
      assert.notDeepEqual(offlineOriginal, offlineChanged, 'a visible local change must alter the offline replay');
    } finally {
      await browser.close();
    }

    const dynamicManifest = await run(`http://127.0.0.1:${port}/dynamic/index.html`, path.join(temp, 'out-dynamic'));
    assertManifest(dynamicManifest, 'needs-review');
    assert.ok(dynamicManifest.limitations.canvas);
    assert.ok(dynamicManifest.limitations.canvasKinds.includes('2d'));
    assert.ok(dynamicManifest.diff.changedPixelRatio > dynamicManifest.diff.thresholds.changedPixelRatio, 'the stripped Canvas must cause a visible replay difference');

    const missingManifest = await run(`http://127.0.0.1:${port}/missing/index.html`, path.join(temp, 'out-missing'));
    assertManifest(missingManifest, 'needs-review');
    assert.ok(missingManifest.assets.missing.length > 0, 'a missing source asset must be recorded');
    const runtimeFonts = await run(`http://127.0.0.1:${port}/runtime-font/index.html`, path.join(temp, 'out-runtime-font'));
    assertManifest(runtimeFonts, 'needs-review');
    assert.ok(runtimeFonts.limitations.fonts.some(face => face.family.includes('SessionFace')));
    assert.deepEqual(staticManifest.limitations.offlineRequests, []);
    console.log('PASS url baseline captures static assets offline and marks canvas or missing resources for review');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().finally(() => rmSync(temp, { recursive: true, force: true })).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
