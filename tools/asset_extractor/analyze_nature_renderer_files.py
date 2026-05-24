#!/usr/bin/env python
"""Summarize nature renderer files and their Terrain.csv usage."""

from __future__ import annotations

import collections
import csv
import json
from pathlib import Path

from analyze_renderer_reference_files import parse_opt, parse_seb


ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ASSETS = Path("c:/Users/anisb/OneDrive/Desktop/KA_assets")
NATURE_DIR = DESKTOP_ASSETS / "nature"
TERRAIN_CSV = ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - Terrain.csv"
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"
JSON_OUT = OUT_DIR / "nature_renderer_evidence_2026-05-15.json"


def read_index(path: Path) -> dict[int, str]:
    result = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) >= 2:
            result[int(parts[0])] = parts[1].split(",", 1)[0]
    return result


def summarize_seb(path: Path) -> dict[str, object]:
    parsed = parse_seb(path)
    first_records = []
    animated_records = []
    unique_cells = set()
    unique_offsets = set()
    frame_counts = []
    for block in parsed["blocks"]:
        frame_counts.append(block["frameCount"])
        if block["records"]:
            record = block["records"][0]
            first_records.append(record)
        if len(block["records"]) > 1:
            animated_records.append({"block": block["block"], "records": block["records"]})
        for record in block["records"]:
            unique_cells.add((record["cellW"], record["cellH"]))
            unique_offsets.add((record["offsetX"], record["offsetY"]))
    return {
        "path": parsed["path"],
        "size": parsed["size"],
        "blockCount": parsed["blockCount"],
        "headerValue": parsed["headerValue"],
        "frameCounts": frame_counts,
        "firstRecords": first_records,
        "animatedRecords": animated_records,
        "uniqueCells": sorted([list(item) for item in unique_cells]),
        "uniqueOffsets": sorted([list(item) for item in unique_offsets]),
        "trailingBytes": parsed["trailingBytes"],
    }


def summarize_opt(path: Path) -> dict[str, object]:
    parsed = parse_opt(path)
    non_empty = [slot for slot in parsed["slots"] if not slot.get("empty")]
    widths = sorted({slot["width"] for slot in non_empty if "width" in slot})
    heights = sorted({slot["height"] for slot in non_empty if "height" in slot})
    return {
        "path": str(path),
        "cellW": parsed["cellW"],
        "cellH": parsed["cellH"],
        "cols": parsed["cols"],
        "rows": parsed["rows"],
        "nonEmpty": len(non_empty),
        "widths": widths,
        "heights": heights,
        "firstSlots": non_empty[:6],
    }


def read_terrain_rows() -> list[dict[str, object]]:
    rows = []
    with TERRAIN_CSV.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        index = {name: header.index(name) for name in ("type", "category", "natureId", "natureGroupId", "res", "img", "seb", "frame")}
        for row in reader:
            if row[index["res"]] != "20":
                continue
            rows.append(
                {
                    "terrainId": int(row[0]),
                    "type": int(row[index["type"]]),
                    "category": int(row[index["category"]]),
                    "natureId": int(row[index["natureId"]]),
                    "natureGroupId": int(row[index["natureGroupId"]]),
                    "res": int(row[index["res"]]),
                    "img": int(row[index["img"]]),
                    "seb": int(row[index["seb"]]),
                    "frame": int(row[index["frame"]]),
                }
            )
    return rows


def main() -> int:
    seb_index = read_index(NATURE_DIR / "seb.inf")
    img_index = read_index(NATURE_DIR / "img.inf")
    terrain_rows = read_terrain_rows()

    seb_summaries = {
        seb_id: summarize_seb(NATURE_DIR / filename)
        for seb_id, filename in seb_index.items()
    }
    opt_summaries = {}
    for img_id, filename in img_index.items():
        opt_path = NATURE_DIR / f"{Path(filename).stem}.opt"
        if opt_path.exists():
            opt_summaries[img_id] = summarize_opt(opt_path)

    terrain_usage_by_seb = collections.Counter(row["seb"] for row in terrain_rows)
    terrain_usage_by_seb_frame = collections.Counter((row["seb"], row["frame"]) for row in terrain_rows)
    terrain_usage_by_img = collections.Counter(row["img"] for row in terrain_rows)
    terrain_joined = []
    for row in terrain_rows:
        joined = dict(row)
        joined["imgFile"] = img_index.get(row["img"])
        joined["sebFile"] = seb_index.get(row["seb"])
        terrain_joined.append(joined)

    evidence = {
        "sebIndex": seb_index,
        "imgIndexCount": len(img_index),
        "sebSummaries": seb_summaries,
        "optSummaryCount": len(opt_summaries),
        "terrainRes20Rows": terrain_joined,
        "terrainUsageBySeb": dict(sorted(terrain_usage_by_seb.items())),
        "terrainUsageBySebFrame": {
            f"seb{seb_id}_frame{frame}": count
            for (seb_id, frame), count in sorted(terrain_usage_by_seb_frame.items())
        },
        "terrainUsageByImgTop": terrain_usage_by_img.most_common(20),
        "optSummaries": opt_summaries,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    print(f"wrote {JSON_OUT}")
    print("Nature SEB index:")
    for seb_id, filename in seb_index.items():
        summary = seb_summaries[seb_id]
        first = summary["firstRecords"][0] if summary["firstRecords"] else {}
        print(
            f"  {seb_id}: {filename} blocks={summary['blockCount']} header={summary['headerValue']} "
            f"frames={summary['frameCounts']} firstCell={first.get('cellW')}x{first.get('cellH')} "
            f"firstOffset={first.get('offsetX')},{first.get('offsetY')}"
        )
    print("Terrain.csv res=20 usage by seb:")
    for seb_id, count in sorted(terrain_usage_by_seb.items()):
        print(f"  seb {seb_id} ({seb_index.get(seb_id)}): {count}")
    print("First joined Terrain rows:")
    for row in terrain_joined[:12]:
        print(
            f"  terrain {row['terrainId']}: img {row['img']} {row['imgFile']} "
            f"seb {row['seb']} {row['sebFile']} frame {row['frame']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())