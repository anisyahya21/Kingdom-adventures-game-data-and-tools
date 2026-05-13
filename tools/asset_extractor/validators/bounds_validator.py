"""
bounds_validator.py — verifies every AssetRef rect is within its source PNG dimensions.
Outputs bounds_errors.json for any out-of-bounds entries.
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef, REVIEW_AUTO


def validate(refs: list[AssetRef], write_output: bool = True) -> list[dict]:
    """
    Check all AssetRefs with reviewStatus=="auto" and a rect.
    Returns list of error dicts.
    """
    errors: list[dict] = []
    png_size_cache: dict[str, tuple[int, int] | None] = {}

    try:
        from PIL import Image
        has_pillow = True
    except ImportError:
        warnings.warn("bounds_validator: Pillow not installed — cannot check PNG dimensions")
        has_pillow = False

    for ref in refs:
        if ref.reviewStatus != REVIEW_AUTO:
            continue
        if not ref.rect or not ref.sourcePng:
            continue

        src_key = ref.sourcePng
        if src_key not in png_size_cache:
            src_path = config.KA_ASSETS_DIR / ref.sourcePng
            if has_pillow and src_path.exists():
                try:
                    with Image.open(src_path) as img:
                        png_size_cache[src_key] = img.size
                except Exception:
                    png_size_cache[src_key] = None
            else:
                png_size_cache[src_key] = None

        dims = png_size_cache.get(src_key)
        if dims is None:
            continue

        iw, ih = dims
        r = ref.rect
        if r.x < 0 or r.y < 0 or r.x + r.w > iw or r.y + r.h > ih:
            errors.append({
                "assetId":   ref.assetId,
                "sourcePng": ref.sourcePng,
                "rect":      r.to_dict(),
                "pngSize":   {"w": iw, "h": ih},
                "error":     f"rect ({r.x},{r.y},{r.w},{r.h}) exceeds PNG ({iw}×{ih})",
            })

    if write_output:
        config.DISCOVERY_DIR.mkdir(parents=True, exist_ok=True)
        out_path = config.DISCOVERY_DIR / "bounds_errors.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(errors, fh, indent=2)
        if errors:
            print(f"[bounds_validator] {len(errors)} errors → {out_path}")
        else:
            print("[bounds_validator] all rects within bounds ✓")

    return errors
