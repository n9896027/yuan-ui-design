#!/usr/bin/env python3
"""Create an offline before-and-after PNG review page for one UI screen."""
from __future__ import annotations

import argparse
import base64
import html
import os
from pathlib import Path
import sys
import tempfile

try:
    from PIL import Image, UnidentifiedImageError
except ImportError as error:  # pragma: no cover - environment-specific
    raise SystemExit(
        "ERROR Pillow is required; install it with: python3 -m pip install Pillow"
    ) from error


class ReviewError(ValueError):
    pass


def png(path: Path) -> tuple[bytes, int, int]:
    if path.is_symlink() or not path.is_file():
        raise ReviewError(f"Image must be a regular file: {path}")
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                raise ReviewError(f"Image must be PNG: {path}")
            width, height = image.size
            image.verify()
        with Image.open(path) as image:
            image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ReviewError(f"Unreadable PNG: {path} ({error})") from error
    if width < 1 or height < 1:
        raise ReviewError(f"PNG has no visible size: {path}")
    return path.read_bytes(), width, height


def source(data: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


def pair_html(index: int, label: str, before: bytes, after: bytes, width: int, height: int) -> str:
    safe_label = html.escape(label, quote=True)
    before_source = source(before)
    after_source = source(after)
    ratio = f"{width} / {height}"
    return f"""<section class="pair" aria-labelledby="heading-{index}">
  <h2 id="heading-{index}">{safe_label}</h2>
  <div class="pair--compare">
    <div class="switch" role="radiogroup" aria-labelledby="heading-{index}">
      <input id="pair-{index}-before" name="pair-{index}" type="radio" checked>
      <label for="pair-{index}-before">原图</label>
      <input id="pair-{index}-after" name="pair-{index}" type="radio">
      <label for="pair-{index}-after">改稿</label>
    </div>
  </div>
  <div class="image-stage" style="--ratio: {ratio}; --image-width: {width}px">
    <figure class="before"><img src="{before_source}" alt="{safe_label}，原图"><figcaption>原图</figcaption></figure>
    <figure class="after"><img src="{after_source}" alt="{safe_label}，改稿"><figcaption>改稿</figcaption></figure>
  </div>
</section>"""


def page(title: str, pairs: list[tuple[str, bytes, bytes, int, int]]) -> str:
    safe_title = html.escape(title, quote=True)
    sections = "\n".join(
        pair_html(index, label, before, after, width, height)
        for index, (label, before, after, width, height) in enumerate(pairs, 1)
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{safe_title}</title>
<style>
  :root {{ color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif; color: #1d2420; background: #ecefe8; }}
  * {{ box-sizing: border-box; }} body {{ margin: 0; }} main {{ max-width: 1280px; margin: auto; padding: 32px 24px 56px; }}
  h1 {{ margin: 0 0 8px; font-size: clamp(28px, 5vw, 48px); line-height: 1.08; letter-spacing: -.04em; }} h2 {{ margin: 0 0 14px; font-size: 17px; }}
  .hint {{ margin: 0 0 24px; color: #59655e; }} .mode, .switch {{ display: flex; gap: 8px; flex-wrap: wrap; }}
  input {{ position: absolute; opacity: 0; }} label {{ padding: 8px 12px; border: 1px solid #819087; border-radius: 999px; background: #f9fbf6; cursor: pointer; }}
  input:focus-visible + label {{ outline: 3px solid #d06c35; outline-offset: 2px; }} input:checked + label {{ color: white; background: #254b3e; border-color: #254b3e; }}
  .review {{ margin-top: 24px; display: grid; gap: 28px; }} .pair {{ padding: 20px; border: 1px solid #b9c3ba; background: #f9fbf6; }}
  .image-stage {{ position: relative; width: 100%; max-width: var(--image-width); aspect-ratio: var(--ratio); overflow: hidden; background: #dce1da; }} figure {{ margin: 0; }}
  .image-stage figure {{ position: absolute; inset: 0; }} .image-stage img {{ display: block; width: 100%; height: 100%; object-fit: contain; }}
  .image-stage figcaption {{ display: none; }} .after {{ visibility: hidden; }} .pair:has([id$="-after"]:checked) .after {{ visibility: visible; }} .pair:has([id$="-after"]:checked) .before {{ visibility: hidden; }}
  body:has(#layout-split:checked) .pair--compare {{ display: none; }} body:has(#layout-split:checked) .image-stage {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-width: calc(var(--image-width) + var(--image-width) + 16px); aspect-ratio: auto; overflow: visible; background: transparent; }}
  body:has(#layout-split:checked) .image-stage figure {{ position: static; max-width: var(--image-width); visibility: visible; }} body:has(#layout-split:checked) .image-stage img {{ height: auto; background: #dce1da; }} body:has(#layout-split:checked) .image-stage figcaption {{ display: block; margin-top: 8px; color: #59655e; font-size: 14px; }}
  @media (max-width: 640px) {{ main {{ padding: 22px 14px 40px; }} .pair {{ padding: 14px; }} body:has(#layout-split:checked) .image-stage {{ grid-template-columns: 1fr; }} }}
</style>
<main>
  <h1>{safe_title}</h1>
  <p class="hint">选择「叠加切换」后，用 Tab 聚焦每组的原图与改稿，再用方向键切换。所有图片已内嵌，可离线审阅。</p>
  <div class="mode" role="radiogroup" aria-label="对照方式">
    <input id="layout-compare" name="layout" type="radio" checked><label for="layout-compare">叠加切换</label>
    <input id="layout-split" name="layout" type="radio"><label for="layout-split">并排查看</label>
  </div>
  <div class="review">{sections}</div>
</main>
</html>
"""


def write_new(destination: Path, content: str) -> None:
    if destination.exists() or destination.is_symlink():
        raise ReviewError(f"Refusing to overwrite existing output: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=destination.parent, delete=False
        ) as handle:
            temporary = Path(handle.name)
            handle.write(content)
        os.link(temporary, destination)
    except FileExistsError as error:
        raise ReviewError(f"Refusing to overwrite existing output: {destination}") from error
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title", required=True, help="Review title")
    parser.add_argument(
        "--pair", action="append", nargs=3, metavar=("LABEL", "BEFORE.PNG", "AFTER.PNG"),
        required=True, help="One same-size before/after PNG pair",
    )
    parser.add_argument("--out", required=True, type=Path, help="New standalone HTML file")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    arguments = parse(argv)
    checked: list[tuple[str, bytes, bytes, int, int]] = []
    for label, before_name, after_name in arguments.pair:
        before, before_width, before_height = png(Path(before_name))
        after, after_width, after_height = png(Path(after_name))
        if (before_width, before_height) != (after_width, after_height):
            raise ReviewError(
                f"Pair '{label}' needs equal dimensions, got {before_width}x{before_height} and {after_width}x{after_height}"
            )
        checked.append((label, before, after, before_width, before_height))
    write_new(arguments.out, page(arguments.title, checked))
    print(f"PASS wrote offline review with {len(checked)} pair(s): {arguments.out}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except ReviewError as error:
        print(f"ERROR {error}", file=sys.stderr)
        raise SystemExit(1)
