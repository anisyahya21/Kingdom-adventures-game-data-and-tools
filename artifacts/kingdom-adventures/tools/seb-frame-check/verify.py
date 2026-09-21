#!/usr/bin/env python3
"""Independent verification of the SEB frame/line selection wired into the battle replay.

Inputs are the artefacts written by run_check.mjs plus the intact original SEB files and the
validated OPT sheets. The script:

  A. frame-key lookup   - every clip/line/frame probe the browser produced is compared with an
                          independent decode of the SEB bytes using the confirmed rule
                          (Seb.GetSprite 0x2351CA0, see seb-lookup/ in this evidence folder);
  B. coordinate use     - the SEB-selected (u,v) of each rendered case must be the cell whose OPT
                          crop the component actually painted;
  C. second row         - a case that selects v=60 must paint row 1 and must not match row 0;
  D. body/shadow        - the two lines keep their own records, image overrides and cells;
  E. no temporary rule  - the production path no longer contains animState -> poseColumn.
"""

from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

from PIL import Image

MAGENTA = (255, 0, 255, 255)
ARTIFACT = Path(__file__).resolve().parents[2]
KA_WEBSITE = ARTIFACT.parents[1]
WORKSPACE = KA_WEBSITE.parent
SEB_DIR = WORKSPACE / "RE-evidence" / "20260911-treasure" / "monster-original"
SERVED_SHEETS = ARTIFACT / "public" / "battle-assets" / "monster-original"
MANIFEST = ARTIFACT / "src" / "game-data" / "battle-animation.json"

TRACE_ROW = re.compile(
    r"^m(?P<monster>\d+) (?P<state>\w+) dir (?P<direction>\w+)\((?P<dirindex>\d+)\) "
    r"asset (?P<asset>[\w,]+) mirror u(?P<mirroru>\d) v(?P<mirrorv>\d) (?P<seb>\S+) "
    r"f(?P<frame>\d+) L(?P<line>\d+) "
    r"tex(?P<tex>-?\d+) u(?P<u>-?\d+) v(?P<v>-?\d+) w(?P<w>\d+) h(?P<h>\d+) "
    r"tX(?P<transX>-?\d+) tY(?P<transY>-?\d+) rU(?P<reversU>\d+) rV(?P<reversV>\d+) img (?P<image>\S+)"
)
TRACE_ROW_NONE = re.compile(
    r"^m(?P<monster>\d+) (?P<state>\w+) dir (?P<direction>\w+)\((?P<dirindex>\d+)\) "
    r"asset (?P<asset>[\w,]+) mirror u(?P<mirroru>\d) v(?P<mirrorv>\d) (?P<seb>\S+) "
    r"f(?P<frame>\d+) L(?P<line>\d+) · no record"
)


def parse_trace_row(row: str) -> dict | None:
    """Parse one debug-overlay row of the running page (same text the driver captures)."""
    match = TRACE_ROW.match(row)
    if match:
        record = {key: int(match.group(key)) for key in ("tex", "u", "v", "w", "h", "transX", "transY", "reversU", "reversV")}
        record["image"] = match.group("image")
        return {
            "monsterId": int(match.group("monster")),
            "state": match.group("state"),
            "direction": match.group("direction"),
            "directionIndex": int(match.group("dirindex")),
            "asset": match.group("asset"),
            "mirror": {"u": match.group("mirroru") == "1", "v": match.group("mirrorv") == "1"},
            "seb": match.group("seb"),
            "frame": int(match.group("frame")),
            "line": int(match.group("line")),
            "record": record,
        }
    match = TRACE_ROW_NONE.match(row)
    if match:
        return {
            "monsterId": int(match.group("monster")),
            "state": match.group("state"),
            "direction": match.group("direction"),
            "directionIndex": int(match.group("dirindex")),
            "asset": match.group("asset"),
            "mirror": {"u": match.group("mirroru") == "1", "v": match.group("mirrorv") == "1"},
            "seb": match.group("seb"),
            "frame": int(match.group("frame")),
            "line": int(match.group("line")),
            "record": None,
        }
    return None


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


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
                dict(line=line, frame=frame, tex=tex, u=u, v=v, w=w, h=h,
                     transX=trans_x, transY=trans_y, reversU=revers_u, reversV=revers_v)
            )
    if pos != len(data):
        raise SystemExit(f"{path.name}: parsed {pos} of {len(data)} bytes")
    return {"layers": layers, "maxFrame": max_frame, "records": records, "bytes": len(data)}


def line_records(clip: dict, line: int) -> list[dict]:
    return [record for record in clip["records"] if record["line"] == line]


def expected_record(clip: dict, frame: int, line: int) -> dict | None:
    """The confirmed Seb.GetSprite rule: wrap, then persist/step the line's own key list."""
    records = line_records(clip, line)
    if not records:
        return None
    phase = frame % clip["maxFrame"]
    if phase < records[0]["frame"] or phase > records[-1]["frame"]:
        return None
    current = records[0]
    for record in records:
        if record["frame"] <= phase:
            current = record
        else:
            break
    return current


class Report:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, group: str, name: str, passed: bool, detail: str = "") -> bool:
        self.checks.append({"group": group, "name": name, "pass": bool(passed), "detail": detail})
        return bool(passed)

    def expect(self, group: str, name: str, actual, expected, detail: str = "") -> bool:
        ok = actual == expected
        return self.add(group, name, ok, detail if ok else f"expected {expected!r}, got {actual!r}")

    @property
    def failures(self) -> list[dict]:
        return [check for check in self.checks if not check["pass"]]


def load_opt_parser():
    sys.path.insert(0, str(KA_WEBSITE / "tools" / "asset_extractor" / "parsers"))
    import opt_parser  # noqa: E402

    return opt_parser


def opt_sheets(names: set[str], parser) -> dict[str, dict]:
    sheets = {}
    for name in sorted(names):
        parsed = parser.parse_opt(SERVED_SHEETS / f"{name}.opt")
        image = Image.open(SERVED_SHEETS / f"{name}.png").convert("RGBA")
        components = {
            f"u{sprite['u']}_v{sprite['v']}": sprite for sprite in parsed["sprites"]
        }
        sheets[name] = {
            "cellW": parsed["cell_width"],
            "cellH": parsed["cell_height"],
            "png": image,
            "components": components,
        }
    return sheets


def cell_crop(sheet: dict, cell: tuple[int, int]) -> Image.Image:
    sprite = sheet["components"][f"u{cell[0]}_v{cell[1]}"]
    return sheet["png"].crop(
        (sprite["src_x"], sprite["src_y"], sprite["src_x"] + sprite["w"], sprite["src_y"] + sprite["h"])
    )


"""Unit-space window for the expectations: origin = entity origin."""
UNIT_WINDOW = {"x": -200, "y": -200, "w": 400, "h": 320}


def unit_expectation(lines: list[tuple]) -> Image.Image:
    """All SEB lines of one unit in unit coordinates: (sheet, cell, (flipU, flipV), transX, transY).

    The native flip belongs to the resource, so every line of the unit is mirrored on the same axes
    about its own crop rect centre (which is what the cell-box transform does).
    """
    canvas = Image.new("RGBA", (UNIT_WINDOW["w"], UNIT_WINDOW["h"]), MAGENTA)
    for sheet, cell, flip, trans_x, trans_y in lines:
        flip_u, flip_v = flip
        component = sheet["components"][f"u{cell[0]}_v{cell[1]}"]
        crop = cell_crop(sheet, cell)
        x = component["dest_x"]
        if flip_u:
            crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
            x = sheet["cellW"] - component["dest_x"] - component["w"]
        y = component["dest_y"]
        if flip_v:
            crop = crop.transpose(Image.FLIP_TOP_BOTTOM)
            y = sheet["cellH"] - component["dest_y"] - component["h"]
        canvas.alpha_composite(crop, (trans_x + x - UNIT_WINDOW["x"], trans_y + y - UNIT_WINDOW["y"]))
    return canvas


def clip_region(canvas: Image.Image, clip_rect: dict, anchor_rect: dict) -> Image.Image:
    x = round(clip_rect["x"] - anchor_rect["x"]) - UNIT_WINDOW["x"]
    y = round(clip_rect["y"] - anchor_rect["y"]) - UNIT_WINDOW["y"]
    return canvas.crop((x, y, x + round(clip_rect["w"]), y + round(clip_rect["h"])))


def diff(rendered: Image.Image, expected: Image.Image, tolerance: int = 0) -> dict:
    if rendered.size != expected.size:
        return {"sizeMatch": False, "differingPixels": None, "maxChannelDelta": None}
    a, b = rendered.convert("RGBA").load(), expected.convert("RGBA").load()
    differing = max_delta = 0
    for y in range(rendered.height):
        for x in range(rendered.width):
            delta = max(abs(a[x, y][i] - b[x, y][i]) for i in range(4))
            if delta > tolerance:
                differing += 1
            max_delta = max(max_delta, delta)
    return {"sizeMatch": True, "differingPixels": differing, "maxChannelDelta": max_delta}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    args = ap.parse_args()
    root = Path(args.dir).resolve()
    report = Report()

    probe = load(root / "seb-probe.json")
    geometry = load(root / "seb-geometry.json")
    page = load(root / "page-check.json")
    manifest = load(MANIFEST)
    parser = load_opt_parser()

    clip_by_key = {entry["key"]: entry for entry in probe["clips"]}
    decoded = {key: decode_seb(SEB_DIR / entry["seb"]) for key, entry in clip_by_key.items()}

    # ---------------------------------------------------------------- manifest provenance
    for key, entry in clip_by_key.items():
        source = manifest["sources"].get(f"monster{key[0].upper()}{key[1:]}") or {}
        report.add("provenance", f"{key}: decoded from an intact SEB", source.get("intact") is True, json.dumps(source)[:200])
        report.expect("provenance", f"{key}: no dropped records", 0, source.get("droppedRecords"))
        clip_manifest = manifest["clips"].get(f"monster{key[0].upper()}{key[1:]}")
        if clip_manifest is not None:
            report.expect("provenance", f"{key}: manifest clip name matches the browser clip", clip_manifest["seb"], entry["seb"])
            manifest_records = sorted(
                (r["line"], r["frame"], r["tex"], r["u"], r["v"], r["w"], r["h"], r["transX"], r["transY"], r["reversU"], r["reversV"])
                for r in clip_manifest["frames"]
            )
            seb_records = sorted(
                (r["line"], r["frame"], r["tex"], r["u"], r["v"], r["w"], r["h"], r["transX"], r["transY"], r["reversU"], r["reversV"])
                for r in decoded[key]["records"]
            )
            report.expect("provenance", f"{key}: manifest equals the intact SEB bytes", manifest_records, seb_records)
        for line in entry["lines"]:
            report.expect(
                "provenance",
                f"{key}: line {line['line']} key list matches the SEB",
                line["keys"],
                [r["frame"] for r in line_records(decoded[key], line["line"])],
            )

    # ---------------------------------------------------------------- A. frame-key lookup
    per_clip = {}
    for entry in probe["selection"]:
        clip = decoded[entry["clip"]]
        expected = expected_record(clip, entry["frame"], entry["line"])
        actual = entry["record"]
        key = (entry["clip"], entry["line"])
        per_clip.setdefault(key, [0, 0])
        per_clip[key][0] += 1
        same = (expected is None and actual is None) or (
            expected is not None and actual is not None and all(actual[field] == expected[field] for field in expected)
        )
        if same:
            per_clip[key][1] += 1
        report.expect("frame", f"{entry['clip']} L{entry['line']} frame {entry['frame']}", actual, expected)
    for (clip, line), (total, ok) in sorted(per_clip.items()):
        report.expect("frame", f"{clip} line {line}: probes matched", ok, total)

    wait_clip = decoded["wait"]
    wait_left = decoded["waitLeft"]
    attack = decoded["attack"]
    report.expect("frame-key", "wait L1: frame 0 -> key 0 (u=0)", expected_record(wait_clip, 0, 1)["u"], 0)
    report.expect("frame-key", "wait L1: frame 9 -> key 9 (u=0 persists)", expected_record(wait_clip, 9, 1)["u"], 0)
    report.expect("frame-key", "wait L1: frame 10 -> key 10 (u=80)", expected_record(wait_clip, 10, 1)["u"], 80)
    report.expect("frame-key", "wait L1: frame 19 -> key 19 (u=80 persists)", expected_record(wait_clip, 19, 1)["u"], 80)
    report.expect("frame-key", "waitLeft L1: row stays 60 for every key", sorted({r["v"] for r in line_records(wait_left, 1)}), [60])
    report.expect("frame-key", "attack L1: frame 2 -> u=0", expected_record(attack, 2, 1)["u"], 0)
    report.expect("frame-key", "attack L1: frame 3 -> previous key (u=0 persists)", expected_record(attack, 3, 1)["u"], 0)
    report.expect("frame-key", "attack L1: frame 4 -> u=80", expected_record(attack, 4, 1)["u"], 80)
    report.expect("frame-key", "attack L1: frame 9 -> last key returns to u=0", expected_record(attack, 9, 1)["u"], 0)
    report.expect("frame-key", "attack L0: shadow stays u=0 v=0", sorted({(r["u"], r["v"]) for r in line_records(attack, 0)}), [(0, 0)])
    report.expect(
        "frame-key",
        "frame is wrapped before the lookup (tick 40 of a 10-frame clip == frame 0)",
        expected_record(attack, 40, 1),
        expected_record(attack, 0, 1),
    )
    covered = all(
        line_records(clip, line)[0]["frame"] == 0 and line_records(clip, line)[-1]["frame"] == clip["maxFrame"] - 1
        for clip in decoded.values()
        for line in range(clip["layers"])
    )
    report.add(
        "frame-key",
        "every line's keys span [0, maxFrame-1], so the native 'no sprite' branch is unreachable for these clips",
        covered,
    )

    # ---------------------------------------------------------------- B/C/D. rendered cells
    items_by_case = {}
    for item in geometry["items"]:
        items_by_case.setdefault(item["caseId"], []).append(item)
    sheets_needed = {entry["bodySheet"] for entry in probe["renderCases"]} | {entry["shadowSheet"] for entry in probe["renderCases"]}
    sheets = opt_sheets({name for name in sheets_needed if name}, parser)

    # ------------------------------------------------- direction model vs monster/seb.inf (CONFIRMED)
    MONSTER_SEB_INF = SEB_DIR / "seb.inf"
    inf_entries = {}
    for line in MONSTER_SEB_INF.read_text(encoding="utf-8-sig").splitlines():
        if "\t" not in line:
            continue
        index, rest = line.split("\t", 1)
        inf_entries[int(index)] = rest.strip()
    DIRECTIONS = {"up": 0, "right": 1, "down": 2, "left": 3}
    for direction, index in DIRECTIONS.items():
        variant = probe["directionModel"][direction]
        report.expect("direction", f"{direction}: direction constant", variant["index"], index)
        flags = "".join(f",{flag}" for flag in variant["assetFlags"])
        report.expect(
            "direction",
            f"(A) {direction}: seb.inf wait entry",
            inf_entries[index],
            f"monster_s_wait_{variant['asset']}.seb{flags}",
        )
        report.expect(
            "direction",
            f"(A) {direction}: seb.inf attack entry at base 16 + {index}",
            inf_entries[16 + index],
            f"monster_s_attack_{variant['asset']}.seb{flags}",
        )
        report.expect(
            "direction",
            f"(B) {direction}: native mirror state",
            [variant["mirror"]["u"], variant["mirror"]["v"]],
            [direction in ("down", "left"), False],
        )
    report.expect(
        "direction",
        "(A) only two monster_s wait assets back the four directions",
        sorted({probe["directionModel"][d]["asset"] for d in DIRECTIONS}),
        ["right", "up"],
    )
    report.expect("direction", "ally entity direction", probe["battleDirections"]["ally"], "up")
    report.expect("direction", "enemy entity direction", probe["battleDirections"]["enemy"], "down")

    clip_key_for = {
        ("wait", "up"): "wait",
        ("wait", "right"): "waitLeft",
        ("attack", "up"): "attack",
        ("attack", "right"): "attackLeft",
    }

    for case in probe["renderCases"]:
        case_id = case["id"]
        variant = probe["directionModel"][case["direction"]]
        clip = decoded[clip_key_for[(case["state"], variant["asset"])]]
        report.expect(
            "direction",
            f"(A) {case_id}: {case['direction']} uses the {variant['asset']} asset",
            clip_by_key[clip_key_for[(case["state"], variant["asset"])]]["seb"],
            f"monster_s_{case['state']}_{variant['asset']}.seb",
        )
        shadow_record = expected_record(clip, case["frame"], 0)
        body_record = expected_record(clip, case["frame"], 1)
        if shadow_record is None or body_record is None:
            report.add("render", f"{case_id}: both lines resolve", False, "no record")
            continue
        shadow_cell = (shadow_record["u"] // 80, shadow_record["v"] // 60)
        body_cell = (body_record["u"] // 80, body_record["v"] // 60)
        report.expect("render", f"{case_id}: SEB selects body cell", list(body_cell), [case["expectedBodyCell"][0], case["expectedBodyCell"][1]])
        report.expect("render", f"{case_id}: SEB selects shadow cell", list(shadow_cell), [0, 0])
        report.add(
            "render",
            f"(D) {case_id}: body and shadow lines keep separate image overrides",
            bool(case["bodySheet"]) and bool(case["shadowSheet"]) and case["bodySheet"] != case["shadowSheet"],
            f"body={case['bodySheet']} shadow={case['shadowSheet']}",
        )
        report.add(
            "render",
            f"(D) {case_id}: body and shadow records are different SEB records",
            (body_record["tex"], body_record["frame"], body_record["line"]) != (shadow_record["tex"], shadow_record["frame"], shadow_record["line"]),
            f"body tex{body_record['tex']} L{body_record['line']} vs shadow tex{shadow_record['tex']} L{shadow_record['line']}",
        )

        mirrored_case = variant["mirror"]["u"]

        def expectation_for(body_target: tuple[int, int], mirror: bool, vertical: bool = False) -> Image.Image:
            return unit_expectation(
                [
                    (
                        sheets[case["shadowSheet"]],
                        shadow_cell,
                        (mirror, vertical),
                        shadow_record["transX"],
                        shadow_record["transY"],
                    ),
                    (
                        sheets[case["bodySheet"]],
                        body_target,
                        (mirror, vertical),
                        body_record["transX"],
                        body_record["transY"],
                    ),
                ]
            )

        expected = expectation_for(body_cell, mirrored_case)
        for item in items_by_case.get(case_id, []):
            kind = "body" if item["sheet"] == case["bodySheet"] else "shadow" if item["sheet"] == case["shadowSheet"] else "unknown"
            report.add("render", f"{case_id}: viewport belongs to a known line sheet", kind != "unknown", item["sheet"])
            report.expect(
                "render",
                f"{case_id}/{kind}: packed image drawn at natural size",
                [float(item["imgStyle"]["width"].replace("px", "")), float(item["imgStyle"]["height"].replace("px", ""))],
                [item["natural"]["w"], item["natural"]["h"]],
            )
            report.expect(
                "render",
                f"(E) {case_id}/{kind}: native mirror state on this line's cell box",
                item["cellStyle"]["transform"],
                "matrix(-1, 0, 0, 1, 0, 0)" if mirrored_case else "none",
            )
            if kind == "unknown" or not item.get("anchorRect"):
                continue
            record = body_record if kind == "body" else shadow_record
            shot = Image.open(root / item["file"]).convert("RGBA")
            region = clip_region(expected, item["clipRect"], item["anchorRect"])
            stats = diff(shot, region)
            report.expect("render", f"{case_id}/{kind}: viewport capture size", list(shot.size), [region.width, region.height])
            report.add(
                "render",
                f"(B) {case_id}/{kind}: painted pixels == OPT crop of the SEB-selected cell",
                stats["differingPixels"] == 0,
                f"{stats['differingPixels']} differing px, max delta {stats['maxChannelDelta']}",
            )
            if kind == "body":
                if mirrored_case:
                    mirror_stats = diff(shot, clip_region(expectation_for(body_cell, False), item["clipRect"], item["anchorRect"]))
                    report.add(
                        "render",
                        f"(D) {case_id}: the mirrored direction differs from the unmirrored crop",
                        (mirror_stats["differingPixels"] or 0) > 0,
                        f"{mirror_stats['differingPixels']} differing px",
                    )
                    vertical_stats = diff(
                        shot,
                        clip_region(
                            expectation_for(body_cell, True, vertical=True),
                            item["clipRect"],
                            item["anchorRect"],
                        ),
                    )
                    report.add(
                        "render",
                        f"(D) {case_id}: the flip is on the u axis, not the v axis",
                        (vertical_stats["differingPixels"] or 0) > 0,
                        f"{vertical_stats['differingPixels']} differing px vs the vertical flip",
                    )
                if body_cell[1] == 1:
                    row_stats = diff(shot, clip_region(expectation_for((body_cell[0], 0), mirrored_case), item["clipRect"], item["anchorRect"]))
                    report.add(
                        "render",
                        f"(C) {case_id}: v=60 paints row 1, not row 0",
                        (row_stats["differingPixels"] or 0) > 0,
                        f"{row_stats['differingPixels']} differing px",
                    )
            measured = [
                round(item["cellRect"]["x"] - item["anchorRect"]["x"]),
                round(item["cellRect"]["y"] - item["anchorRect"]["y"]),
            ]
            report.expect(
                "placement",
                f"(A/D) {case_id}/{kind}: line origin = entity origin + SEB trans",
                measured,
                [record["transX"], record["transY"]],
            )
            component = sheets[item["sheet"]]["components"][f"u{body_cell[0] if kind == 'body' else 0}_v{body_cell[1] if kind == 'body' else 0}"]
            expected_opt = (
                [
                    sheets[item["sheet"]]["cellW"] - component["dest_x"] - component["w"],
                    component["dest_y"],
                ]
                if mirrored_case
                else [component["dest_x"], component["dest_y"]]
            )
            report.expect(
                "placement",
                f"(C) {case_id}/{kind}: OPT dest still places pixels inside the SEB crop",
                [
                    round(item["clipRect"]["x"] - item["cellRect"]["x"]),
                    round(item["clipRect"]["y"] - item["cellRect"]["y"]),
                ],
                expected_opt,
            )

        case_items = [
            item
            for item in items_by_case.get(case_id, [])
            if item.get("anchorRect") and item["sheet"] in (case["bodySheet"], case["shadowSheet"])
        ]
        if len(case_items) == 2:
            offsets = {
                ("body" if item["sheet"] == case["bodySheet"] else "shadow"): [
                    round(item["cellRect"]["x"] - item["anchorRect"]["x"]),
                    round(item["cellRect"]["y"] - item["anchorRect"]["y"]),
                ]
                for item in case_items
            }
            report.expect(
                "placement",
                f"(A) {case_id}: shadow uses its own translation",
                offsets["shadow"],
                [shadow_record["transX"], shadow_record["transY"]],
            )
            report.expect(
                "placement",
                f"(A) {case_id}: body uses its own translation",
                offsets["body"],
                [body_record["transX"], body_record["transY"]],
            )
            if (shadow_record["transX"], shadow_record["transY"]) != (body_record["transX"], body_record["transY"]):
                report.add(
                    "placement",
                    f"(A) {case_id}: body and shadow land on different offsets",
                    offsets["body"] != offsets["shadow"],
                    f"body {offsets['body']} vs shadow {offsets['shadow']}",
                )

    # ---------------------------------------------------------------- B. frame-dependent translation
    def case_offset(case_id: str, kind: str = "body") -> list[int] | None:
        for item in items_by_case.get(case_id, []):
            if not item.get("anchorRect"):
                continue
            case = next((entry for entry in probe["renderCases"] if entry["id"] == case_id), None)
            if case is None:
                return None
            if item["sheet"] != (case["bodySheet"] if kind == "body" else case["shadowSheet"]):
                continue
            return [
                round(item["cellRect"]["x"] - item["anchorRect"]["x"]),
                round(item["cellRect"]["y"] - item["anchorRect"]["y"]),
            ]
        return None

    attack_clip = decoded["attack"]
    for frame_key in (0, 1, 6, 9):
        record = expected_record(attack_clip, frame_key, 1)
        report.expect(
            "placement",
            f"(B) attack f{frame_key}: body offset follows the frame's record",
            case_offset(f"116-up-attack-f{frame_key}"),
            [record["transX"], record["transY"]],
        )
    offsets_seen = {
        tuple(case_offset(f"116-up-attack-f{frame_key}") or [])
        for frame_key in (0, 1, 6, 9)
    }
    report.add(
        "placement",
        "(B) attack clip moves the body across frames",
        len(offsets_seen) >= 3,
        f"offsets {sorted(offsets_seen)}",
    )

    # ---------------------------------------------------------------- C. SEB vs OPT separation
    same_frame = {monster: case_offset(f"{monster}-down-wait-f10") for monster in (116, 121, 142)}
    report.expect(
        "placement",
        "(C) same SEB clip/frame gives identical line offsets for different sheets",
        len({tuple(value) for value in same_frame.values() if value}),
        1,
    )
    dests = {
        monster: (
            sheets[probe_case["bodySheet"]]["components"]["u1_v1"]["dest_x"],
            sheets[probe_case["bodySheet"]]["components"]["u1_v1"]["dest_y"],
        )
        for monster, probe_case in (
            (entry["monsterId"], entry)
            for entry in probe["renderCases"]
            if entry["direction"] == "down" and entry["state"] == "wait" and entry["frame"] == 10
        )
    }
    report.add(
        "placement",
        "(C) OPT destinations differ per sheet while the SEB translation does not",
        len(set(dests.values())) > 1,
        json.dumps({str(k): v for k, v in dests.items()}),
    )

    rows_seen = {
        (case["expectedBodyCell"][1])
        for case in probe["renderCases"]
    }
    report.expect("render", "(C) render cases cover both sheet rows", sorted(rows_seen), [0, 1])

    # ---------------------------------------------------------------- E. no temporary rule
    page_source = (ARTIFACT / "src" / "pages" / "battle-replay.tsx").read_text(encoding="utf-8")
    lib_source = (ARTIFACT / "src" / "lib" / "battle-replay.ts").read_text(encoding="utf-8")
    report.add(
        "timing",
        "(A) no temporary tick constant remains in the monster path",
        "TEMP_TICK_RATE" not in page_source and "TEMP_TICK_RATE" not in lib_source,
    )
    report.add(
        "timing",
        "(A) the page drives the recovered 50 ms native update",
        "NATIVE_FRAME_MS" in page_source
        and "NATIVE_ANIMATION" in lib_source
        and "nativeAnimationFrame" in page_source,
    )
    report.add(
        "timing",
        "(A) per-unit animation resets are keyed on the SEB clip identity",
        "clipId: clip.id" in page_source and "startTick" in page_source,
    )
    report.add("temporary", "(E) no poseColumn prop in the page", "poseColumn" not in page_source)
    report.add("temporary", "(E) no poseCell conversion in the lib", "poseCell" not in lib_source)
    report.add("temporary", "(E) no animState -> column expression remains", 'animState === "attack" || animState === "skill" || animState === "walk" ? 1 : 0' not in page_source)
    report.add("temporary", "(E) SEB selection rule is exported and documented", "SEB_SPRITE_SELECTION_RULE" in lib_source)
    report.add("temporary", "(E) per-line lookup helper is exported", "export function sebSpriteAt" in lib_source)
    report.add("temporary", "(D) the fixed -40/-60 anchor is gone from the page", "left: -40" not in page_source and "top: -60" not in page_source)
    report.add(
        "temporary",
        "(D) each line is placed from its own SEB record translation",
        "left: shadowRecord.transX, top: shadowRecord.transY" in page_source
        and "left: bodyRecord.transX, top: bodyRecord.transY" in page_source,
    )
    report.add(
        "direction",
        "(E) no side-based scaleX(-1) stand-in remains in the monster path",
        'side === "ally" ? undefined : "scaleX(-1)"' not in page_source
        and "side === \"enemy\" ? undefined : \"scaleX(-1)\"" not in page_source,
    )
    report.add(
        "direction",
        "(E) the mirror state comes from the native direction model",
        "sebMirror" in page_source
        and "MONSTER_DIRECTION_VARIANTS" in page_source
        and "BATTLE_DIRECTIONS" in page_source
        and "monsterClipForDirection" in page_source,
    )
    report.add(
        "direction",
        "(E) the library exports the direction -> variant model and the battle team directions",
        "MONSTER_DIRECTION_VARIANTS" in lib_source
        and "BATTLE_DIRECTIONS" in lib_source
        and "export function monsterClipForDirection" in lib_source,
    )

    # ---------------------------------------------------------------- runtime
    # ------------------------------------------------- timing (recovered native progression)
    trace = load(root / "page-trace.json")
    timing = probe["timing"]
    model = timing["model"]
    report.expect("timing", "native target frame rate", model["targetFps"], 20)
    report.expect("timing", "native monster rate (AnimationComponent.rate)", model["monsterRate"], 1)
    report.expect("timing", "milliseconds per SEB frame", timing["frameMs"], 50)
    report.expect("timing", "frameMs * targetFps == 1000 (one frame per update)", timing["frameMs"] * model["targetFps"], 1000)

    sequences = {entry["clip"]: entry for entry in timing["sequences"]}
    wait_ticks = sequences["wait"]["ticks"]
    report.expect(
        "timing",
        "(A) wait clip advances one frame per tick",
        [row["frame"] for row in wait_ticks[:8]],
        [0, 1, 2, 3, 4, 5, 6, 7],
    )
    report.expect(
        "timing",
        "(B) wait clip wraps at maxFrame 20",
        [row["frame"] for row in wait_ticks if row["tick"] in (18, 19, 20, 21, 24)],
        [18, 19, 0, 1, 4],
    )
    report.expect(
        "timing",
        "(F) wait clip body record sequence: u0 for ticks 0-9 then u80 for 10-19",
        [
            (row["body"]["u"], row["body"]["v"])
            for row in wait_ticks
            if row["tick"] in (0, 9, 10, 19, 20)
        ],
        [(0, 0), (0, 0), (80, 0), (80, 0), (0, 0)],
    )
    attack_ticks = sequences["attack"]["ticks"]
    report.expect(
        "timing",
        "(F) attack clip body sequence: u0 (0-3) -> u80 (4-8) -> u0 (9) -> wrap",
        [
            (row["tick"], row["body"]["u"])
            for row in attack_ticks
            if row["tick"] in (0, 3, 4, 8, 9, 10)
        ],
        [(0, 0), (3, 0), (4, 80), (8, 80), (9, 0), (10, 0)],
    )
    wait_cycle = [row for row in wait_ticks if row["tick"] < 20]
    report.expect(
        "timing",
        "(F) wait cycle timing: 500 ms per u cell, 1000 ms per cycle",
        [
            len([row for row in wait_cycle if row["body"]["u"] == 0]) * timing["frameMs"],
            len([row for row in wait_cycle if row["body"]["u"] == 80]) * timing["frameMs"],
            len(wait_cycle) * timing["frameMs"],
        ],
        [500, 500, 1000],
    )
    attack_cycle = [row for row in attack_ticks if row["tick"] < 10]
    report.expect(
        "timing",
        "(F) attack cycle timing: 250 ms per u cell, 500 ms per cycle",
        [
            len([row for row in attack_cycle if row["body"]["u"] == 0]) * timing["frameMs"],
            len([row for row in attack_cycle if row["body"]["u"] == 80]) * timing["frameMs"],
            len(attack_cycle) * timing["frameMs"],
        ],
        [250, 250, 500],
    )

    timeline = timing["timeline"]
    changes = [
        (row["tick"], row["clip"], row["sinceChange"], row["frame"])
        for row in timeline
        if row["tick"] in (0, 24, 25, 36, 37)
    ]
    report.expect(
        "timing",
        "(C/D) frame restarts at 0 on every clip change (wait -> attack -> wait)",
        changes,
        [
            (0, "monsterWait", 0, 0),
            (24, "monsterWait", 24, 4),
            (25, "monsterAttack", 0, 0),
            (36, "monsterAttack", 11, 1),
            (37, "monsterWait", 0, 0),
        ],
    )
    report.add(
        "timing",
        "(E) units that changed animation at different ticks are out of phase",
        timing["phaseIndependence"]["early"] != timing["phaseIndependence"]["late"],
        f"early {timing['phaseIndependence']['early']} vs late {timing['phaseIndependence']['late']}",
    )
    report.add(
        "timing",
        "(E) units with the same animation-change tick stay synchronised",
        timing["phaseIndependence"]["early"] == [0, 5, 10],
        f"early {timing['phaseIndependence']['early']}",
    )

    observed = []
    for encounter in trace["encounters"]:
        for sample in encounter.get("samples", []):
            for row in sample["rows"]:
                match = TRACE_ROW.match(row)
                tick_match = re.search(r"tick(\d+) global(\d+) rate(\d+)$", row)
                if not match or not tick_match:
                    continue
                frame = int(match.group("frame"))
                ticks = int(tick_match.group(1))
                global_tick = int(tick_match.group(2))
                observed.append(
                    {
                        "t": sample["t"],
                        "monster": int(match.group("monster")),
                        "seb": match.group("seb"),
                        "frame": frame,
                        "ticks": ticks,
                        "global": global_tick,
                        "rate": int(tick_match.group(3)),
                    }
                )
    report.add("timing", "(A) runtime samples carry the animation tick", len(observed) > 0, f"{len(observed)} samples")
    max_frame_by_seb = {entry["seb"]: entry["maxFrame"] for entry in clip_by_key.values()}
    inconsistent = [
        row
        for row in observed
        if row["seb"] in max_frame_by_seb and row["frame"] != row["ticks"] % max_frame_by_seb[row["seb"]]
    ]
    report.add(
        "timing",
        "(A/B) runtime frame == (ticks since animation change % maxFrame)",
        not inconsistent,
        f"{len(observed)} rows checked, {len(inconsistent)} inconsistent {json.dumps(inconsistent[:3])[:200]}",
    )
    report.add(
        "timing",
        "runtime advance rate is the recovered 1 frame per update",
        all(row["rate"] == 1 for row in observed),
        f"rates {sorted({row['rate'] for row in observed})}",
    )
    by_monster = {}
    for row in observed:
        key = (row["monster"], row["seb"])
        by_monster.setdefault(key, []).append(row)
    rates = []
    for key, rows in by_monster.items():
        rows.sort(key=lambda r: r["t"])
        first, last = rows[0], rows[-1]
        if last["t"] > first["t"] + 500 and last["global"] > first["global"]:
            rates.append((last["global"] - first["global"]) * 1000 / (last["t"] - first["t"]))
    report.add(
        "timing",
        "(A) measured runtime rate is ~20 animation updates/s",
        bool(rates) and all(15 <= rate <= 25 for rate in rates),
        f"observed {[round(rate, 1) for rate in rates]}",
    )

    trace_rows = [row for encounter in trace["encounters"] for row in encounter["rows"]]
    report.add("runtime", "debug overlay switch found and enabled", trace["switchIndex"] is not None, f"index {trace['switchIndex']}")
    for monster_id, name in ((116, "Wairobot"), (121, "Tuxy"), (142, "Wairo Tank")):
        rows = [row for row in trace_rows if row["monsterId"] == monster_id and row["record"]]
        report.add("trace", f"monster {monster_id} ({name}) frames sampled on /battle-replay", len(rows) > 0, f"{len(rows)} rows")
        body_rows = [row for row in rows if row["line"] == 1 and row["seb"] == "monster_s_wait_right.seb"]
        report.add(
            "trace",
            f"monster {monster_id}: wait clip line 1 visits both u cells",
            sorted({row["record"]["u"] for row in body_rows}) == [0, 80],
            f"u values {sorted({row['record']['u'] for row in body_rows})}",
        )
        report.add(
            "trace",
            f"monster {monster_id}: wait clip line 1 stays on sheet row v=60",
            sorted({row["record"]["v"] for row in body_rows}) == [60],
            f"v values {sorted({row['record']['v'] for row in body_rows})}",
        )
        shadow_rows = [row for row in rows if row["line"] == 0]
        report.add(
            "trace",
            f"monster {monster_id}: shadow line keeps its own crop (u=0, v=0)",
            all((row["record"]["u"], row["record"]["v"]) == (0, 0) for row in shadow_rows) and len(shadow_rows) > 0,
            f"{len(shadow_rows)} shadow rows",
        )
    attack_rows = [row for row in trace_rows if row["seb"] == "monster_s_attack_right.seb" and row["line"] == 1 and row["record"]]
    report.add(
        "trace",
        "attack clip line 1 shows the key-4 switch to u=80 and the key-9 return to u=0",
        any(row["record"]["u"] == 80 for row in attack_rows) and any(row["record"]["u"] == 0 for row in attack_rows),
        f"{len(attack_rows)} attack rows",
    )
    pairs = 0
    placement_bad = []
    transform_bad = []
    transforms = set()
    for encounter in trace["encounters"]:
        for sample in encounter.get("samples", []):
            rows = []
            for row in sample["rows"]:
                parsed_row = parse_trace_row(row)
                if parsed_row:
                    rows.append(parsed_row)
            for placement in sample["placements"]:
                transforms.add(placement["unitTransform"])
                # the page draws the scene through one presentation transform, so a browser rect is
                # a *displayed* pixel; the SEB record is a logical pixel. Check both directions of
                # that one transform explicitly instead of equating the two spaces.
                scale = placement.get("sceneScale")
                scale_y = placement.get("sceneScaleY") or scale
                displayed = placement.get("displayedLineOffset")
                if scale and displayed:
                    # the presentation stretches Y by the native 196/192 ratio, so the two axes are
                    # compared with their own scale instead of one uniform factor
                    expected = [placement["lineOffset"][0] * scale, placement["lineOffset"][1] * scale_y]
                    if abs(displayed[0] - expected[0]) > 0.6 or abs(displayed[1] - expected[1]) > 0.6:
                        transform_bad.append(
                            {
                                "sheet": placement["sheet"],
                                "displayed": displayed,
                                "logical": placement["lineOffset"],
                                "scale": scale,
                                "scaleY": scale_y,
                            }
                        )
                match = next(
                    (
                        row
                        for row in rows
                        if row["record"] and row["record"]["image"] == placement["sheet"]
                        and (row["record"]["transX"], row["record"]["transY"]) == tuple(placement["lineOffset"])
                    ),
                    None,
                )
                if match is None:
                    placement_bad.append({"sheet": placement["sheet"], "offset": placement["lineOffset"], "frame": None})
                else:
                    pairs += 1
    report.add("trace", "runtime placement samples captured", pairs + len(placement_bad) > 0, f"{pairs} matched samples")
    report.add(
        "trace",
        "(A) every measured line offset (logical px) matches the SEB record translation of the same frame",
        not placement_bad,
        f"{pairs}/{pairs + len(placement_bad)} matched, unmatched {json.dumps(placement_bad)[:200]}",
    )
    report.add(
        "trace",
        "(A) displayed line displacement == logical displacement x shared scene scale",
        not transform_bad,
        f"{len(transform_bad)} mismatched, first {json.dumps(transform_bad[:2])[:200]}",
    )
    report.expect("trace", "(D) monster unit roots carry no extra translate", sorted(transforms), ["none"])
    report.expect("runtime", "harness console clean", [], geometry["console"])
    report.expect("runtime", "harness asset failures", [], geometry["failures"])
    report.expect("runtime", "/battle-replay has no broken images", [], page["page"]["brokenImages"])
    report.expect("runtime", "/battle-replay threw no exception", [], [entry for entry in page["console"] if entry.get("type") == "exception"])
    report.expect("runtime", "/battle-replay served every battle asset", [], [entry for entry in page["failures"] if "/battle-assets/" in (entry.get("url") or "")])
    report.add("runtime", "/battle-replay renders native monster viewports", len(page["items"]) > 0, f"{len(page['items'])} viewports")

    failures = report.failures
    summary = {
        "checks": len(report.checks),
        "passed": len(report.checks) - len(failures),
        "failed": len(failures),
        "failures": failures,
        "checks_detail": report.checks,
    }
    (root / "seb-report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
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


if __name__ == "__main__":
    raise SystemExit(main())
