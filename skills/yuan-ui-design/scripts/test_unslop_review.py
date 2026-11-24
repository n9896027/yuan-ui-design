"""Regression checks for packaging matched screenshots into an offline review."""
from base64 import b64decode
from io import BytesIO
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from PIL import Image


class Pictures(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.sources.append(dict(attrs)["src"])


class ReviewTest(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        self.output = self.directory / "review.html"
        self.inputs = [self.directory / "before.png", self.directory / "after.png"]
        for path, color in zip(self.inputs, ("navy", "orange")):
            Image.new("RGB", (64, 32), color).save(path)

    def run_review(self):
        return subprocess.run(
            [sys.executable, str(Path(__file__).with_name("unslop_review.py")),
             "--title", '工单 <草稿>', "--pair", "窄屏", *self.inputs, "--out", self.output],
            capture_output=True, text=True,
        )

    def test_portable_pair_and_original_output(self):
        result = self.run_review()
        self.assertEqual(result.returncode, 0, result.stderr)
        html = self.output.read_text(encoding="utf-8")
        self.assertNotIn(str(self.directory), html)
        self.assertIn("&lt;草稿&gt;", html)
        pictures = Pictures()
        pictures.feed(html)
        colors = set()
        for src in pictures.sources:
            self.assertTrue(src.startswith("data:image/png;base64,"))
            with Image.open(BytesIO(b64decode(src.partition(",")[2]))) as img:
                self.assertEqual(img.size, (64, 32))
                colors.add(img.convert("RGB").getpixel((0, 0)))
        self.assertEqual(colors, {(0, 0, 128), (255, 165, 0)})
        self.output.write_text("existing review", encoding="utf-8")
        self.assertNotEqual(self.run_review().returncode, 0)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "existing review")

    def test_mismatched_viewports_are_rejected(self):
        Image.new("RGB", (32, 64)).save(self.inputs[1])
        self.assertNotEqual(self.run_review().returncode, 0)
        self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
