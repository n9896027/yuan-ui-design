#!/usr/bin/env node

/* Build a compact, offline A/B/C comparison from one reproducible capture. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.argv[2] ? resolve(process.argv[2]) : null;
const defaultOutput = resolve(dirname(fileURLToPath(import.meta.url)), 'compare.html');
const output = process.argv[3] ? resolve(process.argv[3]) : defaultOutput;
if (!directory || process.argv.length > 4) {
  throw new Error('Usage: node build-comparison.mjs CAPTURE_DIRECTORY [OUTPUT_HTML]');
}

const variants = [
  { id: 'A', title: 'A · Huashu Design 3.5.0 首稿', page: 'A/index.html' },
  { id: 'B', title: 'B · Yuan 原首稿', page: 'B/index.html' },
  { id: 'C', title: 'C · Yuan 2.5.0-dev.4 修订', page: 'C/index.html' },
];
const surfaces = [
  { id: 'desktop', title: '桌面 · 1280 × 800' },
  { id: 'mobile', title: '手机首屏 · 390 × 844' },
  { id: 'poster', title: '独立海报 · 800 × 1000', suffix: '?format=poster' },
];

async function encodedImage(variant, surface) {
  const name = `${variant.id}-${surface.id}.jpg`;
  const image = await readFile(resolve(directory, name));
  return `data:image/jpeg;base64,${image.toString('base64')}`;
}

const rows = await Promise.all(surfaces.map(async surface => {
  const figures = await Promise.all(variants.map(async variant => {
    const image = await encodedImage(variant, surface);
    const href = `${variant.page}${surface.suffix || ''}`;
    return `<figure><figcaption><b>${variant.title}</b><a href="${href}">${surface.id === 'poster' ? '打开海报' : '体验网页'}</a></figcaption><button class="shot" data-label="${variant.title} · ${surface.title}"><img src="${image}" alt="${variant.title}，${surface.title}"></button></figure>`;
  }));
  return `<section id="${surface.id}"><h2>${surface.title}</h2><div class="shots">${figures.join('')}</div></section>`;
}));

const document = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>读一张肖像 · A/B/C 对照</title>
<style>
:root{color:#20292b;background:#f3f1ec;font-family:ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{max-width:1760px;margin:0 auto;padding:clamp(16px,3vw,48px)}h1{font:clamp(30px,4vw,56px)/.98 ui-serif,STSong,"Songti SC",serif;letter-spacing:-.05em;margin:0}p{max-width:64ch;margin:12px 0 36px;color:#52605d}section{border-top:1px solid #abb5ad;padding:20px 0 36px}h2{font-size:14px;letter-spacing:.08em;margin:0 0 12px}.shots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(12px,2vw,28px)}figure{min-width:0;margin:0}figcaption{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:13px;margin:0 0 7px}figcaption b{font-weight:700}a{color:inherit;text-underline-offset:3px;font-size:12px}.shot{display:block;width:100%;padding:0;border:1px solid #728079;background:#fff;cursor:zoom-in}.shot:focus-visible{outline:3px solid #b44631;outline-offset:3px}.shot img{display:block;width:100%;height:auto}dialog{width:min(96vw,1600px);max-height:96vh;padding:18px;border:1px solid #2d3c39;background:#f7f5f0}dialog::backdrop{background:#0d1715cc}.dialog-head{display:flex;justify-content:space-between;gap:20px;margin-bottom:12px}.dialog-head button{font:inherit;background:none;border:1px solid #52605d;padding:6px 10px}dialog img{display:block;max-width:100%;max-height:82vh;margin:auto}@media(max-width:760px){body{padding:18px}.shots{grid-template-columns:1fr}figcaption{font-size:14px}}
nav{display:flex;gap:20px;padding:8px 0 16px}nav a{font-size:14px}section{scroll-margin-top:16px}
</style></head><body><main><h1>读一张肖像</h1><p>同一张照片、同一份简报。A 与 B 保留首稿，C 是 Yuan 按具体反馈完成的修订。点击截图可放大，链接打开实际页面。</p><nav aria-label="查看画幅"><a href="#desktop">桌面</a><a href="#mobile">手机首屏</a><a href="#poster">海报</a></nav>${rows.join('')}</main><dialog aria-labelledby="preview-title"><div class="dialog-head"><strong id="preview-title"></strong><button type="button">关闭</button></div><img alt=""></dialog><script>const dialog=document.querySelector('dialog'),title=dialog.querySelector('strong'),image=dialog.querySelector('img');document.querySelectorAll('.shot').forEach(button=>button.addEventListener('click',()=>{title.textContent=button.dataset.label;image.src=button.querySelector('img').src;image.alt=button.querySelector('img').alt;dialog.showModal()}));dialog.querySelector('button').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()})</script></body></html>`;

await writeFile(output, document);
console.log(`Built ${basename(output)} from ${directory}`);
