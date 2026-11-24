#!/usr/bin/env python3
"""Render the silent-programme example into reviewable, local media deliverables.

The programme JSON remains the single source of truth.  This script creates the
semantic HTML and editable-text PPTX; capture_silent_programme.mjs creates the
PDF and social raster/video derivatives from the generated HTML.
"""
from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
import sys
import hashlib
import re
from pathlib import Path

from pptx import Presentation
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
PAPER, INK, RED, GREEN, MUTED = "#f4f0e7", "#172018", "#b13a2c", "#1e5b46", "#596158"


def esc(value: str) -> str:
    return (str(value).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def image_data(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def attribution(source: dict) -> str:
    parts = []
    if source.get("author"):
        parts.append(f"作者：{source['author']}")
    if source.get("credit"):
        parts.append(f"图片署名：{source['credit']}")
    if source.get("reference"):
        parts.append(f"来源记录：{source['reference']}")
    if source.get("license"):
        parts.append(f"许可：{source['license']}")
    if source.get("rights_note"):
        parts.append(f"权利说明：{source['rights_note']}")
    return "；".join(parts) or "未提供署名或权利说明"


def time_to_minutes(value: str) -> int:
    hours, minutes = value.split(":", 1)
    return int(hours) * 60 + int(minutes)


def credits(data: dict, source_dir: Path) -> list[dict]:
    rows = []
    for film in data["films"]:
        image = (source_dir / film["image"]).resolve()
        if source_dir not in image.parents or not image.is_file():
            raise ValueError(f"film '{film.get('id', '?')}' image must exist inside the input directory: {film.get('image')}")
        provenance_path = image.with_name(image.name + ".provenance.json")
        if not provenance_path.is_file():
            raise ValueError(f"film '{film.get('id', '?')}' is missing provenance sidecar: {provenance_path.name}")
        provenance = json.loads(provenance_path.read_text())
        expected_hash = provenance.get("asset", {}).get("sha256")
        actual_hash = file_hash(image)
        if not expected_hash or expected_hash != actual_hash:
            raise ValueError(f"film '{film['id']}' image fingerprint does not match its provenance sidecar")
        source = provenance.get("source", {})
        rows.append({
            "film": film,
            "image": image,
            "author": source.get("author"),
            "credit": source.get("credit"),
            "license": source.get("license"),
            "page": source.get("file_page") or source.get("reference"),
            "subject": provenance.get("subject", film["title"]),
            "attribution": attribution(source),
        })
    return rows


def programme_html(data: dict, source_dir: Path, rows: list[dict]) -> str:
    rows_by_id = {row["film"]["id"]: row for row in rows}
    cards = "".join(f'''<article class="film"><img src="{image_data(rows_by_id[f['id']]['image'])}" alt="{esc(f['alt'])}"><div class="film-copy"><p class="slot">{esc(f['time'])}–{esc(f['end'])}</p><h2>{esc(f['title'])}</h2><p class="original">{esc(f['original'])} · {esc(f['year'])}</p><p class="caption">{esc(f['caption'])}</p></div></article>''' for f in data["films"])
    source_rows = "".join(f"<li><strong>{esc(r['film']['title'])}</strong>：{esc(r['subject'])}；{esc(r['attribution'])}；来源：{esc(r['page'] or '未提供')}</li>" for r in rows)
    total_minutes = sum(time_to_minutes(f["end"]) - time_to_minutes(f["time"]) for f in data["films"])
    css = '''@page { size:A4; margin:14mm } *{box-sizing:border-box} body{margin:0;background:PAPER;color:INK;font-family:"Songti SC","STSong",serif} main{max-width:1120px;margin:auto;padding:42px 30px 56px} .rule{border-top:2px solid INK;padding-top:12px;display:flex;justify-content:space-between;font:12px ui-monospace,monospace;letter-spacing:.11em} .rule b{color:RED} h1{font-size:clamp(52px,9vw,104px);font-weight:400;line-height:.92;letter-spacing:-.08em;margin:52px 0 12px} .subtitle{font-size:22px;color:GREEN;margin:0} .details{border-top:1px solid #aeb4aa;border-bottom:1px solid #aeb4aa;margin:42px 0 28px;padding:16px 0;display:flex;gap:42px;flex-wrap:wrap;font-size:17px} .details strong{font-family:ui-monospace,monospace;font-size:12px;letter-spacing:.09em;color:RED;display:block;margin-bottom:4px} .note{max-width:650px;color:MUTED;line-height:1.7;margin:0 0 36px} .films{display:grid;grid-template-columns:repeat(3,1fr);gap:18px} .film{border-top:2px solid INK;padding-top:10px} .film img{width:100%;aspect-ratio:4/3;object-fit:cover;filter:grayscale(1);display:block} .slot{font:12px ui-monospace,monospace;letter-spacing:.1em;color:RED;margin:14px 0 6px} h2{font-size:28px;line-height:1.05;font-weight:400;margin:0} .original,.maker{font-size:13px;color:MUTED;margin:8px 0} .caption{line-height:1.65;min-height:5.1em} footer{margin-top:58px;padding-top:14px;border-top:1px solid #aeb4aa;font-size:12px;line-height:1.7;color:MUTED} footer h3{color:INK;font-size:14px;margin:0 0 8px} footer ol{padding-left:20px} @media(max-width:700px){main{padding:24px 18px}h1{font-size:64px}.films{grid-template-columns:1fr}.film{display:grid;grid-template-columns:42% 1fr;gap:14px}.film-copy{align-self:start}.film h2{font-size:25px}.caption{min-height:0}} @media print{main{padding:0}.films{gap:14px}h1{font-size:74px}}'''
    css += '@media print{h1{font-size:62px}.details{margin:22px 0 14px;padding:10px 0}.note{margin-bottom:18px}.film img{aspect-ratio:16/9}footer{margin-top:20px;font-size:8.5px;line-height:1.25}footer ol{margin:5px 0;padding-left:16px}}'
    css = css.replace("PAPER", PAPER).replace("INK", INK).replace("RED", RED).replace("GREEN", GREEN).replace("MUTED", MUTED)
    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{esc(data['title'])}｜{esc(data['subtitle'])}</title><style>{css}</style></head><body><main><div class="rule"><b>虚构策展示例 / PROGRAMME STUDY</b><span>NO. 01 · {esc(data['date'])}</span></div><header><h1>{esc(data['title'])}</h1><p class="subtitle">{esc(data['subtitle'])}</p></header><section class="details"><div><strong>日期</strong>{esc(data['date'])}</div><div><strong>地点</strong>{esc(data['venue'])}</div><div><strong>场次</strong>{len(data['films'])} films · {total_minutes} min</div></section><p class="note">{esc(data['note'])}</p><section class="films" aria-label="排片">{cards}</section><footer><h3>图片来源与署名</h3><ol>{source_rows}</ol><p>本页为虚构策展示例；使用本地 sidecar 记录的静帧来源与权利信息，不含影片片段，也不构成活动售票或商店页面。</p></footer></main></body></html>'''


def social_html(data: dict, source_dir: Path, rows: list[dict], index: int | None = None) -> str:
    f = data["films"][index if index is not None else 0]
    heading = data["title"] if index is None else f["title"]
    sub = f"{data['subtitle']} · {data['date']}" if index is None else f"{f['original']} · {f['year']}"
    top = "虚构策展示例 · PROGRAMME STUDY" if index is None else f"场次 {index + 1:02d} · {f['time']} 开场"
    cue = "" if index is None else f'<div class="cue"><b>{esc(f["time"])} 开场</b><span>{esc(f["caption"])}</span></div>'
    css = '''*{box-sizing:border-box}html,body{margin:0;width:1200px;height:1500px;overflow:hidden;background:PAPER;color:INK;font-family:"Songti SC","STSong",serif}main{height:100%;padding:78px 72px;position:relative;background:linear-gradient(90deg,transparent 0 71px,rgba(23,32,24,.05) 71px 72px,transparent 72px)}.top{font:15px ui-monospace,monospace;letter-spacing:.12em;border-top:2px solid INK;padding-top:14px;color:RED}h1{font-weight:400;font-size:104px;line-height:.9;letter-spacing:-.09em;margin:78px 0 18px}.sub{font-size:27px;color:GREEN}figure{margin:65px 0 0;position:relative;height:695px;border:1px solid #9ba198}img{width:100%;height:100%;object-fit:cover;filter:grayscale(1)}figcaption{position:absolute;right:18px;bottom:18px;background:PAPER;padding:9px 12px;font:14px ui-monospace,monospace}.meta{margin-top:28px;border-top:1px solid #9ba198;padding-top:18px;display:flex;justify-content:space-between;font-size:24px}.foot{position:absolute;left:72px;right:72px;bottom:62px;font-size:13px;line-height:1.5;color:MUTED;border-top:1px solid #9ba198;padding-top:12px}.foot b{color:INK}'''
    css += '.interior .top{font-size:30px}.interior h1{font-size:100px;margin:42px 0 12px}.interior .sub{font-size:25px}.interior figure{height:510px;margin-top:38px}.cue{border-top:2px solid INK;margin-top:25px;padding-top:18px;display:grid;gap:9px}.cue b{font:42px ui-monospace,monospace;letter-spacing:.04em;color:RED}.cue span{font-size:29px;line-height:1.32}.interior .meta{margin-top:19px;font-size:21px}.interior .foot{bottom:42px}'
    css = css.replace("PAPER", PAPER).replace("INK", INK).replace("RED", RED).replace("GREEN", GREEN).replace("MUTED", MUTED)
    r = rows[index if index is not None else 0]
    page_class = 'interior' if index is not None else 'cover'
    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>{css}</style></head><body class="{page_class}"><main><div class="top">{esc(top)}</div><h1>{esc(heading)}</h1><div class="sub">{esc(sub)}</div><figure><img src="{image_data(r['image'])}" alt=""><figcaption>{esc(f['title'])} · {esc(f['year'])}</figcaption></figure>{cue}<div class="meta"><span>{esc(data['date'])}</span><span>{esc(data['venue'])}</span></div><div class="foot"><b>图片来源与署名：</b>{esc(r['subject'])} · {esc(r['attribution'])}<br>来源：{esc(r['page'] or '未提供')}<br>仅为排片视觉示例，不含影片片段。</div></main></body></html>'''


def set_text(shape, text, size, color, *, bold=False, font="Songti SC"):
    shape.text = text
    p = shape.text_frame.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    for run in p.runs:
        run.font.name = font; run.font.size = Pt(size); run.font.bold = bold; run.font.color.rgb = RGBColor.from_string(color.lstrip("#"))


def pptx(data: dict, source_dir: Path, rows: list[dict], output: Path):
    deck = Presentation(); deck.slide_width = Inches(13.333); deck.slide_height = Inches(7.5)
    blank = deck.slide_layouts[6]
    def box(slide, x, y, w, h, text, size, color=INK, **kw): return set_text(slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)), text, size, color, **kw)
    s = deck.slides.add_slide(blank); box(s,.6,.42,12,.25,"虚构策展示例 / PROGRAMME STUDY",11,RED,font="Aptos Mono"); box(s,.6,.75,11,1.45,data['title'],52,INK); box(s,.64,2.25,8,.4,data['subtitle'],22,GREEN); box(s,.64,3.28,4,.7,f"{data['date']}\n{data['venue']}",20,INK); box(s,.64,5.9,9,.35,"排片为策展示例；以下使用已记录来源的早期电影静帧。",14,MUTED)
    rows_by_id = {row['film']['id']: row for row in rows}
    for f in data['films']:
        row = rows_by_id[f['id']]
        slide = deck.slides.add_slide(blank)
        with Image.open(row['image']) as image:
            width, height = image.size
        display_width = Inches(5.55)
        display_height = int(display_width * height / width)
        slide.shapes.add_picture(str(row['image']), Inches(.6), Inches(.55), width=display_width, height=display_height)
        box(slide,6.65,.62,5.9,.3,f"{f['time']}–{f['end']}  /  {f['year']}",13,RED,font="Aptos Mono"); box(slide,6.65,1.12,5.9,.7,f['title'],33,INK); box(slide,6.65,1.95,5.9,.35,f['original'],16,GREEN); box(slide,6.65,2.72,5.5,1.2,f['caption'],20,INK); box(slide,6.65,4.55,5.8,1.1,f"{row['attribution']}\n画面说明：{f['alt']}",12,MUTED); box(slide,.6,6.72,12,.25,"虚构策展示例 · 不含影片片段 · 详见来源页与署名页",10,MUTED,font="Aptos Mono")
    for page_index in range(0, len(rows), 3):
        s = deck.slides.add_slide(blank)
        box(s,.6,.55,12,.35,"图片来源与署名",30,INK)
        y = 1.35
        for r in rows[page_index:page_index + 3]:
            box(s,.7,y,11.9,1.25,f"{r['film']['title']}｜{r['subject']}\n{r['attribution']}\n来源：{r['page'] or '未提供'}",13,INK)
            y += 1.55
        box(s,.7,6.45,11,.4,"以上静帧为节目视觉材料；公开发布前请重新核对来源及适用性。",12,MUTED)
    deck.save(output)


def main():
    parser=argparse.ArgumentParser(description="Render a programme JSON and its local image assets into HTML, PPTX, PDF and social media.")
    parser.add_argument('--data', type=Path, required=True, help='Programme JSON; image paths are resolved beside it.')
    parser.add_argument('--out', type=Path, required=True, help='Empty or existing output directory to update.')
    parser.add_argument('--timeline', type=Path, help='Optional prior timeline.json: edit scene durations/order, then rerender.')
    parser.add_argument('--skip-capture', action='store_true', help='Generate only HTML, social HTML, PPTX and manifest.')
    args=parser.parse_args()
    data_path=args.data.resolve(); source_dir=data_path.parent; out=args.out.resolve(); out.mkdir(parents=True,exist_ok=True)
    data=json.loads(data_path.read_text())
    ids = [film.get('id', '') for film in data.get('films', [])]
    if (len(ids) != len(set(ids)) or not ids or "cover" in ids
            or any(not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', item) for item in ids)):
        raise SystemExit("every film.id must be unique, must not be 'cover', and must match [a-z0-9][a-z0-9_-]*")
    rows=credits(data,source_dir)
    default_timeline = {'version': 1, 'scenes': [{'id':'cover','duration':3}] + [{'id': film['id'], 'duration':3} for film in data['films']]}
    timeline_data = json.loads(args.timeline.read_text()) if args.timeline else default_timeline
    scene_ids = [scene.get('id') for scene in timeline_data.get('scenes', [])]
    valid_ids = ['cover'] + ids
    if set(scene_ids) != set(valid_ids) or len(scene_ids) != len(valid_ids) or any(not isinstance(scene.get('duration'), (int, float)) or scene['duration'] <= 0 for scene in timeline_data.get('scenes', [])):
        raise SystemExit('timeline.json must contain cover and each unique film.id once, with a positive duration')
    (out/'programme.html').write_text(programme_html(data,source_dir,rows)); (out/'social-cover.html').write_text(social_html(data,source_dir,rows));
    for index, film in enumerate(data['films']): (out/f"social-{film['id']}.html").write_text(social_html(data,source_dir,rows,index))
    pptx(data,source_dir,rows,out/'programme.pptx')
    pages = [f"social-{scene['id']}" for scene in timeline_data['scenes']]
    manifest = {'source':data_path.name, 'title':data['title'], 'times':[{k:f[k] for k in ('id','time','end')} for f in data['films']], 'assets': [{'film':r['film']['id'], 'attribution':r['attribution'], 'source_page':r['page'], 'sha256':file_hash(r['image'])} for r in rows], 'social_pages':pages, 'timeline':'timeline.json'}
    (out/'timeline.json').write_text(json.dumps(timeline_data,ensure_ascii=False,indent=2)+'\n')
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    if not args.skip_capture:
        node=shutil.which('node'); ffmpeg=shutil.which('ffmpeg')
        if not node or not ffmpeg: raise SystemExit('node and ffmpeg are required for PDF/PNG/MP4/GIF capture')
        subprocess.run([node,str(SCRIPT_DIR/'capture-silent-programme.mjs'),str(out)],check=True)
        scenes = [out/f"{name}.png" for name in manifest['social_pages']]
        durations = [scene['duration'] for scene in timeline_data['scenes']]
        video_command = [ffmpeg, '-y']
        for item, duration in zip(scenes, durations):
            video_command.extend(['-loop', '1', '-t', str(duration), '-i', str(item)])
        video_command.extend(['-filter_complex', f'concat=n={len(scenes)}:v=1:a=0,format=yuv420p', '-r', '24', str(out / 'social.mp4')])
        subprocess.run(video_command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run([ffmpeg,'-y','-i',str(out/'social.mp4'),'-vf','fps=8,scale=600:-1:flags=lanczos',str(out/'social.gif')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        manifest['hashes'] = {item.name: hashlib.sha256(item.read_bytes()).hexdigest() for item in scenes + [out/'social.mp4', out/'social.gif']}
        checkpoints = {}
        elapsed = 0
        for scene, duration in zip(timeline_data['scenes'], durations):
            checkpoints[f"{scene['id']}_start"] = elapsed
            checkpoints[f"{scene['id']}_end"] = max(elapsed, elapsed + duration - min(.1, duration / 10))
            elapsed += duration
        manifest['timeline_frame_hashes'] = {}
        for label, second in checkpoints.items():
            frame = out/f'.{label}.jpg'
            subprocess.run([ffmpeg,'-y','-ss',str(second),'-i',str(out/'social.mp4'),'-frames:v','1',str(frame)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            manifest['timeline_frame_hashes'][label] = hashlib.sha256(frame.read_bytes()).hexdigest(); frame.unlink()
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(f'Rendered {out}')
if __name__ == '__main__': main()
