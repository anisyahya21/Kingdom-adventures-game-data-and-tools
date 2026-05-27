#!/usr/bin/env python
"""Summarize renderer reference SEB/OPT files from the Desktop KA_assets copy."""

from __future__ import annotations

import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ASSETS = Path("c:/Users/anisb/OneDrive/Desktop/KA_assets")
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"
JSON_OUT = OUT_DIR / "renderer_reference_file_evidence_2026-05-15.json"

SEB_FILES = [
    DESKTOP_ASSETS / "building" / "1x1.seb",
    DESKTOP_ASSETS / "building" / "1x1_2state.seb",
    DESKTOP_ASSETS / "building" / "1x1_4way.seb",
    DESKTOP_ASSETS / "building" / "2x2.seb",
    DESKTOP_ASSETS / "building" / "2x2_01.seb",
    DESKTOP_ASSETS / "building" / "2x2_2state.seb",
    DESKTOP_ASSETS / "building" / "2x2_anim.seb",
    DESKTOP_ASSETS / "game_2" / "influence_effect.seb",
    DESKTOP_ASSETS / "game_2" / "effect_00.seb",
    DESKTOP_ASSETS / "game_2" / "town_area_frame.seb",
]

OPT_FILES = [
    DESKTOP_ASSETS / "game_2" / "select_frame.opt",
]

TEXT_FILES = [
    DESKTOP_ASSETS / "game_2" / "select_frame.optinfo",
    DESKTOP_ASSETS / "game_2" / "img.inf",
    DESKTOP_ASSETS / "chip" / "optimize_48x36.inf",
    DESKTOP_ASSETS / "chip" / "optimize_48x128.inf",
    DESKTOP_ASSETS / "chip" / "optimize_48x148.inf",
    DESKTOP_ASSETS / "chip" / "optimize_48x23.inf",
    DESKTOP_ASSETS / "chip" / "optimize_48x64.inf",
    DESKTOP_ASSETS / "building" / "optimize_48x128.inf",
    DESKTOP_ASSETS / "building" / "optimize_60x30.inf",
    DESKTOP_ASSETS / "building" / "optimize_96x128.inf",
    DESKTOP_ASSETS / "building" / "optimize_96x200.inf",
]


def i16(data: bytes, offset: int) -> int:
    return struct.unpack_from(">h", data, offset)[0]


def u16(data: bytes, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def parse_seb(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    block_count = u16(data, 0)
    header_value = u16(data, 2)
    offset = 4
    blocks = []
    for block_index in range(block_count):
        if offset + 4 > len(data):
            break
        frame_count = u16(data, offset)
        period = u16(data, offset + 2)
        offset += 4
        records = []
        for frame_index in range(frame_count):
            if offset + 20 > len(data):
                break
            values = [i16(data, offset + index * 2) for index in range(10)]
            offset += 20
            records.append(
                {
                    "frame": frame_index,
                    "tick": values[0],
                    "sourceId": values[1],
                    "srcX": values[2],
                    "srcY": values[3],
                    "cellW": values[4],
                    "cellH": values[5],
                    "offsetX": values[6],
                    "offsetY": values[7],
                    "extra8": values[8],
                    "extra9": values[9],
                }
            )
        blocks.append({"block": block_index, "frameCount": frame_count, "period": period, "records": records})
    return {
        "path": str(path),
        "size": len(data),
        "blockCount": block_count,
        "headerValue": header_value,
        "parsedBytes": offset,
        "trailingBytes": len(data) - offset,
        "blocks": blocks,
    }


def parse_opt(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    cell_w, cell_h, cols, rows = data[:4]
    offset = 4
    slots = []
    for slot_index in range(cols * rows):
        if offset >= len(data):
            break
        flag = data[offset]
        if flag == 0:
            slots.append({"slot": slot_index, "empty": True})
            offset += 1
            continue
        if offset + 15 > len(data):
            slots.append({"slot": slot_index, "truncated": True})
            break
        sentinel = u16(data, offset + 1)
        slots.append(
            {
                "slot": slot_index,
                "empty": False,
                "sentinel": sentinel,
                "destX": i16(data, offset + 3),
                "destY": i16(data, offset + 5),
                "srcX": i16(data, offset + 7),
                "srcY": i16(data, offset + 9),
                "width": u16(data, offset + 11),
                "height": u16(data, offset + 13),
            }
        )
        offset += 15
    return {
        "path": str(path),
        "size": len(data),
        "cellW": cell_w,
        "cellH": cell_h,
        "cols": cols,
        "rows": rows,
        "parsedBytes": offset,
        "trailingBytes": len(data) - offset,
        "slots": slots,
    }


def read_text_summary(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"path": str(path), "exists": False}
    text = path.read_text(encoding="utf-8", errors="replace")
    return {"path": str(path), "exists": True, "lines": text.splitlines()}


def main() -> int:
    evidence = {
        "seb": [parse_seb(path) for path in SEB_FILES if path.exists()],
        "opt": [parse_opt(path) for path in OPT_FILES if path.exists()],
        "text": [read_text_summary(path) for path in TEXT_FILES],
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    print(f"wrote {JSON_OUT}")
    print("SEB summary:")
    for item in evidence["seb"]:
        first = item["blocks"][0]["records"][0] if item["blocks"] and item["blocks"][0]["records"] else {}
        print(
            f"  {Path(item['path']).name}: blocks={item['blockCount']} header={item['headerValue']} "
            f"firstCell={first.get('cellW')}x{first.get('cellH')} firstOffset={first.get('offsetX')},{first.get('offsetY')}"
        )
    print("OPT summary:")
    for item in evidence["opt"]:
        non_empty = sum(1 for slot in item["slots"] if not slot.get("empty"))
        print(f"  {Path(item['path']).name}: cell={item['cellW']}x{item['cellH']} grid={item['cols']}x{item['rows']} nonEmpty={non_empty}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())