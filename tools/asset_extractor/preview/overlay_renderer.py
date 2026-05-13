"""
overlay_renderer.py — V1 visual validation.

For every category PNG that has a parsed .opt, draws colored bounding-box rects
and {u},{v} index labels directly on top of the original PNG using Pillow ImageDraw.

This is the primary .opt correctness check: wrong boxes = wrong binary format assumption.
Output: generated/previews/overlays/{category}_{pngname}_overlay.png
"""

from __future__ import annotations
import warnings
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef

# Color cycle for different sprites (RGB)
RECT_COLORS = [
    (255, 80,  80),   # red
    (80,  200, 80),   # green
    (80,  120, 255),  # blue
    (255, 200, 50),   # yellow
    (200, 80,  255),  # purple
    (80,  220, 220),  # cyan
    (255, 140, 50),   # orange
]


def render_overlays(refs: list[AssetRef], categories: Optional[list[str]] = None) -> list[Path]:
    """
    Render bounding-box overlays for all (or specified) categories.
    Returns list of output paths written.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        warnings.warn("overlay_renderer: Pillow not installed")
        return []

    config.OVERLAYS_DIR.mkdir(parents=True, exist_ok=True)

    # Group refs by (category, sourcePng)
    by_sheet: dict[tuple[str, str], list[AssetRef]] = {}
    for ref in refs:
        if ref.sourcePng is None or ref.rect is None:
            continue
        if categories and ref.category not in categories:
            continue
        key = (ref.category, ref.sourcePng)
        by_sheet.setdefault(key, []).append(ref)

    written: list[Path] = []

    for (cat, src_rel), sheet_refs in sorted(by_sheet.items()):
        src_path = config.KA_ASSETS_DIR / src_rel
        if not src_path.exists():
            warnings.warn(f"overlay_renderer: source PNG not found: {src_path}")
            continue

        try:
            with Image.open(src_path) as img:
                overlay = img.convert("RGBA")
        except Exception as e:
            warnings.warn(f"overlay_renderer: cannot open {src_path}: {e}")
            continue

        draw = ImageDraw.Draw(overlay)

        # Try to load a small font; fall back to default
        try:
            font = ImageFont.truetype("arial.ttf", 10)
        except Exception:
            font = ImageFont.load_default()

        for i, ref in enumerate(sheet_refs):
            r = ref.rect
            if r.w <= 0 or r.h <= 0:
                continue  # skip zero-size rects from truncated .opt files
            color = RECT_COLORS[i % len(RECT_COLORS)]
            # Draw rect outline (2px)
            draw.rectangle([r.x, r.y, r.x + r.w - 1, r.y + r.h - 1], outline=color, width=2)
            # Label at top-left corner
            label = f"{r.x},{r.y}"
            if ref.atlasCoords:
                label = f"u{ref.atlasCoords.u},v{ref.atlasCoords.v}"
            # Small background for readability
            draw.rectangle([r.x, r.y, r.x + len(label) * 6, r.y + 11], fill=(0, 0, 0, 160))
            draw.text((r.x + 1, r.y + 1), label, fill=color, font=font)

        stem = Path(src_rel).stem
        out_path = config.OVERLAYS_DIR / f"{cat}_{stem}_overlay.png"
        overlay.save(out_path, "PNG")
        written.append(out_path)

    print(f"[overlay_renderer] wrote {len(written)} overlay PNGs → {config.OVERLAYS_DIR}")
    return written
