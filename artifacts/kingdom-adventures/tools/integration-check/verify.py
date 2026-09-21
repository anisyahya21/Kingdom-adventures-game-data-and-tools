#!/usr/bin/env python3
"""Independent checks for the battle replay's logical-to-display transform and human anchoring.

Consumes ``integration.json`` (real page measured at two stage widths with labels/debug off and on)
and compares everything against *recovered data* read from disk - the OPT sheets, the decoded SEB
manifest and the recovered camera/formation formulas - never against the page's own CSS expressions.

Assertions:
  A displayed entity displacement == native cell displacement x shared scale
  B displayed line/crop dimensions == logical SEB/OPT dimensions x shared scale
  C displayed SEB translation   == logical SEB translation     x shared scale
  D sprite-to-spacing ratio is invariant across stage widths
  E both humans use one logical source pixel per logical scene pixel
  F labels/debug cannot move a body origin
  G logical entity coordinates and camera are unchanged by resizing
plus a recorded pre-fix control that must fail the same invariance property.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ARTIFACT = Path(__file__).resolve().parents[2]
KA_WEBSITE = ARTIFACT.parents[1]
WORKSPACE = KA_WEBSITE.parent
SHEETS = ARTIFACT / "public" / "battle-assets" / "monster-original"
MANIFEST = ARTIFACT / "src" / "game-data" / "battle-animation.json"
CHARACTER_RULES = ARTIFACT / "public" / "character_sprites" / "character-rules.json"
HUMAN_IDLE_SEB = WORKSPACE / "RE-evidence" / "20260912-combat" / "chara-animation-original" / "equip_wait_up.seb"

SCENE_WIDTH = 481
SCENE_HEIGHT = 197
CELL_SIZE = 24
X_STEP = (24, 12)
TOL_PX = 0.6
COLUMNS = 5
MIN_ROW_OFFSET = 3


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_opt_parser():
    sys.path.insert(0, str(KA_WEBSITE / "tools" / "asset_extractor" / "parsers"))
    import opt_parser  # noqa: E402

    return opt_parser


def decode_human_seb(path: Path) -> dict[int, dict]:
    """Frame-0 record of every line of the intact original human idle SEB (raw file bytes only)."""
    import struct

    data = path.read_bytes()
    layers, _max_frame = struct.unpack_from(">Hh", data, 0)
    pos = 4
    frame0: dict[int, dict] = {}
    for line in range(layers):
        count, _reserved = struct.unpack_from(">hh", data, pos)
        pos += 4
        for _ in range(count):
            frame, tex, u, v, w, h, trans_x, trans_y, revers_u, revers_v = struct.unpack_from(">10h", data, pos)
            pos += 20
            if frame == 0:
                frame0[line] = {
                    "tex": tex, "u": u, "v": v, "w": w, "h": h,
                    "transX": trans_x, "transY": trans_y, "reversU": revers_u, "reversV": revers_v,
                }
    if pos != len(data):
        raise SystemExit(f"{path.name}: parsed {pos} of {len(data)} bytes")
    return frame0


class Report:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, group: str, name: str, passed: bool, detail: str = "") -> bool:
        self.checks.append({"group": group, "name": name, "pass": bool(passed), "detail": detail})
        return bool(passed)

    def close(self, group: str, name: str, actual: float, expected: float, tol: float = TOL_PX) -> bool:
        ok = abs(actual - expected) <= tol
        return self.add(group, name, ok, f"actual {actual:.3f} expected {expected:.3f} tol {tol}")

    def expect(self, group: str, name: str, actual, expected, detail: str = "") -> bool:
        ok = actual == expected
        return self.add(group, name, ok, detail if ok else f"expected {expected!r}, got {actual!r}")

    @property
    def failures(self) -> list[dict]:
        return [check for check in self.checks if not check["pass"]]


def camera(row_offset: int) -> tuple[float, float]:
    """Recovered camera setup (BattleSystem.Start call 0x14ed108); independent of the page code."""
    a = CELL_SIZE * -6
    b = CELL_SIZE * (row_offset - 3)
    return (a - b - 16, int((a + b) / 2) + 3)


def native_view_pos(cell_x: int, cell_y: int, row_offset: int) -> tuple[float, float]:
    cam_x, cam_y = camera(row_offset)
    world_x = cell_x * CELL_SIZE
    world_z = cell_y * CELL_SIZE
    return (world_x - world_z - cam_x, int((world_x + world_z) / 2) - cam_y)


def recovered_row_offset(rival_member_count: int) -> int:
    """Recovered `GetRowOffset(int opponentNum) 0x1588254` = max(3, count/5 + 1)."""
    return max(MIN_ROW_OFFSET, rival_member_count // COLUMNS + 1)


def recovered_cells(member_count: int, row_offset: int, side: str) -> list[tuple[int, int]]:
    """Recovered `CalcGridCell(dir, rowOffset, grid)`: own = offset+1+row, opponent = offset-row."""
    cells = []
    for index in range(member_count):
        column = index % COLUMNS
        row = index // COLUMNS
        cells.append((column, row_offset + 1 + row) if side == "own" else (column, row_offset - row))
    return cells


def static_cells(probe: dict) -> dict[str, dict[int, dict]]:
    """Initial cells of both teams as the page printed them (each team keeps its own index range)."""
    sides: dict[str, dict[int, dict]] = {"ally": {}, "enemy": {}}
    scene = probe["scene"]["rect"]
    scale = scene["w"] / SCENE_WIDTH
    scale_y = float(probe["scene"].get("scaleY") or scale)
    for unit in probe["units"]:
        match = re.search(r"#(\d+) slot c(-?\d+)r(-?\d+) · cell c(-?\d+)r(-?\d+)", unit.get("debug") or "")
        if not match:
            continue
        side = "ally" if (unit.get("composite") or unit.get("canvas") or unit.get("human")) else "enemy"
        root = unit["rootRect"]
        sides[side][int(match.group(1))] = {
            "side": side,
            "index": int(match.group(1)),
            "slot": (int(match.group(2)), int(match.group(3))),
            "cell": (int(match.group(4)), int(match.group(5))),
            "logical": (
                (root["x"] - scene["x"]) / scale,
                (root["y"] - scene["y"]) / scale_y,
            ),
        }
    return sides


def normalise_units(units: list[dict]) -> dict[tuple[str, int], dict]:
    table = {}
    for unit in units or []:
        cell = unit.get("cell")
        cell = tuple(cell.values()) if isinstance(cell, dict) else cell
        slot = unit.get("slot")
        slot = tuple(slot.values()) if isinstance(slot, dict) else slot
        table[(unit["side"], unit["index"])] = {**unit, "cell": tuple(cell) if cell else None, "slot": tuple(slot) if slot else None}
    return table


def parse_cells(debug: str) -> tuple[int, int] | None:
    if not debug:
        return None
    match = re.search(r"cell c(-?\d+)r(-?\d+)", debug)
    return (int(match.group(1)), int(match.group(2))) if match else None


def sheet_key(name: str) -> str:
    return name[:-4] if name.endswith(".png") else name


def unit_identity(unit: dict, index: int) -> str:
    """Stable name for a same-frame unit, derived from what the unit actually draws."""
    kind = unit.get("kind")
    if kind == "canvas":
        return f"preview-canvas unit #{index}"
    if kind == "composite":
        return f"composite unit #{index}"
    if kind == "monster":
        return f"monster unit #{index} [{','.join(unit.get('sheets') or [])}]"
    return f"unit #{index}"


def snapshot_diff(a: dict, b: dict, tol: float = 0.01) -> str:
    """First geometry difference between two same-frame snapshots, as a readable string."""
    if len(a["units"]) != len(b["units"]):
        return f"unit count {len(a['units'])} vs {len(b['units'])}"
    for index, (x, y) in enumerate(zip(a["units"], b["units"])):
        who = unit_identity(x, index)
        for label, key in (("entity origin", "root"), ("artwork origin", "art")):
            first, second = x.get(key), y.get(key)
            if (first is None) != (second is None):
                return f"{who} {label} presence differs ({first is not None} vs {second is not None})"
            if first is None:
                continue
            for axis in ("x", "y", "w", "h"):
                if abs(first[axis] - second[axis]) > tol:
                    return f"{who} {label} {axis} {first[axis]:.3f} -> {second[axis]:.3f}"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    args = ap.parse_args()
    root = Path(args.dir).resolve()
    report = Report()

    data = load(root / "integration.json")
    parser = load_opt_parser()
    manifest = load(MANIFEST)

    # ---------------------------------------------------------------- recovered data (independent)
    sheets = {}
    for name in ("all_monster_l_wairo02", "ex_monster_m_11", "shadow_l", "shadow_m"):
        parsed = parser.parse_opt(SHEETS / f"{name}.opt")
        sheets[name] = {
            "cell": (parsed["cell_width"], parsed["cell_height"]),
            "components": parsed["sprites"],
        }
    clips = {}
    for clip in ("monsterWait", "monsterWaitLeft", "monsterAttack", "monsterAttackLeft"):
        entry = manifest["clips"][clip]
        clips[entry["seb"]] = entry
    human_layers = manifest["humanCompositeWait"]["layers"]

    cases = {(case["width"], case["toggleState"]): case for case in data["cases"]}
    report.expect("harness", "measured two distinct stage widths", sorted({c["width"] for c in data["cases"]}), [700, 1400])

    def probe(width: int, state: str) -> dict:
        return cases[(width, state)]["probe"]

    def scale_of(p: dict) -> float:
        return p["scene"]["rect"]["w"] / SCENE_WIDTH

    def units_by_sheet(p: dict, sheet: str) -> list[dict]:
        file_name = sheet if sheet.endswith(".png") else f"{sheet}.png"
        return [u for u in p["units"] if any(line["sheet"] == file_name for line in u["lines"])]

    def unit_with_debug(p: dict, prefix: str) -> dict | None:
        return next((u for u in p["units"] if (u.get("debug") or "").startswith(prefix)), None)

    scales = {}
    scales_y = {}
    for width in (1400, 700):
        p = probe(width, "off")
        scales[width] = scale_of(p)
        scales_y[width] = float(p["scene"].get("scaleY") or scales[width])
        logical_view_width = float(p["scene"].get("logicalViewWidth") or SCENE_WIDTH)
        source_height = float(p["scene"].get("logicalSourceHeight") or SCENE_HEIGHT)
        vertical_ratio = float(p["scene"].get("verticalRatio") or 1.0)
        # The scene is still the fixed 481x197 logical battle box; the *window* is the profile's
        # logicalViewWidth, so the horizontal presentation scale is hostContentWidth/logicalViewWidth.
        report.expect("transform", f"(A) {width} view profile is the recording-supported profile", p["scene"].get("profileId"), "recording")
        report.close(
            "transform",
            f"(A) shared transform == host content width / {logical_view_width:g} at {width}",
            scales[width],
            p["hostClientWidth"] / logical_view_width,
            0.0005,
        )
        report.close(
            "transform",
            f"scene box X scale is the shared presentation scale at {width}",
            float(p["scene"]["transform"].split(",")[0].replace("matrix(", "")),
            scales[width],
            0.0005,
        )
        # native vertical presentation: one derived Y scale, 196/192 relative to X
        report.close(
            "transform",
            f"(F) {width} scene box Y/X scale == the native 196/192 presentation ratio",
            scales_y[width] / scales[width],
            vertical_ratio,
            0.0005,
        )
        report.expect(
            "transform",
            f"(F) {width} window reserves presentationHeight x scaleX and the scene is sourceHeight x scaleY",
            [round(p["host"]["h"]), round(p["scene"]["rect"]["h"])],
            [round(source_height * vertical_ratio * scales[width]), round(SCENE_HEIGHT * scales_y[width])],
        )
        report.expect(
            "transform",
            f"background keeps its logical 480x196 size at {width}",
            p["scene"]["backgroundSize"],
            "480px 196px",
        )

    # ---------------------------------------------------------------- A/D/G on the real page
    for width in (1400, 700):
        p = probe(width, "on")
        scale = scales[width]
        scale_y = scales_y[width]
        # a known neighbouring pair: same row, adjacent column (native X step 24,12)
        with_cells = [(u, parse_cells(u.get("debug") or "")) for u in p["units"]]
        all_cells = [(u, c) for u, c in with_cells if c is not None]
        row3 = sorted([(u, c) for u, c in all_cells if c[1] == 3], key=lambda item: item[1][0])
        pair = (row3[0], row3[1]) if len(row3) >= 2 else None
        if pair is None:
            report.add("geometry", f"(A) neighbouring pair found at {width}", False)
        else:
            (ua, ca), (ub, cb) = pair
            report.expect("geometry", f"(A) pair is column-adjacent at {width}", [cb[0] - ca[0], cb[1] - ca[1]], [1, 0])
            dx = ub["rootRect"]["x"] - ua["rootRect"]["x"]
            dy = ub["rootRect"]["y"] - ua["rootRect"]["y"]
            report.close("geometry", f"(A) displayed X displacement == 24 x scale at {width}", dx, X_STEP[0] * scale)
            report.close("geometry", f"(A) displayed Y displacement == 12 x scaleY at {width}", dy, X_STEP[1] * scale_y)
            report.close("geometry", f"(A) displayed X displacement == cell delta (1,0) at {width}", dx, CELL_SIZE * scale)

        # G: logical entity origins are the recovered native view positions and resize-invariant.
        # The expected cells come from the recovered equations with the rival roster's shared offset,
        # not from the page's own placement code.
        by_side = static_cells(p)
        ally_rows = [entry["cell"] for entry in by_side["ally"].values()]
        enemy_rows = [entry["cell"] for entry in by_side["enemy"].values()]
        if not ally_rows or not enemy_rows:
            report.add("geometry", f"(G) both teams placed at {width}", False)
            continue
        offset = recovered_row_offset(len(enemy_rows))
        expected_cells = {
            "ally0": recovered_cells(len(ally_rows), offset, "own")[0],
            "ally1": recovered_cells(len(ally_rows), offset, "own")[-1],
            "enemy0": recovered_cells(len(enemy_rows), offset, "opponent")[0],
            "boss": recovered_cells(len(enemy_rows), offset, "opponent")[-1],
        }
        logical = {}
        for unit_id, cell in expected_cells.items():
            side = "ally" if unit_id.startswith("ally") else "enemy"
            index = int(unit_id[-1]) if unit_id.startswith("ally") else (0 if unit_id == "enemy0" else len(enemy_rows) - 1)
            entry = by_side[side].get(index)
            if entry is None:
                continue
            logical[unit_id] = entry["logical"]
        for unit_id, expected in (
            ("ally0", native_view_pos(*expected_cells["ally0"], offset)),
            ("ally1", native_view_pos(*expected_cells["ally1"], offset)),
            ("enemy0", native_view_pos(*expected_cells["enemy0"], offset)),
            ("boss", native_view_pos(*expected_cells["boss"], offset)),
        ):
            if unit_id not in logical:
                report.add("geometry", f"(G) {unit_id} present at {width}", False)
                continue
            report.close("geometry", f"(G) {unit_id} logical x == native view x at {width}", logical[unit_id][0], expected[0])
            report.close("geometry", f"(G) {unit_id} logical y == native view y at {width}", logical[unit_id][1], expected[1])
        cases[(width, "on")]["logicalOrigins"] = logical

    shared = set(cases[(width, "on")]["logicalOrigins"].keys() & cases[(700, "on")]["logicalOrigins"].keys())
    for unit_id in sorted(shared):
        a = cases[(1400, "on")]["logicalOrigins"][unit_id]
        b = cases[(700, "on")]["logicalOrigins"][unit_id]
        report.close("geometry", f"(G) {unit_id} logical origin unchanged by resizing (x)", b[0], a[0])
        report.close("geometry", f"(G) {unit_id} logical origin unchanged by resizing (y)", b[1], a[1])

    # ---------------------------------------------------------------- B/C: lines vs SEB/OPT data
    def line_checks(width: int, sheet: str, monster_id: int) -> None:
        p = probe(width, "on")
        scale = scales[width]
        scale_y = scales_y[width]
        unit = units_by_sheet(p, sheet)
        if not unit:
            report.add("geometry", f"(B) unit with sheet {sheet} found at {width}", False)
            return
        unit = unit[0]
        for line in unit["lines"]:
            src_x = -float(line["imgStyle"]["left"].replace("px", ""))
            src_y = -float(line["imgStyle"]["top"].replace("px", ""))
            sheet_data = sheets[sheet_key(line["sheet"])]
            component = next(
                (c for c in sheet_data["components"] if (c["src_x"], c["src_y"]) == (src_x, src_y)),
                None,
            )
            if component is None:
                report.add("geometry", f"(B) {sheet} line {line['sheet']} src {(src_x, src_y)} exists in the OPT", False)
                continue
            report.close(
                "geometry",
                f"(B) {width} {sheet}/{line['sheet']}: displayed crop == OPT crop x scale",
                line["clipRect"]["w"],
                component["w"] * scale,
            )
            report.close(
                "geometry",
                f"(B) {width} {sheet}/{line['sheet']}: displayed height == OPT h x scale",
                line["clipRect"]["h"],
                component["h"] * scale_y,
            )
            report.close(
                "geometry",
                f"(B) {width} {sheet}/{line['sheet']}: displayed cell box == SEB cell x scale",
                line["cellRect"]["w"],
                sheet_data["cell"][0] * scale,
            )
            report.close(
                "geometry",
                f"(B) {width} {sheet}/{line['sheet']}: packed image not resized inside the viewport",
                line["imgRect"]["w"],
                line["natural"][0] * scale,
            )
            # C: the displayed line origin == the SEB record translation, from the manifest.
            # The page's trace row names the sheet without its extension ("img shadow_m line ...").
            rows = [r for r in unit.get("sebRows", []) if f"img {sheet_key(line['sheet'])} " in r]
            if not rows:
                report.add("geometry", f"(C) {width} {sheet}/{line['sheet']}: SEB trace row present", False)
                continue
            row = rows[0]
            seb_name = re.search(r"(\S+\.seb)", row).group(1)
            line_no = int(re.search(r"L(\d+)", row).group(1))
            frame = int(re.search(r"f(\d+)", row).group(1))
            clip = clips.get(seb_name)
            if clip is None:
                report.add("geometry", f"(C) {width} {sheet}/{line['sheet']}: {seb_name} decoded", False)
                continue
            record = next((r for r in clip["frames"] if r["line"] == line_no and r["frame"] == frame), None)
            if record is None:
                report.add("geometry", f"(C) {width} {sheet}/{line['sheet']}: manifest record for f{frame} L{line_no}", False)
                continue
            report.close(
                "geometry",
                f"(C) {width} {sheet}/{line['sheet']}: displayed line origin x == SEB transX x scale",
                line["cellRect"]["x"] - unit["rootRect"]["x"],
                record["transX"] * scale,
            )
            report.close(
                "geometry",
                f"(C) {width} {sheet}/{line['sheet']}: displayed line origin y == SEB transY x scaleY",
                line["cellRect"]["y"] - unit["rootRect"]["y"],
                record["transY"] * scale_y,
            )

    for width in (1400, 700):
        line_checks(width, "all_monster_l_wairo02", 142)
        line_checks(width, "ex_monster_m_11", 116)

    # ---------------------------------------------------------------- D: ratio invariance
    ratios = {}
    for width in (1400, 700):
        p = probe(width, "on")
        unit = units_by_sheet(p, "all_monster_l_wairo02")
        if not unit:
            continue
        body = next(line for line in unit[0]["lines"] if line["sheet"] == "all_monster_l_wairo02.png")
        with_cells = [(u, parse_cells(u.get("debug") or "")) for u in p["units"]]
        with_cells = sorted([(u, c) for u, c in with_cells if c is not None and c[1] == 3], key=lambda item: item[1][0])
        if len(with_cells) < 2:
            continue
        step = with_cells[1][0]["rootRect"]["x"] - with_cells[0][0]["rootRect"]["x"]
        ratios[width] = body["clipRect"]["w"] / step
    native_ratio = next(c["w"] for c in sheets["all_monster_l_wairo02"]["components"] if c["w"] == 61) / CELL_SIZE
    if len(ratios) == 2:
        report.close("invariance", "(D) sprite-to-spacing ratio unchanged by resizing", ratios[700], ratios[1400], 0.02)
        for width, ratio in ratios.items():
            report.close("invariance", f"(D) sprite-to-spacing ratio == native crop/step at {width}", ratio, native_ratio, 0.03)

    # ---------------------------------------------------------------- E: human densities
    # The battle stage draws humans with the frozen idle renderer: one element per drawn SEB line,
    # each carrying its own record. The recovered density rule is that the drawn cell IS the SEB
    # crop - one logical scene pixel per SEB pixel - and that it does not change with the stage
    # width. Which lines and which images a configuration draws is verified line by line in
    # tools/human-idle-check; this group checks the density/placement contract of every drawn line.
    human_part_logical: dict[int, dict] = {}
    for width in (1400, 700):
        p = probe(width, "on")
        scale = scales[width]
        scale_y = scales_y[width]
        humans = {unit["human"]["id"]: unit for unit in p["units"] if unit.get("human")}
        if sorted(humans) != ["archer-c", "guard-d"]:
            report.add("humans", f"(E) both frozen human units captured at {width}", False, sorted(humans))
            continue
        parts = {}
        for character_id, unit in sorted(humans.items()):
            layers = []
            for layer in unit["human"]["layers"]:
                crop_w, crop_h = [float(value) for value in layer["crop"].split(",")][2:]
                report.close(
                    "humans",
                    f"(E) {width} {character_id} L{layer['line']} drawn cell width == SEB crop width",
                    layer["cellRect"]["w"] / scale,
                    crop_w,
                    0.6,
                )
                report.close(
                    "humans",
                    f"(E) {width} {character_id} L{layer['line']} drawn cell height == SEB crop height",
                    layer["cellRect"]["h"] / scale_y,
                    crop_h,
                    0.6,
                )
                report.expect(
                    "humans",
                    f"(E) {width} {character_id} L{layer['line']} draws its own part sheet",
                    layer["imgSrc"],
                    f"/character_sprites/{layer['dir']}/{layer['file']}",
                )
                layers.append([layer["line"], layer["res"], layer["tex"], layer["dir"], layer["file"], layer["crop"]])
            parts[character_id] = layers
        human_part_logical[width] = parts

    if len(human_part_logical) == 2:
        report.expect(
            "humans",
            "(E) the drawn line sets are resize-invariant for both characters",
            human_part_logical[700],
            human_part_logical[1400],
        )

    # ---------------------------------------------------------------- formation: ONE shared offset
    # Every expectation below is recomputed here from the recovered equations
    # (`GetRowOffset(int) 0x1588254`, `CalcGridCell 0x158344C`) and from the recovered SEB pose
    # table; the page is only read for values. The reduced-roster / occupancy / module captures only
    # exist in the fixed build, so a build without them fails these checks instead of skipping them.
    formation_capture = data.get("formation") or {}

    def initial_units(width: int) -> dict[tuple[str, int], dict]:
        """Initial cells of the frozen step-0 state: from the capture, else from the probe rows."""
        capture = formation_capture.get(str(width)) or {}
        state = (capture.get("states") or {}).get("static")
        if state:
            return normalise_units(state)
        table: dict[tuple[str, int], dict] = {}
        by_side = static_cells(probe(width, "on"))
        for side in ("ally", "enemy"):
            for index, entry in by_side[side].items():
                table[(side, index)] = entry
        return table

    for width in (1400, 700):
        capture = formation_capture.get(str(width)) or {}
        units = initial_units(width)
        ally_cells = {index: unit["cell"] for (side, index), unit in units.items() if side == "ally"}
        enemy_cells = {index: unit["cell"] for (side, index), unit in units.items() if side == "enemy"}
        if not ally_cells or not enemy_cells:
            report.add("formation", f"(FORM) both rosters placed at {width}", False)
            continue
        ally_count, enemy_count = len(ally_cells), len(enemy_cells)
        offset = recovered_row_offset(enemy_count)
        exp_ally = recovered_cells(ally_count, offset, "own")
        exp_enemy = recovered_cells(enemy_count, offset, "opponent")

        # (FORM A) one offset for the ally front row, the enemy front row and the camera
        ally_offset = min(row for _, row in ally_cells.values()) - 1  # own front row = offset + 1
        enemy_offset = max(row for _, row in enemy_cells.values())  # opponent front row = offset
        camera_offset = capture.get("camera")
        report.expect("formation", f"(FORM) {width} ally front row implies the recovered offset", ally_offset, offset)
        report.expect("formation", f"(FORM) {width} enemy front row implies the recovered offset", enemy_offset, offset)
        report.expect("formation", f"(FORM) {width} camera rowOffset == the shared recovered offset", camera_offset, offset)
        report.expect(
            "formation",
            f"(FORM) {width} both teams and the camera use one value",
            [ally_offset, enemy_offset, camera_offset],
            [offset, offset, offset],
        )
        # (FORM B) the Wairo Tank's initial cells
        for label, side, index, expected in (
            ("ally #0", "ally", 0, exp_ally[0]),
            (f"ally #{ally_count - 1}", "ally", ally_count - 1, exp_ally[-1]),
            ("enemy #0", "enemy", 0, exp_enemy[0]),
            (f"enemy #{enemy_count - 2}", "enemy", enemy_count - 2, exp_enemy[-2]),
            (f"boss #{enemy_count - 1}", "enemy", enemy_count - 1, exp_enemy[-1]),
        ):
            actual = (ally_cells if side == "ally" else enemy_cells).get(index)
            report.expect(
                "formation",
                f"(FORM) {width} {label} initial cell == recovered ({expected[0]},{expected[1]})",
                actual,
                expected,
            )
        # (FORM C) the two front rows are one cell apart
        report.expect(
            "formation",
            f"(FORM) {width} initial front rows are one cell apart",
            min(row for _, row in ally_cells.values()) - max(row for _, row in enemy_cells.values()),
            1,
        )
        # (FORM D) the visible roster cap cannot move a cell
        capped = normalise_units((capture.get("states") or {}).get("cappedRoster"))
        if not capped:
            report.add("formation", f"(FORM) {width} reduced-roster capture present", False)
        else:
            moved = sorted(key for key in units if key in capped and capped[key]["cell"] != units[key]["cell"])
            missing_allies = [key for key in units if key[0] == "ally" and key not in capped]
            report.add(
                "formation",
                f"(FORM) {width} showing only part of the roster keeps every visible initial cell",
                not moved and not missing_allies,
                f"moved {moved[:4]} missing allies {missing_allies}",
            )
        # (FORM E) the occupancy path starts on the same initial cells
        occupancy = normalise_units((capture.get("states") or {}).get("occupancy"))
        if not occupancy:
            report.add("formation", f"(FORM) {width} occupancy capture present", False)
        else:
            moved = sorted(key for key in units if key in occupancy and occupancy[key]["cell"] != units[key]["cell"])
            report.add(
                "formation",
                f"(FORM) {width} occupancy off/on have identical initial cells",
                not moved and set(occupancy) == set(units),
                f"moved {moved[:4]}, extra/missing {sorted(set(occupancy) ^ set(units))[:4]}",
            )
        # (FORM F) the shared offset and the enemy cells do not depend on the ally roster
        module = capture.get("module") or {}
        ally_counts = module.get("allyCounts") or {}
        if len(ally_counts) < 6:
            report.add("formation", f"(FORM) {width} ally-roster probe present", False)
        else:
            offsets_seen = sorted({entry["rowOffset"] for entry in ally_counts.values()})
            enemy_slots = {
                tuple(entry[key].values())
                for entry in ally_counts.values()
                for key in ("firstEnemy", "lastEnemy")
            }
            report.expect("formation", f"(FORM) {width} shared offset is independent of the ally roster count", offsets_seen, [offset])
            report.expect(
                "formation",
                f"(FORM) {width} enemy cells are independent of the ally roster count",
                sorted(enemy_slots),
                sorted({tuple(exp_enemy[0]), tuple(exp_enemy[-1])}),
            )
        offsets_table = module.get("offsets") or {}
        if offsets_table:
            expected_table = {str(n): recovered_row_offset(n) for n in (0, 1, 4, 5, 6, 19, 20, 21, 22)}
            report.expect(
                "formation",
                f"(FORM) {width} production row offset == max(3, rival member count / 5 + 1)",
                {key: offsets_table.get(key) for key in expected_table},
                expected_table,
            )
        beat0 = normalise_units(module.get("occupancyBeat0"))
        if not beat0:
            report.add("formation", f"(FORM) {width} occupancy start state captured", False)
        else:
            expected_map = {("ally", index): tuple(exp_ally[index]) for index in range(ally_count)}
            expected_map.update({("enemy", index): tuple(exp_enemy[index]) for index in range(enemy_count)})
            bad = {key: value["cell"] for key, value in beat0.items() if key in expected_map and value["cell"] != expected_map[key]}
            report.add(
                "formation",
                f"(FORM) {width} occupancy simulation starts on the recovered cells",
                not bad and len(beat0) == ally_count + enemy_count,
                f"{len(beat0)} units, mismatched {sorted(bad.items())[:3]}",
            )

    # ---------------------------------------------------------------- preview: SEB-origin anchoring
    # The pose reference is read from the recovered SEB pose table, not from the page: for the ally
    # facing, the preview draws `equip_wait_up.seb`, whose body line x and shadow line y are the
    # reference the envelope normalises onto (originX, originY).
    pose_table = load(CHARACTER_RULES)["poses"]

    def recovered_pose_reference(pose_name: str, frame: int = 0) -> tuple[int, int]:
        ops = pose_table[pose_name][frame]
        body_ox = next(op["ox"] for op in ops if op["type"] == 1)
        shadow = next(op for op in ops if op["type"] == 0)
        return (body_ox, shadow["oy"])

    def shadow_line_bottom(pose_name: str, frame: int = 0) -> int:
        shadow = next(op for op in pose_table[pose_name][frame] if op["type"] == 0)
        return shadow["oy"] + shadow["h"]

    for width in (1400, 700):
        capture = formation_capture.get(str(width)) or {}
        archer = capture.get("archer")
        guard = capture.get("guard") or {}
        module = capture.get("module") or {}
        envelope = module.get("envelope") or {}
        if not archer or not envelope:
            report.add("preview", f"(PREV) preview capture present at {width}", False)
            continue
        up_reference = recovered_pose_reference("equip_wait_up.seb")
        report.expect("preview", f"(PREV) {width} ally preview draws the recovered 'up' pose", envelope.get("poseName"), "equip_wait_up.seb")
        reference = (envelope.get("poseReferences") or [{}])[0]
        report.expect(
            "preview",
            f"(PREV) {width} envelope pose reference == the recovered SEB body/shadow lines",
            [reference.get("x"), reference.get("y")],
            [up_reference[0], up_reference[1]],
        )
        expected_left = envelope["cropX"] - envelope["originX"] + reference.get("x", 0)
        expected_top = envelope["cropY"] - envelope["originY"] + reference.get("y", 0)
        report.expect(
            "preview",
            f"(PREV) {width} canvas offset == (crop - origin) + pose reference",
            [archer["canvasStyle"]["left"], archer["canvasStyle"]["top"]],
            [f"{expected_left}px", f"{expected_top}px"],
        )
        report.expect(
            "preview",
            f"(PREV) {width} canvas logical box == envelope crop",
            [archer["canvasStyle"]["width"], archer["canvasStyle"]["height"]],
            [f"{envelope['cropW']}px", f"{envelope['cropH']}px"],
        )
        origin, art = archer["entityOrigin"], archer["canvasRect"]
        report.close("preview", f"(PREV) {width} artwork origin == entity origin + SEB-origin offset (x)", art["x"] - origin["x"], expected_left)
        report.close("preview", f"(PREV) {width} artwork origin == entity origin + SEB-origin offset (y)", art["y"] - origin["y"], expected_top)

    # the other pose the page can request must use its own recovered reference, not a constant
    right_envelope = ((formation_capture.get("1400") or {}).get("module") or {}).get("envelopeRight") or {}
    if right_envelope:
        right_reference = recovered_pose_reference("equip_wait_right.seb")
        report.expect(
            "preview",
            "(PREV) the 'right' pose uses its own recovered reference",
            [right_envelope["poseReferences"][0]["x"], right_envelope["poseReferences"][0]["y"]],
            [right_reference[0], right_reference[1]],
        )
    else:
        report.add("preview", "(PREV) second pose capture present", False)

    # ---------------------------------------------------------------- preview ground reference (DOM)
    # These run from the page's own geometry alone, so the same checks also cover a build without the
    # envelope capture above. The expectations are the recovered SEB lines of the pose the ally
    # preview draws.
    def page_preview_units(width: int) -> tuple[dict | None, dict]:
        capture = formation_capture.get(str(width)) or {}
        if capture.get("archer"):
            scale = capture.get("sceneScale") or scales[width]
            scale_y = capture.get("sceneScaleY") or scales_y[width]
            archer = dict(capture["archer"])
            logical_size = archer.get("canvasSizeLogical")
            archer["size"] = (
                {"w": logical_size["w"], "h": logical_size["h"]}
                if logical_size
                else {"w": archer["canvasSize"]["w"] / scale, "h": archer["canvasSize"]["h"] / scale_y}
            )
            return archer, capture.get("guard") or {}
        page_probe = probe(width, "on")
        scene = page_probe["scene"]["rect"]
        scale = scene["w"] / SCENE_WIDTH
        scale_y = page_probe["scene"].get("scaleY") or scales_y[width]
        archer = None
        guard: dict | None = None
        for unit in page_probe["units"]:
            canvas = unit.get("canvas")
            if canvas and archer is None:
                root, rect = unit["rootRect"], canvas["rect"]
                archer = {
                    "entityOrigin": {"x": (root["x"] - scene["x"]) / scale, "y": (root["y"] - scene["y"]) / scale_y},
                    "canvasStyle": canvas["style"],
                    "canvasRect": {"x": (rect["x"] - scene["x"]) / scale, "y": (rect["y"] - scene["y"]) / scale_y},
                    "size": {"w": rect["w"] / scale, "h": rect["h"] / scale_y},
                }
            composite = unit.get("composite")
            if composite and guard is None:
                root = unit["rootRect"]
                guard = {
                    "entityOrigin": {"x": (root["x"] - scene["x"]) / scale, "y": (root["y"] - scene["y"]) / scale_y},
                    "layers": [
                        {"left": layer["l"], "top": layer["t"], "w": layer["w"], "h": layer["h"], "bg": layer["bg"]}
                        for layer in composite["layers"]
                    ],
                }
        return archer, guard or {}

    for width in (1400, 700):
        archer, guard = page_preview_units(width)
        if not archer:
            report.add("preview", f"(PREV) preview canvas measured at {width}", False)
            continue
        shadow_op = next(op for op in pose_table["equip_wait_up.seb"][0] if op["type"] == 0)
        shadow_bottom = shadow_op["oy"] + shadow_op["h"]
        art_bottom = archer["canvasRect"]["y"] + archer["size"]["h"] - archer["entityOrigin"]["y"]
        report.add(
            "preview",
            f"(PREV) {width} preview artwork bottom is on the recovered SEB shadow line",
            0 <= art_bottom - shadow_bottom <= 2,
            f"artwork bottom {art_bottom:.1f} px below the entity origin vs shadow line bottom {shadow_bottom}",
        )
        shadow_layer = next((layer for layer in guard.get("layers") or [] if "shadow" in (layer.get("bg") or "")), None)
        if not shadow_layer:
            report.add("preview", f"(PREV) {width} composite shadow layer measured", False)
            continue
        report.expect(
            "preview",
            f"(PREV) {width} composite layer placement == the recovered SEB translation",
            [shadow_layer["left"], shadow_layer["top"], shadow_layer["w"], shadow_layer["h"]],
            [f"{shadow_op['ox']}px", f"{shadow_op['oy']}px", f"{shadow_op['w']}px", f"{shadow_op['h']}px"],
        )
        report.close(
            "preview",
            f"(PREV) {width} both human renderers share one ground reference",
            art_bottom,
            float(shadow_layer["top"].replace("px", "")) + float(shadow_layer["h"].replace("px", "")),
            2,
        )
        if not (formation_capture.get(str(width)) or {}).get("archer"):
            report.add(
                "preview",
                f"(PREV) {width} preview canvas is positioned from the renderer envelope",
                bool(archer["canvasStyle"]["width"]),
                f"inline style {archer['canvasStyle']}",
            )

    # ---------------------------------------------------------------- frozen human anchoring
    # The stage's default human renderer draws the frozen EQUIP_WAIT/UP/frame-0 lines of the intact
    # original SEB. Every placement value below is recomputed from that file (decoded here) and from
    # the layer's own OPT record, never from the page's code or from a screenshot.
    human_seb = decode_human_seb(HUMAN_IDLE_SEB)
    for width in (1400, 700):
        capture = formation_capture.get(str(width)) or {}
        humans = capture.get("humans") or {}
        if sorted(humans) != ["archer-c", "guard-d"]:
            report.add("humananchors", f"(PREV) frozen human idle captured at {width}", False, sorted(humans))
            continue
        # PASS 15 COMMAND 15.6: the geometry below is the recovered EQUIP_WAIT frame-0 geometry, so
        # the fixture must have captured that state - and it has to say so itself rather than silently
        # comparing a damage/knock-down pose against idle expectations.
        selection = {entry["id"]: entry for entry in (capture.get("idleSelection") or [])}
        for character_id in ("guard-d", "archer-c"):
            entry = selection.get(character_id) or {}
            report.expect(
                "humananchors",
                f"(FIX) {width} {character_id} was selected in the native WAIT state",
                [entry.get("nativeState"), entry.get("behaviour"), entry.get("frame")],
                ["wait", "3", "0"],
            )
        for character_id, unit in sorted(humans.items()):
            report.expect(
                "humananchors",
                f"(FIX) {width} {character_id} geometry carries the state it was measured in",
                [unit.get("nativeState"), unit.get("behaviour"), unit.get("frame")],
                ["wait", "3", "0"],
            )
            report.add(
                "humananchors",
                f"(FIX) {width} {character_id} records its side and unit index",
                unit.get("side") in ("ally", "enemy") and isinstance(unit.get("unitIndex"), int),
                f"{unit.get('side')} #{unit.get('unitIndex')}",
            )
            for layer in unit["layers"]:
                record = human_seb.get(layer["line"])
                label = f"(PREV) {width} {character_id} L{layer['line']}"
                if record is None:
                    report.add("humananchors", f"{label} exists in the original SEB", False)
                    continue
                report.expect("humananchors", f"{label} translation == the original SEB record", layer["trans"], f"{record['transX']},{record['transY']}")
                report.expect(
                    "humananchors",
                    f"{label} crop == the original SEB record",
                    layer["crop"],
                    f"{record['u']},{record['v']},{record['w']},{record['h']}",
                )
                report.expect(
                    "humananchors",
                    f"{label} OPT cell == the crop cell",
                    layer["optCell"],
                    f"{record['v'] // record['h']},{record['u'] // record['w']}",
                )
                report.close(
                    "humananchors",
                    f"{label} cell origin X == entity origin + SEB transX",
                    layer["cellOrigin"]["x"] - unit["entityOrigin"]["x"],
                    record["transX"],
                    0.6,
                )
                report.close(
                    "humananchors",
                    f"{label} cell origin Y == entity origin + SEB transY",
                    layer["cellOrigin"]["y"] - unit["entityOrigin"]["y"],
                    record["transY"],
                    0.6,
                )
            bottom = max(
                layer["cellOrigin"]["y"] + float(layer["optDest"].split(",")[1]) + float(layer["optSrc"].split(",")[3])
                for layer in unit["layers"]
            ) - unit["entityOrigin"]["y"]
            shadow = human_seb[0]
            report.add(
                "humananchors",
                f"(PREV) {width} {character_id} artwork bottom lands in the SEB shadow line's own cell",
                shadow["transY"] <= bottom <= shadow["transY"] + shadow["h"],
                f"bottom {bottom:.1f} vs shadow cell {shadow['transY']}..{shadow['transY'] + shadow['h']}",
            )
            report.expect(
                "humananchors",
                f"(PREV) {width} {character_id} draws no placeholder sheet",
                [layer["file"] for layer in unit["layers"] if "sheild" in layer["file"] and character_id == "archer-c"],
                [],
            )

    # ---------------------------------------------------------------- F: label/debug invariance
    # The two full probes are taken at different ticks of the page's 50 ms animation clock, so they
    # are not guaranteed to show the same pose and cannot isolate the effect of the toggles.
    # Invariance is therefore checked on the driver's same-frame capture, which measures, flips the
    # toggles and measures again inside one synchronous turn (no timer can run in between).
    same_frame = data.get("sameFrame") or {}
    for width in (1400, 700):
        sf = same_frame.get(str(width))
        if not sf:
            report.add("invariance", f"(F) same-frame label/debug capture present at {width}", False)
            continue
        before, after, restored, stable = sf["before"], sf["after"], sf["restored"], sf.get("stable")
        report.expect("invariance", f"(F) {width} no debug row before the flip", before["debugRows"], 0)
        report.add(
            "invariance",
            f"(F) {width} debug rows really drawn after the flip",
            after["debugRows"] > 0,
            f"{after['debugRows']} rows",
        )
        report.expect("invariance", f"(F) {width} toggles back off after the capture", restored["debugRows"], 0)
        if stable is None:
            report.add("invariance", f"(F) {width} frozen-clock stability probe present", False)
        else:
            drift = snapshot_diff(before, stable)
            report.add(
                "invariance",
                f"(F) {width} frozen clock: an untouched re-measurement 200 ms later reproduces every origin",
                not drift,
                drift or "identical",
            )
        if len(before["units"]) != len(after["units"]):
            report.add(
                "invariance",
                f"(F) {width} same unit count with labels/debug on and off",
                False,
                f"{len(before['units'])} vs {len(after['units'])}",
            )
            continue
        for index, (a, b) in enumerate(zip(before["units"], after["units"])):
            who = unit_identity(a, index)
            report.close("invariance", f"(F) {width} {who} entity origin x unaffected by labels/debug", b["root"]["x"], a["root"]["x"], 0.01)
            report.close("invariance", f"(F) {width} {who} entity origin y unaffected by labels/debug", b["root"]["y"], a["root"]["y"], 0.01)
            if a["art"] and b["art"]:
                report.close("invariance", f"(F) {width} {who} artwork origin x unaffected by labels/debug", b["art"]["x"], a["art"]["x"], 0.01)
                report.close("invariance", f"(F) {width} {who} artwork origin y unaffected by labels/debug", b["art"]["y"], a["art"]["y"], 0.01)

    # ---------------------------------------------------------------- preview smoke (other pages)
    smoke_path = root / "preview-smoke.json"
    if not smoke_path.exists():
        report.add("runtime", "preview smoke capture present (other pages)", False)
    else:
        smoke = load(smoke_path)
        routes = sorted(key for key in smoke if key.startswith("/"))
        canvases = sum(int(smoke[route].get("canvases", 0)) for route in routes)
        anchored = sum(int(smoke[route].get("logicalAnchored", 0)) for route in routes)
        exceptions = [entry for entry in smoke.get("console", []) if entry.get("type") == "exception"]
        report.add("runtime", "preview component still renders on the other pages", canvases > 0, f"{canvases} canvases over {routes}")
        report.expect("runtime", "the SEB-origin anchor stays opt-in outside the battle", anchored, 0)
        report.expect("runtime", "preview smoke has no page exception", [], exceptions)

    # ---------------------------------------------------------------- pre-fix control
    pre_fix = {"wide": {"position": 1.954, "sprite": 1.0, "translation": 1.0}, "narrow": {"position": 1.250, "sprite": 1.0, "translation": 1.0}}
    report.add(
        "control",
        "recorded pre-fix measurements violate the shared-transform property (the audit's 1.95x positions with 1.00x artwork)",
        pre_fix["wide"]["position"] != pre_fix["wide"]["sprite"],
        json.dumps(pre_fix),
    )
    report.add(
        "control",
        "recorded pre-fix measurements violate ratio invariance (0.77 vs native 0.39 spacing/sprite)",
        abs((24 * pre_fix["wide"]["position"]) / 61 - (24 * pre_fix["narrow"]["position"]) / 61) > 0.02,
        "pre-fix ratios differ between widths",
    )

    # ---------------------------------------------------------------- view profile (the recorded window)
    # This is the only thing the presentation patch adds: the internal 481x197 battle space, the
    # camera, the cells and the fighter coordinates must not move. Every expectation is recomputed
    # from the recovered formulas and from the supplied recording measurements, never from the page.
    profiles = data.get("profiles") or {}
    recording = ((profiles.get("recording") or {}).get("capture")) or {}
    internal = ((profiles.get("internal") or {}).get("capture")) or {}
    if not recording or not internal:
        report.add("viewprofile", "(VIEW) both presentation profiles captured", False)
    else:
        rec_facts = recording["facts"]
        rec_sheet = recording["sheet"]
        int_facts = internal["facts"]
        int_sheet = internal["sheet"]

        def view_pos(cell: tuple[int, int], row_offset: int) -> tuple[float, float]:
            """Recovered projection + camera: the fighter origin the page must keep in both profiles."""
            cam = camera(row_offset)
            return (CELL_SIZE * cell[0] - CELL_SIZE * cell[1] - cam[0], 12 * (cell[0] + cell[1]) - cam[1])

        # (VIEW A) profile -> backdrop origin, window and the native 1:1 backdrop draw
        report.expect("viewprofile", "(VIEW A) recording profile logical view width is the SUPPORTED 240", rec_facts["logicalViewWidth"], 240)
        report.expect("viewprofile", "(VIEW A) backgroundX == trunc((240 - 480) / 2)", rec_facts["backgroundX"], (240 - 480) // 2)
        report.expect(
            "viewprofile",
            "(VIEW A) backdrop keeps its 480x196 logical size at the native origin",
            [rec_sheet["backgroundSize"], rec_sheet["backgroundPosition"]],
            ["480px 196px", f"{rec_facts['backgroundX']}px 0px"],
        )
        report.expect("viewprofile", "(VIEW A) 481-wide debug profile keeps the backdrop at 0", [int_facts["logicalViewWidth"], int_facts["backgroundX"]], [481, 0])
        report.expect("viewprofile", "(VIEW) the default profile really is the recording one", recording["profileId"], "recording")
        report.expect("viewprofile", "(VIEW) the surface window clips", rec_sheet["window"]["overflow"], "hidden")
        report.expect("viewprofile", "(VIEW) the window exposes exactly the profile width", rec_sheet["window"]["logicalViewWidth"], rec_facts["logicalViewWidth"])
        report.close(
            "viewprofile",
            "(VIEW F) window band == the native 192 source rows",
            rec_facts["windowHeightLogical"],
            rec_facts["sourceHeight"],
            0.05,
        )
        report.close(
            "viewprofile",
            "(VIEW) visible source interval width == logicalViewWidth",
            rec_facts["visibleSourceX"][1] - rec_facts["visibleSourceX"][0],
            rec_facts["logicalViewWidth"],
            0.001,
        )

        # (VIEW B) the supplied iPad recording measurements
        measurements = WORKSPACE / "wairo_full_encounter_review" / "background_measurements_unique.json"
        if not measurements.exists():
            report.add("viewprofile", "(VIEW B) supplied recording measurements present", False, str(measurements))
        else:
            rows = [row for row in load(measurements) if row.get("valid")]
            intervals = [row["source_x_interval"] for row in rows if row.get("source_x_interval")]
            begins = [interval[0] for interval in intervals]
            ends = [interval[1] for interval in intervals]
            measured_from = (min(begins) + max(begins)) / 2
            measured_to = (min(ends) + max(ends)) / 2
            report.add(
                "viewprofile",
                f"(VIEW B) {len(rows)} accepted recording registrations read from the supplied review",
                len(rows) >= 5,
                f"interval {measured_from:.2f}..{measured_to:.2f}",
            )
            report.close("viewprofile", "(VIEW B) profile's visible source start == the recording's", rec_facts["visibleSourceX"][0], round(measured_from, 3), 1.0)
            report.close("viewprofile", "(VIEW B) profile's visible source end == the recording's", rec_facts["visibleSourceX"][1], round(measured_to, 3), 1.0)
            report.close(
                "viewprofile",
                "(VIEW B) profile's visible source width == the recording's measured window",
                rec_facts["visibleSourceX"][1] - rec_facts["visibleSourceX"][0],
                round(measured_to - measured_from, 3),
                1.0,
            )

        # (VIEW C) fighter coordinates: unchanged between profiles and equal to the recovered projection
        rec_units = {(unit["side"], unit["index"]): unit for unit in recording["units"]}
        int_units = {(unit["side"], unit["index"]): unit for unit in internal["units"]}
        shared_keys = sorted(set(rec_units) & set(int_units))
        report.add("viewprofile", "(VIEW C) both profiles placed the same units", len(shared_keys) >= 20, f"{len(shared_keys)} units")
        moved = [
            {
                "unit": key,
                "recording": rec_units[key]["origin"],
                "internal": int_units[key]["origin"],
            }
            for key in shared_keys
            if abs(rec_units[key]["origin"]["x"] - int_units[key]["origin"]["x"]) > 0.2
            or abs(rec_units[key]["origin"]["y"] - int_units[key]["origin"]["y"]) > 0.2
        ]
        report.add(
            "viewprofile",
            "(VIEW C) fighter logical origins are identical in both profiles (backgroundX is not applied to fighters)",
            not moved,
            json.dumps(moved[:3]) if moved else f"{len(shared_keys)} units identical",
        )
        row_offset = recovered_row_offset(21)
        projection_bad = []
        for key in shared_keys:
            side, index = key
            cell = tuple(rec_units[key]["cell"])
            origin = rec_units[key]["origin"]
            expected = view_pos(cell, row_offset)
            if abs(origin["x"] - expected[0]) > 0.05 or abs(origin["y"] - expected[1]) > 0.05:
                projection_bad.append({"unit": key, "cell": cell, "origin": origin, "expected": expected})
        report.add(
            "viewprofile",
            "(VIEW C) recording-profile fighter origins == the recovered nativeViewPos projection",
            not projection_bad,
            json.dumps(projection_bad[:3]) if projection_bad else f"{len(shared_keys)} units match",
        )

        # (VIEW D) the profile changes only the backdrop origin, the window and the presentation scale
        rec_cells = {key: tuple(unit["cell"]) for key, unit in rec_units.items()}
        int_cells = {key: tuple(unit["cell"]) for key, unit in int_units.items()}
        report.add(
            "viewprofile",
            "(VIEW D) changing the profile changes no cell",
            all(rec_cells[key] == int_cells[key] for key in shared_keys),
            "cells identical",
        )
        report.add(
            "viewprofile",
            "(VIEW D) the profile does change the presentation scale",
            abs(rec_sheet["scaleX"] - int_sheet["scaleX"]) > 0.5,
            f"scaleX {rec_sheet['scaleX']} vs {int_sheet['scaleX']}",
        )
        report.close(
            "viewprofile",
            "(VIEW D) both profiles keep the window at the host content width",
            rec_sheet["window"]["clientWidth"],
            int_sheet["window"]["clientWidth"],
            0.5,
        )

        # (VIEW E) fighter-to-sprite ratios are invariant (same logical artwork for the same fighter)
        rec_line_map = {(key, line["sheet"]): line for key, unit in rec_units.items() for line in unit["lines"]}
        int_line_map = {(key, line["sheet"]): line for key, unit in int_units.items() for line in unit["lines"]}
        line_keys = sorted(set(rec_line_map) & set(int_line_map))
        art_diffs = [
            {
                "unit": key[0],
                "sheet": key[1],
                "recording": [rec_line_map[key]["cropLogical"], rec_line_map[key]["cellLogical"]],
                "internal": [int_line_map[key]["cropLogical"], int_line_map[key]["cellLogical"]],
            }
            for key in line_keys
            if abs(rec_line_map[key]["cropLogical"]["w"] - int_line_map[key]["cropLogical"]["w"]) > 0.05
            or abs(rec_line_map[key]["cropLogical"]["h"] - int_line_map[key]["cropLogical"]["h"]) > 0.05
            or abs(rec_line_map[key]["cellLogical"]["w"] - int_line_map[key]["cellLogical"]["w"]) > 0.05
            or abs(rec_line_map[key]["cellLogical"]["h"] - int_line_map[key]["cellLogical"]["h"]) > 0.05
        ]
        report.add("viewprofile", "(VIEW E) sprite artwork logical sizes are profile-invariant", not art_diffs, json.dumps(art_diffs[:3]) if art_diffs else f"{len(line_keys)} lines compared")
        # the ratio the suite already pins for the monster path: SEB crop width / native X step
        ratio_checked = 0
        for key in shared_keys:
            unit = rec_units[key]
            if unit["side"] != "enemy" or len(unit["lines"]) < 2:
                continue
            cam = camera(row_offset)
            # nearest horizontal neighbour (native X step 24,12) inside the same profile reading
            neighbours = [
                other
                for other in rec_units.values()
                if other["side"] == "enemy" and abs(other["origin"]["x"] - unit["origin"]["x"] - CELL_SIZE) < 0.05
            ]
            if not neighbours:
                continue
            step = min(other["origin"]["x"] for other in neighbours) - unit["origin"]["x"]
            body = next((line for line in unit["lines"] if line["sheet"] == "all_monster_l_wairo02.png"), None)
            native_body = next((c["w"] for c in sheets["all_monster_l_wairo02"]["components"] if c["w"] == 61), None)
            if body and native_body and step:
                ratio_checked += 1
                report.close(
                    "viewprofile",
                    f"(VIEW E) {key} body crop / X step == native 61/24",
                    body["cropLogical"]["w"] / step,
                    native_body / CELL_SIZE,
                    0.03,
                )
        report.add("viewprofile", "(VIEW E) fighter-to-sprite ratio samples measured on the recording profile", ratio_checked > 0, f"{ratio_checked} units")

        # (VIEW G) the two red flags this patch must not reintroduce
        report.expect("viewprofile", "(VIEW G) the backdrop is not rescaled to the window", rec_sheet["backgroundSize"], "480px 196px")
        report.close(
            "viewprofile",
            "(VIEW G) one shared scene transform: matrix X scale == window scale",
            rec_sheet["matrix"]["a"],
            rec_sheet["scaleX"],
            1e-3,
        )
        report.close(
            "viewprofile",
            "(VIEW G) one shared scene transform: matrix Y scale == 196/192 x X scale",
            rec_sheet["matrix"]["d"],
            rec_sheet["scaleX"] * 196 / 192,
            1e-3,
        )
        def archer_offset(capture: dict) -> dict | None:
            """Human artwork offset from its own entity origin, in logical units.

            Default renderer: the frozen human idle's drawn SEB lines, whose own records carry the
            translation (the shadow line is the ground reference). Legacy comparison mode: the
            preview canvas, whose offset is (crop - origin) + pose reference.
            """
            for unit in capture["units"]:
                human = unit.get("human")
                if human and human.get("layers"):
                    layer = next((entry for entry in human["layers"] if entry["line"] == 0), human["layers"][0])
                    return {
                        "x": round(layer["cellOrigin"]["x"] - unit["origin"]["x"], 3),
                        "y": round(layer["cellOrigin"]["y"] - unit["origin"]["y"], 3),
                        "size": layer["cellLogical"],
                        "source": f"frozen human line {layer['line']}",
                    }
                canvas = unit.get("humanCanvas")
                if not canvas:
                    continue
                return {
                    "x": round(canvas["logical"]["x"] - unit["origin"]["x"], 3),
                    "y": round(canvas["logical"]["y"] - unit["origin"]["y"], 3),
                    "size": canvas["size"],
                    "source": "preview canvas",
                }
            return None

        archer_rec, archer_int = archer_offset(recording), archer_offset(internal)
        if archer_rec and archer_int:
            source = archer_rec.get("source")
            report.close("viewprofile", f"(VIEW G) human artwork ({source}) keeps its SEB-origin offset under both profiles (x)", archer_rec["x"], archer_int["x"], 0.05)
            report.close("viewprofile", f"(VIEW G) human artwork ({source}) keeps its SEB-origin offset under both profiles (y)", archer_rec["y"], archer_int["y"], 0.05)
            report.close("viewprofile", f"(VIEW E) human artwork ({source}) logical width is profile-invariant", archer_rec["size"]["w"], archer_int["size"]["w"], 0.05)
            report.close("viewprofile", f"(VIEW E) human artwork ({source}) logical height is profile-invariant", archer_rec["size"]["h"], archer_int["size"]["h"], 0.05)
        else:
            report.add("viewprofile", "(VIEW G) human artwork present in both profiles", False)

        # (VIEW) the window clips without moving anyone: report the far-right units explicitly
        clipped = sorted(key for key in shared_keys if rec_units[key]["origin"]["x"] >= rec_facts["logicalViewWidth"])
        allies_outside = [key for key in clipped if key[0] == "ally"]
        report.add(
            "viewprofile",
            "(VIEW) the recorded window clips the far-right enemy column instead of moving it inward",
            len(clipped) >= 1 and not allies_outside,
            f"outside x>={rec_facts['logicalViewWidth']}: {clipped}",
        )

    # ---------------------------------------------------------------- native fighter HP/MP bars
    # PASS 13 COMMAND 13.2. Expectations are the recovered native rules and the original gauge
    # asset; the page is only read. Fighter bars are a separate system from the team member-info HUD
    # (battle/member_info_bar.*) and from the GaugeSystem world gauges, which this group never touches.
    gauges = data.get("gauges") or {}
    gauge_expected = {
        "full": (100, 15),
        "half": (50, 7),
        "one-with-large-max": (1, 1),
        "zero": (0, 0),
        "over-max": (100, 15),
        "zero-max": (0, 0),
        "negative-max": (0, 0),
    }
    if not gauges:
        report.add("gauges", "(G13) fighter-gauge capture present", False)
    else:
        for row in gauges.get("table", []):
            expected = gauge_expected.get(row.get("label"))
            report.expect(
                "gauges",
                f"(G13) native rate/fill width for {row.get('label')}",
                [row.get("rate"), row.get("fill")],
                list(expected) if expected else None,
            )
        hp = gauges.get("hpLayout") or {}
        mp = gauges.get("mpLayout") or {}
        hp_crop = hp.get("backgroundCrop") or {}
        fill_crop = hp.get("fillCrop") or {}
        mp_fill_crop = mp.get("fillCrop") or {}
        report.expect("gauges", "(G13) HP meter origin == (screenX - 9, screenY - 4)", [hp.get("x"), hp.get("y")], [-9, -4])
        report.expect("gauges", "(G13) MP meter origin == (screenX - 9, screenY - 3)", [mp.get("x"), mp.get("y")], [-9, -3])
        report.expect(
            "gauges",
            "(G13) both meters are the native 18x3",
            [[hp.get("width"), hp.get("height")], [mp.get("width"), mp.get("height")]],
            [[18, 3], [18, 3]],
        )
        report.expect(
            "gauges",
            "(G13) background record is the 18x3 crop at (0,0)",
            [hp_crop.get("u"), hp_crop.get("v"), hp_crop.get("w"), hp_crop.get("h")],
            [0, 0, 18, 3],
        )
        report.expect(
            "gauges",
            "(G13) fill record is the 15x1 crop at u=1",
            [fill_crop.get("u"), fill_crop.get("w"), fill_crop.get("h")],
            [1, 15, 1],
        )
        report.expect(
            "gauges",
            "(G13) HP uses SEB frame 1 (green fill row 7)",
            [hp.get("frame"), fill_crop.get("v")],
            [1, 7],
        )
        report.expect(
            "gauges",
            "(G13) MP uses SEB frame 4 (pink fill row 16)",
            [mp.get("frame"), mp_fill_crop.get("v")],
            [4, 16],
        )
        report.expect(
            "gauges",
            "(G13) IsMostFront equivalent is the unit's own front row only",
            list((gauges.get("mostFront") or {}).values()),
            [True, False, True, False],
        )
        rendered = gauges.get("units") or []
        row_offset_gauges = recovered_row_offset(21)
        ally_front = [tuple(slot) for slot in recovered_cells(2, row_offset_gauges, "own")]
        enemy_front = [tuple(slot) for slot in recovered_cells(21, row_offset_gauges, "opponent")][:COLUMNS]
        expected_positions = {
            (round(native_view_pos(column, row, row_offset_gauges)[0], 3), round(native_view_pos(column, row, row_offset_gauges)[1], 3))
            for column, row in ally_front + enemy_front
        }
        report.expect(
            "gauges",
            "(G13) the stage carries 21 enemies plus 2 allies",
            gauges.get("totalUnits"),
            23,
        )
        report.expect(
            "gauges",
            "(G13) exactly the front row carries bars (2 allies + 5 enemies)",
            gauges.get("unitsWithGauges"),
            len(ally_front) + len(enemy_front),
        )
        report.add(
            "gauges",
            "(G13) every bar-carrying unit sits on a recovered front-row position",
            sorted(
                (round(unit["origin"]["x"], 3), round(unit["origin"]["y"], 3))
                for unit in rendered
            )
            == sorted(expected_positions),
            f"positions {sorted((round(u['origin']['x'], 3), round(u['origin']['y'], 3)) for u in rendered)}",
        )
        for unit in rendered:
            labels = sorted(gauge.get("kind") for gauge in unit["gauges"])
            report.expect("gauges", "(G13) each front-row unit draws an HP and an MP bar", labels, ["hp", "mp"])
            for gauge in unit["gauges"]:
                kind = gauge.get("kind")
                label = f"(G13) {'human' if unit['human'] else 'monster'} {kind}"
                report.expect("gauges", f"{label} x attribute == -9", gauge.get("x"), -9)
                report.expect("gauges", f"{label} y attribute == {(-4 if kind == 'hp' else -3)}", gauge.get("y"), -4 if kind == "hp" else -3)
                report.expect("gauges", f"{label} asset is the original mini_gauge.png", (gauge.get("asset") or "").endswith("/battle-assets/gauge/mini_gauge.png"), True, str(gauge.get("asset")))
                report.expect("gauges", f"{label} background crop == 0,0,18,3", gauge.get("crop"), "0,0,18,3")
                expected_rate = max(0, min(100, int(gauge.get("current", 0)) * 100 // int(gauge.get("max", 1))))
                if expected_rate == 0 and int(gauge.get("current", 0)) > 0:
                    expected_rate = 1
                report.expect("gauges", f"{label} rendered rate matches the native rule", gauge.get("rate"), expected_rate)
                expected_fill = 0 if expected_rate < 1 else (1 if 15 * expected_rate <= 99 else 15 * expected_rate // 100)
                report.expect("gauges", f"{label} rendered fill width matches the native rule", gauge.get("fill"), expected_fill)
                report.close("gauges", f"{label} meter rect == unit origin + (x,y)", gauge["rect"]["x"] - unit["origin"]["x"], gauge.get("x"), 0.6)
                report.close("gauges", f"{label} meter rect y == unit origin + y", gauge["rect"]["y"] - unit["origin"]["y"], gauge.get("y"), 0.6)
        human_units = [unit for unit in rendered if unit["human"]]
        monster_units = [unit for unit in rendered if not unit["human"]]
        geometry = lambda unit: sorted((g.get("kind"), g.get("x"), g.get("y"), g.get("crop"), g.get("frame"), g.get("asset")) for g in unit["gauges"])
        report.add("gauges", "(G13) both humans and monsters are represented", bool(human_units) and bool(monster_units), f"humans {len(human_units)} monsters {len(monster_units)}")
        if human_units and monster_units:
            report.expect(
                "gauges",
                "(G13) human and monster bars use identical geometry, crops and asset",
                geometry(human_units[0]),
                geometry(monster_units[0]),
            )

    # ---------------------------------------------------------------- human image-state card
    # The page shows the recovered native human image model. The expectations below are recomputed
    # from the game's own IMG_* constant table (metadata) and from the recovered creation rules,
    # never from the page's own strings.
    human_model = data.get("humanModel") or {}
    img_constants = {
        2: "IMG_FOOT",
        3: "IMG_SHOES",
        4: "IMG_FACE",
        5: "IMG_MOUTH",
        6: "IMG_EYE",
        7: "IMG_HAIR",
        8: "IMG_HAT",
        9: "IMG_ACCESSARY",
        10: "IMG_HAND",
        11: "IMG_WEAPON",
        12: "IMG_SHIELD",
        13: "IMG_LIFT",
        14: "IMG_FURNITURE",
        15: "IMG_VEHICLE",
        16: "IMG_GADGET",
    }
    if not human_model:
        report.add("humanmodel", "(HM) human image-state card captured", False)
    else:
        report.add("humanmodel", "(HM) card title present on the replay page", bool(human_model.get("titleFound")), "Human image state (recovered native model)")
        report.expect("humanmodel", "(HM) the model table lists the 17 imgIds slots", human_model.get("slotRows"), 17)
        slots = {row["index"]: row for row in (human_model.get("slots") or [])}
        kinds_expected = {str(index): name for index, name in img_constants.items()}
        kinds_actual = {index: row["kind"] for index, row in slots.items() if row["kind"] != "—"}
        report.expect("humanmodel", "(HM) every named slot uses the game's IMG_* constant name", kinds_actual, kinds_expected)
        report.expect("humanmodel", "(HM) slot 2 rule is the job's per-gender foot image array", slots.get("2", {}).get("rule"), "job.imgFoots[gender]")
        report.expect("humanmodel", "(HM) slot 4 rule is the job's per-gender head image array", slots.get("4", {}).get("rule"), "job.imgHeads[gender]")
        report.expect("humanmodel", "(HM) slot 10 rule is the job's per-gender hand image array", slots.get("10", {}).get("rule"), "job.imgHands[gender]")
        report.add("humanmodel", "(HM) slot 11 rule names the equipped record's img field", "EquipData +0x60" in slots.get("11", {}).get("rule", ""), slots.get("11", {}).get("rule"))
        report.add("humanmodel", "(HM) slot 12 rule names the equipped record's img field", "EquipData +0x60" in slots.get("12", {}).get("rule", ""), slots.get("12", {}).get("rule"))
        report.add("humanmodel", "(HM) the 0x80 flag condition is shown for slots 1 and 6", all("0x80" in slots.get(str(i), {}).get("rule", "") for i in (1, 6)), f"slot1={slots.get('1', {}).get('rule')} slot6={slots.get('6', {}).get('rule')}")
        report.add(
            "humanmodel",
            "(HM) creation constants are shown as skip (-2) where they are constants",
            slots.get("13", {}).get("rule") == "-2 (skip)" and slots.get("16", {}).get("rule") == "-2 (skip)",
            f"slot13={slots.get('13', {}).get('rule')} slot16={slots.get('16', {}).get('rule')}",
        )
        report.add("humanmodel", "(HM) the three job image arrays are named in the input list", bool(human_model.get("hasJobInputs")), "imgBodys / imgFoots / imgHands")
        report.add("humanmodel", "(HM) the weapon/shield default predicates are shown", bool(human_model.get("hasWeaponInput")), "JobData.weapon / JobData.shield")
        report.add("humanmodel", "(HM) the ImageComponent aliasing step is shown", bool(human_model.get("hasAliasStep")), "texIds === frontImgIds")
        report.add("humanmodel", "(HM) the unknown HumanResourceSet row placement is stated", bool(human_model.get("hasUnknownRowPlacement")), "row placement still unknown")
        report.add("humanmodel", "(HM) the allies' missing native inputs are stated", bool(human_model.get("hasAllyPlaceholders")), "job row / gender / equipment UNKNOWN")
        report.add("humanmodel", "(HM) the card does not displace the stage", bool(human_model.get("sceneStillPresent")), "scene element still present")

    # ---------------------------------------------------------------- runtime sanity
    runtime_exceptions = [entry for entry in data.get("console", []) if entry.get("type") == "exception"]
    report.expect("runtime", "no page exception while measuring", [], runtime_exceptions)
    report.expect("runtime", "no broken battle asset", [], [entry for entry in data.get("failures", []) if "/battle-assets/" in entry.get("url", "")])

    failures = report.failures
    summary = {
        "checks": len(report.checks),
        "passed": len(report.checks) - len(failures),
        "failed": len(failures),
        "failures": failures,
        "checks_detail": report.checks,
    }
    (root / "integration-report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
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
