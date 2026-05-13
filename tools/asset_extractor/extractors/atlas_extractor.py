"""
atlas_extractor.py — extracts sprites from ImageAtlas source PNGs.

Warns if source PNG is absent, does not crash.
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from parsers.atlas_parser import load_all_atlases, AtlasSprite


def extract_all_atlases() -> dict[int, list[dict]]:
    """
    For each ImageAtlas*.txt, find the corresponding source PNG and crop each sprite.
    Returns {atlas_index -> [{"filename": str, "saved_to": str|None}]}
    """
    config.ATLASES_DIR.mkdir(parents=True, exist_ok=True)
    config.SPRITES_DIR.mkdir(parents=True, exist_ok=True)

    atlas_data = load_all_atlases(config.KA_ASSETS_DIR)
    results: dict[int, list[dict]] = {}

    for atlas_idx, sprites in atlas_data.items():
        atlas_results = []
        # Determine source PNG — look for "atlas_{idx}.png", "ImageAtlas{idx}.png", etc.
        source_png = _find_atlas_source_png(atlas_idx)

        for sprite in sprites:
            entry: dict = {
                "filename": sprite.filename,
                "x": sprite.x, "y": sprite.y,
                "w": sprite.w, "h": sprite.h,
                "saved_to": None,
            }
            if source_png is None:
                entry["error"] = "source PNG not found"
            else:
                out_path = _crop_atlas_sprite(source_png, sprite, atlas_idx)
                entry["saved_to"] = str(out_path) if out_path else None
            atlas_results.append(entry)

        results[atlas_idx] = atlas_results

        # Write intermediate JSON
        out_json = config.ATLASES_DIR / f"atlas_{atlas_idx}.json"
        with open(out_json, "w", encoding="utf-8") as fh:
            json.dump(atlas_results, fh, indent=2)
        print(f"  [atlas_{atlas_idx}] {len(atlas_results)} sprites → {out_json.name}")

    return results


def _find_atlas_source_png(atlas_idx: int) -> Path | None:
    """Try common naming conventions for atlas source PNGs."""
    atlas_dir = config.KA_ASSETS_DIR / "image_atlas"
    candidates = [
        atlas_dir / f"ImageAtlas{atlas_idx}.png",
        atlas_dir / f"atlas_{atlas_idx}.png",
        atlas_dir / f"atlas{atlas_idx}.png",
        config.KA_ASSETS_DIR / f"ImageAtlas{atlas_idx}.png",
    ]
    for c in candidates:
        if c.exists():
            return c

    warnings.warn(f"atlas_extractor: source PNG not found for atlas index {atlas_idx}")
    return None


def _crop_atlas_sprite(
    source_png: Path,
    sprite: AtlasSprite,
    atlas_idx: int,
) -> Path | None:
    try:
        from PIL import Image
        with Image.open(source_png) as img:
            iw, ih = img.size
            box = (sprite.x, sprite.y, sprite.x + sprite.w, sprite.y + sprite.h)
            if sprite.x < 0 or sprite.y < 0 or sprite.x + sprite.w > iw or sprite.y + sprite.h > ih:
                warnings.warn(f"atlas_extractor: rect {box} out of bounds ({iw}×{ih}) for {sprite.filename}")
                return None
            cropped = img.crop(box)

        stem = Path(sprite.filename).stem
        out_dir = config.SPRITES_DIR / f"atlas_{atlas_idx}"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{stem}.png"
        cropped.save(out_path, "PNG")
        return out_path
    except Exception as e:
        warnings.warn(f"atlas_extractor: error cropping {sprite.filename}: {e}")
        return None
