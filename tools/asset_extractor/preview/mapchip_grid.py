"""
mapchip_grid.py — V5 visual validation.

Renders the first 100 resolved MapChip entries as a 10×10 tile grid PNG.
Purpose: confirms tile sprites render correctly with no offset drift.
Output: generated/previews/mapchip_grid_test.png
"""

from __future__ import annotations
import warnings
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef

GRID_W = 10
GRID_H = 10
MAX_TILES = GRID_W * GRID_H


def render_mapchip_grid(refs: list[AssetRef]) -> Path | None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        warnings.warn("mapchip_grid: Pillow not installed")
        return None

    config.PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

    # Filter to chip category only, resolved only
    chip_refs = [
        r for r in refs
        if r.category == "chip" and r.sourcePng and r.rect
    ][:MAX_TILES]

    if not chip_refs:
        print("[mapchip_grid] no resolved chip refs found — skipping")
        return None

    # Determine tile size from first ref
    sample = chip_refs[0].rect
    tile_w = sample.w if sample else 32
    tile_h = sample.h if sample else 32

    # Grid image
    sheet_w = GRID_W * tile_w
    sheet_h = GRID_H * tile_h
    grid_img = Image.new("RGBA", (sheet_w, sheet_h), (20, 20, 30, 255))
    draw = ImageDraw.Draw(grid_img)

    try:
        font = ImageFont.truetype("arial.ttf", 8)
    except Exception:
        font = ImageFont.load_default()

    for idx, ref in enumerate(chip_refs):
        col = idx % GRID_W
        row = idx // GRID_W
        ox = col * tile_w
        oy = row * tile_h

        src_path = config.KA_ASSETS_DIR / ref.sourcePng
        placed = False
        if src_path.exists() and ref.rect:
            try:
                with Image.open(src_path) as src:
                    r = ref.rect
                    box = (r.x, r.y, r.x + r.w, r.y + r.h)
                    sprite = src.crop(box).convert("RGBA")
                    # Resize to tile_w×tile_h if different
                    if sprite.width != tile_w or sprite.height != tile_h:
                        sprite = sprite.resize((tile_w, tile_h), Image.NEAREST)
                    grid_img.paste(sprite, (ox, oy), sprite)
                    placed = True
            except Exception as e:
                warnings.warn(f"mapchip_grid: error placing {ref.assetId}: {e}")

        if not placed:
            draw.rectangle([ox, oy, ox + tile_w - 1, oy + tile_h - 1], outline=(80, 80, 80))
            draw.text((ox + 2, oy + 2), "?", fill=(100, 100, 100), font=font)

        # Index label in corner
        draw.text((ox + 1, oy + 1), str(idx), fill=(200, 200, 200, 180), font=font)

    out_path = config.PREVIEWS_DIR / "mapchip_grid_test.png"
    grid_img.save(out_path, "PNG")
    print(f"[mapchip_grid] {len(chip_refs)} tiles → {out_path}")
    return out_path
