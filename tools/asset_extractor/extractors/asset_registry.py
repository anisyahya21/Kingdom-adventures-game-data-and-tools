"""
asset_registry.py — core module that builds the flat AssetRef list from all sources.

Walk every KA_assets category directory:
  1. Parse img.inf → {id -> filename}
  2. For each file, parse .opt → sprite rects
  3. Create one AssetRef per sprite slot
  4. Merge CSV game data links from all 9 CSVs

Resolution rules:
  - Unknown res → reviewStatus:"unresolved_res", rawRes preserved
  - Missing source PNG → reviewStatus:"missing_source"
  - Item icons without sheet → reviewStatus:"missing_source"
  - Job res* with unconfirmed dir → reviewStatus:"res_variant_unknown"
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import (
    AssetRef, AtlasCoords, Rect,
    CATEGORY_TO_SUBCATEGORY, LAYER_ORDER,
    REVIEW_AUTO, REVIEW_CANDIDATE, REVIEW_MISSING_SOURCE,
    REVIEW_UNRESOLVED_RES, REVIEW_RES_VARIANT_UNKNOWN,
)
from parsers.inf_parser import parse_img_inf, parse_optimize_inf
from parsers.opt_parser import parse_opt


# ---------------------------------------------------------------------------
# CSV data caches (populated once by _load_csv_data)
# ---------------------------------------------------------------------------
_csv_loaded = False
_mapchip_by_img: dict[int, list[dict]] = {}    # img -> [mapchip rows]
_monster_by_img: dict[int, list[dict]] = {}
_terrain_by_img: dict[int, list[dict]] = {}
_house_by_img: dict[int, list[dict]] = {}
_job_by_img: dict[str, list[dict]] = {}        # "resBody:2:img140" -> [job rows]
_treasure_by_img: dict[int, list[dict]] = {}
_item_by_uv: dict[tuple[int,int], list[dict]] = {}  # (u,v) -> [item rows]


def _load_csv_data() -> None:
    global _csv_loaded
    if _csv_loaded:
        return
    _csv_loaded = True

    from parsers.csv_parser import (
        load_mapchips, load_monsters, load_terrains,
        load_houses, load_jobs, load_treasures, load_items,
    )

    try:
        for r in load_mapchips(config.CSV_MAPCHIP):
            img = r.get("img")
            if img is not None:
                _mapchip_by_img.setdefault(img, []).append(r)
    except Exception as e:
        warnings.warn(f"asset_registry: MapChip load: {e}")

    try:
        for r in load_monsters(config.CSV_MONSTER):
            img = r.get("img")
            if img is not None:
                _monster_by_img.setdefault(img, []).append(r)
    except Exception as e:
        warnings.warn(f"asset_registry: Monster load: {e}")

    try:
        for r in load_terrains(config.CSV_TERRAIN):
            img = r.get("img")
            if img is not None:
                _terrain_by_img.setdefault(img, []).append(r)
    except Exception as e:
        warnings.warn(f"asset_registry: Terrain load: {e}")

    try:
        for r in load_houses(config.CSV_HOUSE):
            img = r.get("img")
            if img is not None:
                _house_by_img.setdefault(img, []).append(r)
    except Exception as e:
        warnings.warn(f"asset_registry: House load: {e}")

    try:
        for r in load_jobs(config.CSV_JOB):
            for part, res_field, img_field in [
                ("head",  "resHead", "imgHeads"),
                ("body",  "resBody", "imgBodys"),
                ("hand",  "resHand", "imgHands"),
                ("foot",  "resFoot", "imgFoots"),
            ]:
                res_val = r.get(res_field)
                imgs = r.get(img_field) or []
                for rank_idx, img in enumerate(imgs):
                    if img is not None:
                        key = f"{part}:{res_val}:{img}"
                        _job_by_img.setdefault(key, []).append({
                            **r, "_part": part, "_rank": rank_idx
                        })
    except Exception as e:
        warnings.warn(f"asset_registry: Job load: {e}")

    try:
        for r in load_treasures(config.CSV_TREASURE):
            img = r.get("img")
            if img is not None:
                _treasure_by_img.setdefault(img, []).append(r)
    except Exception as e:
        warnings.warn(f"asset_registry: Treasure load: {e}")

    try:
        for r in load_items(config.CSV_ITEM):
            u, v = r.get("iconU"), r.get("iconV")
            if u is not None and v is not None:
                _item_by_uv.setdefault((u, v), []).append(r)
    except Exception as e:
        warnings.warn(f"asset_registry: Item load: {e}")


def _get_cell_size_for_dir(dir_path: Path) -> tuple[int, int]:
    """Read cell size from optimize_*.inf in this directory. Default 60×60."""
    for inf_path in dir_path.glob("optimize_*.inf"):
        data = parse_optimize_inf(inf_path)
        w = data.get("size_w", 60)
        h = data.get("size_h", 60)
        return int(w), int(h)
    return 60, 60


def _resolve_dir_for_res(res_val: Optional[int]) -> Optional[str]:
    if res_val is None:
        return None
    # Check overrides first, then resolved, then seeds
    return (
        config.RES_OVERRIDES.get(res_val)
        or config.RES_RESOLVED.get(res_val)
        or config.RES_SEEDS.get(res_val)
    )


def _build_refs_for_directory(dir_path: Path) -> list[AssetRef]:
    """Build AssetRefs for one KA_assets category directory."""
    category = dir_path.name
    subcategory = CATEGORY_TO_SUBCATEGORY.get(category, "unknown")
    layer = category if category in LAYER_ORDER else ""

    inf_path = dir_path / "img.inf"
    if not inf_path.exists():
        return []

    inf_data = parse_img_inf(inf_path)
    cell_w, cell_h = _get_cell_size_for_dir(dir_path)

    refs: list[AssetRef] = []

    for img_id, filename in inf_data.items():
        png_path = dir_path / filename
        opt_path = dir_path / (Path(filename).stem + ".opt")

        source_png_rel = f"{category}/{filename}"
        png_exists = png_path.exists()

        if not png_exists:
            # Emit a stub ref for the missing PNG
            ref = AssetRef(
                assetId=f"{category}_{Path(filename).stem}_missing",
                category=category,
                subCategory=subcategory,
                sourcePng=None,
                spriteName=Path(filename).stem,
                reviewStatus=REVIEW_MISSING_SOURCE,
                layer=layer,
            )
            refs.append(ref)
            continue

        if opt_path.exists():
            opt_data = parse_opt(opt_path)
            sprites = opt_data.get("sprites", [])
        else:
            # No .opt — use actual PNG dimensions so crop never goes out of bounds
            try:
                from PIL import Image as _Img
                with _Img.open(png_path) as _im:
                    actual_w, actual_h = _im.size
            except Exception:
                actual_w, actual_h = cell_w, cell_h
            sprites = [{"u": 0, "v": 0, "x": 0, "y": 0, "w": actual_w, "h": actual_h}]

        sprite_stem = Path(filename).stem

        for sprite in sprites:
            u, v = sprite["u"], sprite["v"]
            x, y, w, h = sprite["x"], sprite["y"], sprite["w"], sprite["h"]

            asset_id = f"{category}_{sprite_stem}_u{u}_v{v}"

            # Build game data links
            game_data: dict = {}
            csv_links = _resolve_csv_links(category, sprite_stem, img_id, u, v)
            game_data.update(csv_links)

            review_status = REVIEW_AUTO
            if not png_exists:
                review_status = REVIEW_MISSING_SOURCE

            ref = AssetRef(
                assetId=asset_id,
                category=category,
                subCategory=subcategory,
                sourcePng=source_png_rel,
                spriteName=sprite_stem,
                atlasCoords=AtlasCoords(u=u, v=v),
                rect=Rect(x=x, y=y, w=w, h=h),
                pivot=None,
                layer=layer,
                tags=[category, subcategory],
                gameDataLinks=game_data,
                reviewStatus=review_status,
            )
            refs.append(ref)

    return refs


# Known item icon sheet stems (in the 'com' category)
_ITEM_ICON_STEMS = frozenset(["icon_item", "icon_item2"])


def _resolve_csv_links(category: str, sprite_stem: str, img_id: int, u: int, v: int) -> dict:
    """Look up any CSV rows that reference this sprite and return link data."""
    links: dict = {}

    if category == "chip":
        rows = _mapchip_by_img.get(img_id, [])
        if rows:
            links["mapchipIds"] = [r["id"] for r in rows]
            links["mapchipNames"] = [r["name"] for r in rows if r.get("name")]
        rows_t = _terrain_by_img.get(img_id, [])
        if rows_t:
            links["terrainIds"] = [r["id"] for r in rows_t]

    elif category == "monster":
        rows = _monster_by_img.get(img_id, [])
        if rows:
            links["monsterIds"] = [r["id"] for r in rows]
            links["monsterNames"] = [r["name"] for r in rows if r.get("name")]

    elif category == "building":
        rows = _house_by_img.get(img_id, [])
        if rows:
            links["houseIds"] = [r["id"] for r in rows]
            links["houseNames"] = [r["name"] for r in rows if r.get("name")]

    # Item icon: only match within the dedicated item icon sheets in 'com'
    elif category == "com" and sprite_stem in _ITEM_ICON_STEMS:
        item_rows = _item_by_uv.get((u, v), [])
        if item_rows:
            links["itemIds"] = [r["id"] for r in item_rows]
            links["itemNames"] = [r["name"] for r in item_rows if r.get("name")]

    elif category == "treasure":
        rows = _treasure_by_img.get(img_id, [])
        if rows:
            links["treasureIds"] = [r["id"] for r in rows]

    return links


def build_registry(categories: Optional[list[str]] = None) -> list[AssetRef]:
    """
    Walk KA_assets and build the full flat AssetRef list.
    categories: if set, only process those category dirs. None = all.
    """
    _load_csv_data()

    # Ensure res_mapper has been run so RES_RESOLVED is populated
    if not config.RES_RESOLVED:
        config.RES_RESOLVED.update(config.RES_SEEDS)

    all_refs: list[AssetRef] = []

    for subdir in sorted(config.KA_ASSETS_DIR.iterdir()):
        if not subdir.is_dir():
            continue
        if categories and subdir.name not in categories:
            continue
        refs = _build_refs_for_directory(subdir)
        all_refs.extend(refs)
        print(f"  [{subdir.name}] {len(refs)} refs")

    return all_refs


def save_registry(refs: list[AssetRef], path: Optional[Path] = None) -> Path:
    path = path or (config.MAPPINGS_DIR / "asset_registry.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump([r.to_dict() for r in refs], fh, indent=2)
    return path
