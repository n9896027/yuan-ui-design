#!/usr/bin/env python3
"""Check the released programme's editable slides, source data and rendered assets."""
from hashlib import sha256
import json
import shutil
import subprocess
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
TEXT_TAG = "{http://schemas.openxmlformats.org/drawingml/2006/main}t"


def check():
    data = json.loads((ROOT / "programme.json").read_text())
    manifest = json.loads((OUT / "manifest.json").read_text())
    slots = [{key: film[key] for key in ("id", "time", "end")} for film in data["films"]]
    if manifest["times"] != slots:
        raise ValueError("Schedule in export differs from programme.json")
    with ZipFile(OUT / "programme.pptx") as deck:
        slides = []
        for member in deck.namelist():
            if not member.startswith("ppt/slides/slide") or not member.endswith(".xml"):
                continue
            root = ElementTree.fromstring(deck.read(member))
            slides.append(" ".join(node.text or "" for node in root.iter(TEXT_TAG)))
        for film in data["films"]:
            if not any(all(film[key] in text for key in ("title", "time", "end")) for text in slides):
                raise ValueError(f"Slide lacks editable title or showtime: {film['id']}")

    html = (OUT / "programme.html").read_text()
    for film in data["films"]:
        if any(film[key] not in html for key in ("title", "time", "end", "alt")):
            raise ValueError(f"Programme page is stale: {film['id']}")
        asset = next(item for item in manifest["assets"] if item["film"] == film["id"])
        if asset.get("composition") != film.get("composition"):
            raise ValueError(f"Composition contract drifted: {film['id']}")
    expected = {"social-cover.png", "social.mp4", "social.gif"}
    expected.update("social-" + film["id"] + ".png" for film in data["films"])
    for name in expected:
        actual = sha256((OUT / name).read_bytes()).hexdigest()
        if manifest["hashes"].get(name) != actual:
            raise ValueError(f"Rendered asset differs from manifest: {name}")
    if not (OUT / "programme.pdf").read_bytes().startswith(b"%PDF-"):
        raise ValueError("Missing programme PDF")
    if shutil.which("ffprobe"):
        timeline = json.loads((OUT / "timeline.json").read_text())
        expected_frames = sum(round(scene["duration"] * 24) for scene in timeline["scenes"])
        raw = subprocess.check_output([
            "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
            "stream=nb_frames,r_frame_rate", "-of", "json", str(OUT / "social.mp4"),
        ])
        stream = json.loads(raw)["streams"][0]
        if int(stream["nb_frames"]) != expected_frames or stream["r_frame_rate"] != "24/1":
            raise ValueError("Video frame count or rate differs from the editable timeline")
    print(f"PASS editable slides and showtimes for {len(slots)} films; {len(expected)} rendered assets match")


if __name__ == "__main__":
    check()
