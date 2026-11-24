#!/usr/bin/env python3
"""Unit checks for crop-window math shared by browser and PPTX render paths."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RENDER = ROOT / "skills/yuan-ui-design/scripts/render-silent-programme.py"
spec = importlib.util.spec_from_file_location("silent_programme_renderer", RENDER)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def main():
    image = ROOT / "examples/silent-programme/assets/garden.jpg"
    right_top = {
        "id": "right-top", "composition": {
            "fit": "cover", "protectedRegion": {"x": .80, "y": .08, "width": .12, "height": .30},
            "intent": "A valid right-side protected subject remains visible.",
        },
    }
    placement = renderer.image_placement(right_top, image, .8)
    assert placement["fit"] == "cover"
    assert placement["axis"] == "x"
    assert placement["position"] == "100.000% 50%"
    assert 0 <= placement["start"] <= 1 - placement["extent"]

    too_wide = {**right_top, "composition": {**right_top["composition"], "protectedRegion": {"x": .05, "y": .08, "width": .90, "height": .30}}}
    assert renderer.image_placement(too_wide, image, .8)["fit"] == "contain"
    native_spec = importlib.util.spec_from_file_location("programme_sync", ROOT / "examples/silent-programme/wechat/scripts/sync_programme.py")
    native = importlib.util.module_from_spec(native_spec)
    native_spec.loader.exec_module(native)
    assert native.safe_mode(right_top, image, .8) == "aspectFit"
    middle = {**right_top, "composition": {**right_top["composition"], "protectedRegion": {"x": .42, "y": .30, "width": .12, "height": .30}}}
    assert native.safe_mode(middle, image, .8) == "aspectFill"
    print("PASS safe cover maps source window to CSS/PPTX crop fractions; unsafe cover downgrades")


if __name__ == "__main__":
    main()
