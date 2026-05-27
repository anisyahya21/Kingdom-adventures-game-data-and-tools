#!/usr/bin/env python
"""Summarize shadow renderer OPT metadata from the Desktop KA_assets copy."""

from __future__ import annotations

import collections
import json
from pathlib import Path

from analyze_renderer_reference_files import parse_opt


ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ASSETS = Path("c:/Users/anisb/OneDrive/Desktop/KA_assets")
SHADOW_DIR = DESKTOP_ASSETS / "shadow"
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"
JSON_OUT = OUT_DIR / "shadow_renderer_evidence_2026-05-15.json"


def read_text(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8", errors="replace").splitlines() if path.exists() else []


def image_size(path: Path) -> list[int] | None:
    try:
        from PIL import Image
        with Image.open(path) as image:
            return [image.width, image.height]
    except Exception:
        return None


def main() -> int:
    opt = parse_opt(SHADOW_DIR / "shadow.opt")
    non_empty = [slot for slot in opt["slots"] if not slot.get("empty")]
    repeated_shapes = collections.Counter(
        (
            slot.get("destX"),
            slot.get("destY"),
            slot.get("srcX"),
            slot.get("srcY"),
            slot.get("width"),
            slot.get("height"),
        )
        for slot in non_empty
    )

    evidence = {
        "imgInf": read_text(SHADOW_DIR / "img.inf"),
        "optinfo": read_text(SHADOW_DIR / "shadow.optinfo"),
        "optimizeInf": read_text(SHADOW_DIR / "optimize_24x30.inf"),
        "pngSize": image_size(SHADOW_DIR / "shadow.png"),
        "opt": opt,
        "nonEmptySlotCount": len(non_empty),
        "repeatedShapes": [
            {
                "destX": shape[0],
                "destY": shape[1],
                "srcX": shape[2],
                "srcY": shape[3],
                "width": shape[4],
                "height": shape[5],
                "count": count,
            }
            for shape, count in sorted(repeated_shapes.items())
        ],
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    print(f"wrote {JSON_OUT}")
    print(
        f"shadow.opt: cell={opt['cellW']}x{opt['cellH']} grid={opt['cols']}x{opt['rows']} "
        f"slots={len(opt['slots'])} nonEmpty={len(non_empty)} size={opt['size']} parsed={opt['parsedBytes']} trailing={opt['trailingBytes']}"
    )
    print(f"shadow.png size: {evidence['pngSize']}")
    print("Slots:")
    for slot in non_empty:
        print(
            f"  slot {slot['slot']}: dest=({slot['destX']},{slot['destY']}) "
            f"src=({slot['srcX']},{slot['srcY']}) size={slot['width']}x{slot['height']}"
        )
    print("Repeated shapes:")
    for item in evidence["repeatedShapes"]:
        print(
            f"  dest=({item['destX']},{item['destY']}) src=({item['srcX']},{item['srcY']}) "
            f"size={item['width']}x{item['height']} count={item['count']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())