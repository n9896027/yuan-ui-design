#!/usr/bin/env python3
"""Import locally-authorized images or fetch one explicit Wikimedia Commons file.

Pillow verifies that imported files decode. The tool never guesses a Commons
image from a broad search: a file page URL or File: title is required.  The
result is an image plus a JSON sidecar that records enough provenance for a
reviewer to independently re-check it.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen

try:
    from PIL import Image, UnidentifiedImageError
except ImportError as error:  # pragma: no cover - environment-specific guard
    raise SystemExit("ERROR Pillow is required for safe image decode validation; install with: python3 -m pip install Pillow") from error


COMMONS_API = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "yuan-ui-design-image-provenance/1.0 (local provenance utility)"


class ImageToolError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise ImageToolError(message)


def require_absent(path: Path) -> None:
    if path.exists():
        fail(f"Refusing to overwrite existing path: {path}. Choose a new target path.")
    if path.is_symlink():
        fail(f"Refusing symlink destination: {path}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_dimensions(path: Path) -> dict[str, int]:
    with Image.open(path) as image:
        width, height = image.size
        return {"width": width, "height": height}


def validate_image(path: Path) -> None:
    try:
        with Image.open(path) as image:
            width, height = image.size
            if not width or not height or width * height > 100_000_000:
                fail(f"Refusing dimensionless or oversized image data: {path.name}")
            image.verify()
        with Image.open(path) as image:
            image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        fail(f"Refusing undecodable, truncated, or unsafe image data: {path.name} ({error})")


def staged_copy(source: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
        temp = Path(handle.name)
        try:
            with source.open("rb") as input_handle:
                shutil.copyfileobj(input_handle, handle)
            handle.flush()
            validate_image(temp)
        except Exception:
            temp.unlink(missing_ok=True)
            raise
    return temp


def staged_download(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=30) as response, tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
            temp = Path(handle.name)
            try:
                shutil.copyfileobj(response, handle)
                handle.flush()
                validate_image(temp)
            except Exception:
                temp.unlink(missing_ok=True)
                raise
    except HTTPError as error:
        retry_after = error.headers.get("Retry-After") if error.headers else None
        suffix = f" Retry-After: {retry_after}; wait at least that long before trying again." if error.code == 429 and retry_after else " Do not retry rapidly." if error.code == 429 else ""
        fail(f"Download failed for {url}: HTTP {error.code}.{suffix}")
    except (URLError, TimeoutError) as error:
        fail(f"Download failed for {url}: {error}")
    return temp


def staged_json(data: dict[str, Any], destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=destination.parent, delete=False) as handle:
        temp = Path(handle.name)
        json.dump(data, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    return temp


def commit_new(temp: Path, destination: Path) -> None:
    """Atomically publish a same-directory temp file without replacing anything."""
    try:
        os.link(temp, destination)
    except FileExistsError:
        fail(f"Refusing concurrent overwrite of existing path: {destination}")
    finally:
        temp.unlink(missing_ok=True)


def rollback_created(path: Path, expected_stat: os.stat_result) -> None:
    try:
        actual = path.stat()
        if (actual.st_dev, actual.st_ino) == (expected_stat.st_dev, expected_stat.st_ino):
            path.unlink()
    except FileNotFoundError:
        pass


def commons_title(value: str) -> str:
    if value.startswith("File:"):
        candidate = value.replace("_", " ")
    else:
        parsed = urlparse(value)
        if not parsed.scheme:
            candidate = value.replace("_", " ")
        else:
            if parsed.netloc != "commons.wikimedia.org":
                fail("Commons file URLs must use commons.wikimedia.org")
            query_title = parse_qs(parsed.query).get("title", [None])[0]
            candidate = query_title or unquote(parsed.path.rsplit("/", 1)[-1]).replace("_", " ")
    if not candidate.startswith("File:") or len(candidate) <= len("File:"):
        fail("Provide an exact Commons File: title or its commons.wikimedia.org file-page URL")
    return candidate


def commons_info(title: str, width: int | None) -> dict[str, Any]:
    parameters = "action=query&format=json&formatversion=2&prop=imageinfo&titles=" + quote(title) + "&iiprop=url|extmetadata|size|mime|sha1"
    if width:
        parameters += f"&iiurlwidth={width}"
    try:
        with urlopen(Request(COMMONS_API + "?" + parameters, headers={"User-Agent": USER_AGENT}), timeout=30) as response:
            payload = json.load(response)
    except HTTPError as error:
        retry_after = error.headers.get("Retry-After") if error.headers else None
        suffix = f" Retry-After: {retry_after}; wait at least that long before trying again." if error.code == 429 and retry_after else " Do not retry rapidly." if error.code == 429 else ""
        fail(f"Commons metadata request failed: HTTP {error.code}.{suffix}")
    except (URLError, TimeoutError, json.JSONDecodeError) as error:
        fail(f"Commons metadata request failed: {error}")
    pages = payload.get("query", {}).get("pages", [])
    if len(pages) != 1 or "missing" in pages[0] or not pages[0].get("imageinfo"):
        fail(f"Commons file was not found: {title}")
    info = pages[0]["imageinfo"][0]
    metadata = info.get("extmetadata", {})
    def ext(key: str) -> str | None:
        value = metadata.get(key, {}).get("value")
        return re.sub(r"<[^>]+>", "", value).strip() if value else None
    download_url = info.get("thumburl") if width else info["url"]
    if not download_url:
        fail(f"Commons did not provide a {width}px thumbnail for: {title}")
    return {"title": pages[0]["title"], "original_url": info["url"], "download_url": download_url, "retrieval_kind": "thumbnail" if width else "original", "requested_width": width, "file_page": "https://commons.wikimedia.org/wiki/" + quote(pages[0]["title"].replace(" ", "_")), "author": ext("Artist"), "credit": ext("Credit"), "license": ext("LicenseShortName"), "license_url": ext("LicenseUrl"), "mime": info.get("mime"), "width": info.get("width"), "height": info.get("height")}


def record(destination: Path, manifest: Path, source: dict[str, Any], subject: str, focal_intent: str, generation_method: str, mode: str) -> dict[str, Any]:
    portable_path = os.path.relpath(destination.resolve(), manifest.parent.resolve())
    return {"schema_version": "1.0", "recorded_at": dt.datetime.now(dt.timezone.utc).isoformat(), "asset": {"path": portable_path, "bytes": destination.stat().st_size, "sha256": sha256(destination), "dimensions": image_dimensions(destination)}, "mode": mode, "source": source, "subject": subject, "focal_or_crop_intent": focal_intent, "generation_method": generation_method, "review_note": "Hash and metadata establish traceability, not ownership or suitability. Re-check the source page before publication."}


def common_fields(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--dest", required=True, type=Path, help="New image destination")
    parser.add_argument("--manifest", type=Path, help="Sidecar JSON path (default: <dest>.provenance.json)")
    parser.add_argument("--subject", required=True, help="What the image depicts")
    parser.add_argument("--focal-intent", required=True, help="Intended focal point or crop instruction")
    parser.add_argument("--mode", help="Editorial mode, e.g. documentary_photo or product_reference")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    local = sub.add_parser("import-local", help="Copy an authorized local image and record its provenance")
    local.add_argument("--source", required=True, type=Path)
    local.add_argument("--source-reference", required=True, help="Non-sensitive review reference; never an absolute local path")
    local.add_argument("--rights-note", required=True, help="Authorization/rights basis; do not include secrets")
    local.add_argument("--author", help="Author/creator attribution")
    local.add_argument("--license", help="License label")
    local.add_argument("--license-url", help="License URL when applicable")
    local.add_argument("--generation-method", default="authorized local import (not generated)", help="Creation or acquisition method")
    common_fields(local)
    commons = sub.add_parser("fetch-commons", help="Fetch one explicit Wikimedia Commons File: item")
    group = commons.add_mutually_exclusive_group(required=True)
    group.add_argument("--title", help="Exact Commons File: title")
    group.add_argument("--url", help="Exact commons.wikimedia.org file-page URL")
    commons.add_argument("--width", type=int, help="Request a Commons thumbnail at this pixel width (1-4096); omit for original")
    common_fields(commons)
    args = parser.parse_args(argv)
    if args.command == "fetch-commons" and args.width is not None and not 1 <= args.width <= 4096:
        fail("--width must be between 1 and 4096 pixels")
    manifest = args.manifest or Path(str(args.dest) + ".provenance.json")
    if args.dest.resolve(strict=False) == manifest.resolve(strict=False):
        fail("--manifest must not point to the same path as --dest")
    require_absent(args.dest)
    require_absent(manifest)
    if args.command == "import-local" and Path(args.source_reference).is_absolute():
        fail("--source-reference must be a portable non-absolute reference, not a filesystem path")
    if args.command == "import-local":
        if not args.source.is_file() or args.source.is_symlink():
            fail(f"Local source must be a regular non-symlink file: {args.source}")
        image_temp = staged_copy(args.source, args.dest)
        source = {"kind": "authorized_local_import", "reference": args.source_reference, "author": args.author, "license": args.license, "license_url": args.license_url, "rights_note": args.rights_note}
        generated = args.generation_method
        mode = args.mode or "authorized_local_import"
    else:
        info = commons_info(commons_title(args.title or args.url), args.width)
        image_temp = staged_download(info["download_url"], args.dest)
        source = {"kind": "wikimedia_commons", **info}
        generated = f"downloaded {info['retrieval_kind']} from Wikimedia Commons (not AI-generated)"
        mode = args.mode or "wikimedia_commons_download"
    try:
        # record uses dimensions/hash, so calculate it against the staged file
        # while expressing the final portable asset path.
        staged_record = record(image_temp, manifest, source, args.subject, args.focal_intent, generated, mode)
        staged_record["asset"]["path"] = os.path.relpath(args.dest.resolve(), manifest.parent.resolve())
        manifest_temp = staged_json(staged_record, manifest)
        created = image_temp.stat()
        commit_new(image_temp, args.dest)
        try:
            commit_new(manifest_temp, manifest)
        except Exception:
            rollback_created(args.dest, created)
            raise
    except Exception:
        image_temp.unlink(missing_ok=True)
        if 'manifest_temp' in locals():
            manifest_temp.unlink(missing_ok=True)
        raise
    print(f"PASS wrote {args.dest} and {manifest}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except ImageToolError as error:
        print(f"ERROR {error}", file=sys.stderr)
        raise SystemExit(1)
