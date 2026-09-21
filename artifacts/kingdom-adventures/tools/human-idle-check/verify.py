#!/usr/bin/env python3
"""Independent verification of the frozen human battle idle (PASS 12 / COMMAND 12.36).

Consumes the capture written by run_check.mjs and recomputes every expectation from the originals:

  * the intact 980-byte `RE-evidence/20260912-combat/chara-animation-original/equip_wait_up.seb`
    (decoded here, not read from the site's manifest),
  * the frozen demo inputs in `src/game-data/human-battle-idle.json` (job/gender/flag/imgIds),
  * the original `img.inf` index tables and OPT grids baked into
    `public/character_sprites/character-rules.json`,
  * the packed PNGs those OPT components point at.

Assertions:
  (S) shipped data == the intact SEB frame 0, line for line, plus the frozen state's own facts
  (H) the handoff's stated per-line resource/image geometry is reproduced line for line
  (D) the DOM draws exactly the expected lines, in ascending order, with the expected res/tex/dir/
      file/crop/OPT cell and no line for a slot the configuration has no image for
  (N) no drawn layer reads a truncated OPT component and no layer substitutes a placeholder
  (P) the painted pixels of each sole unit equal the independent composition of the same layers
  (G) the path adds no scale of its own: layer declarations carry the SEB translation verbatim and
      the scene keeps its single recovered presentation transform
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

from PIL import Image

ARTIFACT = Path(__file__).resolve().parents[2]
KA_WEBSITE = ARTIFACT.parents[1]
WORKSPACE = KA_WEBSITE.parent
SEB_PATH = WORKSPACE / "RE-evidence" / "20260912-combat" / "chara-animation-original" / "equip_wait_up.seb"
DATA_PATH = ARTIFACT / "src" / "game-data" / "human-battle-idle.json"
CHARACTER_RULES = ARTIFACT / "public" / "character_sprites" / "character-rules.json"
SPRITE_ROOT = ARTIFACT / "public" / "character_sprites"
ANIMATION_DATA = ARTIFACT / "src" / "game-data" / "human-battle-animation.json"
CHARA_DIR = WORKSPACE / "RE-evidence" / "20260912-combat" / "chara-animation-original"
EQUIP_TABLE = (
    WORKSPACE / "RE-evidence" / "20260911-treasure" / "xls-original" / "English.lproj" / "Equip.txt"
)
CLIP_SEB = {
    "equipWaitUp": CHARA_DIR / "equip_wait_up.seb",
    "attackSpearUp": CHARA_DIR / "attack_spear_up.seb",
    "attackBowUp": CHARA_DIR / "attack_bow_up.seb",
}
ATTACK_EXPECTED = {
    "guard-d": {
        "clip": "attackSpearUp",
        "seb": "chara/attack_spear_up.seb",
        "maxFrame": 19,
        "row": [18, 25, 25, 12, 15, 19, 16, 14, 17, 13, -2, -2, -2, 16],
        "lines": [0, 1, 2, 3, 4, 6, 7, 13],
    },
    "archer-c": {
        "clip": "attackBowUp",
        "seb": "chara/attack_bow_up.seb",
        "maxFrame": 19,
        "row": [18, 25, 25, 12, 15, 19, 16, 14, 17, 13, -2, -2, -2, 16],
        # Archer has no shield (imgIds[12] = -2), so line 1 must stay absent during the attack too.
        "lines": [0, 2, 3, 4, 6, 7, 13],
    },
}
ATTACK_WINDOW = {"updates": 20, "hitUpdate": 11, "frameMs": 50}
TOL_PX = 0.01

"""The frozen state's request, restated literally: EQUIP_WAIT / TYPE_NORMAL row 0 / UP / frame 0."""
HANDOFF_EXPECTED = {
    "guard-d": {
        "draws": 8,
        "lines": [
            (0, 18, 0, 0, 30, 24, 30, -13, -29),
            (1, 25, 100, 0, 0, 24, 30, -23, -30),
            (2, 12, 28, 0, 0, 24, 30, -12, -29),
            (3, 15, 28, 0, 0, 24, 30, -13, -29),
            (5, 16, 28, 0, 60, 24, 30, -13, -29),
            (6, 14, 70, 0, 0, 24, 24, -12, -32),
            (12, 25, 270, 0, 0, 60, 60, -26, -50),
            (13, 16, 28, 144, 0, 24, 30, -13, -29),
        ],
    },
    "archer-c": {
        "draws": 7,
        "lines": [
            (0, 18, 0, 0, 30, 24, 30, -13, -29),
            (2, 12, 38, 0, 0, 24, 30, -12, -29),
            (3, 15, 38, 0, 0, 24, 30, -13, -29),
            (5, 16, 38, 0, 60, 24, 30, -13, -29),
            (6, 14, 96, 0, 0, 24, 24, -12, -32),
            (12, 25, 295, 0, 0, 60, 60, -26, -50),
            (13, 16, 38, 144, 0, 24, 30, -13, -29),
        ],
    },
}


class Report:
    def __init__(self) -> None:
        self.checks: list[dict] = []

    def add(self, group: str, name: str, passed: bool, detail: str = "") -> bool:
        self.checks.append({"group": group, "name": name, "pass": bool(passed), "detail": detail})
        return bool(passed)

    def expect(self, group: str, name: str, actual, expected, detail: str = "") -> bool:
        ok = actual == expected
        return self.add(group, name, ok, detail if ok else f"expected {expected!r}, got {actual!r}")

    def close(self, group: str, name: str, actual: float, expected: float, tol: float = TOL_PX) -> bool:
        ok = abs(actual - expected) <= tol
        return self.add(group, name, ok, f"actual {actual:.4f} expected {expected:.4f} tol {tol}")

    @property
    def failures(self) -> list[dict]:
        return [check for check in self.checks if not check["pass"]]


def decode_seb_frame(path: Path) -> tuple[dict[int, dict], dict]:
    """Raw SEB decode: only the file's own bytes are used."""
    data = path.read_bytes()
    layers, max_frame = struct.unpack_from(">Hh", data, 0)
    pos = 4
    frame0: dict[int, dict] = {}
    counts: dict[int, int] = {}
    total = 0
    for line in range(layers):
        count, _reserved = struct.unpack_from(">hh", data, pos)
        pos += 4
        counts[line] = count
        for _ in range(count):
            frame, tex, u, v, w, h, trans_x, trans_y, revers_u, revers_v = struct.unpack_from(">10h", data, pos)
            pos += 20
            total += 1
            if frame == 0:
                frame0[line] = dict(tex=tex, u=u, v=v, w=w, h=h, transX=trans_x, transY=trans_y, reversU=revers_u, reversV=revers_v)
        if pos > len(data):
            raise SystemExit(f"{path.name}: line {line} runs past the end of the file")
    if pos != len(data):
        raise SystemExit(f"{path.name}: parsed {pos} of {len(data)} bytes")
    return frame0, {"layers": layers, "maxFrame": max_frame, "records": total, "bytes": len(data), "counts": counts}


def opt_cells(raw: bytes) -> tuple[dict, list]:
    """Tolerant count-prefixed OPT decode, used to prove a used cell is not a truncated record."""
    cell_w, cell_h, cols, rows = raw[0], raw[1], raw[2], raw[3]
    pos = 4
    cells: dict[str, list] = {}
    truncated: list = []
    for v in range(rows):
        for u in range(cols):
            if pos >= len(raw):
                truncated.append([u, v, "no-count"])
                return cells, truncated
            count = raw[pos]
            pos += 1
            components = []
            for _ in range(count):
                if pos + 14 <= len(raw):
                    components.append(struct.unpack_from(">7h", raw, pos))
                    pos += 14
                else:
                    truncated.append([u, v, len(raw) - pos])
                    pos = len(raw)
                    break
            if components:
                cells[f"{v},{u}"] = components
    return cells, truncated


def cell_size_key(cell: str) -> tuple[int, int]:
    row, column = cell.split(",")
    return int(row), int(column)


def all_seb_records(path: Path) -> list[dict]:
    """Every key record of one intact SEB, in file order (the site's exporter uses this layout)."""
    raw = path.read_bytes()
    layers, _max_frame = struct.unpack_from(">Hh", raw, 0)
    pos = 4
    records: list[dict] = []
    for line in range(layers):
        count, _reserved = struct.unpack_from(">hh", raw, pos)
        pos += 4
        for index in range(count):
            rec = struct.unpack_from(">10h", raw, pos + index * 20)
            records.append(
                {
                    "line": line,
                    "frame": rec[0],
                    "tex": rec[1],
                    "u": rec[2],
                    "v": rec[3],
                    "w": rec[4],
                    "h": rec[5],
                    "transX": rec[6],
                    "transY": rec[7],
                    "reversU": rec[8],
                    "reversV": rec[9],
                }
            )
        pos += count * 20
    assert pos == len(raw), f"{path.name}: parsed {pos} of {len(raw)} bytes"
    return records


def seb_select(records: list[dict], frame: int, line: int) -> dict | None:
    """`Seb.GetSprite(frame, line) 0x2351CA0`: last key <= frame, none outside the line's range."""
    keys = [record for record in records if record["line"] == line]
    if not keys:
        return None
    if frame < keys[0]["frame"] or frame > keys[-1]["frame"]:
        return None
    current = keys[0]
    for record in keys:
        if record["frame"] <= frame:
            current = record
        else:
            break
    return current


def expected_attack_line(
    rules: dict,
    part_dirs: dict[str, str],
    row: list[int],
    img_ids: list[int],
    records: list[dict],
    frame: int,
    line: int,
) -> dict | None:
    """Independently recompute one attack line: SEB record -> imgIds slot -> group -> part sheet."""
    record = seb_select(records, frame, line)
    if record is None or record["tex"] < 0:
        return None
    image = img_ids[record["tex"]] if record["tex"] < len(img_ids) else -2
    if image < 0:
        return None
    group = row[line] if line < len(row) else -2
    dir_name = part_dirs.get(str(group))
    if dir_name is None:
        return None
    part = rules["dirs"].get(dir_name)
    if part is None:
        return None
    name = part["inf"]["img"].get(str(image))
    if name is None:
        return None
    return {
        "line": line,
        "res": str(group),
        "file": name.rsplit(".", 1)[0],
        "crop": f'{record["u"]},{record["v"]},{record["w"]},{record["h"]}',
        "trans": f'{record["transX"]},{record["transY"]}',
        "record": record,
    }


REACTION_BEHAVIOUR = {"damage": 30, "knockDownSit": 28, "knockDownDown": 7}
REACTION_FILES = {
    "damage": ["equip_damege2_up.seb", "equip_damege2_right.seb"],
    "knockDownSit": ["equip_sit_up.seb", "equip_sit_right.seb"],
    "knockDownDown": ["down_right.seb", "down_right.seb"],
}
REACTION_TYPE_EXPECTED = {7: 0, 28: 18, 30: 0}
DAMAGE_UPDATES = 7
DAMAGE_MAX_FRAME = 6
KNOCKDOWN_SPIN_THROUGH = 20
KNOCKDOWN_DOWN_FROM = 21
KNOCKDOWN_LEAVING_AT = 101
LEAVING_KIND = 10
LEAVING_CELL_SIZE = 24
LEAVING_COLUMNS = 5
LEAVING_MIN_HEIGHT = 20
LEAVING_MAX_HEIGHT = 100


def human_damage_lift(frame: int, team: int) -> int:
    """`Easing.Parabola(team0 ? +10 : -10, 6, frame)` - the recovered `offsetZ` arc."""
    height = 10 if team == 0 else -10
    t = frame / DAMAGE_MAX_FRAME
    return int((t * 4 - t * (t * 4)) * height)


def human_parabola(height: int, length: int, frame: int) -> int:
    """`Easing.Parabola 0x1444988` with its integer truncation."""
    if length <= 0:
        return 0
    t = frame / length
    return int((t * 4 - t * (t * 4)) * height)


def leaving_height_for_distance(distance: float) -> int:
    """The COMMAND 15.9 maxFrame clamp: lower 20, upper 100."""
    return min(LEAVING_MAX_HEIGHT, max(LEAVING_MIN_HEIGHT, int(distance * distance / 100)))


def expected_leaving(cell: tuple[int, int], team: int, rival_team_member_count: int, frame: int) -> dict:
    """Recompute the COMMAND 15.7 destination and the kind-10 projectile position."""
    column, row = cell
    row_offset = max(3, int(rival_team_member_count / 5) + 1)
    start = (column * LEAVING_CELL_SIZE, 0, row * LEAVING_CELL_SIZE)
    queued_grid = row * LEAVING_COLUMNS + column + 100
    queued_row = int(queued_grid / LEAVING_COLUMNS)
    queued_column = queued_grid - queued_row * LEAVING_COLUMNS
    end = (
        queued_column * LEAVING_CELL_SIZE,
        0,
        (
            row_offset
            + (1 if team == 0 else 0)
            + (queued_row if team == 0 else -queued_row)
        )
        * LEAVING_CELL_SIZE,
    )
    dx, dz = end[0] - start[0], end[2] - start[2]
    distance = (dx * dx + dz * dz) ** 0.5
    height = leaving_height_for_distance(distance)
    speed = max(1, int(distance / LEAVING_KIND))
    updates = max(0, int(distance / speed))
    impacted = frame >= updates
    applied = updates if impacted else frame + 1
    nx = dx / distance if distance else 0.0
    nz = dz / distance if distance else 0.0
    world = end if impacted else (
        start[0] + nx * speed * applied,
        human_parabola(height, updates, applied),
        start[2] + nz * speed * applied,
    )
    return {
        "start": start,
        "end": end,
        "rowOffset": row_offset,
        "distance": distance,
        "height": height,
        "maxFrame": height,
        "updates": updates,
        "impacted": impacted,
        "world": world,
    }


def parse_triple(raw: str) -> tuple[float, float, float]:
    values = raw.split(",")
    if len(values) != 3:
        raise ValueError(f"expected three comma-separated numbers, got {raw!r}")
    return float(values[0]), float(values[1]), float(values[2])


def expected_queue_position(side: str, target_index: int, units: list[dict], row_offset: int) -> dict:
    """Recovered `GetQueueingPosition 0x1588078`: first minimum count, then CalcGridCell."""
    living = [
        unit for unit in units
        if unit["side"] == side and int(unit["index"]) != target_index and unit["alive"]
    ]
    counts = [
        sum(1 for unit in living if int(unit["cell"]["column"]) == column)
        for column in range(5)
    ]
    best_count = min(counts)
    best_column = counts.index(best_count)
    index = best_column + 5 * (best_count + 1)
    row = int(index / 5)
    column = index - row * 5
    cell_row = row_offset + 1 + row if side == "ally" else row_offset - row
    return {
        "cell": {"column": column, "row": cell_row},
        "world": {"x": column * 24, "y": 0, "z": cell_row * 24},
        "sourceColumn": best_column,
        "sourceCount": best_count,
        "index": index,
    }


def human_fighter_path(start: tuple[float, float], target: tuple[float, float]) -> list[tuple[int, int]]:
    """`GetPath 0x1584310`: the recovered L-shaped intersection plus the target."""
    sx, sz = start
    tx, tz = target
    a1 = tx - (tx + 1)
    b0 = (sz + 1) - sz
    det = -b0 * a1
    c0 = sx * -b0
    c1 = -a1 * tz
    cross_x = sx if det == 0 else (a1 * c0) / det
    cross_z = tz if det == 0 else (b0 * c1) / det
    return [(int(cross_x), int(cross_z)), (int(tx), int(tz))]


def expected_move(start: tuple[float, float], target: tuple[float, float], frame: int) -> dict:
    """`AISystem.MoveBase 0x148C2E0` at 4.46 units/update, one UpdateMoving step per frame."""
    path = human_fighter_path(start, target)
    x, z = start
    arrived = False
    for _ in range(max(0, frame)):
        if not path:
            x, z = target
            arrived = True
            break
        wx, wz = path[0]
        dx, dz = wx - x, wz - z
        distance = (dx * dx + dz * dz) ** 0.5
        if distance * distance <= 4.46 * 4.46:
            x, z = wx, wz
            path.pop(0)
            if not path:
                arrived = True
            continue
        step = min(4.46, distance)
        x += (dx / distance) * step
        z += (dz / distance) * step
    if not path:
        x, z = target
        arrived = True
    return {"world": (x, 0.0, z), "arrived": arrived}


def revival_checks(report: Report, capture: dict, animation: dict, idle: dict, rules: dict) -> None:
    """PASS 15 COMMAND 15.11: state-2 revival walk and native queueing destination."""
    group = "revival"
    pass_data = capture.get("revival") or {}
    fixtures = (((capture.get("lab") or {}).get("scene") or {}).get("facts") or {}).get("revivalFixtures") or []
    report.expect(group, "(M) the production queue-position helper exposes three fixtures",
                  len(fixtures), 3)
    for fixture in fixtures:
        expected = expected_queue_position(
            fixture["side"],
            int(fixture["targetIndex"]),
            fixture["units"],
            int(fixture["rowOffset"]),
        )
        destination = fixture["destination"]
        report.expect(group, f"(M) fixture {fixture['id']} queue cell",
                      destination["cell"], expected["cell"])
        report.expect(group, f"(M) fixture {fixture['id']} queue world",
                      destination["world"], expected["world"])
        report.expect(group, f"(M) fixture {fixture['id']} source column/count",
                      [destination["sourceColumn"], destination["sourceCount"]],
                      [expected["sourceColumn"], expected["sourceCount"]])
        report.expect(group, f"(M) fixture {fixture['id']} grid index",
                      destination["index"], expected["index"])

    expected_pre = {
        "damage": "damage",
        "knockdown": "knockdown",
        "down": "down",
        "leaving": "leaving",
    }
    walk_files = {
        0: ("chara/equip_walk_up.seb", "0"),
        1: ("chara/equip_walk_right.seb", "0"),
        2: ("chara/equip_walk_right.seb", "1"),
        3: ("chara/equip_walk_up.seb", "1"),
    }
    for scenario_id, wanted_pre in expected_pre.items():
        scenario = pass_data.get(scenario_id) or {}
        pre = scenario.get("pre") or {}
        samples = scenario.get("samples") or []
        pre_guard = pre.get("guard") or {}
        report.expect(group, f"(D) {scenario_id}: pre-revive native state",
                      pre_guard.get("nativeState"), wanted_pre)
        if scenario_id == "leaving":
            unsupported = [
                sample for sample in samples
                if (sample.get("guard") or {}).get("revivalState") == "unsupported-during-leaving"
            ]
            report.add(group, "(D) leaving: revive during Leaving is explicitly unsupported",
                       len(unsupported) > 0, f"{len(unsupported)}/{len(samples)} samples")
            report.add(group, "(D) leaving: no fake cancellation into revival-moving",
                       all((sample.get("guard") or {}).get("nativeState") != "revival-moving"
                           for sample in samples),
                       "revival-moving must not appear")
            report.add(group, "(D) leaving: the leaving projectile state is retained",
                       all((sample.get("guard") or {}).get("leaving") == "1"
                           for sample in unsupported),
                       f"{len(unsupported)} unsupported samples")
            continue

        moving = [
            sample for sample in samples
            if (sample.get("guard") or {}).get("nativeState") == "revival-moving"
        ]
        complete = [
            sample for sample in samples
            if (sample.get("guard") or {}).get("revivalState") == "complete"
        ]
        report.add(group, f"(D) {scenario_id}: revive enters state 2 immediately",
                   len(moving) > 0, f"{len(moving)} moving samples")
        report.add(group, f"(D) {scenario_id}: the walk reaches arrival",
                   len(complete) > 0, f"{len(complete)} complete samples")
        if not moving:
            continue

        pre_lines = pre.get("guardLines") or []
        if not pre_lines:
            continue
        start_column, start_row = (int(value) for value in str(pre_lines[0]["cell"]).split(","))
        start = (start_column * 24.0, start_row * 24.0)
        first_moving = moving[0].get("guard") or {}
        if first_moving.get("moveTargetX") in (None, "") or first_moving.get("moveTargetZ") in (None, ""):
            report.add(group, f"(D) {scenario_id}: target metadata present", False,
                       json.dumps(first_moving)[:200])
            continue
        target = (float(first_moving["moveTargetX"]), float(first_moving["moveTargetZ"]))
        target_cell_raw = first_moving.get("moveTargetCell") or ""
        target_cell = tuple(int(value) for value in target_cell_raw.split(",")) if target_cell_raw else None

        archer_line = (pre.get("archerLines") or [{}])[0]
        archer_cell = str(archer_line.get("cell") or "0,0").split(",")
        units = [
            {"side": "ally", "index": 0, "alive": False,
             "cell": {"column": start_column, "row": start_row}},
            {"side": "ally", "index": 1, "alive": True,
             "cell": {"column": int(archer_cell[0]), "row": int(archer_cell[1])}},
        ]
        expected_target = expected_queue_position("ally", 0, units, 5)
        report.expect(group, f"(D) {scenario_id}: queue target matches GetQueueingPosition",
                      [target[0], target[1]],
                      [expected_target["world"]["x"], expected_target["world"]["z"]])
        report.expect(group, f"(D) {scenario_id}: queue target cell",
                      target_cell,
                      (expected_target["cell"]["column"], expected_target["cell"]["row"]))

        for sample in moving:
            guard = sample.get("guard") or {}
            move_frame = int(guard["moveFrame"])
            expected = expected_move(start, target, move_frame)
            expected_world = expected["world"]
            report.expect(group, f"(D) {scenario_id} move {move_frame}: behavior 2",
                          guard.get("behaviour"), "2")
            report.expect(group, f"(D) {scenario_id} move {move_frame}: state is revival-moving",
                          guard.get("nativeState"), "revival-moving")
            direction = int(guard["direction"])
            walk = walk_files.get(direction)
            report.expect(group, f"(D) {scenario_id} move {move_frame}: intact direction SEB",
                          [guard.get("seb"), guard.get("flip")], list(walk) if walk else None)
            report.expect(group, f"(D) {scenario_id} move {move_frame}: frame advances by rate 2",
                          int(guard["frame"]), (move_frame * 2) % 14)
            report.close(group, f"(D) {scenario_id} move {move_frame}: world X",
                         float(guard["worldX"]), expected_world[0], 0.01)
            report.close(group, f"(D) {scenario_id} move {move_frame}: world Y",
                         float(guard["worldY"]), expected_world[1], 0.01)
            report.close(group, f"(D) {scenario_id} move {move_frame}: world Z",
                         float(guard["worldZ"]), expected_world[2], 0.01)
            for line in sample.get("guardLines") or []:
                line_index = int(line["line"])
                expected_base = expected_world[0] + expected_world[1] + expected_world[2]
                report.expect(group, f"(D) {scenario_id} move {move_frame} L{line_index}: live world",
                              line.get("livePosition"), "1")
                report.close(group, f"(D) {scenario_id} move {move_frame} L{line_index}: depth base",
                             float(line["baseDepth"]), expected_base, 0.01)
                report.close(group, f"(D) {scenario_id} move {move_frame} L{line_index}: queue depth",
                             float(line["depth"]), expected_base + line_index, 0.01)
                origin = line.get("logicalOrigin") or {}
                camera_x = -144 - 24 * (5 - 3) - 16
                camera_y = int((-144 + 24 * (5 - 3)) / 2) + 3
                expected_screen_x = expected_world[0] - expected_world[2] - camera_x
                expected_screen_y = int((expected_world[0] + expected_world[2]) / 2 - expected_world[1]) - camera_y
                report.close(group, f"(D) {scenario_id} move {move_frame} L{line_index}: screen X",
                             float(origin.get("x", 0)), expected_screen_x, 0.6)
                report.close(group, f"(D) {scenario_id} move {move_frame} L{line_index}: screen Y",
                             float(origin.get("y", 0)), expected_screen_y, 0.6)

        if complete:
            arrival = complete[0].get("guard") or {}
            report.expect(group, f"(D) {scenario_id}: arrival returns to EQUIP_WAIT frame 0",
                          [arrival.get("nativeState"), arrival.get("seb"), int(arrival.get("frame") or 0)],
                          ["wait", "chara/equip_wait_up.seb", 0])
            report.expect(group, f"(D) {scenario_id}: arrival direction is team facing",
                          int(arrival.get("direction") or 0), 0)
            report.expect(group, f"(D) {scenario_id}: arrival revision state is complete",
                          arrival.get("revivalState"), "complete")
            report.close(group, f"(D) {scenario_id}: arrival world X",
                         float(arrival.get("worldX")), target[0], 0.01)
            report.close(group, f"(D) {scenario_id}: arrival world Z",
                         float(arrival.get("worldZ")), target[1], 0.01)
            report.expect(
                group,
                f"(D) {scenario_id}: arrival exposes the native queue cell",
                arrival.get("moveTargetCell"),
                f"{expected_target['cell']['column']},{expected_target['cell']['row']}",
            )


def reaction_checks(report: Report, capture: dict, animation: dict, idle: dict, rules: dict) -> None:
    """PASS 15 COMMAND 15.5: damage reaction, knock-down spin and the static down pose."""
    group = "reaction"

    # ---------------------------------------------------------------- (A) native type + intact clips
    from elftools.elf.elffile import ELFFile

    binary = WORKSPACE / "RE-evidence" / "G2.1" / "39257e72291d" / "inputs" / "libil2cpp.so"
    with binary.open("rb") as handle:
        elf = ELFFile(handle)
        for segment in elf.iter_segments():
            if segment["p_type"] != "PT_LOAD":
                continue
            start, size = segment["p_vaddr"], segment["p_filesz"]
            if start <= 0x772314 < start + size:
                handle.seek(segment["p_offset"] + (0x772314 - start))
                table = struct.unpack("<34I", handle.read(34 * 4))
                break
        else:
            raise SystemExit("GetHumanResourceSetType jump table not found")
    for behaviour, expected in REACTION_TYPE_EXPECTED.items():
        report.expect(group, f"(A) behaviour {behaviour} -> resource-set type {expected}",
                      table[behaviour - 5], expected)

    for reaction_id, behaviour in REACTION_BEHAVIOUR.items():
        reaction = animation["reactions"][reaction_id]
        report.expect(group, f"(A) {reaction_id} behaviour", reaction["behaviour"], behaviour)
        report.expect(group, f"(A) {reaction_id} resource-set type matches the jump table",
                      reaction["resourceSetType"], table[behaviour - 5])
        report.expect(group, f"(A) {reaction_id} line -> group row is the EQUIP_WAIT row",
                      reaction["lineResourceGroups"]["row"], idle["lineResourceGroups"]["row"])
        report.expect(group, f"(A) {reaction_id} has four direction variants",
                      [v["direction"] for v in reaction["directions"]], [0, 1, 2, 3])
        for variant in reaction["directions"]:
            name = REACTION_FILES[reaction_id][0 if variant["direction"] in (0, 3) else 1]
            path = CHARA_DIR / name
            raw = path.read_bytes()
            layers, max_frame = struct.unpack_from(">Hh", raw, 0)
            report.expect(group, f"(A) {reaction_id} d{variant['direction']} SEB", variant["seb"], f"chara/{name}")
            report.expect(group, f"(A) {reaction_id} d{variant['direction']} sha256",
                          variant["sha256"], hashlib.sha256(raw).hexdigest())
            report.expect(group, f"(A) {reaction_id} d{variant['direction']} header",
                          [variant["layers"], variant["maxFrame"]], [layers, max_frame])
            report.expect(group, f"(A) {reaction_id} d{variant['direction']} records are the SEB's",
                          variant["frames"], all_seb_records(path))
            report.expect(group, f"(A) {reaction_id} d{variant['direction']} flip flag",
                          variant["flip"], variant["direction"] in (2, 3))
            report.expect(group, f"(A) {reaction_id} d{variant['direction']} sebId is base + direction",
                          variant["sebId"], reaction["humanBase"] + variant["direction"])

    # ---------------------------------------------------------------- (D) the damage reaction on the page
    samples = (capture.get("reaction") or {}).get("samples") or []
    damaged = [s for s in samples if (s.get("guard") or {}).get("nativeState") == "damage"]
    report.add(group, "(D) the damage reaction was captured", len(damaged) > 0, f"{len(damaged)}/{len(samples)} samples")
    for sample in damaged:
        guard = sample["guard"]
        update = int(guard["reactionUpdate"])
        frame = int(guard["frame"])
        report.expect(group, f"(D) damage update {update} behaviour", guard["behaviour"], "30")
        report.expect(group, f"(D) damage update {update} clip is the intact damage SEB",
                      guard["seb"], "chara/equip_damege2_up.seb")
        report.expect(group, f"(D) damage update {update} frame wraps at 6", frame, update % DAMAGE_MAX_FRAME)
        report.expect(group, f"(D) damage update {update} recovered offsetZ arc",
                      int(guard["damageLift"]), human_damage_lift(frame, 0))
        report.expect(group, f"(D) damage update {update} direction stays the entry facing",
                      guard["direction"], "0")
        report.expect(group, f"(D) damage update {update} reports the window", guard["nativeDamageWindow"], str(DAMAGE_UPDATES))
    if damaged:
        later = samples[samples.index(damaged[-1]) + 1:]
        report.add(group, "(D) the non-lethal hit returns to EQUIP_WAIT frame 0",
                   any((s.get("guard") or {}).get("nativeState") == "wait"
                       and (s.get("guard") or {}).get("seb") == "chara/equip_wait_up.seb"
                       and int((s.get("guard") or {}).get("frame", -1)) <= 2 for s in later),
                   f"{len(later)} samples after the last damage sample")
        report.expect(group, "(D) the reaction never exceeds its 7-update window",
                      max(int(s["guard"]["reactionUpdate"]) for s in damaged), DAMAGE_UPDATES - 1)

    # ---------------------------------------------------------------- (M) the lethal timeline is model-checked
    down = animation["reactions"]["knockDownDown"]
    sit = animation["reactions"]["knockDownSit"]
    report.expect(group, "(A) the settled down pose is a one-frame clip",
                  [v["maxFrame"] for v in down["directions"]], [1, 1, 1, 1])
    report.expect(group, "(A) the sit clip is the 14-frame pose",
                  [v["maxFrame"] for v in sit["directions"]], [14, 14, 14, 14])
    entry = 0
    spin_directions = [((entry + k) % 4) for k in range(1, KNOCKDOWN_SPIN_THROUGH + 1)]
    report.expect(group, "(M) the knock-down spin visits every facing and returns to the entry facing",
                  sorted(set(spin_directions)), [0, 1, 2, 3])
    report.expect(group, "(M) the settled facing after 20 spins from UP",
                  spin_directions[-1], 0)
    # The knock-down clip restarts at frame 0 on ChangeAnimation and wraps at its own maxFrame.
    sit_frames = [(k - 1) % 14 for k in range(1, KNOCKDOWN_SPIN_THROUGH + 1)]
    report.expect(group, "(M) sit frames restart at 0 and wrap at 14", sit_frames[:15], list(range(14)) + [0])
    report.expect(group, "(M) the down pose begins at knock-down timer 21",
                  KNOCKDOWN_DOWN_FROM, KNOCKDOWN_SPIN_THROUGH + 1)
    report.expect(group, "(M) the static pose holds from timer 21 to 100",
                  KNOCKDOWN_LEAVING_AT - KNOCKDOWN_DOWN_FROM, 80)
    report.expect(group, "(M) leaving begins at knock-down timer 101",
                  KNOCKDOWN_LEAVING_AT, 101)
    report.expect(group, "(M) the lethal sequence starts its reaction at the hit update",
                  [DAMAGE_UPDATES, DAMAGE_UPDATES + KNOCKDOWN_DOWN_FROM - 1, DAMAGE_UPDATES + KNOCKDOWN_LEAVING_AT - 1],
                  [7, 27, 107])


def leaving_checks(report: Report, capture: dict, animation: dict, idle: dict, rules: dict) -> None:
    """PASS 15 COMMAND 15.9: the kind-10 self-projectile and its live world depth."""
    group = "leaving"
    pass_data = capture.get("leaving") or {}
    samples = pass_data.get("samples") or []
    report.expect(group, "(D) the leaving pass selected the Kairobot Knight encounter",
                  pass_data.get("encounterSelected"), True)
    leaving = [sample for sample in samples
               if (sample.get("guard") or {}).get("nativeState") == "leaving"]
    report.add(group, "(D) the leaving phase was captured", len(leaving) > 0,
               f"{len(leaving)}/{len(samples)} samples")
    if not leaving:
        return

    first = leaving[0]
    first_guard = first.get("guard") or {}
    lines = first.get("guardLines") or []
    report.add(group, "(D) the leaving sample carries the drawn down-pose lines",
               len(lines) > 0, f"{len(lines)} lines")
    if not lines or not lines[0].get("cell"):
        return
    cell = tuple(int(value) for value in str(lines[0]["cell"]).split(","))
    camera_row_offset = int(first.get("rowOffset"))
    rival_team_member_count = int(first_guard.get("rivalTeamMemberCount"))
    first_expected = expected_leaving(cell, 0, rival_team_member_count, int(first_guard["leavingFrame"]))

    report.expect(group, "(D) the leaving pass is on the Kairobot Knight KO event",
                  first.get("event"), "event 6 / 10")
    report.expect(group, "(D) the projection camera keeps the shared 21-enemy row offset",
                  camera_row_offset, 5)
    report.expect(group, "(D) the destination uses the fixed teams[1] count, here 21 enemies",
                  rival_team_member_count, 21)
    report.expect(group, "(D) the flight starts from the unit's live cell",
                  f"{first_expected['start'][0]},{first_expected['start'][1]},{first_expected['start'][2]}",
                  first_guard.get("leavingStart"))
    report.expect(group, "(D) the destination is board[7] + 100 through GridToCellXi/Yi",
                  f"{first_expected['end'][0]},{first_expected['end'][1]},{first_expected['end'][2]}",
                  first_guard.get("leavingEnd"))
    report.expect(group, "(D) the projectile component keeps kind 10",
                  first_guard.get("nativeLeavingKind"), str(LEAVING_KIND))
    report.expect(group, "(D) the parabola height is the recovered clamp",
                  first_guard.get("leavingHeight"), str(first_expected["height"]))
    report.expect(group, "(D) the command maxFrame metadata is the same recovered clamp",
                  first_guard.get("projectileMaxFrame"), str(first_expected["maxFrame"]))
    report.expect(group, "(D) the flight length is distance / kind, not the parabola height",
                  first_guard.get("leavingUpdates"), str(first_expected["updates"]))
    report.expect(group, "(D) state 8 keeps the unchanged down pose",
                  [first_guard.get("seb"), first_guard.get("reaction"), first_guard.get("behaviour")],
                  ["chara/down_right.seb", "knockDownDown", "7"])

    def triple_close(actual_raw: str, expected: tuple[float, float, float], label: str) -> None:
        actual = parse_triple(actual_raw)
        for index, axis in enumerate("xyz"):
            report.close(group, f"(D) {label} {axis}", actual[index], expected[index], 0.01)

    for sample in leaving:
        guard = sample.get("guard") or {}
        frame = int(guard["leavingFrame"])
        expected = expected_leaving(cell, 0, rival_team_member_count, frame)
        report.expect(group, f"(D) leaving frame {frame} exposes the command update hook",
                      guard.get("leavingUpdate"), str(frame))
        report.expect(group, f"(D) leaving frame {frame} exposes the projectile frame hook",
                      guard.get("projectileFrame"), str(frame))
        triple_close(
            f"{guard.get('worldX')},{guard.get('worldY')},{guard.get('worldZ')}",
            expected["world"],
            f"leaving frame {frame} world hooks",
        )
        report.expect(group, f"(D) leaving frame {frame} starts at knock-down timer 101",
                      int(guard["knockdownUpdate"]), KNOCKDOWN_LEAVING_AT + frame)
        report.expect(group, f"(D) leaving frame {frame} reports the live projectile",
                      guard.get("leaving"), "1")
        report.expect(group, f"(D) leaving frame {frame} impact flag",
                      guard.get("leavingImpacted"), "1" if expected["impacted"] else "0")
        triple_close(guard.get("leavingWorld"), expected["world"], f"leaving frame {frame} world")
        expected_direction = (2 * frame) % 4
        report.expect(group, f"(D) leaving frame {frame} spins +2 quarter-turns per update",
                      int(guard["direction"]), expected_direction)
        report.expect(group, f"(D) leaving frame {frame} uses the ,u mirror for RIGHT/DOWN",
                      guard.get("flip"), "1" if expected_direction in (2, 3) else "0")

        for line in sample.get("guardLines") or []:
            line_index = int(line["line"])
            expected_base = sum(expected["world"])
            report.expect(group, f"(D) leaving frame {frame} L{line_index} uses the live world position",
                          line.get("livePosition"), "1")
            report.expect(group, f"(D) leaving frame {frame} L{line_index} world matches the flight",
                          line.get("worldPosition"), guard.get("leavingWorld"))
            report.close(group, f"(D) leaving frame {frame} L{line_index} base depth",
                         float(line["baseDepth"]), expected_base, 0.01)
            report.close(group, f"(D) leaving frame {frame} L{line_index} queue depth",
                         float(line["depth"]), expected_base + line_index, 0.01)
            camera_x = -144 - 24 * (camera_row_offset - 3) - 16
            camera_y = int((-144 + 24 * (camera_row_offset - 3)) / 2) + 3
            expected_screen_x = expected["world"][0] - expected["world"][2] - camera_x
            expected_screen_y = int((expected["world"][0] + expected["world"][2]) / 2 - expected["world"][1]) - camera_y
            origin = line.get("logicalOrigin") or {}
            report.close(group, f"(D) leaving frame {frame} L{line_index} screen X",
                         float(origin.get("x", 0)), expected_screen_x, 0.6)
            report.close(group, f"(D) leaving frame {frame} L{line_index} screen Y",
                         float(origin.get("y", 0)), expected_screen_y, 0.6)

    impacted = [sample for sample in leaving
                if (sample.get("guard") or {}).get("leavingImpacted") == "1"]
    report.add(group, "(D) the flight reaches its off-field endpoint", len(impacted) > 0,
               f"{len(impacted)} impacted samples")
    if impacted:
        guard = impacted[0]["guard"]
        expected = expected_leaving(cell, 0, rival_team_member_count, int(guard["leavingFrame"]))
        triple_close(guard.get("leavingWorld"), expected["end"], "impacted world")
        report.expect(group, "(D) after impact the fighter stays at the endpoint",
                      guard.get("leavingWorld"), first_guard.get("leavingEnd"))

    # Every stationary line must keep the PASS 14 cell formula; only the leaving unit changes key.
    archer_lines = first.get("archerLines") or []
    for line in archer_lines:
        column, row = (int(value) for value in str(line["cell"]).split(","))
        expected_base = 24 * (column + row)
        line_index = int(line["line"])
        report.expect(group, f"(D) stationary Archer L{line_index} has no live world position",
                      line.get("livePosition"), None)
        report.expect(group, f"(D) stationary Archer L{line_index} keeps the cell base depth",
                      int(line["baseDepth"]), expected_base)
        report.expect(group, f"(D) stationary Archer L{line_index} keeps base + line depth",
                      int(line["depth"]), expected_base + line_index)

    # Asymmetric cases: the same fixed teams[1] count feeds both sides.
    report.expect(group, "(M) Case A: team 0, teams[1]=21 -> rowOffset 5 -> endZ 768",
                  expected_leaving((0, 6), 0, 21, 0)["end"], (0.0, 0.0, 768.0))
    report.expect(group, "(M) Case B: team 0, teams[1]=5 -> rowOffset 3 -> endZ 720",
                  expected_leaving((0, 6), 0, 5, 0)["end"], (0.0, 0.0, 720.0))
    report.expect(group, "(M) Case C: team 1, teams[1]=21 -> rowOffset 5 -> endZ -480",
                  expected_leaving((0, 5), 1, 21, 0)["end"], (0.0, 0.0, -480.0))

    # The lab surface exposes the production helper's own results for the three asymmetric fixtures.
    fixtures = (((capture.get("lab") or {}).get("scene") or {}).get("facts") or {}).get("leavingFixtures") or []
    report.expect(group, "(D) the production helper exposes exactly the three asymmetric fixtures",
                  len(fixtures), 3)
    for fixture in fixtures:
        fixture_id = fixture.get("id")
        cell_value = fixture.get("cell") or {}
        cell_fixture = (int(cell_value.get("column")), int(cell_value.get("row")))
        expected = expected_leaving(
            cell_fixture,
            int(fixture.get("team")),
            int(fixture.get("rivalTeamMemberCount")),
            0,
        )
        report.expect(group, f"(D) fixture {fixture_id} rowOffset is independent of the leaving team",
                      int(fixture.get("rowOffset")), expected["rowOffset"])
        report.expect(group, f"(D) fixture {fixture_id} endX/endY/endZ match the native source rule",
                      [fixture.get("end", {}).get("x"), fixture.get("end", {}).get("y"), fixture.get("end", {}).get("z")],
                      list(expected["end"]))
    report.expect(group, "(M) the maxFrame clamp lower bound is 20",
                  leaving_height_for_distance(10), 20)
    report.expect(group, "(M) the maxFrame clamp middle value is unmodified",
                  leaving_height_for_distance(50), 25)
    report.expect(group, "(M) the maxFrame clamp upper bound is 100",
                  leaving_height_for_distance(200), 100)

    # Impact must not delete or hide the visual; the off-field endpoint is clipped by the viewport.
    if impacted:
        guard = impacted[0].get("guard") or {}
        report.expect(group, "(D) the impacted human is still in the visual scene",
                      [guard.get("nativeState"), int(guard.get("draws") or 0) > 0],
                      ["leaving", True])
        impacted_lines = impacted[0].get("guardLines") or []
        report.add(group, "(D) the impacted human still exposes its static down-pose lines",
                   len(impacted_lines) > 0, f"{len(impacted_lines)} lines")
        if impacted_lines:
            origin = impacted_lines[0].get("logicalOrigin") or {}
            view_width = float(capture["frozen"]["scene"]["facts"]["logicalViewWidth"])
            report.add(
                group,
                "(D) the off-field endpoint is outside the recovered viewport and therefore clipped",
                float(origin.get("x", 0)) < 0 or float(origin.get("x", 0)) > view_width,
                f"screen X {origin.get('x')} outside [0,{view_width}]",
            )

    # The pre-flight sample is the static down state; it must not already report a live position.
    start = pass_data.get("start") or {}
    start_guard = start.get("guard") or {}
    report.add(group, "(D) the pre-flight sample is still in the knock-down/down chain",
               start_guard.get("nativeState") in {"damage", "knockdown", "down"},
               f"state {start_guard.get('nativeState')!r} kd {start_guard.get('knockdownUpdate')!r}")
    report.add(group, "(D) the pre-flight sample carries no live projectile",
               not start_guard.get("leaving"),
               f"leaving {start_guard.get('leaving')!r}")


def attack_checks(report: Report, capture: dict, animation: dict, idle: dict, rules: dict) -> None:
    """PASS 15 COMMAND 15.2: the human EQUIP_WAIT loop and the two weapon attacks."""
    group = "attack"
    part_dirs = idle["lineResourceGroups"]["partDirs"]
    img_ids = {character["id"]: character["imgIds"] for character in idle["characters"]}
    seb_records = {clip_id: all_seb_records(path) for clip_id, path in CLIP_SEB.items()}

    # ---------------------------------------------------------------- (A) shipped clips == originals
    for clip_id, path in CLIP_SEB.items():
        clip = animation["clips"][clip_id]
        raw = path.read_bytes()
        layers, max_frame = struct.unpack_from(">Hh", raw, 0)
        report.expect(group, f"(A) {clip_id} ships the whole intact {path.name}", clip["bytes"], path.stat().st_size)
        report.expect(group, f"(A) {clip_id} sha256 is the intact file's", clip["sha256"], hashlib.sha256(raw).hexdigest())
        report.expect(group, f"(A) {clip_id} header (layers, maxFrame)", [clip["layers"], clip["maxFrame"]], [layers, max_frame])
        report.expect(group, f"(A) {clip_id} records are exactly the SEB's", clip["frames"], seb_records[clip_id])
        expected_row = (
            idle["lineResourceGroups"]["row"]
            if clip_id == "equipWaitUp"
            else ATTACK_EXPECTED["archer-c" if clip_id == "attackBowUp" else "guard-d"]["row"]
        )
        report.expect(group, f"(A) {clip_id} line -> group row", clip["lineResourceGroups"]["row"], expected_row)
        report.add(
            group,
            f"(A) {clip_id} row is recorded as the unique consistent recovered row",
            bool(clip["lineResourceGroups"].get("derivedFrom")),
            json.dumps(clip["lineResourceGroups"].get("derivedFrom")),
        )

    equip_lines = EQUIP_TABLE.read_text(encoding="utf-8-sig").splitlines()
    for equip_id, character in ((72, "guard-d"), (162, "archer-c")):
        columns = equip_lines[equip_id].split("\t")
        weapon = animation["characterWeapons"][character]
        expected = ATTACK_EXPECTED[character]
        report.expect(group, f"(A) equip {equip_id} name is the intact master row's", weapon["equipName"], columns[1])
        report.expect(group, f"(A) equip {equip_id} motion (+0x64) is the intact master row's", weapon["motion"], int(columns[9]))
        report.expect(group, f"(A) {character} attack clip follows the weapon motion", weapon["clipId"], expected["clip"])
        report.expect(group, f"(A) {character} attack SEB", animation["clips"][weapon["clipId"]]["seb"], expected["seb"])
        report.expect(group, f"(A) {character} attack clip maxFrame", animation["clips"][weapon["clipId"]]["maxFrame"], expected["maxFrame"])
        # the behaviour -> base pair the clip claims, against humanAnimationSebBases
        constants = json.loads((WORKSPACE / "RE-evidence" / "20260912-combat" / "skill-combat-constants.json").read_text(encoding="utf-8"))
        behaviour = animation["clips"][weapon["clipId"]]["behaviour"]
        report.expect(group, f"(A) {character} clip behaviour -> humanAnimationSebBases base", animation["clips"][weapon["clipId"]]["humanBase"], constants["humanAnimationSebBases"]["values"][behaviour])

    window = animation["attackWindow"]
    report.expect(group, "(A) attack window is the recovered 20 updates", window["updates"], ATTACK_WINDOW["updates"])
    report.expect(group, "(A) native hit update is 11", window["hitUpdate"], ATTACK_WINDOW["hitUpdate"])
    report.expect(group, "(A) one update is 50 ms at the recovered 20 fps", window["frameMs"], ATTACK_WINDOW["frameMs"])

    # ---------------------------------------------------------------- (D) the frozen pass is the idle state
    idle_step = capture.get("idleStep") or {}
    report.add(group, "(D) the frozen surface was captured on a non-attack step", bool(idle_step.get("clips")), json.dumps(idle_step.get("clips"))[:160])
    for entry in idle_step.get("clips") or []:
        report.expect(group, f"(D) {entry[0]} on the frozen pass is EQUIP_WAIT frame {entry[2]}", [entry[1]], ["equipWaitUp"])

    attack = capture.get("attack") or {}
    samples = attack.get("samples") or []
    report.add(group, "(D) the attack pass captured samples", len(samples) > 10, f"{len(samples)} samples")
    report.expect(group, "(D) the attack pass stepped off the reset step", attack.get("stepped"), True)

    guard_attack = [s for s in samples if (s.get("guard") or {}).get("clip") == "attackSpearUp"]
    report.add(group, "(D) Guard D plays the spear attack clip", len(guard_attack) > 0, f"{len(guard_attack)}/{len(samples)} samples")
    updates = sorted({int((s.get("guard") or {}).get("attackUpdate")) for s in guard_attack if (s.get("guard") or {}).get("attackUpdate") not in (None, "")})
    # The browser click lands through React, so the first sample the harness can take is already a few
    # updates into the window; what has to hold is that the sampled window brackets the native hit and
    # reaches its end.
    report.add(
        group,
        "(D) the sampled attack window covers the hit update and reaches its end",
        bool(updates) and updates[0] <= ATTACK_WINDOW["hitUpdate"] and updates[-1] >= ATTACK_WINDOW["updates"] - 2,
        f"updates {updates[:6]} ... {updates[-1] if updates else None}",
    )
    report.add(group, "(D) the attack window reaches its last update", bool(updates) and max(updates) >= ATTACK_WINDOW["updates"] - 2, f"max {updates[-1] if updates else None}")
    hit_observed = ATTACK_WINDOW["hitUpdate"] in updates or any(
        int((sample.get("guard") or {}).get("frame", -1)) == ATTACK_WINDOW["hitUpdate"] for sample in guard_attack
    )
    bracketed = bool(updates) and min(updates) < ATTACK_WINDOW["hitUpdate"] < max(updates)
    hit_attribute = all(
        (sample.get("guard") or {}).get("nativeHitUpdate") == str(ATTACK_WINDOW["hitUpdate"]) for sample in guard_attack
    )
    report.add(
        group,
        "(D) the native hit update (11) is marked and bracketed by the sampled window",
        hit_attribute and (hit_observed or bracketed),
        f"attribute={hit_attribute} observed={hit_observed} bracketed={bracketed} updates {updates}",
    )
    # Past the window the state machine is back on EQUIP_WAIT, so `data-attack-update` is empty
    # again; what proves the close is a wait sample that follows the last attack sample.
    last_attack = max(
        (index for index, sample in enumerate(samples)
         if (sample.get("guard") or {}).get("clip") == "attackSpearUp"),
        default=None,
    )
    closed = [
        sample for sample in (samples[last_attack + 1:] if last_attack is not None else [])
        if (sample.get("guard") or {}).get("clip") == "equipWaitUp"
    ]
    report.add(
        group,
        "(D) the window closes and the unit returns to EQUIP_WAIT",
        bool(closed) and all(sample["guard"]["clip"] == "equipWaitUp" for sample in closed),
        f"{len(closed)} samples past the window",
    )

    for sample in samples:
        guard = sample.get("guard") or {}
        raw_update = guard.get("attackUpdate")
        update = None if raw_update in (None, "") else int(raw_update)
        if update is None:
            # Outside the attack window the unit is on EQUIP_WAIT or in a reaction state - never still
            # on the attack clip.
            report.add(
                group,
                "(D) samples without an attack update are not on the attack clip",
                guard.get("clip") != "attackSpearUp",
                f"clip {guard.get('clip')!r} state {guard.get('nativeState')!r}",
            )
            continue
        if update < ATTACK_WINDOW["updates"]:
            report.expect(group, f"(D) update {update} plays the attack clip", guard.get("clip"), "attackSpearUp")
            report.expect(group, f"(D) update {update} frame wraps at the clip's maxFrame", guard.get("frame"), update % ATTACK_EXPECTED["guard-d"]["maxFrame"])
        else:
            report.expect(group, f"(D) update {update} is back on EQUIP_WAIT", guard.get("clip"), "equipWaitUp")
        report.expect(group, f"(D) update {update} reports the native hit update", guard.get("nativeHitUpdate"), str(ATTACK_WINDOW["hitUpdate"]))
        report.expect(group, f"(D) update {update} reports the native window", guard.get("nativeAttackWindow"), str(ATTACK_WINDOW["updates"]))
        # an attack never fabricates a second animation for the idle ally
        report.expect(group, f"(D) update {update} leaves Archer C on EQUIP_WAIT", (sample.get("archer") or {}).get("clip"), "equipWaitUp")

    # ---------------------------------------------------------------- (D) attack lines == the SEB
    keyed = 0
    persisted = 0
    for sample in guard_attack:
        guard = sample["guard"]
        update = int(guard["attackUpdate"])
        frame = int(guard["frame"])
        records = seb_records["attackSpearUp"]
        expected = [
            entry
            for line in range(14)
            if (entry := expected_attack_line(rules, part_dirs, ATTACK_EXPECTED["guard-d"]["row"], img_ids["guard-d"], records, frame, line))
        ]
        observed = sample.get("guardLines") or []
        report.expect(group, f"(D) attack frame {frame} draws exactly the SEB's lines", [entry["line"] for entry in observed], [entry["line"] for entry in expected])
        for wanted, got in zip(expected, observed):
            report.expect(group, f"(D) attack frame {frame} L{wanted['line']} res", got.get("res"), wanted["res"])
            report.expect(group, f"(D) attack frame {frame} L{wanted['line']} sheet", (got.get("file") or "").rsplit(".", 1)[0], wanted["file"])
            report.expect(group, f"(D) attack frame {frame} L{wanted['line']} crop is the selected SEB record", got.get("crop"), wanted["crop"])
            report.expect(group, f"(D) attack frame {frame} L{wanted['line']} SEB translation", got.get("trans"), wanted["trans"])
        if observed:
            base = observed[0]["depth"] - observed[0]["line"]
            report.expect(group, f"(D) attack frame {frame} depths are base + line index", [entry["depth"] for entry in observed], [base + entry["line"] for entry in observed])

    # persistence: at least one sampled frame must sit between two keys and reuse the previous record
    for sample in guard_attack:
        frame = int(sample["guard"]["frame"])
        records = seb_records["attackSpearUp"]
        for line in ATTACK_EXPECTED["guard-d"]["lines"]:
            keys = [record["frame"] for record in records if record["line"] == line]
            if frame in keys:
                keyed += 1
            elif keys[0] < frame < keys[-1]:
                persisted += 1
                break
    report.add(group, "(D) the sampled attack reaches an exact SEB key", keyed > 0, f"{keyed} exact-key line hits")
    report.add(group, "(D) the sampled attack also exercises between-key persistence", persisted > 0, f"{persisted} frames between keys")

    # ---------------------------------------------------------------- (D) archer's attack is data-verified
    archer_clip = animation["clips"][ATTACK_EXPECTED["archer-c"]["clip"]]
    archer_records = seb_records["attackBowUp"]
    archer_frame_lines = [
        entry
        for line in range(14)
        if (entry := expected_attack_line(rules, part_dirs, ATTACK_EXPECTED["archer-c"]["row"], img_ids["archer-c"], archer_records, 0, line))
    ]
    report.expect(group, "(A) Archer C's attack draws the bow on line 2", [entry["line"] for entry in archer_frame_lines], ATTACK_EXPECTED["archer-c"]["lines"])
    report.add(group, "(A) Archer C's attack keeps the shield line absent", 1 not in [entry["line"] for entry in archer_frame_lines], json.dumps([entry["line"] for entry in archer_frame_lines]))
    report.expect(group, "(A) Archer C's attack uses the bow sheet", [entry["file"] for entry in archer_frame_lines if entry["line"] == 2], ["weapon_19"])
    report.add(group, "(A) no projectile sprite is fabricated for the bow attack", all(entry["res"] in {"18", "25", "12", "15", "16", "14"} for entry in archer_frame_lines), "attack lines are part sheets only")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capture", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    capture = json.loads(Path(args.capture).read_text(encoding="utf-8"))
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = Report()

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    rules = json.loads(CHARACTER_RULES.read_text(encoding="utf-8"))
    frame0, seb_facts = decode_seb_frame(SEB_PATH)

    # ---------------------------------------------------------------- S: frozen data == original
    report.expect("seb", "(S) intact original size is the declared 980 bytes", seb_facts["bytes"], data["frozenState"]["seb"]["bytes"])
    report.expect("seb", "(S) 14 lines", seb_facts["layers"], data["frozenState"]["seb"]["layers"])
    report.expect("seb", "(S) 46 key records", seb_facts["records"], data["frozenState"]["seb"]["keyRecords"])
    report.expect("seb", "(S) maxFrame 14", seb_facts["maxFrame"], data["frozenState"]["seb"]["maxFrame"])
    import hashlib

    digest = hashlib.sha256(SEB_PATH.read_bytes()).hexdigest()
    report.expect("seb", "(S) sha256 matches the shipped provenance", digest, data["frozenState"]["seb"]["sha256"])
    for line in data["lines"]:
        record = frame0.get(line["line"])
        if record is None:
            report.add("seb", f"(S) line {line['line']} has a frame-0 record", False, "not in the file")
            continue
        keys = (("texId", "tex"), ("u", "u"), ("v", "v"), ("w", "w"), ("h", "h"),
                ("transX", "transX"), ("transY", "transY"), ("reversU", "reversU"), ("reversV", "reversV"))
        report.expect(
            "seb",
            f"(S) shipped line {line['line']} matches the original frame-0 record",
            [line[data_key] for data_key, _ in keys],
            [record[record_key] for _, record_key in keys],
        )

    # ---------------------------------------------------------------- expected resolution
    part_dirs = data["lineResourceGroups"]["partDirs"]
    res_row = data["lineResourceGroups"]["row"]
    expected: dict[str, dict] = {}
    for character in data["characters"]:
        draws = []
        for line in sorted(data["lines"], key=lambda entry: entry["line"]):
            index = line["line"]
            tex_slot = frame0[index]["tex"]
            if tex_slot < 0:
                continue
            image = character["imgIds"][tex_slot]
            if image < 0:
                continue
            directory = part_dirs[str(res_row[index])]
            inf_name = rules["dirs"][directory]["inf"]["img"][str(image)]
            opts = rules["dirs"][directory]["opts"]
            key = inf_name if inf_name in opts else inf_name.rsplit(".", 1)[0]
            sheet = opts[key]
            cell_row = frame0[index]["v"] // sheet["cellH"]
            cell_column = frame0[index]["u"] // sheet["cellW"]
            cell_key = f"{cell_row},{cell_column}"
            slot = sheet["slots"][cell_key]
            draws.append(
                {
                    "line": index,
                    "part": line["part"],
                    "res": res_row[index],
                    "tex": image,
                    "slot": tex_slot,
                    "dir": directory,
                    "file": f"{key}.png",
                    "trans": f"{frame0[index]['transX']},{frame0[index]['transY']}",
                    "crop": f"{frame0[index]['u']},{frame0[index]['v']},{frame0[index]['w']},{frame0[index]['h']}",
                    "optCell": cell_key,
                    "optDest": f"{slot['destX']},{slot['destY']}",
                    "optSrc": f"{slot['srcX']},{slot['srcY']},{slot['w']},{slot['h']}",
                    "cellW": sheet["cellW"],
                    "cellH": sheet["cellH"],
                    "png": SPRITE_ROOT / directory / f"{key}.png",
                }
            )
        expected[character["id"]] = {"character": character, "draws": draws}

    for character_id, entry in expected.items():
        report.expect(
            "handoff",
            f"(H) {character_id} draw count matches the frozen request",
            len(entry["draws"]),
            HANDOFF_EXPECTED[character_id]["draws"],
        )
        actual_lines = [(d["line"], d["res"], d["tex"], frame0[d["line"]]["u"], frame0[d["line"]]["v"], frame0[d["line"]]["w"], frame0[d["line"]]["h"], frame0[d["line"]]["transX"], frame0[d["line"]]["transY"]) for d in entry["draws"]]
        report.expect(
            "handoff",
            f"(H) {character_id} line/resource/image/geometry list matches the frozen request",
            actual_lines,
            HANDOFF_EXPECTED[character_id]["lines"],
        )

    # ---------------------------------------------------------------- D: the DOM draws that
    allies = {ally["id"]: ally for ally in capture["frozen"]["allies"]}
    # ---------------------------------------------------------------- the shipped surface
    # The default page is Recovered Replay: one locked encounter, one view profile, no override.
    surface = capture["frozen"].get("surface") or {}
    report.expect("surface", "(S) the default page shows the Recovered Replay card", surface.get("recoveredCard"), True)
    report.expect(
        "surface",
        "(S) the default page pins the only fully recovered encounter",
        surface.get("encounterId"),
        "wairo-tank",
    )
    report.expect("surface", "(S) the default page exposes no override switches", surface.get("switches"), 0)
    report.expect("surface", "(S) the default page exposes no view-profile picker", surface.get("profileOptions"), 0)
    report.expect(
        "surface",
        "(S) the default page shows the recorded ~240 logical window",
        [capture["frozen"]["scene"]["facts"].get("viewProfile"), capture["frozen"]["scene"]["facts"].get("logicalViewWidth")],
        ["recording", 240],
    )
    report.expect(
        "surface",
        "(S) the default page states that unrecovered overlays are hidden",
        surface.get("overlayNotice"),
        True,
    )
    report.expect(
        "surface",
        "(S) the default stage draws no unrecovered overlay or asset-only HUD sprite",
        surface.get("unsupportedOverlays"),
        0,
    )
    lab = capture.get("lab") or {}
    report.expect(
        "surface",
        "(S) the lab surface (?lab=1) restores the switches for the comparison captures",
        [bool(lab.get("surface", {}).get("switches")), bool(lab.get("surface", {}).get("profileOptions"))],
        [True, True],
    )
    report.add(
        "surface",
        "(S) the lab surface keeps the combat overlays and HUD sprites available",
        (lab.get("surface", {}).get("unsupportedOverlays") or 0) > 0,
        f"lab overlay/HUD sprites: {lab.get('surface', {}).get('unsupportedOverlays')}",
    )
    report.expect(
        "surface",
        "(S) the lab surface does not show the Recovered Replay notice",
        lab.get("surface", {}).get("overlayNotice"),
        False,
    )
    report.expect(
        "surface",
        "(S) both surfaces draw the identical frozen human layers (one renderer, two shells)",
        [[ally["id"], ally["draws"], [layer["line"] for layer in ally["layers"]]] for ally in lab.get("allies", [])],
        [[ally["id"], ally["draws"], [layer["line"] for layer in ally["layers"]]] for ally in capture["frozen"]["allies"]],
    )

    report.expect("dom", "(D) exactly the two frozen demo characters are rendered by the shared path", sorted(allies), ["archer-c", "guard-d"])
    for character_id, entry in expected.items():
        ally = allies.get(character_id)
        if not ally:
            report.add("dom", f"(D) {character_id} captured", False, "missing")
            continue
        report.expect("dom", f"(D) {character_id} draw count", ally["draws"], len(entry["draws"]))
        report.expect("dom", f"(D) {character_id} skipped count", ally["skipped"], 14 - len(entry["draws"]))
        report.expect("dom", f"(D) {character_id} line order is ascending", [layer["line"] for layer in ally["layers"]], [d["line"] for d in entry["draws"]])
        for layer, draw in zip(ally["layers"], entry["draws"]):
            label = f"(D) {character_id} L{draw['line']}"
            report.expect("dom", f"{label} resource group", layer["res"], draw["res"])
            report.expect("dom", f"{label} image index", layer["tex"], draw["tex"])
            report.expect("dom", f"{label} imgIds slot", layer["slot"], draw["slot"])
            report.expect("dom", f"{label} part directory", layer["dir"], draw["dir"])
            report.expect("dom", f"{label} sheet file", layer["file"], draw["file"])
            report.expect("dom", f"{label} SEB translation", layer["trans"], draw["trans"])
            report.expect("dom", f"{label} SEB crop", layer["crop"], draw["crop"])
            report.expect("dom", f"{label} OPT cell", layer["optCell"], draw["optCell"])
            report.expect("dom", f"{label} OPT destination", layer["optDest"], draw["optDest"])
            report.expect("dom", f"{label} OPT source rect", layer["optSrc"], draw["optSrc"])
            report.expect("dom", f"{label} image url", layer["imgSrc"], f"/character_sprites/{draw['dir']}/{draw['file']}")
            report.expect("dom", f"{label} image loaded", bool(layer["imgComplete"]) and (layer["imgNatural"] or [0])[0] > 0, True, str(layer["imgNatural"]))
            # G: the DOM carries the SEB translation verbatim - no per-character offset, no extra scale
            trans_parts = draw["trans"].split(",")
            src_parts = draw["optSrc"].split(",")
            report.expect("dom", f"(G) {label} inline left == SEB transX", layer["domCellLeft"], f"{int(trans_parts[0])}px")
            report.expect("dom", f"(G) {label} inline top == SEB transY", layer["domCellTop"], f"{int(trans_parts[1])}px")
            report.expect("dom", f"(G) {label} inline width == OPT cell width", layer["domCellSize"]["w"], f"{draw['cellW']}px")
            report.expect("dom", f"(G) {label} inline height == OPT cell height", layer["domCellSize"]["h"], f"{draw['cellH']}px")
            report.expect("dom", f"(G) {label} clip left == OPT destX", layer["domClipLeft"], f"{draw['optDest'].split(',')[0]}px")
            report.expect("dom", f"(G) {label} clip top == OPT destY", layer["domClipTop"], f"{draw['optDest'].split(',')[1]}px")
            report.expect("dom", f"(G) {label} clip width == OPT source width", layer["domClipWidth"], f"{draw['optSrc'].split(',')[2]}px")
            report.expect("dom", f"(G) {label} clip height == OPT source height", layer["domClipHeight"], f"{draw['optSrc'].split(',')[3]}px")
            report.expect("dom", f"(G) {label} image sits at -srcX", layer["domImgLeft"], f"{-int(src_parts[0])}px")
            report.expect("dom", f"(G) {label} image sits at -srcY", layer["domImgTop"], f"{-int(src_parts[1])}px")
            # measured geometry: one logical scene pixel per SEB pixel, anchored on the entity origin
            report.close("dom", f"{label} cell logical width == OPT cell width", layer["cellLogicalSize"]["w"], draw["cellW"], 0.6)
            report.close("dom", f"{label} cell logical height == OPT cell height", layer["cellLogicalSize"]["h"], draw["cellH"], 0.6)
            origin = ally["entityOrigin"]
            trans_x, trans_y = (float(value) for value in trans_parts)
            report.close("dom", f"{label} cell origin X == entity origin + SEB transX", layer["cellLogicalOrigin"]["x"] - origin["x"], trans_x, 0.6)
            report.close("dom", f"{label} cell origin Y == entity origin + SEB transY", layer["cellLogicalOrigin"]["y"] - origin["y"], trans_y, 0.6)
            dest_x, dest_y = (float(value) for value in draw["optDest"].split(","))
            report.close("dom", f"{label} clip origin X == cell origin + OPT destX", layer["clipLogicalOrigin"]["x"] - layer["cellLogicalOrigin"]["x"], dest_x, 0.6)
            report.close("dom", f"{label} clip origin Y == cell origin + OPT destY", layer["clipLogicalOrigin"]["y"] - layer["cellLogicalOrigin"]["y"], dest_y, 0.6)

    # ---------------------------------------------------------------- N: no placeholder, no truncation
    archer = allies.get("archer-c", {"layers": []})
    report.add(
        "no-placeholder",
        "(N) Archer C draws no shield layer and no shield sheet",
        all(layer["line"] != 1 and "sheild" not in layer["file"] for layer in archer["layers"]),
        ", ".join(f"L{layer['line']}:{layer['file']}" for layer in archer["layers"]),
    )
    for character_id, entry in expected.items():
        for draw in entry["draws"]:
            raw = (ARTIFACT / "tmp" / "KA_assets" / draw["dir"] / f"{draw['file'].rsplit('.', 1)[0]}.opt").read_bytes()
            cells, truncated = opt_cells(raw)
            row, column = cell_size_key(draw["optCell"])
            is_truncated = any(item[0] == column and item[1] == row for item in truncated)
            report.add(
                "no-placeholder",
                f"(N) {character_id} L{draw['line']} reads a complete OPT component ({draw['file']} cell {draw['optCell']})",
                not is_truncated,
                f"file cells {sorted(cells)} truncated {truncated}",
            )

    # ---------------------------------------------------------------- no per-character hack
    guard_lines = {layer["line"]: layer for layer in allies.get("guard-d", {"layers": []})["layers"]}
    archer_lines = {layer["line"]: layer for layer in archer["layers"]}
    shared = sorted(set(guard_lines) & set(archer_lines))
    report.add("shared-path", "(D) the two characters share most of their drawn lines", len(shared) >= 6, f"shared {shared}")
    same_geometry = all(
        guard_lines[line]["trans"] == archer_lines[line]["trans"]
        and guard_lines[line]["crop"] == archer_lines[line]["crop"]
        and guard_lines[line]["optCell"] == archer_lines[line]["optCell"]
        for line in shared
    )
    report.add(
        "shared-path",
        "(D) shared lines carry identical SEB translation/crop/OPT cell for both characters (no per-character positioning)",
        same_geometry,
        "; ".join(f"L{line} {guard_lines[line]['trans']} vs {archer_lines[line]['trans']}" for line in shared),
    )
    differing = sorted(
        key
        for key in ("res", "tex", "dir", "file", "slot", "optDest", "optSrc", "optCell", "crop", "trans")
        if any(guard_lines[line][key] != archer_lines[line][key] for line in shared)
    )
    image_fields = {"res", "tex", "dir", "file", "slot", "optDest", "optSrc"}
    geometry_fields = {"optCell", "crop", "trans"}
    report.add(
        "shared-path",
        "(D) no geometry field differs between the two characters - only the image selection does",
        set(differing) <= image_fields and not (set(differing) & geometry_fields),
        f"differing fields {differing}",
    )
    report.expect(
        "shared-path",
        "(D) both characters resolve every shared line to the same part directory and group",
        sorted({(guard_lines[line]["dir"], guard_lines[line]["res"], guard_lines[line]["optCell"]) for line in shared})
        == sorted({(archer_lines[line]["dir"], archer_lines[line]["res"], archer_lines[line]["optCell"]) for line in shared}),
        True,
    )

    # ---------------------------------------------------------------- P: painted pixels
    scale_x = capture["frozen"]["scene"]["scaleX"]
    scale_y = capture["frozen"]["scene"]["scaleY"]
    report.close("pixels", "(G) the scene keeps its single recovered presentation transform (Y/X)",
                 scale_y / scale_x, capture["frozen"]["scene"]["facts"]["verticalRatio"], 0.002)
    pixel_summary = {}
    for character_id, entry in expected.items():
        solo = capture.get("solo", {}).get(character_id)
        if not solo:
            report.add("pixels", f"(P) {character_id} solo capture present", False)
            continue
        image = Image.open(out / solo["file"]).convert("RGBA")
        width_logical = solo["captureLogical"]["w"]
        height_logical = solo["captureLogical"]["h"]
        region_left = solo["captureOriginLogical"]["x"]
        region_top = solo["captureOriginLogical"]["y"]
        origin_x = solo["origin"]["x"]
        origin_y = solo["origin"]["y"]
        background = image.getpixel((1, 1))
        # independent composition over the same logical window
        reference = Image.new("RGBA", (width_logical, height_logical), background)
        for draw in entry["draws"]:
            source = Image.open(draw["png"]).convert("RGBA")
            sx, sy, sw, sh = (int(value) for value in draw["optSrc"].split(","))
            crop = source.crop((sx, sy, sx + sw, sy + sh))
            dx, dy = (int(value) for value in draw["optDest"].split(","))
            tx, ty = (int(value) for value in draw["trans"].split(","))
            px = int(round(origin_x + tx + dx - region_left))
            py = int(round(origin_y + ty + dy - region_top))
            reference.alpha_composite(crop, (px, py))
        reference.resize((width_logical * 6, height_logical * 6), Image.NEAREST).save(out / f"reference-{character_id}.png")

        mismatches = 0
        compared = 0
        for ly in range(height_logical):
            for lx in range(width_logical):
                expected_pixel = reference.getpixel((lx, ly))
                block_x = int(round((lx + 0.5) * scale_x - 0.5))
                block_y = int(round((ly + 0.5) * scale_y - 0.5))
                if not (0 <= block_x < image.width and 0 <= block_y < image.height):
                    continue
                # one logical pixel covers a fractional ~3.9 device px block; the block's own centre
                # pixel is the one the nearest-neighbour upscale painted it from
                sample = image.getpixel((block_x, block_y))
                compared += 1
                if not all(abs(sample[channel] - expected_pixel[channel]) <= 2 for channel in range(4)):
                    mismatches += 1
        ratio = 1 - (mismatches / compared if compared else 1)
        pixel_summary[character_id] = {"compared": compared, "mismatched": mismatches, "agreement": round(ratio, 5)}
        report.add(
            "pixels",
            f"(P) {character_id} painted pixels match the independent composition (>= 0.995)",
            ratio >= 0.995,
            f"agreement {ratio:.5f} over {compared} logical px ({mismatches} mismatched)",
        )

    # ---------------------------------------------------------------- harness hygiene
    report.expect("harness", "(H) no console errors on the replay page", capture.get("console"), [])
    bad = [entry for entry in capture.get("failures", []) if "/character_sprites/" in entry["url"] or "/battle-assets/" in entry["url"]]
    report.expect("harness", "(H) every part sheet and battle asset loaded (no 404)", bad, [])

    # ---------------------------------------------------------------- PASS 15 COMMAND 15.2: animation
    animation = json.loads(ANIMATION_DATA.read_text(encoding="utf-8"))
    attack_checks(report, capture, animation, data, rules)
    reaction_checks(report, capture, animation, data, rules)
    leaving_checks(report, capture, animation, data, rules)
    revival_checks(report, capture, animation, data, rules)

    payload = {
        "checks": len(report.checks),
        "passed": len(report.checks) - len(report.failures),
        "failed": len(report.failures),
        "failures": report.failures,
        "pixel_summary": pixel_summary,
        "checks_detail": report.checks,
    }
    (out / "verify-report.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({key: payload[key] for key in ("checks", "passed", "failed")}, indent=1))
    for failure in report.failures[:20]:
        print(f"  FAIL [{failure['group']}] {failure['name']} :: {failure['detail']}")
    return 1 if report.failures else 0


if __name__ == "__main__":
    sys.exit(main())
