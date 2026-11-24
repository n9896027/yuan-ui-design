#!/usr/bin/env python3
import hashlib
import importlib.util
import json
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

SCRIPT = Path(__file__).with_name("image_provenance.py")
spec = importlib.util.spec_from_file_location("image_provenance", SCRIPT)
tool = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(tool)

_buffer = io.BytesIO()
Image.new("RGB", (1, 1), (255, 0, 0)).save(_buffer, format="PNG")
PNG_1X1 = _buffer.getvalue()


class ImageProvenanceTests(unittest.TestCase):
    def test_dimensions_and_title_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / "x.png"
            image.write_bytes(PNG_1X1)
            self.assertEqual(tool.image_dimensions(image), {"width": 1, "height": 1})
        self.assertEqual(tool.commons_title("https://commons.wikimedia.org/wiki/File:Example.jpg"), "File:Example.jpg")
        with self.assertRaisesRegex(tool.ImageToolError, "exact Commons"):
            tool.commons_title("Example.jpg")
        with self.assertRaisesRegex(tool.ImageToolError, "commons.wikimedia.org"):
            tool.commons_title("https://example.test/wiki/File:Example.jpg")

    def test_local_import_round_trip_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, dest = root / "source.png", root / "dest.png"
            source.write_bytes(PNG_1X1)
            command = [sys.executable, str(SCRIPT), "import-local", "--source", str(source), "--dest", str(dest), "--subject", "test pixel", "--focal-intent", "no crop", "--rights-note", "test authorization", "--source-reference", "asset-registry:test-pixel", "--author", "Test author", "--license", "Internal approved"]
            first = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            manifest = json.loads(Path(str(dest) + ".provenance.json").read_text())
            self.assertEqual(manifest["asset"]["sha256"], hashlib.sha256(PNG_1X1).hexdigest())
            self.assertEqual(manifest["asset"]["dimensions"], {"width": 1, "height": 1})
            self.assertEqual(manifest["asset"]["path"], "dest.png")
            self.assertEqual(manifest["source"]["reference"], "asset-registry:test-pixel")
            self.assertNotIn(str(source), json.dumps(manifest))
            second = subprocess.run(command, text=True, capture_output=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertIn("Refusing to overwrite", second.stderr)

    def test_bad_source_does_not_create_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "dest.png"
            result = subprocess.run([sys.executable, str(SCRIPT), "import-local", "--source", str(Path(directory) / "missing.png"), "--dest", str(dest), "--subject", "x", "--focal-intent", "x", "--rights-note", "x", "--source-reference", "registry:missing"], text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(dest.exists())

    def test_network_failure_does_not_create_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            dest = Path(directory) / "unreachable.jpg"
            with self.assertRaisesRegex(tool.ImageToolError, "Download failed"):
                tool.staged_download("http://127.0.0.1:1/no-image.jpg", dest)
            self.assertFalse(dest.exists())

    def test_rejects_html_and_manifest_collision_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, dest = root / "fake.jpg", root / "out.jpg"
            source.write_text("<html>not an image</html>")
            command = [sys.executable, str(SCRIPT), "import-local", "--source", str(source), "--dest", str(dest), "--manifest", str(dest), "--subject", "x", "--focal-intent", "x", "--rights-note", "x", "--source-reference", "registry:fake"]
            collision = subprocess.run(command, text=True, capture_output=True)
            self.assertNotEqual(collision.returncode, 0)
            self.assertIn("same path", collision.stderr)
            self.assertFalse(dest.exists())
            command[command.index("--manifest") + 1] = str(root / "out.provenance.json")
            html = subprocess.run(command, text=True, capture_output=True)
            self.assertNotEqual(html.returncode, 0)
            self.assertIn("undecodable", html.stderr)
            self.assertFalse(dest.exists())

    def test_rejects_truncated_png_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, dest = root / "truncated.png", root / "out.png"
            source.write_bytes(PNG_1X1[:24])
            result = subprocess.run([sys.executable, str(SCRIPT), "import-local", "--source", str(source), "--dest", str(dest), "--subject", "x", "--focal-intent", "x", "--rights-note", "x", "--source-reference", "registry:bad"], text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("undecodable", result.stderr)
            self.assertFalse(dest.exists())

    def test_manifest_write_failure_removes_new_image(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, dest, blocked = root / "source.png", root / "out.png", root / "blocked"
            source.write_bytes(PNG_1X1)
            blocked.write_text("not a directory")
            result = subprocess.run([sys.executable, str(SCRIPT), "import-local", "--source", str(source), "--dest", str(dest), "--manifest", str(blocked / "sidecar.json"), "--subject", "x", "--focal-intent", "x", "--rights-note", "x", "--source-reference", "registry:test"], text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(dest.exists())

    def test_absolute_reference_and_concurrent_target_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, dest = root / "source.png", root / "out.png"
            source.write_bytes(PNG_1X1)
            absolute_reference = subprocess.run([sys.executable, str(SCRIPT), "import-local", "--source", str(source), "--dest", str(dest), "--subject", "x", "--focal-intent", "x", "--rights-note", "x", "--source-reference", str(source.resolve())], text=True, capture_output=True)
            self.assertNotEqual(absolute_reference.returncode, 0)
            self.assertFalse(dest.exists())
            dest.write_bytes(b"existing-not-an-image")
            temp = root / "staged"
            temp.write_bytes(PNG_1X1)
            with self.assertRaisesRegex(tool.ImageToolError, "concurrent overwrite"):
                tool.commit_new(temp, dest)
            self.assertEqual(dest.read_bytes(), b"existing-not-an-image")


if __name__ == "__main__":
    unittest.main()
