"""
manifest_generator.py — slices the flat AssetRef registry into 6 domain manifests.

Manifests:
  asset_registry.json       — all AssetRefs (written by asset_registry.py)
  equipment_assets.json     — weapons + shields keyed by inf img ID
  map_assets.json           — chip tiles; each linked to MapChip CSV rows
  character_parts.json      — body/head/hair/hands/feet/weapon/shield grouped by layer
  building_assets.json      — buildings/objects by img ID
  ui_icons.json             — ImageAtlas sprites
  game_data_links.json      — CSV entity id → assetId lookup table
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef


def _group_by(refs: list[AssetRef], key_fn) -> dict:
    out: dict = {}
    for r in refs:
        k = key_fn(r)
        if k is None:
            continue
        out.setdefault(k, []).append(r.to_dict())
    return out


def generate_all(refs: list[AssetRef]) -> dict[str, Path]:
    """Write all 6 domain manifests. Returns {name -> output_path}."""
    config.MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}

    written["equipment_assets"]  = _write_equipment(refs)
    written["map_assets"]        = _write_map_assets(refs)
    written["character_parts"]   = _write_character_parts(refs)
    written["building_assets"]   = _write_building_assets(refs)
    written["ui_icons"]          = _write_ui_icons(refs)
    written["game_data_links"]   = _write_game_data_links(refs)

    for name, path in written.items():
        print(f"  [manifest] wrote {path.name}")

    return written


# ---------------------------------------------------------------------------
# equipment_assets.json
# ---------------------------------------------------------------------------
def _write_equipment(refs: list[AssetRef]) -> Path:
    equip_cats = {"weapon", "shield"}
    data: dict = {"weapons": {}, "shields": {}}

    for r in refs:
        if r.category not in equip_cats:
            continue
        key = r.spriteName
        bucket = "shields" if r.category == "shield" else "weapons"
        data[bucket].setdefault(key, []).append(r.to_dict())

    path = config.MAPPINGS_DIR / "equipment_assets.json"
    _write_json(path, data)
    return path


# ---------------------------------------------------------------------------
# map_assets.json
# ---------------------------------------------------------------------------
def _write_map_assets(refs: list[AssetRef]) -> Path:
    data: dict = {}
    for r in refs:
        if r.category != "chip":
            continue
        chip_ids = r.gameDataLinks.get("mapchipIds", [])
        for cid in chip_ids:
            data.setdefault(str(cid), []).append(r.to_dict())
        if not chip_ids:
            data.setdefault(f"__unlinked_{r.assetId}", [r.to_dict()])

    path = config.MAPPINGS_DIR / "map_assets.json"
    _write_json(path, data)
    return path


# ---------------------------------------------------------------------------
# character_parts.json
# ---------------------------------------------------------------------------
CHAR_LAYERS = ["body", "head", "hair", "hands", "hand", "feet", "shoes", "weapon", "shield",
               "hat", "eye", "face", "mouth", "accessory"]

def _write_character_parts(refs: list[AssetRef]) -> Path:
    data: dict = {layer: [] for layer in CHAR_LAYERS}

    for r in refs:
        if r.category not in set(CHAR_LAYERS):
            continue
        entry = r.to_dict()
        # Ensure pivot is null (Phase 2 will fill offsets)
        entry["pivot"] = None
        bucket = r.category
        if bucket in data:
            data[bucket].append(entry)

    path = config.MAPPINGS_DIR / "character_parts.json"
    _write_json(path, data)
    return path


# ---------------------------------------------------------------------------
# building_assets.json
# ---------------------------------------------------------------------------
def _write_building_assets(refs: list[AssetRef]) -> Path:
    data: dict = {}
    for r in refs:
        if r.category != "building":
            continue
        key = r.spriteName
        data.setdefault(key, []).append(r.to_dict())

    path = config.MAPPINGS_DIR / "building_assets.json"
    _write_json(path, data)
    return path


# ---------------------------------------------------------------------------
# ui_icons.json
# ---------------------------------------------------------------------------
def _write_ui_icons(refs: list[AssetRef]) -> Path:
    data: dict = {}
    for r in refs:
        if r.category != "image_atlas" and r.subCategory != "ui":
            continue
        data.setdefault(r.spriteName, []).append(r.to_dict())

    path = config.MAPPINGS_DIR / "ui_icons.json"
    _write_json(path, data)
    return path


# ---------------------------------------------------------------------------
# game_data_links.json
# ---------------------------------------------------------------------------
def _write_game_data_links(refs: list[AssetRef]) -> Path:
    """Flat lookup: CSV entity id → list of assetIds."""
    data: dict = {
        "byMapchipId": {},
        "byMonsterId": {},
        "byHouseId": {},
        "byItemId": {},
        "byTreasureId": {},
        "byTerrainId": {},
    }

    for r in refs:
        links = r.gameDataLinks
        for cid in links.get("mapchipIds", []):
            data["byMapchipId"].setdefault(str(cid), []).append(r.assetId)
        for cid in links.get("monsterIds", []):
            data["byMonsterId"].setdefault(str(cid), []).append(r.assetId)
        for cid in links.get("houseIds", []):
            data["byHouseId"].setdefault(str(cid), []).append(r.assetId)
        for cid in links.get("itemIds", []):
            data["byItemId"].setdefault(str(cid), []).append(r.assetId)
        for cid in links.get("treasureIds", []):
            data["byTreasureId"].setdefault(str(cid), []).append(r.assetId)
        for cid in links.get("terrainIds", []):
            data["byTerrainId"].setdefault(str(cid), []).append(r.assetId)

    path = config.MAPPINGS_DIR / "game_data_links.json"
    _write_json(path, data)
    return path


def _write_json(path: Path, data) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
