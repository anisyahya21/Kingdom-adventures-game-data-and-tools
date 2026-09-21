#!/usr/bin/env python3
"""Comparable zoom crops for the presentation/anchoring evidence.

The driver stores one full-stage screenshot per (width, toggle state) plus the browser geometry it
measured in the same pass. This script uses *that measured geometry* to cut the same regions out of
the before and the after capture, so the two can be compared directly:

  guard   - ally 0, the HumanComposite body path
  archer  - ally 1, the CharacterPreviewCanvas body path
  pair    - two column-adjacent monsters of the same clip (native X step 24, 12)
  boss    - the 80x60 Wairo Tank cell (all_monster_l_wairo02 + shadow_l)

Usage: python make_zooms.py --dir <evidence dir> [--zoom 3]
       python make_zooms.py --dir <evidence dir> --region x,y,w,h   # fixed logical rect, for
                                                                    # before/after comparisons
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def pick_units(probe: dict) -> dict:
    """Locate the regions by what a unit draws, not by order or debug text."""
    regions: dict[str, dict | None] = {"guard": None, "archer": None, "pair": None, "boss": None}
    monsters = []
    for unit in probe["units"]:
        canvas = unit.get("canvas")
        art = unit.get("composite") and unit["composite"]["union"]
        if canvas and regions["archer"] is None:
            regions["archer"] = canvas["rect"]
        elif art and regions["guard"] is None:
            regions["guard"] = art
        sheets = [line["sheet"] for line in unit.get("lines") or []]
        if "all_monster_l_wairo02.png" in sheets:
            regions["boss"] = union([line["cellRect"] for line in unit["lines"]])
        elif "ex_monster_m_11.png" in sheets:
            monsters.append(unit)
    if len(monsters) >= 2:
        monsters.sort(key=lambda unit: (unit["rootRect"]["y"], unit["rootRect"]["x"]))
        first, second = monsters[0], monsters[1]
        regions["pair"] = union(
            [line["cellRect"] for line in first["lines"]] + [line["cellRect"] for line in second["lines"]]
        )
    return regions


def union(rects: list[dict]) -> dict:
    x0 = min(r["x"] for r in rects)
    y0 = min(r["y"] for r in rects)
    x1 = max(r["x"] + r["w"] for r in rects)
    y1 = max(r["y"] + r["h"] for r in rects)
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--zoom", type=int, default=3)
    ap.add_argument("--pad", type=int, default=4, help="logical/scene padding in displayed pixels")
    ap.add_argument(
        "--region",
        default=None,
        help="fixed logical-scene rect 'x,y,w,h' cut from every case (comparable across builds)",
    )
    args = ap.parse_args()

    root = Path(args.dir).resolve()
    data = json.loads((root / "integration.json").read_text(encoding="utf-8"))
    out_dir = root / "shots" / "zoom"
    out_dir.mkdir(parents=True, exist_ok=True)
    fixed = [int(value) for value in args.region.split(",")] if args.region else None

    written = []
    for case in data["cases"]:
        probe = case["probe"]
        host = probe["host"]
        shot = root / case["screenshot"]
        if not shot.exists():
            continue
        image = Image.open(shot).convert("RGBA")
        if fixed:
            scale = probe["scene"]["rect"]["w"] / 481
            # the presentation applies the native 196/192 vertical stretch, so a fixed logical
            # region maps to pixels with the Y scale, not with the X scale
            scale_y = probe["scene"].get("scaleY") or scale
            scene = probe["scene"]["rect"]
            x, y, w, h = fixed
            regions = {
                f"region-{x}-{y}-{w}-{h}": {
                    "x": scene["x"] + x * scale,
                    "y": scene["y"] + y * scale_y,
                    "w": w * scale,
                    "h": h * scale_y,
                }
            }
        else:
            regions = pick_units(probe)
        for name, rect in regions.items():
            if not rect:
                continue
            left = max(0, int(rect["x"] - host["x"]) - args.pad)
            top = max(0, int(rect["y"] - host["y"]) - args.pad)
            right = min(image.width, int(rect["x"] - host["x"] + rect["w"]) + args.pad)
            bottom = min(image.height, int(rect["y"] - host["y"] + rect["h"]) + args.pad)
            if right <= left or bottom <= top:
                continue
            crop = image.crop((left, top, right, bottom))
            zoomed = crop.resize((crop.width * args.zoom, crop.height * args.zoom), Image.NEAREST)
            target = out_dir / f"zoom-{case['width']}-{case['toggleState']}-{name}.png"
            zoomed.save(target)
            written.append(f"{target.name} {rect['w']:.1f}x{rect['h']:.1f} -> {zoomed.width}x{zoomed.height}")
    print(f"{len(written)} crops in {out_dir}")
    for line in written:
        print(f"  {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
