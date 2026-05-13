"""
sprite_extractor.py — crops PNG sprites from source sheets using AssetRef rects.

Uses Pillow. Skips refs with reviewStatus != "auto" (emits a warning instead of crashing).
"""

from __future__ import annotations
import warnings
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef, REVIEW_AUTO


def _get_out_path(ref: AssetRef) -> Path:
    """Returns the output path for a cropped sprite PNG."""
    return config.SPRITES_DIR / ref.category / f"{ref.assetId}.png"


def extract_sprite(ref: AssetRef, force: bool = False) -> Optional[Path]:
    """
    Crop and save one sprite.
    Returns output path on success, None if skipped.
    """
    if ref.reviewStatus != REVIEW_AUTO and not force:
        warnings.warn(
            f"sprite_extractor: skipping {ref.assetId} (reviewStatus={ref.reviewStatus})"
        )
        return None

    if not ref.sourcePng or not ref.rect:
        warnings.warn(f"sprite_extractor: no sourcePng or rect for {ref.assetId}")
        return None

    src = config.KA_ASSETS_DIR / ref.sourcePng
    if not src.exists():
        warnings.warn(f"sprite_extractor: source PNG not found: {src}")
        return None

    try:
        from PIL import Image
        r = ref.rect
        # Skip zero-size rects (come from truncated .opt files)
        if r.w == 0 or r.h == 0:
            return None
        with Image.open(src) as img:
            iw, ih = img.size
            box = (r.x, r.y, r.x + r.w, r.y + r.h)
            # If opt rect is out of bounds, fall back to the whole PNG.
            # This happens for categories where each PNG is a single sprite
            # (e.g. body/, shoes/) and the opt stores virtual game coordinates.
            if r.x < 0 or r.y < 0 or r.x + r.w > iw or r.y + r.h > ih:
                box = (0, 0, iw, ih)
            cropped = img.crop(box)

        out_path = _get_out_path(ref)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(out_path, "PNG")
        return out_path
    except Exception as e:
        warnings.warn(f"sprite_extractor: error extracting {ref.assetId}: {e}")
        return None


def extract_all(refs: list[AssetRef], force: bool = False) -> dict[str, int]:
    """
    Extract all sprites. Returns counts: {ok, skipped, error}.
    """
    ok = skipped = error = 0
    for ref in refs:
        if ref.reviewStatus != REVIEW_AUTO and not force:
            skipped += 1
            continue
        # Skip zero-size rects from truncated .opt files
        if ref.rect and (ref.rect.w == 0 or ref.rect.h == 0):
            skipped += 1
            continue
        result = extract_sprite(ref, force=force)
        if result is not None:
            ok += 1
        else:
            error += 1
    return {"ok": ok, "skipped": skipped, "error": error}
