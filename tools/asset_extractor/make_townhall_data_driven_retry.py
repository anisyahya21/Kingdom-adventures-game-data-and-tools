#!/usr/bin/env python
"""Render Town Hall using MapChip/Terrain CSVs plus SEB/OPT anchors."""

from __future__ import annotations

import collections
import csv
import json
import struct
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from analyze_renderer_reference_files import parse_opt, parse_seb


ROOT = Path(__file__).resolve().parents[2]
DESKTOP_ASSETS = Path("c:/Users/anisb/OneDrive/Desktop/KA_assets")
PROJECT_ASSETS = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"
MAP_PATH = PROJECT_ASSETS / "map" / "map_160_160.map"
MAPCHIP_CSV = ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - MapChip.csv"
TERRAIN_CSV = ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - Terrain.csv"
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"

STACK_OUT = OUT_DIR / "townhall_retry_stack_same_anchor_v3.png"
STACK_LABEL_OUT = OUT_DIR / "townhall_retry_stack_same_anchor_v3_labeled.png"
PATCH_OUT = OUT_DIR / "townhall_retry_world_patch_v3.png"
PATCH_LABEL_OUT = OUT_DIR / "townhall_retry_world_patch_v3_labeled.png"
REPORT_OUT = OUT_DIR / "townhall_retry_data_driven_v3_report.json"
BEST_OUT = OUT_DIR / "townhall_current_best_data_driven_v4.png"
BEST_LABEL_OUT = OUT_DIR / "townhall_current_best_data_driven_v4_labeled.png"
HIDDEN_FLAG_OUT = OUT_DIR / "townhall_flag_behind_comparison_v4.png"
HIDDEN_FLAG_LABEL_OUT = OUT_DIR / "townhall_flag_behind_comparison_v4_labeled.png"

RES_FOLDERS = {
    9: "chip",
    20: "nature",
    23: "building",
}

TOWNHALL_CHIPS = {58, 59, 60, 61}
STACK_CHIPS = [61, 58, 59, 60]
BEST_STACK_CHIPS = [61, 58, 59, 60]
HIDDEN_FLAG_STACK_CHIPS = [61, 60, 58, 59]
FLAG_STATIC_SLOT = 2


@dataclass(frozen=True)
class Cell:
    f0: int
    f1: int
    f2: int
    f3: int
    f4: int
    f5: int


@dataclass(frozen=True)
class RenderAsset:
    source: str
    folder: str
    filename: str
    image: Image.Image
    offset_x: int
    offset_y: int
    cell_w: int
    cell_h: int
    block: int
    frame: int
    seb_file: str | None


def load_font(size: int = 11) -> ImageFont.ImageFont:
    for path in [Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/arial.ttf")]:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def read_index(folder: str, name: str) -> dict[int, str]:
    path = DESKTOP_ASSETS / folder / name
    result = {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        result[int(parts[0])] = parts[1].split(",", 1)[0]
    return result


def load_mapchips() -> dict[int, dict[str, str]]:
    with MAPCHIP_CSV.open(newline="", encoding="utf-8-sig") as handle:
        return {int(row["id"]): row for row in csv.DictReader(handle)}


def load_terrain_rows() -> dict[int, dict[str, int]]:
    rows = {}
    with TERRAIN_CSV.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.reader(handle)
        header = next(reader)
        index = {name: header.index(name) for name in ("res", "img", "seb", "frame")}
        for row in reader:
            rows[int(row[0])] = {
                "res": int(row[index["res"]]),
                "img": int(row[index["img"]]),
                "seb": int(row[index["seb"]]),
                "frame": int(row[index["frame"]]),
            }
    return rows


def parse_map() -> tuple[int, int, list[list[Cell]]]:
    data = MAP_PATH.read_bytes()
    width, height = struct.unpack_from(">II", data, 0)
    offset = 8
    rows = []
    for y in range(height):
        row = []
        for _ in range(width):
            row.append(Cell(*struct.unpack_from(">6I", data, offset)))
            offset += 24
        sentinel = struct.unpack_from(">I", data, offset)[0]
        offset += 4
        if sentinel != width:
            raise ValueError(f"bad section A sentinel at row {y}: {sentinel}")
        rows.append(row)
    return width, height, rows


def asset_file(folder: str, filename: str) -> Path:
    for root in (DESKTOP_ASSETS, PROJECT_ASSETS):
        path = root / folder / filename
        if path.exists():
            return path
    raise FileNotFoundError(f"missing {folder}/{filename}")


def render_opt_image(folder: str, filename: str, frame: int = 0, force_single_slot: bool = False) -> Image.Image:
    source = Image.open(asset_file(folder, filename)).convert("RGBA")
    opt_path = asset_file(folder, f"{Path(filename).stem}.opt") if (DESKTOP_ASSETS / folder / f"{Path(filename).stem}.opt").exists() or (PROJECT_ASSETS / folder / f"{Path(filename).stem}.opt").exists() else None
    if opt_path is None:
        return source

    opt = parse_opt(opt_path)
    canvas = Image.new("RGBA", (opt["cellW"], opt["cellH"]), (0, 0, 0, 0))
    slots = [slot for slot in opt["slots"] if not slot.get("empty") and not slot.get("truncated")]
    if not slots:
        return canvas

    selected_slots = slots
    if force_single_slot or filename.startswith("flag_"):
        selected_slots = [slots[frame % len(slots)]]

    for slot in selected_slots:
        crop = source.crop((slot["srcX"], slot["srcY"], slot["srcX"] + slot["width"], slot["srcY"] + slot["height"]))
        canvas.alpha_composite(crop, (slot["destX"], slot["destY"]))
    return canvas


def resolve_visual(
    row: dict[str, str] | dict[str, int],
    source: str,
    indexes: dict[str, dict[int, str]],
    flag_slot_override: int | None = None,
) -> RenderAsset | None:
    res = int(row["res"])
    folder = RES_FOLDERS.get(res)
    if folder is None:
        return None
    img_id = int(row["img"])
    seb_id = int(row["seb"])
    frame = int(row.get("frame", 0))
    rotation = int(row.get("rotation", 0)) if "rotation" in row else 0

    filename = indexes[f"{folder}:img"].get(img_id)
    seb_file = indexes[f"{folder}:seb"].get(seb_id)
    if not filename or not seb_file:
        return None
    seb = parse_seb(asset_file(folder, seb_file))
    block_index = rotation if rotation < seb["blockCount"] else 0
    block = seb["blocks"][block_index]
    record_index = frame if frame < len(block["records"]) else 0
    record = block["records"][record_index]

    force_single = filename.startswith("flag_")
    render_frame = flag_slot_override if force_single and flag_slot_override is not None else record_index
    image = render_opt_image(folder, filename, render_frame, force_single_slot=force_single)
    return RenderAsset(
        source=source,
        folder=folder,
        filename=filename,
        image=image,
        offset_x=record["offsetX"],
        offset_y=record["offsetY"],
        cell_w=record["cellW"],
        cell_h=record["cellH"],
        block=block_index,
        frame=render_frame,
        seb_file=seb_file,
    )


def iso_xy(x: int, y: int) -> tuple[int, int]:
    return (x - y) * 24, (x + y) * 12


def normalize_and_save(drawables: list[dict[str, object]], out: Path, labeled: bool = False) -> None:
    min_x = min(item["x"] for item in drawables)
    min_y = min(item["y"] for item in drawables)
    max_x = max(item["x"] + item["image"].width for item in drawables)
    max_y = max(item["y"] + item["image"].height for item in drawables)
    margin = 36
    image = Image.new("RGBA", (max_x - min_x + margin * 2, max_y - min_y + margin * 2), (24, 29, 34, 255))
    draw = ImageDraw.Draw(image)
    font = load_font(10)

    for item in sorted(drawables, key=lambda value: (value["z"], value["sort_y"], value["sort_x"])):
        px = item["x"] - min_x + margin
        py = item["y"] - min_y + margin
        image.alpha_composite(item["image"], (px, py))
        if labeled:
            label = str(item["label"])
            draw.rectangle((px, py, px + item["image"].width, py + item["image"].height), outline=(143, 184, 255, 150))
            draw.text((px + 2, py + 2), label, fill=(244, 247, 250, 255), font=font)
    image.save(out, "PNG")


def build_indexes() -> dict[str, dict[int, str]]:
    result = {}
    for folder in ("chip", "building", "nature"):
        result[f"{folder}:img"] = read_index(folder, "img.inf")
        result[f"{folder}:seb"] = read_index(folder, "seb.inf")
    return result


def render_stack(mapchips: dict[int, dict[str, str]], indexes: dict[str, dict[int, str]]) -> list[dict[str, object]]:
    drawables = []
    for order, chip_id in enumerate(STACK_CHIPS):
        asset = resolve_visual(mapchips[chip_id], f"MapChip {chip_id}", indexes)
        if asset is None:
            continue
        drawables.append(
            {
                "x": asset.offset_x,
                "y": asset.offset_y,
                "z": order,
                "sort_x": 0,
                "sort_y": 0,
                "image": asset.image,
                "label": f"{chip_id} {asset.filename} {asset.seb_file}",
            }
        )
    return drawables


def render_ordered_stack(
    mapchips: dict[int, dict[str, str]],
    indexes: dict[str, dict[int, str]],
    chip_order: list[int],
) -> list[dict[str, object]]:
    drawables = []
    for order, chip_id in enumerate(chip_order):
        asset = resolve_visual(mapchips[chip_id], f"MapChip {chip_id}", indexes, flag_slot_override=FLAG_STATIC_SLOT)
        if asset is None:
            continue
        drawables.append(
            {
                "x": asset.offset_x,
                "y": asset.offset_y,
                "z": order,
                "sort_x": 0,
                "sort_y": 0,
                "image": asset.image,
                "label": f"{chip_id} {asset.filename} {asset.seb_file} frame {asset.frame}",
            }
        )
    return drawables


def connected_components(cells: list[list[Cell]]) -> list[dict[str, object]]:
    height = len(cells)
    width = len(cells[0])
    seen = set()
    components = []
    for y in range(height):
        for x in range(width):
            if (x, y) in seen or cells[y][x].f2 not in TOWNHALL_CHIPS:
                continue
            queue = collections.deque([(x, y)])
            seen.add((x, y))
            points = []
            while queue:
                cx, cy = queue.popleft()
                points.append((cx, cy, cells[cy][cx].f2))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in seen:
                        continue
                    if cells[ny][nx].f2 in TOWNHALL_CHIPS:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            chip_counts = collections.Counter(point[2] for point in points)
            min_x = min(point[0] for point in points)
            max_x = max(point[0] for point in points)
            min_y = min(point[1] for point in points)
            max_y = max(point[1] for point in points)
            components.append(
                {
                    "points": points,
                    "chipCounts": dict(chip_counts),
                    "bbox": [min_x, min_y, max_x, max_y],
                    "score": len(points) * 10 + len(chip_counts) * 100,
                }
            )
    return sorted(components, key=lambda item: item["score"], reverse=True)


def render_world_patch(
    mapchips: dict[int, dict[str, str]],
    terrain_rows: dict[int, dict[str, int]],
    indexes: dict[str, dict[int, str]],
    cells: list[list[Cell]],
    component: dict[str, object],
) -> tuple[list[dict[str, object]], dict[str, object]]:
    min_x, min_y, max_x, max_y = component["bbox"]
    pad = 4
    min_x = max(0, min_x - pad)
    min_y = max(0, min_y - pad)
    max_x = min(len(cells[0]) - 1, max_x + pad)
    max_y = min(len(cells) - 1, max_y + pad)

    drawables = []
    skipped = collections.Counter()
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            cell = cells[y][x]
            sx, sy = iso_xy(x, y)

            terrain_row = terrain_rows.get(cell.f5)
            if terrain_row is not None:
                asset = resolve_visual(terrain_row, f"Terrain {cell.f5}", indexes)
                if asset is not None:
                    drawables.append(
                        {
                            "x": sx + asset.offset_x,
                            "y": sy + asset.offset_y,
                            "z": 0,
                            "sort_x": x,
                            "sort_y": x + y,
                            "image": asset.image,
                            "label": f"F5 {cell.f5} {asset.filename}",
                        }
                    )
                else:
                    skipped[("terrain", cell.f5)] += 1

            chip_row = mapchips.get(cell.f2)
            if chip_row is not None:
                asset = resolve_visual(chip_row, f"MapChip {cell.f2}", indexes)
                if asset is not None:
                    layer = int(chip_row.get("layer", 0))
                    drawables.append(
                        {
                            "x": sx + asset.offset_x,
                            "y": sy + asset.offset_y,
                            "z": 100 + layer,
                            "sort_x": x,
                            "sort_y": x + y,
                            "image": asset.image,
                            "label": f"F2 {cell.f2} {chip_row.get('name')} {asset.filename}",
                        }
                    )
                else:
                    skipped[("mapchip", cell.f2)] += 1

    info = {
        "bboxWithPad": [min_x, min_y, max_x, max_y],
        "skipped": {f"{kind}:{key}": count for (kind, key), count in skipped.items()},
    }
    return drawables, info


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    indexes = build_indexes()
    mapchips = load_mapchips()
    terrain_rows = load_terrain_rows()
    _, _, cells = parse_map()

    stack_drawables = render_stack(mapchips, indexes)
    normalize_and_save(stack_drawables, STACK_OUT)
    normalize_and_save(stack_drawables, STACK_LABEL_OUT, labeled=True)

    best_drawables = render_ordered_stack(mapchips, indexes, BEST_STACK_CHIPS)
    normalize_and_save(best_drawables, BEST_OUT)
    normalize_and_save(best_drawables, BEST_LABEL_OUT, labeled=True)

    hidden_flag_drawables = render_ordered_stack(mapchips, indexes, HIDDEN_FLAG_STACK_CHIPS)
    normalize_and_save(hidden_flag_drawables, HIDDEN_FLAG_OUT)
    normalize_and_save(hidden_flag_drawables, HIDDEN_FLAG_LABEL_OUT, labeled=True)

    components = connected_components(cells)
    best = components[0]
    patch_drawables, patch_info = render_world_patch(mapchips, terrain_rows, indexes, cells, best)
    normalize_and_save(patch_drawables, PATCH_OUT)
    normalize_and_save(patch_drawables, PATCH_LABEL_OUT, labeled=True)

    report = {
        "stackChips": STACK_CHIPS,
        "stackOut": str(STACK_OUT),
        "stackLabelOut": str(STACK_LABEL_OUT),
        "patchOut": str(PATCH_OUT),
        "patchLabelOut": str(PATCH_LABEL_OUT),
        "bestStackChips": BEST_STACK_CHIPS,
        "bestOut": str(BEST_OUT),
        "bestLabelOut": str(BEST_LABEL_OUT),
        "hiddenFlagStackChips": HIDDEN_FLAG_STACK_CHIPS,
        "hiddenFlagOut": str(HIDDEN_FLAG_OUT),
        "hiddenFlagLabelOut": str(HIDDEN_FLAG_LABEL_OUT),
        "flagStaticSlot": FLAG_STATIC_SLOT,
        "selectedComponent": {
            "bbox": best["bbox"],
            "chipCounts": best["chipCounts"],
            "pointCount": len(best["points"]),
            "samplePoints": best["points"][:40],
        },
        "patchInfo": patch_info,
        "topComponents": [
            {"bbox": item["bbox"], "chipCounts": item["chipCounts"], "pointCount": len(item["points"]), "score": item["score"]}
            for item in components[:12]
        ],
    }
    REPORT_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"wrote {STACK_OUT}")
    print(f"wrote {STACK_LABEL_OUT}")
    print(f"wrote {BEST_OUT}")
    print(f"wrote {BEST_LABEL_OUT}")
    print(f"wrote {HIDDEN_FLAG_OUT}")
    print(f"wrote {HIDDEN_FLAG_LABEL_OUT}")
    print(f"wrote {PATCH_OUT}")
    print(f"wrote {PATCH_LABEL_OUT}")
    print(f"wrote {REPORT_OUT}")
    print(f"selected component bbox={best['bbox']} chipCounts={best['chipCounts']} points={len(best['points'])}")
    print(f"patch skipped={patch_info['skipped']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())