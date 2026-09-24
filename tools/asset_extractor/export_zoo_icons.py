#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Export the 23 Zoo silver-coin animal icons as clear transparent PNGs.

Rows are the Monster.csv records with ``group=10`` and a positive
``silverPrice`` (ids 146-168, the animals sold in the Zoo for silver coins).

Pixel source: the existing extracted native animal sprites under
``artifacts/kingdom-adventures/public/monster-sprites/<id>.png``. Each of the
23 ids maps 1:1 to one ``all_animal_s_<nn>.png`` sheet (Monster.img 148-170),
so the id-keyed file IS the canonical animal art for that row. Nothing is
re-drawn or re-coloured; the native pixel art is only nearest-neighbour
upscaled by a whole-number factor and centred on a transparent square canvas
so the icons stay crisp instead of blurry when the page scales them up.

Outputs ``<id>.png`` (RGBA, transparent background, 128x128) into
``artifacts/kingdom-adventures/public/zoo-icons``.

Usage (from the repo root):

  python tools/asset_extractor/export_zoo_icons.py
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - Monster.csv"
SPRITES_JSON = REPO_ROOT / "artifacts" / "kingdom-adventures" / "src" / "game-data" / "monster-sprites.json"
SPRITE_DIR = REPO_ROOT / "artifacts" / "kingdom-adventures" / "public" / "monster-sprites"
OUTPUT_DIR = REPO_ROOT / "artifacts" / "kingdom-adventures" / "public" / "zoo-icons"

CANVAS = 128  # square RGBA canvas
PAD = 4  # transparent border kept around the upscaled sprite


def load_zoo_rows() -> list[tuple[int, str]]:
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    selected = [
        (int(row["id"]), row["name"])
        for row in rows
        if row["group"] == "10" and int(row["silverPrice"]) > 0
    ]
    expected = list(range(146, 169))
    ids = [animal_id for animal_id, _ in selected]
    if ids != expected:
        raise ValueError(f"Zoo rows are {ids}, expected {expected}")
    return selected


def upscale(img: Image.Image) -> Image.Image:
    """Nearest-neighbour whole-number upscale onto a transparent square canvas."""
    sprite = img.convert("RGBA")
    bbox = sprite.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("sprite has no opaque pixels")
    sprite = sprite.crop(bbox)

    limit = CANVAS - 2 * PAD
    scale = max(1, min(limit // sprite.width, limit // sprite.height))
    scaled = sprite.resize((sprite.width * scale, sprite.height * scale), Image.NEAREST)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((CANVAS - scaled.width) // 2, (CANVAS - scaled.height) // 2))
    return canvas


def export() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    animals = load_zoo_rows()
    sprites = {entry["id"]: entry for entry in json.loads(SPRITES_JSON.read_text(encoding="utf-8"))}

    for animal_id, name in animals:
        entry = sprites.get(animal_id)
        if entry is None:
            raise ValueError(f"Monster {animal_id} ({name}) is missing from {SPRITES_JSON.name}")
        if entry["name"] != name:
            raise ValueError(f"Monster {animal_id} name mismatch: csv={name!r} sprites={entry['name']!r}")
        if not entry["source"].startswith("all_animal_s_"):
            raise ValueError(f"Monster {animal_id} ({name}) does not use an animal sprite ({entry['source']})")

        source = SPRITE_DIR / f"{animal_id}.png"
        if not source.exists():
            raise FileNotFoundError(f"Missing extracted sprite {source}")

        icon = upscale(Image.open(source))
        icon.save(OUTPUT_DIR / f"{animal_id}.png", "PNG")

    print(f"Wrote {len(animals)} zoo icons to {OUTPUT_DIR}")
    return len(animals)


if __name__ == "__main__":
    raise SystemExit(0 if export() == 23 else 1)
