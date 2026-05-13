"""
config.py — all path constants and override hooks for the asset extractor.
Fill RES_OVERRIDES and ITEM_SHEET_OVERRIDES after running `python main.py discover`
and reviewing the generated candidate reports.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Workspace root (two levels up from tools/asset_extractor/)
# ---------------------------------------------------------------------------
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent

# ---------------------------------------------------------------------------
# Input paths
# ---------------------------------------------------------------------------
KA_ASSETS_DIR = WORKSPACE_ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"

CSV_DIR = WORKSPACE_ROOT / "data" / "Sheet csv"
CSV_DIR_RESEARCH = WORKSPACE_ROOT / "data" / "sheet-research" / "raw-copies"

# ---------------------------------------------------------------------------
# Output paths
# ---------------------------------------------------------------------------
GENERATED_DIR = Path(__file__).resolve().parent / "generated"

DISCOVERY_DIR     = GENERATED_DIR / "discovery"
SPRITES_DIR       = GENERATED_DIR / "sprites"
OFFSETS_DIR       = GENERATED_DIR / "offsets"
ATLASES_DIR       = GENERATED_DIR / "atlases"
MAPS_DIR          = GENERATED_DIR / "maps"
MAPPINGS_DIR      = GENERATED_DIR / "mappings"
PREVIEWS_DIR      = GENERATED_DIR / "previews"
OVERLAYS_DIR      = PREVIEWS_DIR / "overlays"
SHEETS_DIR        = PREVIEWS_DIR / "sheets"
CHARSTACK_DIR     = PREVIEWS_DIR / "char_stack_test"

# ---------------------------------------------------------------------------
# Confirmed res → directory seeds
# Populated at runtime by res_mapper.py; add confirmed entries here to skip
# the discovery scoring for that res value.
# ---------------------------------------------------------------------------
RES_SEEDS: dict[int, str] = {
    9:  "chip",
    21: "building",
    22: "monster",
    14: "head",
    2:  "body",
    0:  "hand",
    4:  "hand",
    1:  "shoes",
    5:  "shoes",
}

# Merged at runtime from RES_SEEDS + discovered candidates.
# res_mapper.py writes this after scoring.  Downstream modules import this.
RES_RESOLVED: dict[int, str] = {}

# ---------------------------------------------------------------------------
# Manual override hooks (fill after reviewing discovery outputs)
# ---------------------------------------------------------------------------

# RES_OVERRIDES: force a specific directory for a res value that the
# auto-scorer got wrong or couldn't determine.
# Example:  RES_OVERRIDES = { 27: "treasure" }
RES_OVERRIDES: dict[int, str] = {}

# ITEM_SHEET_OVERRIDES: force a specific PNG path for item icon lookups when
# the auto-finder chose the wrong sheet or found nothing.
# Example:  ITEM_SHEET_OVERRIDES = { "item_icon": "item/item_icon_sheet.png" }
ITEM_SHEET_OVERRIDES: dict[str, str] = {}

# ---------------------------------------------------------------------------
# CSV file paths (absolute)
# ---------------------------------------------------------------------------
CSV_ITEM            = CSV_DIR         / "KA GameData - Item.csv"
CSV_MONSTER         = CSV_DIR         / "KA GameData - Monster.csv"
CSV_TERRAIN         = CSV_DIR         / "KA GameData - Terrain.csv"
CSV_HOUSE           = CSV_DIR         / "KA GameData - House.csv"
CSV_FACILITY        = CSV_DIR         / "KA GameData - Facility_lookup.csv"
CSV_JOB             = CSV_DIR         / "KA GameData - Job.csv"
CSV_MAPCHIP         = CSV_DIR_RESEARCH / "KA GameData - MapChip.csv"
CSV_TREASURE        = CSV_DIR_RESEARCH / "KA GameData - Treasure_lookup.csv"
CSV_FACILITY_FULL   = CSV_DIR         / "KA GameData - Facility.csv"
