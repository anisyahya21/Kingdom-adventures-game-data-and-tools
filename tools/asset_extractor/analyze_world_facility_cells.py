#!/usr/bin/env python
"""Inspect production map cells around compound facility MapChips."""

from __future__ import annotations

import collections
import csv
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MAP_PATH = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets" / "map" / "map_160_160.map"
MAPCHIP_PATH = ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - MapChip.csv"
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"
JSON_OUT = OUT_DIR / "world_facility_cell_evidence_2026-05-15.json"

COMPOUND_GROUPS = {
    "Town Hall": [58, 59, 60, 61],
    "Enemy Hall": [62, 63, 64],
    "Port": [67, 68, 69, 70],
}


def load_mapchips() -> dict[int, dict[str, str]]:
    with MAPCHIP_PATH.open(newline="", encoding="utf-8-sig") as handle:
        return {int(row["id"]): row for row in csv.DictReader(handle)}


def parse_map() -> tuple[int, int, list[list[tuple[int, int, int, int, int, int]]], int, dict[str, object]]:
    data = MAP_PATH.read_bytes()
    width, height = struct.unpack_from(">II", data, 0)
    offset = 8
    rows: list[list[tuple[int, int, int, int, int, int]]] = []
    for y in range(height):
        row = []
        for _ in range(width):
            values = struct.unpack_from(">6I", data, offset)
            offset += 24
            row.append(values)
        sentinel = struct.unpack_from(">I", data, offset)[0]
        offset += 4
        if sentinel != width:
            raise ValueError(f"bad section A sentinel at row {y}: {sentinel}")
        rows.append(row)

    section_b_values: collections.Counter[int] = collections.Counter()
    section_b_markers = []
    section_b_missing_values = 0
    for y in range(height):
        if offset + 4 <= len(data):
            section_b_markers.append(struct.unpack_from(">I", data, offset)[0])
            offset += 4
        else:
            raise ValueError(f"missing section B row marker at row {y}")
        for _ in range(width):
            if offset + 4 > len(data):
                section_b_missing_values += 1
                break
            value = struct.unpack_from(">I", data, offset)[0]
            offset += 4
            section_b_values[value] += 1

    section_b = {
        "rowFormat": "marker-first",
        "values": dict(section_b_values),
        "markerCount": len(section_b_markers),
        "markerValues": dict(collections.Counter(section_b_markers)),
        "missingTrailingValues": section_b_missing_values,
        "endOffset": offset,
        "remainingBytes": len(data) - offset,
    }
    return width, height, rows, offset, section_b


def chip_label(mapchips: dict[int, dict[str, str]], chip_id: int) -> str:
    row = mapchips.get(chip_id)
    if row is None:
        return f"{chip_id}:?"
    return f"{chip_id}:{row['name']}"


def inspect_neighborhood(
    cells: list[list[tuple[int, int, int, int, int, int]]],
    mapchips: dict[int, dict[str, str]],
    x: int,
    y: int,
    radius: int = 3,
) -> list[dict[str, object]]:
    width = len(cells[0])
    height = len(cells)
    result = []
    for yy in range(max(0, y - radius), min(height, y + radius + 1)):
        line = []
        for xx in range(max(0, x - radius), min(width, x + radius + 1)):
            f0, f1, f2, f3, f4, f5 = cells[yy][xx]
            line.append({"x": xx, "y": yy, "f1": f1, "f2": f2, "f5": f5, "label": chip_label(mapchips, f2)})
        result.append({"y": yy, "cells": line})
    return result


def offset_frequencies(
    positions: dict[int, list[dict[str, int]]],
    parent_id: int,
    child_ids: list[int],
    radius: int = 10,
) -> dict[str, list[dict[str, int]]]:
    result: dict[str, list[dict[str, int]]] = {}
    parents = positions.get(parent_id, [])
    for child_id in child_ids:
        counter: collections.Counter[tuple[int, int]] = collections.Counter()
        for parent in parents:
            px, py = parent["x"], parent["y"]
            for child in positions.get(child_id, []):
                dx = child["x"] - px
                dy = child["y"] - py
                if abs(dx) <= radius and abs(dy) <= radius:
                    counter[(dx, dy)] += 1
        result[str(child_id)] = [
            {"dx": dx, "dy": dy, "count": count}
            for (dx, dy), count in counter.most_common(20)
        ]
    return result


def main() -> int:
    mapchips = load_mapchips()
    width, height, cells, map_end, section_b = parse_map()
    section_a_end = 8 + height * ((width * 6 + 1) * 4)
    positions: dict[int, list[dict[str, int]]] = collections.defaultdict(list)
    counts: collections.Counter[int] = collections.Counter()

    for y, row in enumerate(cells):
        for x, values in enumerate(row):
            f0, f1, f2, f3, f4, f5 = values
            counts[f2] += 1
            positions[f2].append({"x": x, "y": y, "f1": f1, "f5": f5})

    evidence: dict[str, object] = {
        "map": {
            "path": str(MAP_PATH),
            "width": width,
            "height": height,
            "sectionAEnd": section_a_end,
            "fileSize": MAP_PATH.stat().st_size,
            "sectionBWords": (MAP_PATH.stat().st_size - section_a_end) // 4,
            "mapEnd": map_end,
            "sectionB": section_b,
        },
        "compoundGroups": {},
        "relativeOffsets": {},
    }

    print(f"map {width}x{height} file={MAP_PATH.stat().st_size} sectionAEnd={section_a_end} sectionBWords={(MAP_PATH.stat().st_size - section_a_end) // 4}")
    print(f"sectionB values={section_b['values']} markers={section_b['markerValues']} missingTrailingValues={section_b['missingTrailingValues']} remainingBytes={section_b['remainingBytes']}")
    print("top active F2 MapChips:")
    for chip_id, count in counts.most_common(45):
        row = mapchips.get(chip_id, {})
        print(
            f"  {chip_id:>3} count={count:<5} name={row.get('name')} res={row.get('res')} img={row.get('img')} "
            f"seb={row.get('seb')} layer={row.get('layer')} rot={row.get('rotation')} size={row.get('sizeWidth')}x{row.get('sizeHeight')}"
        )

    for group_name, chip_ids in COMPOUND_GROUPS.items():
        group_data = []
        print(f"\n{group_name} chips:")
        for chip_id in chip_ids:
            row = mapchips.get(chip_id, {})
            found = positions.get(chip_id, [])
            terrain_distribution = collections.Counter((item["f1"], item["f5"]) for item in found)
            samples = found[:12]
            group_data.append(
                {
                    "chipId": chip_id,
                    "name": row.get("name"),
                    "count": len(found),
                    "f1f5Distribution": [
                        {"f1": f1, "f5": f5, "count": count}
                        for (f1, f5), count in terrain_distribution.most_common()
                    ],
                    "samples": samples,
                    "neighborhoods": [
                        {
                            "center": sample,
                            "cells": inspect_neighborhood(cells, mapchips, sample["x"], sample["y"]),
                        }
                        for sample in samples[:3]
                    ],
                }
            )
            print(f"  chip {chip_id:>3} {row.get('name'):<16} count={len(found):<4} samples={samples[:8]}")
        evidence["compoundGroups"][group_name] = group_data

    evidence["relativeOffsets"] = {
        "Town Hall parent 58": offset_frequencies(positions, 58, [59, 60, 61, 46, 56, 57], radius=12),
        "Enemy Hall parent 62": offset_frequencies(positions, 62, [63, 64], radius=12),
        "Port parent 67": offset_frequencies(positions, 67, [68, 69, 70], radius=12),
    }

    print("\nrelative offset frequencies from compound parents:")
    for label, children in evidence["relativeOffsets"].items():
        print(f"  {label}")
        for child_id, offsets in children.items():
            pretty = ", ".join(f"({item['dx']},{item['dy']})x{item['count']}" for item in offsets[:8])
            print(f"    child {child_id}: {pretty}")

    print("\ncompound parent neighborhoods:")
    for parent in [58, 62, 67]:
        for sample in positions.get(parent, [])[:3]:
            print(f"  parent {chip_label(mapchips, parent)} at ({sample['x']},{sample['y']}) f1={sample['f1']} f5={sample['f5']}")
            for line in inspect_neighborhood(cells, mapchips, sample["x"], sample["y"], radius=2):
                labels = [cell["label"] for cell in line["cells"]]
                print(f"    y={line['y']}: {labels}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(f"\nwrote {JSON_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())