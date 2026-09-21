#!/usr/bin/env python3
"""Compare the production monster-body render against the independent OPT/PNG decode.

Consumes the artefacts written by run_check.mjs and build_references.py and asserts handoff
section 6 (a)-(e):

  (a) exact source cropping  - pixels painted in the w x h component viewport - and everywhere
                               else in the logical cell - equal the PNG crop at
                               (srcX, srcY, w, h) and nothing else;
  (b) placement              - the viewport sits at cellOrigin + (destX, destY);
  (c) cell separation        - a cell matches only its own component, never the crop of a
                               neighbouring cell of the same tightly packed sheet;
  (d) Wairo Tank regions     - all_monster_l_wairo02's four regions and their cells;
  (e) shadows                - shadow_m 23x3 at (28,57) and shadow_l 32x3 at (24,57).

The pixels compared here are the ones the *production component* painted in a real browser; the
references come from the OPT bytes and the packed PNG, decoded independently.
"""

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path

from PIL import Image

MAGENTA = (255, 0, 255, 255)

ARTIFACT = Path(__file__).resolve().parents[2]
MONSTER_SEB_DIR = ARTIFACT.parents[2] / "RE-evidence" / "20260911-treasure" / "monster-original"
SEB_FILES = {
    "wait": "monster_s_wait_up.seb",
    "waitLeft": "monster_s_wait_right.seb",
    "attack": "monster_s_attack_up.seb",
    "attackLeft": "monster_s_attack_right.seb",
}
"""
The harness drives the production component with the two wait-clip keys that select a different
cell (0 and 10) for the side's own clip. Those expectations come straight from the SEB bytes, so
the suite states them literally and then asserts the decode agrees - no copy of the selection
rule is used here. The rule itself is exercised frame-by-frame by tools/seb-frame-check.
"""
EXPECTED_BODY_CELL = {
    ("wait", 0): (0, 0),
    ("wait", 10): (1, 0),
    ("waitLeft", 0): (0, 1),
    ("waitLeft", 10): (1, 1),
}


def decode_seb(path: Path) -> dict:
    data = path.read_bytes()
    layers, max_frame = struct.unpack_from(">Hh", data, 0)
    pos = 4
    records = []
    for line in range(layers):
        count, _reserved = struct.unpack_from(">hh", data, pos)
        pos += 4
        for _ in range(count):
            frame, tex, u, v, w, h, trans_x, trans_y, revers_u, revers_v = struct.unpack_from(">10h", data, pos)
            pos += 20
            records.append(
                {
                    "line": line,
                    "frame": frame,
                    "tex": tex,
                    "u": u,
                    "v": v,
                    "w": w,
                    "h": h,
                    "transX": trans_x,
                    "transY": trans_y,
                    "reversU": revers_u,
                    "reversV": revers_v,
                }
            )
    if pos != len(data):
        raise SystemExit(f"{path.name}: parsed {pos} of {len(data)} bytes")
    return {"layers": layers, "maxFrame": max_frame, "records": records, "bytes": len(data)}


def seb_key_record(clip: dict, line: int, frame_key: int) -> dict:
    for record in clip["records"]:
        if record["line"] == line and record["frame"] == frame_key:
            return record
    raise SystemExit(f"no line {line} record at key {frame_key}")


class Report:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, group: str, name: str, passed: bool, detail: str = "") -> bool:
        self.checks.append({"group": group, "name": name, "pass": bool(passed), "detail": detail})
        return bool(passed)

    def expect(self, group: str, name: str, actual, expected, detail: str = "") -> bool:
        ok = actual == expected
        return self.add(
            group,
            name,
            ok,
            detail if ok else f"expected {expected!r}, got {actual!r}" + (f" ({detail})" if detail else ""),
        )

    @property
    def failures(self) -> list[dict]:
        return [check for check in self.checks if not check["pass"]]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def px(value: str) -> float:
    return float(str(value).replace("px", ""))


def diff_stats(rendered: Image.Image, expected: Image.Image, tolerance: int) -> dict:
    a = rendered.convert("RGBA")
    b = expected.convert("RGBA")
    if a.size != b.size:
        return {"sizeMatch": False, "differingPixels": None, "maxChannelDelta": None}
    pa, pb = a.load(), b.load()
    differing = 0
    max_delta = 0
    for y in range(a.height):
        for x in range(a.width):
            delta = max(abs(pa[x, y][i] - pb[x, y][i]) for i in range(4))
            if delta > tolerance:
                differing += 1
            max_delta = max(max_delta, delta)
    return {"sizeMatch": True, "differingPixels": differing, "maxChannelDelta": max_delta}


def component_crop(parsed: dict, refs_dir: Path, sheet: str, cell: str) -> Image.Image:
    component = parsed[sheet]["components"][cell]
    return Image.open(refs_dir / component["reference"]).convert("RGBA")


"""Unit-space window for the expectations: origin = entity origin, generous around the crops."""
UNIT_WINDOW = {"x": -200, "y": -200, "w": 400, "h": 320}


def unit_expectation(parsed: dict, refs_dir: Path, lines: list[tuple]) -> Image.Image:
    """Every SEB line of one unit in the unit's own coordinates, in draw order.

    Each line entry is (sheet, cell, mirrored, transX, transY): the crop is composited at
    line origin + OPT dest, which is exactly what the production DOM does now that the lines are
    placed independently (native per-line SEB transX/transY). `mirrored` is the native `,u`
    resource flip, which applies to every line of the unit, so both entries use the same value.
    """
    canvas = Image.new("RGBA", (UNIT_WINDOW["w"], UNIT_WINDOW["h"]), MAGENTA)
    for sheet, cell, mirrored, trans_x, trans_y in lines:
        key = f"u{cell[0]}_v{cell[1]}"
        component = parsed[sheet]["components"][key]
        crop = component_crop(parsed, refs_dir, sheet, key)
        x = component["dest"]["x"]
        if mirrored:
            crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
            x = parsed[sheet]["cellWidth"] - component["dest"]["x"] - component["src"]["w"]
        canvas.alpha_composite(
            crop,
            (trans_x + x - UNIT_WINDOW["x"], trans_y + component["dest"]["y"] - UNIT_WINDOW["y"]),
        )
    return canvas


def clip_region(canvas: Image.Image, clip_rect: dict, anchor_rect: dict) -> Image.Image:
    x = round(clip_rect["x"] - anchor_rect["x"]) - UNIT_WINDOW["x"]
    y = round(clip_rect["y"] - anchor_rect["y"]) - UNIT_WINDOW["y"]
    return canvas.crop((x, y, x + round(clip_rect["w"]), y + round(clip_rect["h"])))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="evidence dir written by run_check.mjs")
    ap.add_argument("--tolerance", type=int, default=0)
    args = ap.parse_args()

    root = Path(args.dir).resolve()
    refs_dir = root / "references"
    report = Report()

    tables = load(root / "ts-tables.json")
    parsed = load(root / "opt-parsed.json")
    geometry = load(root / "harness-geometry.json")
    page = load(root / "page-check.json")
    encounters = {int(key): value for key, value in tables["encounters"].items()}
    sheets = {**tables["extraSheets"], **tables["baseSheets"]}

    # ------------------------------------------------------------------ production tables vs OPT
    for name, sheet in sorted(parsed.items()):
        table = sheets[name]
        report.expect("table", f"{name}: cell size", [table["cellW"], table["cellH"]], [sheet["cellWidth"], sheet["cellHeight"]])
        report.expect("table", f"{name}: grid", [table["cols"], table["rows"]], [sheet["cols"], sheet["rows"]])
        report.expect("table", f"{name}: OPT sha256 prefix is the provenance guard", table["optSha256_16"], sheet["optSha256_16"])
        report.expect("table", f"{name}: served copy is byte-identical to the RE-evidence original", True, sheet["originalOptMatchesServed"])
        report.expect("table", f"{name}: PNG equals the union of its source rects", True, sheet["unionEqualsPngSize"])
        report.expect(
            "table",
            f"{name}: component cells ({sheet['cols']}x{sheet['rows']})",
            sorted(f"u{c['u']}_v{c['v']}" for c in table["components"]),
            sorted(sheet["components"]),
        )
        for key, component in sorted(sheet["components"].items(), key=lambda kv: kv[1]["index"]):
            column = int(key.split("_")[0][1:])
            row = int(key.split("_")[1][1:])
            table_component = next(
                (c for c in table["components"] if c["u"] == column and c["v"] == row), None
            )
            if table_component is None:
                report.add("table", f"{name} {key}: present in the production table", False)
                continue
            report.expect("table", f"{name} {key}: imageRef", table_component["imageRef"], component["imageRef"])
            report.expect("table", f"{name} {key}: dest", [table_component["destX"], table_component["destY"]], [component["dest"]["x"], component["dest"]["y"]])
            report.expect(
                "table",
                f"{name} {key}: source rect",
                [table_component["srcX"], table_component["srcY"], table_component["w"], table_component["h"]],
                [component["src"]["x"], component["src"]["y"], component["src"]["w"], component["src"]["h"]],
            )

    for encounter_id, value in sorted(encounters.items()):
        body_sheet = tables["imgSheets"][str(value["img"])]
        shadow_sheet = tables["shadowBySize"][str(value["size"])]
        report.add("mapping", f"encounter {encounter_id}: body sheet {body_sheet} decoded", body_sheet in parsed)
        report.add("mapping", f"encounter {encounter_id}: shadow sheet {shadow_sheet} decoded", shadow_sheet in parsed)

    # ------------------------------------------------------------------ rendered pixels
    items_by_case: dict[str, list[dict]] = {}
    for item in geometry["items"]:
        items_by_case.setdefault(item["caseId"], []).append(item)

    seb_clips = {name: decode_seb(MONSTER_SEB_DIR / file) for name, file in SEB_FILES.items()}
    body_cells: dict[str, set[tuple[int, int]]] = {}
    for case in geometry["cases"]:
        case_id = case["id"]
        encounter_id, frame_part, side = case_id.split("-")
        frame_key = int(frame_part.replace("f", ""))
        clip_name = "wait" if side == "ally" else "waitLeft"
        body_cell = EXPECTED_BODY_CELL[(clip_name, frame_key)]
        encounter = encounters[int(encounter_id)]
        body_sheet = tables["imgSheets"][str(encounter["img"])]
        shadow_sheet = tables["shadowBySize"][str(encounter["size"])]
        body_cells.setdefault(body_sheet, set()).add(body_cell)
        items = items_by_case[case_id]
        label = f"{case_id}"

        # the expectation comes from the SEB bytes themselves, not from the selection rule
        body_key_record = seb_key_record(seb_clips[clip_name], 1, frame_key)
        report.expect(
            "seb",
            f"{label}: SEB {SEB_FILES[clip_name]} key {frame_key} line 1 addresses u={body_cell[0] * 80}, v={body_cell[1] * 60}",
            [body_key_record["u"], body_key_record["v"]],
            [body_cell[0] * 80, body_cell[1] * 60],
        )
        report.expect("seb", f"{label}: SEB line 1 crop is the 80x60 cell", [body_key_record["w"], body_key_record["h"]], [80, 60])
        shadow_key_record = seb_key_record(seb_clips[clip_name], 0, frame_key)
        report.expect("seb", f"{label}: shadow line key {frame_key} stays on cell (0,0)", [shadow_key_record["u"], shadow_key_record["v"]], [0, 0])

        mirrored_case = side == "enemy"
        expected = unit_expectation(
            parsed,
            refs_dir,
            [
                # the native `,u` flip belongs to the resource, so the shadow line mirrors too
                (shadow_sheet, (0, 0), mirrored_case, shadow_key_record["transX"], shadow_key_record["transY"]),
                (body_sheet, body_cell, mirrored_case, body_key_record["transX"], body_key_record["transY"]),
            ],
        )

        for item in items:
            kind = "body" if item["sheet"] == body_sheet else "shadow" if item["sheet"] == shadow_sheet else "unknown"
            if kind == "unknown":
                report.add("render", f"{label}/{item['sheet']}: sheet is the encounter's body or shadow sheet", False)
                continue
            u, v = body_cell if kind == "body" else (0, 0)
            sheet = parsed[item["sheet"]]
            component = sheet["components"][f"u{u}_v{v}"]
            dest, src = component["dest"], component["src"]
            mirrored = side == "enemy"
            item_label = f"{label}/{kind}"
            cell_rect = item["cellRect"]
            record = body_key_record if kind == "body" else shadow_key_record

            # native per-line placement: the line's own SEB translation puts the cell box down
            report.expect(
                "placement",
                f"{item_label}: cell box = entity origin + SEB trans",
                [round(item["cellRect"]["x"] - item["anchorRect"]["x"]), round(item["cellRect"]["y"] - item["anchorRect"]["y"])],
                [record["transX"], record["transY"]],
            )
            report.expect(
                "geometry",
                f"{item_label}: cell box size",
                [round(cell_rect["w"]), round(cell_rect["h"])],
                [sheet["cellWidth"], sheet["cellHeight"]],
            )

            # the packed sheet must be drawn at natural size: the viewport is the crop, not a fit
            report.expect(
                "scale",
                f"{item_label}: image drawn at natural size, not fitted to the viewport",
                [px(item["imgStyle"]["width"]), px(item["imgStyle"]["height"])],
                [item["natural"]["w"], item["natural"]["h"]],
                "a fitted image cannot be a 1:1 drawImage crop",
            )
            report.expect("geometry", f"{item_label}: image shift (-srcX,-srcY)", [px(item["imgStyle"]["left"]), px(item["imgStyle"]["top"])], [-src["x"], -src["y"]])
            report.expect("geometry", f"{item_label}: viewport style origin (destX,destY)", [px(item["clipStyle"]["left"]), px(item["clipStyle"]["top"])], [dest["x"], dest["y"]])
            report.expect("geometry", f"{item_label}: viewport size = source rect", [round(item["clipRect"]["w"]), round(item["clipRect"]["h"])], [src["w"], src["h"]])
            report.expect("geometry", f"{item_label}: image natural size = packed PNG size", [item["natural"]["w"], item["natural"]["h"]], sheet["pngSize"])

            expected_x = cell_rect["x"] + (sheet["cellWidth"] - dest["x"] - src["w"] if mirrored else dest["x"])
            expected_y = cell_rect["y"] + dest["y"]
            report.expect(
                "geometry",
                f"(b) {item_label}: painted at cellOrigin + (destX,destY)" + (" (mirrored cell)" if mirrored else ""),
                [round(item["clipRect"]["x"]), round(item["clipRect"]["y"])],
                [round(expected_x), round(expected_y)],
            )

            expected_region = clip_region(expected, item["clipRect"], item["anchorRect"])
            shot = Image.open(root / item["file"]).convert("RGBA")
            stats = diff_stats(shot, expected_region, args.tolerance)
            report.add("pixels", f"{item_label}: capture size", shot.size == expected_region.size, f"{shot.size} vs {expected_region.size}")
            if stats["differingPixels"] is not None:
                report.add(
                    "pixels",
                    f"(a) {item_label}: viewport pixels == PNG crop at ({src['x']},{src['y']},{src['w']},{src['h']})",
                    stats["differingPixels"] == 0,
                    f"{stats['differingPixels']} differing px, max delta {stats['maxChannelDelta']}",
                )

            if kind == "body":
                other = (1 - body_cell[0], body_cell[1])
                other_key = f"u{other[0]}_v{other[1]}"
                if other_key in sheet["components"]:
                    control = unit_expectation(
                        parsed,
                        refs_dir,
                        [
                            (shadow_sheet, (0, 0), mirrored_case, shadow_key_record["transX"], shadow_key_record["transY"]),
                            (body_sheet, other, mirrored_case, body_key_record["transX"], body_key_record["transY"]),
                        ],
                    )
                    control_region = clip_region(control, item["clipRect"], item["anchorRect"])
                    control_stats = diff_stats(shot, control_region, args.tolerance)
                    report.add(
                        "pixels",
                        f"(c) {item_label}: does not match the cell the SEB did not select",
                        (control_stats["differingPixels"] or 0) > 0,
                        f"{control_stats['differingPixels']} differing px",
                    )

    # ------------------------------------------------------------------ (d) Wairo Tank
    tank = parsed.get("all_monster_l_wairo02")
    if tank is None:
        report.add("tank", "(d) all_monster_l_wairo02 decoded", False)
    else:
        expected_regions = {
            "u0_v0": {"src": [0, 118, 61, 58], "dest": [6, 1]},
            "u1_v0": {"src": [0, 0, 61, 59], "dest": [6, 0]},
            "u0_v1": {"src": [0, 176, 61, 58], "dest": [6, 1]},
            "u1_v1": {"src": [0, 59, 61, 59], "dest": [6, 0]},
        }
        for key, expected in expected_regions.items():
            component = tank["components"].get(key)
            if component is None:
                report.add("tank", f"(d) all_monster_l_wairo02 {key} exists", False)
                continue
            report.expect(
                "tank",
                f"(d) all_monster_l_wairo02 {key}: packed region",
                [component["src"]["x"], component["src"]["y"], component["src"]["w"], component["src"]["h"]],
                expected["src"],
            )
            report.expect("tank", f"(d) all_monster_l_wairo02 {key}: dest", [component["dest"]["x"], component["dest"]["y"]], expected["dest"])
        report.expect("tank", "(d) all_monster_l_wairo02: 160x120 logical atlas", [tank["cellWidth"] * tank["cols"], tank["cellHeight"] * tank["rows"]], [160, 120])
        report.add(
            "tank",
            "(d) all_monster_l_wairo02: the two rows hold different art (a wrong-cell crop is visible)",
            _images_differ(component_crop(parsed, refs_dir, "all_monster_l_wairo02", "u0_v0"), component_crop(parsed, refs_dir, "all_monster_l_wairo02", "u0_v1")),
        )

    # ------------------------------------------------------------------ (e) shadows
    rendered_sheets = {item["sheet"] for item in geometry["items"]}
    for name, expected in {
        "shadow_m": {"src": [0, 0, 23, 3], "dest": [28, 57]},
        "shadow_l": {"src": [0, 0, 32, 3], "dest": [24, 57]},
    }.items():
        sheet = parsed.get(name)
        if sheet is None:
            report.add("shadow", f"(e) {name} decoded", False)
            continue
        component = sheet["components"]["u0_v0"]
        report.expect(
            "shadow",
            f"(e) {name}: packed region",
            [component["src"]["x"], component["src"]["y"], component["src"]["w"], component["src"]["h"]],
            expected["src"],
        )
        report.expect("shadow", f"(e) {name}: dest inside the 80x60 cell", [component["dest"]["x"], component["dest"]["y"]], expected["dest"])
        report.expect("shadow", f"(e) {name}: cell", [sheet["cellWidth"], sheet["cellHeight"]], [80, 60])
        report.add("shadow", f"(e) {name}: rendered by the production component", name in rendered_sheets)

    # ------------------------------------------------------------------ coverage + runtime
    for name, cells in sorted(body_cells.items()):
        report.expect(
            "coverage",
            f"{name}: all four logical cells rendered through the SEB",
            sorted(cells),
            [(0, 0), (0, 1), (1, 0), (1, 1)],
        )
    report.expect("coverage", "probe page console (favicon noise excluded)", [], [
        entry for entry in geometry["console"] if "favicon" not in (entry.get("url") or "")
    ])
    report.expect("coverage", "probe page failed requests (favicon noise excluded)", [], [
        entry for entry in geometry["failures"] if "favicon" not in (entry.get("url") or "")
    ])

    asset_failures = [entry for entry in page["initialFailures"] if "/battle-assets/" in (entry.get("url") or "")]
    report.expect("runtime", "(f) /battle-replay served every battle asset", [], asset_failures)
    exceptions = [entry for entry in page["initialConsole"] if entry.get("type") == "exception"]
    report.expect("runtime", "(f) /battle-replay threw no exception", [], exceptions)
    report.expect("runtime", "(f) /battle-replay has no broken images", [], page["page"]["brokenImages"])
    report.add("runtime", "(f) native monster bodies present on the real stage", len(page["clipBoxes"]) > 0, f"{len(page['clipBoxes'])} component viewports")
    report.expect(
        "runtime",
        "(f) every real-stage monster sheet is drawn at natural size",
        [],
        [
            f"{entry['sheet']}: {entry['imgStyle']['width']}x{entry['imgStyle']['height']} vs natural {entry['natural']['w']}x{entry['natural']['h']}"
            for entry in page["clipBoxes"]
            if abs(px(entry["imgStyle"]["width"]) - entry["natural"]["w"]) > 0.01
            or abs(px(entry["imgStyle"]["height"]) - entry["natural"]["h"]) > 0.01
        ],
    )
    report.expect("runtime", "(f) every real-stage component viewport keeps its cell box", [], [
        entry["sheet"] for entry in page["clipBoxes"] if entry["cellStyle"]["width"] != "80px" or entry["cellStyle"]["height"] != "60px"
    ])
    report.expect(
        "runtime",
        "(f) every encounter switches without errors or broken images",
        [],
        [entry["label"] for entry in page["encounters"] if entry["brokenImages"] or any(e.get("type") == "exception" for e in entry["console"])],
    )
    environment_notes = [
        entry["url"] for entry in page["initialFailures"] if entry.get("url") and "/battle-assets/" not in entry["url"]
    ] + [entry["text"] for entry in page["initialConsole"] if entry.get("url", "").startswith("http://127.0.0.1:5173/ka-api")]
    report.add("runtime", "(f) environment noise recorded separately", True, "; ".join(sorted(set(environment_notes)))[:400])

    failures = report.failures
    summary = {
        "checks": len(report.checks),
        "passed": len(report.checks) - len(failures),
        "failed": len(failures),
        "failures": failures,
        "checks_detail": report.checks,
        "environmentNotes": sorted(set(environment_notes)),
    }
    (root / "compare-report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"checks {summary['passed']}/{summary['checks']} passed")
    for failure in failures:
        print(f"FAIL [{failure['group']}] {failure['name']}: {failure['detail']}")
    groups: dict[str, list[int]] = {}
    for check in report.checks:
        counts = groups.setdefault(check["group"], [0, 0])
        counts[0] += 1
        counts[1] += 0 if check["pass"] else 1
    for group, (total, bad) in sorted(groups.items()):
        print(f"  {group}: {total - bad}/{total} passed")
    return 1 if failures else 0


def _images_differ(left: Image.Image, right: Image.Image) -> bool:
    if left.size != right.size:
        return True
    return left.tobytes() != right.tobytes()


if __name__ == "__main__":
    raise SystemExit(main())
