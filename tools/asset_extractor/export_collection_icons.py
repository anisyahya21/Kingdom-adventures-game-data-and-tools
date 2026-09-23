#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Export the 60 collection icons from the native sprite sheets.

Source of truth: data/sheet-research/raw-copies/KA GameData - Collection.csv
Each row selects a cell via (category, iconU, iconV):

  category 0 -> artifact kingdom-adventures/tmp/KA_assets/com/icon_insect.png
                10x2 grid of 20x20 cells
  category 1 -> .../icon_fish.png
                10x2 grid of 24x24 cells
  category 2 -> .../icon_art.png
                10x2 grid of 20x32 cells

Outputs <id>.png (RGBA, transparent background) into
artifacts/kingdom-adventures/public/collection-icons.

Usage (from the repo root):

  python tools/asset_extractor/export_collection_icons.py
"""

from __future__ import annotations

import csv
from pathlib import Path

from PIL import Image


REPO_ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - Collection.csv"
ASSET_DIR = REPO_ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets" / "com"
OUTPUT_DIR = REPO_ROOT / "artifacts" / "kingdom-adventures" / "public" / "collection-icons"

# category -> (sheet filename, cell width, cell height)
CATEGORY_SHEETS: dict[int, tuple[str, int, int]] = {
    0: ("icon_insect.png", 20, 20),
    1: ("icon_fish.png", 24, 24),
    2: ("icon_art.png", 20, 32),
}


def load_rows() -> list[dict[str, str]]:
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def export() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = load_rows()
    sheets: dict[int, Image.Image] = {}
    for category, (filename, _w, _h) in CATEGORY_SHEETS.items():
        sheets[category] = Image.open(ASSET_DIR / filename).convert("RGBA")

    written = 0
    for row in rows:
        item_id = int(row["id"])
        category = int(row["category"])
        if category not in CATEGORY_SHEETS:
            raise ValueError(f"Collection item {item_id} has unknown category {category}")

        _filename, cell_w, cell_h = CATEGORY_SHEETS[category]
        sheet = sheets[category]
        if sheet.width % cell_w or sheet.height % cell_h:
            raise ValueError(f"Sheet for category {category} does not tile into {cell_w}x{cell_h} cells")

        icon_u = int(row["iconU"])
        icon_v = int(row["iconV"])
        left = icon_u * cell_w
        top = icon_v * cell_h
        if left + cell_w > sheet.width or top + cell_h > sheet.height:
            raise ValueError(f"Item {item_id} cell (u={icon_u}, v={icon_v}) is out of bounds")

        cell = sheet.crop((left, top, left + cell_w, top + cell_h))
        cell.save(OUTPUT_DIR / f"{item_id}.png", "PNG")
        written += 1

    print(f"Wrote {written} collection icons to {OUTPUT_DIR}")
    return written


if __name__ == "__main__":
    raise SystemExit(0 if export() == 60 else 1)
