#!/usr/bin/env python3
"""Independent reference crops for the monster OPT reconstruction check (handoff section 6).

The independent side reads the original OPT bytes with the existing parser
(KA-Website/tools/asset_extractor/parsers/opt_parser.py) and crops every component out of the
packed PNG at its own ``(srcX, srcY, w, h)``. Nothing here uses the website's TypeScript
tables; those are compared against this decode later, so the check does not assume the answer
it is testing.

Outputs (into --out):
  opt-parsed.json                  parser result + PNG facts per used sheet
  references/<sheet>__u<u>_v<v>__d<destX>_<destY>.png   exact crop of one component
  manifest.json                    sheet/component expectations for the browser comparison
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ARTIFACT = Path(__file__).resolve().parents[2]
SERVED_DIR = ARTIFACT / "public" / "battle-assets" / "monster-original"


def workspace_root() -> Path:
    for parent in [ARTIFACT, *ARTIFACT.parents]:
        if (parent / "RE-evidence").is_dir():
            return parent
    raise SystemExit("workspace root with RE-evidence/ not found")


ORIGINAL_DIR = workspace_root() / "RE-evidence" / "20260911-treasure" / "monster-original"


def load_parser():
    parser_dir = workspace_root() / "KA-Website" / "tools" / "asset_extractor" / "parsers"
    sys.path.insert(0, str(parser_dir))
    import opt_parser  # noqa: E402  (path set above)

    return opt_parser


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sheet_from_tables(tables: dict, name: str) -> dict:
    for table in ("extraSheets", "baseSheets"):
        entry = tables.get(table, {}).get(name)
        if entry:
            return entry
    raise SystemExit(f"sheet {name} is not in the production tables")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tables", required=True, help="production table dump from the browser probe")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out = Path(args.out).resolve()
    refs = out / "references"
    refs.mkdir(parents=True, exist_ok=True)

    tables = json.loads(Path(args.tables).read_text(encoding="utf-8"))
    opt_parser = load_parser()

    # Which sheets does the production component actually need for these encounters?
    needed: list[str] = []
    body_for_encounter: dict[str, str] = {}
    shadow_for_encounter: dict[str, str] = {}
    for key, data in sorted(tables["encounters"].items(), key=lambda kv: int(kv[0])):
        sheet_name = tables["imgSheets"][str(data["img"])]
        shadow_name = tables["shadowBySize"][str(data["size"])]
        body_for_encounter[key] = sheet_name
        shadow_for_encounter[key] = shadow_name
        for name in (sheet_name, shadow_name):
            if name not in needed:
                needed.append(name)

    parsed: dict[str, dict] = {}
    manifest = {
        "servedDir": str(SERVED_DIR),
        "originalDir": str(ORIGINAL_DIR),
        "bodyForEncounter": body_for_encounter,
        "shadowForEncounter": shadow_for_encounter,
        "sheets": {},
    }

    for name in needed:
        opt_path = SERVED_DIR / f"{name}.opt"
        png_path = SERVED_DIR / f"{name}.png"
        original_opt = ORIGINAL_DIR / f"{name}.opt"
        result = opt_parser.parse_opt(opt_path)

        image = Image.open(png_path).convert("RGBA")
        opt_sha = sha256(opt_path)
        original_sha = sha256(original_opt) if original_opt.is_file() else None

        table_entry = sheet_from_tables(tables, name)
        rects = [
            (component["src_x"], component["src_y"], component["w"], component["h"])
            for component in result["sprites"]
        ]
        for sx, sy, w, h in rects:
            if sx < 0 or sy < 0 or sx + w > image.width or sy + h > image.height:
                raise SystemExit(f"{name}: rect {(sx, sy, w, h)} leaves the {image.size} PNG")
        union_w = max(sx + w for sx, sy, w, h in rects)
        union_h = max(sy + h for sx, sy, w, h in rects)

        components: dict[str, dict] = {}
        for component in result["sprites"]:
            key = f"u{component['u']}_v{component['v']}"
            crop = image.crop(
                (
                    component["src_x"],
                    component["src_y"],
                    component["src_x"] + component["w"],
                    component["src_y"] + component["h"],
                )
            )
            ref_name = f"{name}__u{component['u']}_v{component['v']}__d{component['dest_x']}_{component['dest_y']}.png"
            crop.save(refs / ref_name)
            components[key] = {
                "u": component["u"],
                "v": component["v"],
                "index": component["component"],
                "count": component["component_count"],
                "imageRef": component["image_ref"],
                "dest": {"x": component["dest_x"], "y": component["dest_y"]},
                "src": {
                    "x": component["src_x"],
                    "y": component["src_y"],
                    "w": component["w"],
                    "h": component["h"],
                },
                "reference": ref_name,
                "cropSha256": hashlib.sha256(crop.tobytes()).hexdigest(),
            }

        parsed[name] = {
            "optPath": str(opt_path),
            "optBytes": opt_path.stat().st_size,
            "optSha256": opt_sha,
            "optSha256_16": opt_sha[:16],
            "originalOptMatchesServed": original_sha == opt_sha if original_sha else None,
            "pngPath": str(png_path),
            "pngSize": [image.width, image.height],
            "pngSha256": sha256(png_path),
            "cellWidth": result["cell_width"],
            "cellHeight": result["cell_height"],
            "cols": result["cols"],
            "rows": result["rows"],
            "unionOfSourceRects": [union_w, union_h],
            "unionEqualsPngSize": [union_w, union_h] == [image.width, image.height],
            "components": components,
            "tableCell": [
                table_entry.get("cellW"),
                table_entry.get("cellH"),
                table_entry.get("cols"),
                table_entry.get("rows"),
            ],
            "tableOptSha256_16": table_entry.get("optSha256_16"),
        }
        manifest["sheets"][name] = {
            "cellW": result["cell_width"],
            "cellH": result["cell_height"],
            "cols": result["cols"],
            "rows": result["rows"],
            "components": [
                {
                    "u": component["u"],
                    "v": component["v"],
                    "dest": {"x": component["dest_x"], "y": component["dest_y"]},
                    "src": {
                        "x": component["src_x"],
                        "y": component["src_y"],
                        "w": component["w"],
                        "h": component["h"],
                    },
                    "reference": components[f"u{component['u']}_v{component['v']}"]["reference"],
                }
                for component in result["sprites"]
            ],
        }

    (out / "opt-parsed.json").write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(
        f"references: {len(needed)} sheets, "
        f"{sum(len(sheet['components']) for sheet in parsed.values())} components -> {out}"
    )
    for name in needed:
        sheet = parsed[name]
        print(
            f"  {name}: {sheet['optBytes']}B opt {sheet['optSha256_16']} "
            f"cell {sheet['cellWidth']}x{sheet['cellHeight']} {sheet['cols']}x{sheet['rows']} "
            f"png {sheet['pngSize'][0]}x{sheet['pngSize'][1]} "
            f"union {'==' if sheet['unionEqualsPngSize'] else '!='} png "
            f"origins {'match' if sheet['originalOptMatchesServed'] else 'DIFFER'}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
