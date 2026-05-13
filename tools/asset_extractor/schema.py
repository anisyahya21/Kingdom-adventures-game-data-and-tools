"""
schema.py — AssetRef dataclass and supporting enums/constants.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional

# ---------------------------------------------------------------------------
# reviewStatus values (string enum — kept as literals for JSON portability)
# ---------------------------------------------------------------------------
# "auto"                 — fully resolved; sourcePng confirmed, rect valid
# "candidate"            — directory guessed by discovery scorer (not confirmed)
# "missing_source"       — no source PNG found (item icon sheets absent, etc.)
# "unresolved_res"       — res value has no known directory mapping
# "res_variant_unknown"  — res value found but sub-variant meaning unclear (Job res*)

REVIEW_AUTO             = "auto"
REVIEW_CANDIDATE        = "candidate"
REVIEW_MISSING_SOURCE   = "missing_source"
REVIEW_UNRESOLVED_RES   = "unresolved_res"
REVIEW_RES_VARIANT_UNKNOWN = "res_variant_unknown"

# ---------------------------------------------------------------------------
# Layer ordering for character assembly (lower = further back)
# ---------------------------------------------------------------------------
LAYER_ORDER: dict[str, int] = {
    "body":    0,
    "feet":    1,
    "shoes":   1,
    "hands":   2,
    "head":    3,
    "hair":    4,
    "weapon":  5,
    "shield":  6,
    "hat":     7,
    "eye":     8,
    "face":    9,
    "mouth":   10,
    "accessory": 11,
}

# ---------------------------------------------------------------------------
# Category → sub-category grouping
# ---------------------------------------------------------------------------
CATEGORY_TO_SUBCATEGORY: dict[str, str] = {
    "weapon":    "equipment",
    "shield":    "equipment",
    "body":      "character",
    "head":      "character",
    "hair":      "character",
    "hands":     "character",
    "hand":      "character",
    "feet":      "character",
    "shoes":     "character",
    "hat":       "character",
    "eye":       "character",
    "face":      "character",
    "mouth":     "character",
    "accessory": "character",
    "chip":      "map",
    "building":  "building",
    "monster":   "monster",
    "furniture": "building",
    "effect":    "effect",
    "ui":        "ui",
    "vehicle":   "vehicle",
    "nature":    "map",
    "system":    "system",
    "treasure":  "item",
}

# ---------------------------------------------------------------------------
# Confirmed res → directory mapping seeds
# (duplicated here for import convenience; config.RES_SEEDS is authoritative)
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


@dataclass
class AtlasCoords:
    u: int
    v: int

    def to_dict(self) -> dict:
        return {"u": self.u, "v": self.v}


@dataclass
class Rect:
    x: int
    y: int
    w: int
    h: int

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}


@dataclass
class AssetRef:
    """
    Universal unit for every visual asset in the game.
    Fields may be None/empty when not yet resolved — reviewStatus explains why.
    """
    assetId: str                              # unique stable key
    category: str                             # e.g. "weapon", "chip", "body"
    subCategory: str = ""                     # e.g. "equipment", "map", "character"
    sourcePng: Optional[str] = None           # relative path from KA_assets root
    spriteName: str = ""                      # filename stem of the source sprite sheet
    atlasCoords: Optional[AtlasCoords] = None # (u, v) grid position in the .opt sheet
    rect: Optional[Rect] = None               # pixel rect from .opt parse
    pivot: None = None                        # Phase 2 — always null for now
    layer: str = ""                           # e.g. "body", "weapon"
    tags: list[str] = field(default_factory=list)
    gameDataLinks: dict = field(default_factory=dict)  # e.g. {itemId: 5, mapchipId: 0}
    reviewStatus: str = REVIEW_AUTO
    rawRes: Optional[int] = None              # preserved when res is unresolved

    def to_dict(self) -> dict:
        return {
            "assetId":      self.assetId,
            "category":     self.category,
            "subCategory":  self.subCategory,
            "sourcePng":    self.sourcePng,
            "spriteName":   self.spriteName,
            "atlasCoords":  self.atlasCoords.to_dict() if self.atlasCoords else None,
            "rect":         self.rect.to_dict() if self.rect else None,
            "pivot":        self.pivot,
            "layer":        self.layer,
            "tags":         self.tags,
            "gameDataLinks": self.gameDataLinks,
            "reviewStatus": self.reviewStatus,
            "rawRes":       self.rawRes,
        }
