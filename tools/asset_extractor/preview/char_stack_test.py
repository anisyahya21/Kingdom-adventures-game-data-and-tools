"""
char_stack_test.py — V6 visual validation.

For 3 sample jobs, stacks all resolved body-part sprites in layer order:
  body(0) → feet(1) → hands(2) → head(3) → hair(4) → weapon(5) → shield(6)

Uses rank index 0 (D-grade) for each part.
All layers anchored at (0,0) — no pivot offsets in Phase 1.
Output: generated/previews/char_stack_test/{jobName}_stack.png
"""

from __future__ import annotations
import warnings
import json
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef, LAYER_ORDER

SAMPLE_JOB_COUNT = 3
CANVAS_W = 200
CANVAS_H = 240
PANEL_W  = 80   # per-layer panel width in the side-by-side strip
LAYER_ORDER_LIST = ["body", "feet", "shoes", "hands", "hand", "head", "hair", "weapon", "shield"]


def _get_sprite_img(ref: AssetRef):
    """Returns a Pillow Image for this ref's sprite, or None."""
    try:
        from PIL import Image
        if not ref.sourcePng or not ref.rect:
            return None
        src = config.KA_ASSETS_DIR / ref.sourcePng
        if not src.exists():
            return None
        r = ref.rect
        with Image.open(src) as img:
            return img.crop((r.x, r.y, r.x + r.w, r.y + r.h)).convert("RGBA")
    except Exception:
        return None


def _placeholder(w: int, h: int, label: str, color=(80, 80, 80)):
    try:
        from PIL import Image, ImageDraw, ImageFont
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, w - 1, h - 1], outline=color)
        try:
            font = ImageFont.truetype("arial.ttf", 9)
        except Exception:
            font = ImageFont.load_default()
        draw.text((2, h // 2 - 5), label[:10], fill=(150, 150, 150), font=font)
        return img
    except Exception:
        return None


def render_char_stacks(refs: list[AssetRef]) -> list[Path]:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        warnings.warn("char_stack_test: Pillow not installed")
        return []

    config.CHARSTACK_DIR.mkdir(parents=True, exist_ok=True)

    # Load job data to get sample job names
    jobs_sample: list[dict] = []
    try:
        from parsers.csv_parser import load_jobs
        all_jobs = load_jobs(config.CSV_JOB)
        jobs_sample = all_jobs[:SAMPLE_JOB_COUNT]
    except Exception as e:
        warnings.warn(f"char_stack_test: cannot load jobs: {e}")
        jobs_sample = [{"id": 0, "name": "Job_0"}, {"id": 1, "name": "Job_1"}, {"id": 2, "name": "Job_2"}]

    # Build lookup: category -> list[AssetRef]
    refs_by_cat: dict[str, list[AssetRef]] = {}
    for r in refs:
        refs_by_cat.setdefault(r.category, []).append(r)

    written: list[Path] = []

    try:
        font_small = ImageFont.truetype("arial.ttf", 9)
    except Exception:
        font_small = ImageFont.load_default()

    for job in jobs_sample:
        job_name = job.get("name", f"job_{job.get('id', 0)}")
        safe_name = job_name.replace(" ", "_").replace("/", "_")

        # Collect one ref per layer (first available for this job)
        layers: dict[str, Optional[AssetRef]] = {layer: None for layer in LAYER_ORDER_LIST}

        # Simple strategy: take the first ref in each category
        # (Phase 2 will refine with proper job→img linking)
        for layer in LAYER_ORDER_LIST:
            cat_refs = refs_by_cat.get(layer, [])
            if cat_refs:
                layers[layer] = cat_refs[job.get("id", 0) % max(1, len(cat_refs))]

        # --- Composite stack ---
        composite = Image.new("RGBA", (CANVAS_W, CANVAS_H), (30, 30, 50, 255))
        draw_comp = ImageDraw.Draw(composite)

        for layer_name in LAYER_ORDER_LIST:
            ref = layers.get(layer_name)
            sprite = _get_sprite_img(ref) if ref else None

            if sprite:
                # Center the sprite in the canvas
                ox = (CANVAS_W - sprite.width) // 2
                oy = (CANVAS_H - sprite.height) // 2
                composite.paste(sprite, (ox, oy), sprite)
            # Unresolved layers are simply skipped (gap in composite)

        comp_path = config.CHARSTACK_DIR / f"{safe_name}_stack.png"
        composite.save(comp_path, "PNG")
        written.append(comp_path)

        # --- Side-by-side panel strip ---
        n_layers = len(LAYER_ORDER_LIST)
        strip_w = PANEL_W * n_layers
        strip_h = CANVAS_H + 30
        strip = Image.new("RGBA", (strip_w, strip_h), (20, 20, 30, 255))
        draw_strip = ImageDraw.Draw(strip)

        for li, layer_name in enumerate(LAYER_ORDER_LIST):
            ref = layers.get(layer_name)
            sprite = _get_sprite_img(ref) if ref else None
            ox = li * PANEL_W

            # Background cell
            draw_strip.rectangle([ox, 0, ox + PANEL_W - 1, CANVAS_H - 1], outline=(50, 50, 70))

            if sprite:
                px = ox + (PANEL_W - sprite.width) // 2
                py = (CANVAS_H - sprite.height) // 2
                strip.paste(sprite, (px, py), sprite)
            else:
                ph = _placeholder(PANEL_W - 4, 40, layer_name)
                if ph:
                    strip.paste(ph, (ox + 2, CANVAS_H // 2 - 20), ph)

            # Layer label
            draw_strip.text((ox + 2, CANVAS_H + 5), layer_name[:8], fill=(160, 160, 180), font=font_small)
            if not sprite:
                draw_strip.text((ox + 2, CANVAS_H + 16), "missing", fill=(180, 80, 80), font=font_small)

        strip_path = config.CHARSTACK_DIR / f"{safe_name}_layers.png"
        strip.save(strip_path, "PNG")
        written.append(strip_path)

    print(f"[char_stack_test] {len(jobs_sample)} jobs → {len(written)} images → {config.CHARSTACK_DIR}")
    return written
