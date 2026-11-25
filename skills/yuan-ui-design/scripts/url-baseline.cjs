#!/usr/bin/env node
/*
 * Capture a read-only visual baseline before making a URL-only UI proposal.
 * The local copy removes scripts and disables form submission. It records the
 * observed screen, it does not impersonate the original application.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

function fail(message) { throw new Error(message); }
function usage() {
  return 'Usage: node url-baseline.cjs URL --out DIRECTORY [--width 1280] [--height 800]';
}
function parseArgs(argv) {
  const positional = [];
  const options = { width: 1280, height: 800 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) positional.push(value);
    else if (['--out', '--width', '--height'].includes(value)) options[value.slice(2)] = argv[++index];
    else fail(`${usage()}\nUnknown option: ${value}`);
  }
  if (positional.length !== 1 || !options.out) fail(usage());
  for (const key of ['width', 'height']) {
    options[key] = Number(options[key]);
    if (!Number.isInteger(options[key]) || options[key] < 160 || options[key] > 4000) fail(`${key} must be an integer between 160 and 4000`);
  }
  return { ...options, source: positional[0], out: path.resolve(options.out) };
}
function resolvePlaywright() {
  try { return createRequire(path.join(process.cwd(), 'package.json'))('playwright'); }
  catch {
    try { return require('playwright'); }
    catch { fail('Playwright was not found from the current project. Install the project dependencies first.'); }
  }
}
function extension(contentType, url) {
  const type = (contentType || '').split(';', 1)[0].toLowerCase();
  const known = { 'text/css': '.css', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'application/font-woff': '.woff' };
  if (known[type]) return known[type];
  const suffix = path.extname(new URL(url).pathname).slice(0, 12);
  return /^\.[a-z0-9]+$/i.test(suffix) ? suffix : '.bin';
}
function safeName(url, contentType) {
  return `${crypto.createHash('sha256').update(url).digest('hex').slice(0, 16)}${extension(contentType, url)}`;
}
function emptyDirectory(directory) {
  if (!fs.existsSync(directory)) return true;
  return fs.readdirSync(directory).length === 0;
}
async function writeFileNoClobber(file, data) {
  await fsp.writeFile(file, data, { flag: 'wx' });
}
function rewriteCss(css, base, replacements, onMissing) {
  function resolve(value) {
    const raw = value.trim();
    if (!raw || raw.startsWith('#') || /^data:/i.test(raw)) return raw;
    let reference;
    try { reference = new URL(raw, base); } catch { onMissing(raw); return ''; }
    const fragment = reference.hash;
    reference.hash = '';
    const local = replacements[reference.href];
    if (local) return local + fragment;
    onMissing(reference.href);
    return '';
  }
  return css.replace(/@import\s+(['"])([^'"]+)\1/gi, (_, quote, ref) => `@import "${resolve(ref)}"`)
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_, quote, ref) => `url("${resolve(ref).replace(/"/g, '%22')}")`);
}

async function imageDifference(page, before, replay) {
  const [a, b] = await Promise.all([fsp.readFile(before), fsp.readFile(replay)]);
  return page.evaluate(([left, right]) => new Promise((resolve, reject) => {
    const load = source => new Promise((ok, bad) => { const image = new Image(); image.onload = () => ok(image); image.onerror = bad; image.src = source; });
    Promise.all([load(left), load(right)]).then(images => {
      const [first, second] = images;
      const width = Math.max(first.width, second.width), height = Math.max(first.height, second.height);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(first, 0, 0); const one = context.getImageData(0, 0, width, height).data;
      context.clearRect(0, 0, width, height); context.drawImage(second, 0, 0); const two = context.getImageData(0, 0, width, height).data;
      let changed = 0, delta = 0;
      for (let index = 0; index < one.length; index += 4) {
        const amount = Math.abs(one[index] - two[index]) + Math.abs(one[index + 1] - two[index + 1]) + Math.abs(one[index + 2] - two[index + 2]);
        delta += amount; if (amount > 36) changed += 1;
      }
      resolve({ changedPixelRatio: changed / (width * height), meanChannelDelta: delta / (width * height * 3) });
    }).catch(reject);
  }), [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`]);
}
function recordCanvasUse() {
  const kinds = new Set();
  Object.defineProperty(window, '__yuanCanvasKinds', { value: kinds });
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const result = original.call(this, kind, ...args);
    if (result) kinds.add(kind);
    return result;
  };
}

function readFonts() {
  return [...document.fonts].map(face => ({
    family: face.family, style: face.style, weight: face.weight, status: face.status,
  }));
}

async function settleFonts(page) {
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 6000 }).catch(() => {});
}

async function main() {
  if (process.argv.slice(2).includes('--help')) { console.log(usage()); return; }
  const options = parseArgs(process.argv.slice(2));
  const target = new URL(options.source);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) fail('URL must be an unauthenticated http(s) URL');
  const destination = options.out;
  if (!emptyDirectory(destination)) fail(`Refusing to overwrite non-empty output directory: ${destination}`);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const stage = await fsp.mkdtemp(path.join(path.dirname(destination), '.yuan-url-capture-'));
  try {
    const status = await capture(target, { ...options, out: stage });
    // rename only publishes into an absent or still-empty directory.
    await fsp.rename(stage, destination);
    console.log(`${status}: ${destination}`);
  } finally {
    await fsp.rm(stage, { recursive: true, force: true });
  }
}

async function capture(target, options) {
  await fsp.mkdir(path.join(options.out, 'assets'));
  const { chromium } = resolvePlaywright();
  const launch = { headless: true };
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launch.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  else if (process.env.PLAYWRIGHT_CHROMIUM_CHANNEL) launch.channel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
  const browser = await chromium.launch(launch);
  const responses = new Map();
  try {
    const context = await browser.newContext({ viewport: { width: options.width, height: options.height }, serviceWorkers: 'block' });
    try {
      await context.addInitScript(recordCanvasUse);
      const page = await context.newPage();
      await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
      page.on('response', response => {
        const type = response.request().resourceType();
        if (!['stylesheet', 'image', 'font'].includes(type)) return;
        responses.set(response.url(), { response, type });
      });
      const response = await page.goto(target.href, { waitUntil: 'load', timeout: 30000 });
      if (!response || response.status() >= 400) fail(`Initial navigation returned ${response ? response.status() : 'no response'}`);
      await settleFonts(page);
      await page.evaluate(async () => {
        const original = scrollY;
        const limit = Math.min(document.documentElement.scrollHeight - innerHeight, innerHeight * 3);
        for (let position = innerHeight; position <= limit; position += innerHeight) {
          scrollTo(0, position); await new Promise(resolve => setTimeout(resolve, 120));
        }
        scrollTo(0, original);
      });
      await settleFonts(page);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(options.out, 'before.png'), animations: 'disabled' });
      const resources = new Map(); const missing = [];
      for (const [url, entry] of responses) {
        if (entry.response.status() >= 400) { missing.push(url); continue; }
        try {
          const body = await entry.response.body();
          const contentType = entry.response.headers()['content-type'] || '';
          const relative = `assets/${safeName(url, contentType)}`;
          resources.set(url, { relative, contentType, type: entry.type, body });
        } catch { missing.push(url); }
      }
      const replacements = {};
      const assetLinks = {};
      for (const [url, resource] of resources) {
        const fontData = resource.type === 'font' ? `data:${resource.contentType.split(';')[0] || 'font/woff2'};base64,${resource.body.toString('base64')}` : null;
        replacements[url] = fontData || resource.relative;
        assetLinks[url] = fontData || path.basename(resource.relative);
      }
      const styleMissing = new Set();
      for (const [url, asset] of resources) {
        let body = asset.body;
        if (asset.type === 'stylesheet') {
          const css = rewriteCss(body.toString('utf8'), url, assetLinks, reference => styleMissing.add(reference));
          body = Buffer.from(css);
        }
        await writeFileNoClobber(path.join(options.out, asset.relative), body);
      }
      // Apply the same resolver to inline CSS using the live document's base URL.
      const inline = await page.evaluate(() => ({
        base: document.baseURI,
        values: [...document.querySelectorAll('style,[style]')].flatMap(node =>
          [node.getAttribute('style'), node.tagName === 'STYLE' ? node.textContent : null].filter(value => value !== null)),
      }));
      const inlineCss = Object.fromEntries(inline.values.map(css =>
        [css, rewriteCss(css, inline.base, replacements, reference => styleMissing.add(reference))]));
      const staticSnapshot = await page.evaluate(({ rewrite, inlineCss }) => {
        const copy = document.documentElement.cloneNode(true);
        const stripped = [], unresolved = [];
        const originalElements = [document.documentElement, ...document.documentElement.querySelectorAll('*')];
        const copyElements = [copy, ...copy.querySelectorAll('*')];
        const originals = new Map(copyElements.map((node, index) => [node, originalElements[index]]));
        copy.querySelectorAll('script,base,iframe,object,embed,meta[http-equiv="refresh" i],meta[http-equiv="Content-Security-Policy" i]').forEach(node => { stripped.push(node.tagName.toLowerCase()); node.remove(); });
        copy.querySelectorAll('*').forEach(node => {
          const original = originals.get(node);
          for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name) || ['integrity', 'crossorigin', 'ping'].includes(attribute.name)) node.removeAttribute(attribute.name);
          if (node.hasAttribute('src') || (node.tagName === 'IMG' && original.currentSrc)) {
            const url = original.currentSrc || original.src;
            if (rewrite[url]) node.setAttribute('src', rewrite[url]);
            else if (!/^data:/i.test(url)) { node.removeAttribute('src'); unresolved.push(url || 'unresolved-src'); }
            else node.setAttribute('src', url);
          }
          if (node.hasAttribute('srcset')) node.removeAttribute('srcset');
          if (node.hasAttribute('poster')) {
            const url = original.poster;
            if (rewrite[url]) node.setAttribute('poster', rewrite[url]);
            else if (/^(?:https?:|file:)/i.test(url)) { node.removeAttribute('poster'); stripped.push('unresolved-poster'); unresolved.push(url); }
          }
          if (node.hasAttribute('style')) node.setAttribute('style', inlineCss[node.getAttribute('style')]);
          if (node.tagName === 'STYLE') node.textContent = inlineCss[node.textContent];
          if (node.hasAttribute('href')) {
            const url = original.href;
            if (rewrite[url]) node.setAttribute('href', rewrite[url]);
            else if (node.matches('a,area') && !node.getAttribute('href').startsWith('#')) node.setAttribute('href', '#baseline-link');
            else if (node.matches('link') && /^(?:https?:|file:)/i.test(url)) { node.remove(); stripped.push('unresolved-link'); }
          }
          if (node.matches('form')) { node.setAttribute('action', '#baseline-link'); node.setAttribute('method', 'get'); }
        });
        const meta = document.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; media-src 'none'; connect-src 'none'; script-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'";
        copy.querySelectorAll('meta[charset],meta[http-equiv="Content-Type" i]').forEach(node => node.remove());
        const encoding = document.createElement('meta');
        encoding.setAttribute('charset', 'utf-8');
        copy.querySelector('head')?.prepend(encoding, meta);
        const note = document.createComment('Static visual baseline. Scripts, actions and remote links were removed intentionally. Edit this HTML and its local assets before redesigning.');
        copy.prepend(note);
        const doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) + '\n' : '';
        return { html: doctype + copy.outerHTML, stripped, unresolved };
      }, { rewrite: replacements, inlineCss });
      await writeFileNoClobber(path.join(options.out, 'index.html'), staticSnapshot.html);
      const finalUrl = page.url();
      const observations = await page.evaluate(rewrite => ({
        title: document.title, compatMode: document.compatMode,
        lazyImages: [...document.images].filter(image => image.loading === 'lazy').map(image => ({ url: image.currentSrc || image.src, loaded: image.complete && image.naturalWidth > 0 })),
        canvas: document.querySelectorAll('canvas').length,
        canvasKinds: [...(window.__yuanCanvasKinds || [])],
        webgl: [...(window.__yuanCanvasKinds || [])].some(kind => /webgl/i.test(kind)),
        lazyResources: [...document.images].filter(image => image.loading === 'lazy' && !(image.complete && image.naturalWidth > 0)).length,
        scripts: document.scripts.length,
        unresolved: [...document.querySelectorAll('img,link[rel="stylesheet"],video,source')]
          .map(node => node.currentSrc || node.src || node.href).filter(url => /^https?:/i.test(url) && !rewrite[url]),
      }), replacements);
      const originalFonts = await page.evaluate(readFonts);
      await page.close();
      const replayContext = await browser.newContext({ offline: true, viewport: { width: options.width, height: options.height }, serviceWorkers: 'block' });
      let replayRequests = [];
      try {
        const replay = await replayContext.newPage(); replay.on('request', request => replayRequests.push(request.url()));
        await replay.goto(pathToFileURL(path.join(options.out, 'index.html')).href, { waitUntil: 'load' });
        await settleFonts(replay);
        const replayFonts = await replay.evaluate(readFonts);
        const faceId = face => JSON.stringify([face.family, face.style, face.weight]);
        const loadedFaces = new Set(replayFonts.filter(face => face.status === 'loaded').map(faceId));
        const fontIssues = originalFonts.filter(face => face.status === 'error' || face.status === 'loading' || (face.status === 'loaded' && !loadedFaces.has(faceId(face))));
        await replay.screenshot({ path: path.join(options.out, 'replay.png'), animations: 'disabled' });
        const diff = await imageDifference(replay, path.join(options.out, 'before.png'), path.join(options.out, 'replay.png'));
        const remoteReplay = replayRequests.filter(url => /^https?:/i.test(url));
        const thresholds = { changedPixelRatio: 0.001, meanChannelDelta: 2, perPixelRgbDelta: 12 };
        const limitations = { fonts: fontIssues, canvasKinds: observations.canvasKinds, canvas: observations.canvas, webgl: observations.webgl, lazyResources: observations.lazyResources, dynamic: observations.scripts > 0, removedNodes: staticSnapshot.stripped, offlineRequests: remoteReplay };
        const unresolved = [...new Set([...observations.unresolved, ...staticSnapshot.unresolved, ...styleMissing])];
        const needsReview = diff.changedPixelRatio > thresholds.changedPixelRatio || diff.meanChannelDelta > thresholds.meanChannelDelta || missing.length > 0 || unresolved.length > 0 || staticSnapshot.stripped.length > 0 || remoteReplay.length > 0 || observations.canvas > 0 || observations.webgl || observations.lazyResources > 0 || fontIssues.length > 0;
        const manifest = { version: 1, url: finalUrl, viewport: { width: options.width, height: options.height }, status: needsReview ? 'needs-review' : 'match', files: { before: 'before.png', static: 'index.html', replay: 'replay.png' }, diff: { ...diff, algorithm: 'Changed pixel when the mean absolute RGB channel difference exceeds 12 (0–255)', thresholds }, assets: { captured: resources.size, missing, unresolved }, limitations, capture: { httpStatus: response.status(), title: observations.title, compatMode: observations.compatMode, chromium: browser.version(), fonts: originalFonts, lazyImages: observations.lazyImages }, replay: { fonts: replayFonts } };
        await writeFileNoClobber(path.join(options.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        return manifest.status;
      } finally { await replayContext.close(); }
    } finally { await context.close(); }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(`url-baseline: ${error.message}`); process.exitCode = 1; });
