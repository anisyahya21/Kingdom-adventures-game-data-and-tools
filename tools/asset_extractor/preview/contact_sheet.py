"""
contact_sheet.py — V2 visual validation.

Extracts all sprites per category and composites them into a labeled grid PNG.
Each cell: sprite (zoomed 2-4x if < 32px wide) + spriteName + dimensions + CSV name if linked.
Priority categories: chip, weapon, monster, building, body.
Output: generated/previews/sheets/{category}_sheet.png
"""

from __future__ import annotations
import warnings
from pathlib import Path
from typing import Optional
import math

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef

CELL_PADDING = 4
LABEL_HEIGHT = 28
GRID_COLS = 10


def _zoom_for(w: int, h: int) -> int:
    """Return zoom factor so sprites are at least 32px wide."""
    if w <= 0 or h <= 0:
        return 1
    if w < 16:
        return 4
    if w < 32:
        return 2
    return 1


def render_contact_sheets(
    refs: list[AssetRef],
    categories: Optional[list[str]] = None,
) -> list[Path]:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        warnings.warn("contact_sheet: Pillow not installed")
        return []

    config.SHEETS_DIR.mkdir(parents=True, exist_ok=True)

    # Group refs by category
    by_cat: dict[str, list[AssetRef]] = {}
    for ref in refs:
        if categories and ref.category not in categories:
            continue
        if ref.sourcePng is None or ref.rect is None:
            continue
        by_cat.setdefault(ref.category, []).append(ref)

    try:
        font = ImageFont.truetype("arial.ttf", 9)
    except Exception:
        font = ImageFont.load_default()

    written: list[Path] = []

    # Max rendered cell dimension in pixels (before zoom).
    # Larger sprites are thumbnailed down to fit.
    MAX_CELL_DIM = 128
    MAX_SAMPLE = 200  # max refs per category to keep sheet sizes sane

    for cat, cat_refs in sorted(by_cat.items()):
        # Filter zero-size rects
        cat_refs = [r for r in cat_refs if r.rect and r.rect.w > 0 and r.rect.h > 0]
        if not cat_refs:
            continue

        # Sample: prefer diverse source PNGs
        if len(cat_refs) > MAX_SAMPLE:
            step = len(cat_refs) / MAX_SAMPLE
            cat_refs = [cat_refs[int(i * step)] for i in range(MAX_SAMPLE)]

        # Clamp displayed cell size
        max_w = min(MAX_CELL_DIM, max((r.rect.w for r in cat_refs), default=60))
        max_h = min(MAX_CELL_DIM, max((r.rect.h for r in cat_refs), default=60))
        zoom = _zoom_for(max_w, max_h)
        cell_w = max_w * zoom + CELL_PADDING * 2
        cell_h = max_h * zoom + CELL_PADDING * 2 + LABEL_HEIGHT

        n = len(cat_refs)
        cols = min(GRID_COLS, n)
        rows = math.ceil(n / cols)

        sheet_w = cols * cell_w
        sheet_h = rows * cell_h

        try:
            sheet = Image.new("RGBA", (sheet_w, sheet_h), (30, 30, 40, 255))
        except (MemoryError, Exception) as e:
            warnings.warn(f"contact_sheet: cannot allocate {sheet_w}x{sheet_h} for {cat}: {e}")
            continue
        draw = ImageDraw.Draw(sheet)

        for idx, ref in enumerate(cat_refs):
            col = idx % cols
            row = idx // cols
            ox = col * cell_w + CELL_PADDING
            oy = row * cell_h + CELL_PADDING

            # Load and crop sprite, then thumbnail to MAX_CELL_DIM
            src_path = config.KA_ASSETS_DIR / ref.sourcePng
            sprite_img: Optional[Image.Image] = None
            if src_path.exists() and ref.rect:
                try:
                    with Image.open(src_path) as src:
                        r = ref.rect
                        iw, ih = src.size
                        bx1 = max(0, r.x);  by1 = max(0, r.y)
                        bx2 = min(iw, r.x + r.w); by2 = min(ih, r.y + r.h)
                        if bx2 > bx1 and by2 > by1:
                            sprite_img = src.crop((bx1, by1, bx2, by2)).convert("RGBA")
                except Exception:
                    pass

            if sprite_img:
                # Thumbnail to cell size (preserves aspect ratio)
                sprite_img.thumbnail((max_w * zoom, max_h * zoom), Image.NEAREST)
                sheet.paste(sprite_img, (ox, oy), sprite_img)
            else:
                draw.rectangle(
                    [ox, oy, ox + max_w * zoom - 1, oy + max_h * zoom - 1],
                    outline=(100, 100, 100),
                )
                draw.text((ox + 2, oy + 2), "?", fill=(150, 150, 150), font=font)

            # Labels
            label_y = oy + max_h * zoom + 2
            name = ref.spriteName
            if len(name) > 14:
                name = name[:13] + "\u2026"
            draw.text((ox, label_y), name, fill=(200, 200, 200), font=font)

            if ref.rect:
                size_label = f"{ref.rect.w}\u00d7{ref.rect.h}"
                draw.text((ox, label_y + 11), size_label, fill=(120, 180, 120), font=font)

            csv_names = (
                ref.gameDataLinks.get("mapchipNames")
                or ref.gameDataLinks.get("monsterNames")
                or ref.gameDataLinks.get("houseNames")
                or ref.gameDataLinks.get("itemNames")
            )
            if csv_names:
                csv_label = csv_names[0][:14]
                draw.text((ox, label_y + 20), csv_label, fill=(180, 160, 80), font=font)

        out_path = config.SHEETS_DIR / f"{cat}_sheet.png"
        sheet.save(out_path, "PNG")
        written.append(out_path)

    print(f"[contact_sheet] wrote {len(written)} contact sheets → {config.SHEETS_DIR}")
    return written
