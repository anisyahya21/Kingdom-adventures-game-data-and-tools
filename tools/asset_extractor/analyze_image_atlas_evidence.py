#!/usr/bin/env python
"""Summarize ImageAtlas manifests from the Desktop KA_assets copy."""

from __future__ import annotations

import collections
import json
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from parsers.atlas_parser import parse_atlas_txt


ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ASSETS = Path("c:/Users/anisb/OneDrive/Desktop/KA_assets")
ATLAS_DIR = DESKTOP_ASSETS / "image_atlas"
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"
JSON_OUT = OUT_DIR / "image_atlas_evidence_2026-05-15.json"

INTERESTING_NAMES = {
    "chip_94.png",
    "souko_00.png",
    "mizu_edge.png",
    "mizu00.png",
    "mizu01.png",
    "mizu02.png",
    "mizu03.png",
    "town_hall_tower_00.png",
    "town_hall_base_00.png",
    "flag_00.png",
    "fence_05.png",
    "tower.png",
    "tower_01.png",
    "building_48.png",
    "building_58.png",
    "building_68.png",
    "building_26.png",
    "well.png",
    "fountain_00.png",
}

FAMILY_PREFIXES = (
    "town_hall",
    "flag_",
    "fence_",
    "wall_",
    "building_",
    "obj_",
    "plant_",
    "tree",
    "mizu",
    "rouka",
    "jimen",
    "suna",
    "snow",
    "swamp",
    "kazan",
    "iwa",
    "tochi",
    "tuchi",
    "warehouse",
)


def read_scr_inf() -> dict[int, str]:
    path = ATLAS_DIR / "scr.inf"
    result = {}
    if not path.exists():
        return result
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            result[int(parts[0])] = parts[1]
    return result


def infer_group(filename: str) -> str:
    if filename.startswith(("m_body", "w_body", "m_hand", "w_hand", "m_foot", "w_foot", "tourist_")):
        return "character_parts"
    if filename.startswith(("town_hall", "flag_", "fence_", "wall_", "building_", "tower", "obj_", "well", "fountain")):
        return "building_wall_object"
    if filename.startswith(("mizu", "rouka", "jimen", "suna", "snow", "swamp", "kazan", "iwa", "tochi", "tuchi", "souko", "chip_", "farm_floor", "warehouse_floor")):
        return "terrain_floor_chip"
    if filename.startswith(("tree", "grassland", "desert", "volcano", "rock", "soil", "special", "human", "dungeon")):
        return "nature_world_object"
    if filename.startswith(("bed", "shelf", "desk", "kitchen", "carpet", "chair", "room_", "job_")):
        return "interior_furniture"
    return "ui_misc"


def main() -> int:
    scr = read_scr_inf()
    all_entries = []
    by_name: dict[str, list[dict[str, object]]] = collections.defaultdict(list)
    atlas_summaries = []

    for atlas_id, atlas_file in sorted(scr.items()):
        path = ATLAS_DIR / atlas_file
        sprites = parse_atlas_txt(path)
        group_counts = collections.Counter(infer_group(sprite.filename) for sprite in sprites)
        invalid_coords = [sprite for sprite in sprites if sprite.x < 0 or sprite.y < 0]
        summary = {
            "atlasId": atlas_id,
            "file": atlas_file,
            "spriteCount": len(sprites),
            "groupCounts": dict(group_counts),
            "invalidCoordCount": len(invalid_coords),
        }
        atlas_summaries.append(summary)
        for sprite in sprites:
            entry = {
                "atlasId": atlas_id,
                "atlasFile": atlas_file,
                "filename": sprite.filename,
                "x": sprite.x,
                "y": sprite.y,
                "w": sprite.w,
                "h": sprite.h,
                "group": infer_group(sprite.filename),
            }
            all_entries.append(entry)
            by_name[sprite.filename].append(entry)

    duplicates = {
        filename: entries
        for filename, entries in sorted(by_name.items())
        if len(entries) > 1
    }
    interesting = {
        name: by_name.get(name, [])
        for name in sorted(INTERESTING_NAMES)
    }
    family_hits = [
        entry
        for entry in all_entries
        if entry["filename"].startswith(FAMILY_PREFIXES)
    ]

    evidence = {
        "scr": scr,
        "atlasSummaries": atlas_summaries,
        "interesting": interesting,
        "duplicates": duplicates,
        "familyHits": family_hits,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    print(f"wrote {JSON_OUT}")
    print("Atlas summaries:")
    for summary in atlas_summaries:
        print(
            f"  {summary['atlasId']}: {summary['file']} sprites={summary['spriteCount']} "
            f"invalid={summary['invalidCoordCount']} groups={summary['groupCounts']}"
        )
    print("Interesting entries:")
    for name, entries in interesting.items():
        if not entries:
            continue
        compact = "; ".join(
            f"atlas{entry['atlasId']} ({entry['x']},{entry['y']},{entry['w']},{entry['h']})"
            for entry in entries
        )
        print(f"  {name}: {compact}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())