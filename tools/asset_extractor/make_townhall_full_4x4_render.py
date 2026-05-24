#!/usr/bin/env python
"""Render the current best full 4x4 Town Hall footprint with evidence labels."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from analyze_renderer_reference_files import parse_opt


ROOT = Path(__file__).resolve().parents[2]
PROJECT_ASSETS = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"
DESKTOP_ASSETS = Path("c:/Users/anisb/OneDrive/Desktop/KA_assets")
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"
LAYOUT = OUT_DIR / "townhall_user_approx_layout_2026-05-15_v2.json"
MAPCHIP_CSV = ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - MapChip.csv"
FACILITY_CSV = ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - Facility_lookup.csv"

OUT = OUT_DIR / "townhall_full_4x4_current_best_v5.png"
LABELED_OUT = OUT_DIR / "townhall_full_4x4_current_best_v5_labeled.png"
REPORT_OUT = OUT_DIR / "townhall_full_4x4_current_best_v5_report.json"

MAPCHIP_IDS = [58, 59, 60, 61, 252, 253]
FACILITY_IDS = [17, 187, 188]


def load_font(size: int = 11) -> ImageFont.ImageFont:
    for path in [Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/arial.ttf")]:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def load_rows(path: Path, ids: list[int], id_column: str = "id") -> dict[int, dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        result = {}
        for row in csv.DictReader(handle):
            row_id = int(row[id_column])
            if row_id in ids:
                result[row_id] = row
        return result


def asset_path(folder: str, filename: str) -> Path:
    for root in (DESKTOP_ASSETS, PROJECT_ASSETS):
        path = root / folder / filename
        if path.exists():
            return path
    raise FileNotFoundError(f"missing {folder}/{filename}")


def opt_path(folder: str, filename: str) -> Path | None:
    stem = Path(filename).stem
    for root in (DESKTOP_ASSETS, PROJECT_ASSETS):
        path = root / folder / f"{stem}.opt"
        if path.exists():
            return path
    return None


def render_opt(folder: str, filename: str, only_slot: int | None = None) -> Image.Image:
    source = Image.open(asset_path(folder, filename)).convert("RGBA")
    path = opt_path(folder, filename)
    if path is None:
        return source

    opt = parse_opt(path)
    canvas = Image.new("RGBA", (opt["cellW"], opt["cellH"]), (0, 0, 0, 0))
    slots = [slot for slot in opt["slots"] if not slot.get("empty") and not slot.get("truncated")]
    if only_slot is not None:
        slots = slots[only_slot : only_slot + 1]
    for slot in slots:
        crop = source.crop((slot["srcX"], slot["srcY"], slot["srcX"] + slot["width"], slot["srcY"] + slot["height"]))
        canvas.alpha_composite(crop, (slot["destX"], slot["destY"]))
    return canvas


def render_fence_component(layer_id: str) -> tuple[Image.Image, dict[str, object]]:
    source = Image.open(asset_path("wall", "fence_05.png")).convert("RGBA")
    opt = parse_opt(asset_path("wall", "fence_05.opt"))
    slots = [slot for slot in opt["slots"] if not slot.get("empty") and not slot.get("truncated")]
    if "pillar" in layer_id:
        slot_index = 0
        kind = "pillar"
    elif "corner" in layer_id:
        slot_index = 2
        kind = "corner_base"
    else:
        slot_index = 1
        kind = "canopy"
    slot = slots[slot_index]
    canvas = Image.new("RGBA", (opt["cellW"], opt["cellH"]), (0, 0, 0, 0))
    crop = source.crop((slot["srcX"], slot["srcY"], slot["srcX"] + slot["width"], slot["srcY"] + slot["height"]))
    canvas.alpha_composite(crop, (slot["destX"], slot["destY"]))
    return canvas, {"source": "wall/fence_05.png", "kind": kind, "slot": slot}


def layer_evidence(layer: dict[str, object]) -> dict[str, object]:
    layer_id = str(layer["id"])
    filename = str(layer["file"])
    if filename == "town_hall_base_00.png":
        return {"mapChipIds": [58], "role": "Town Hall base", "confidence": "confirmed"}
    if filename == "town_hall_tower_00.png":
        return {"mapChipIds": [59], "role": "Town Hall tower", "confidence": "confirmed"}
    if filename == "flag_00.png":
        return {"mapChipIds": [60], "role": "Town Hall flag", "confidence": "confirmed"}
    if filename == "chip_94.png":
        return {"mapChipIds": [61], "role": "Town Hall auxiliary platform", "confidence": "confirmed"}
    if filename == "souko_00.png":
        return {"mapChipIds": [252, 253], "role": "Town Hall Storehouse sprite", "confidence": "confirmed sprite, placement guided"}
    if "fence_05" in filename or "fence-05" in layer_id or str(layer.get("sourceFile", "")) == "fence_05.png":
        return {"mapChipIds": [], "role": "Town Hall surround/wall component", "confidence": "confirmed file and OPT slice, placement guided"}
    return {"mapChipIds": [], "role": "unknown", "confidence": "unknown"}


def layer_image(layer: dict[str, object]) -> tuple[Image.Image, dict[str, object]]:
    folder = str(layer["folder"])
    filename = str(layer["file"])
    if folder == "composer_part" and "fence_05" in filename:
        return render_fence_component(str(layer["id"]))
    if folder == "building" and filename == "flag_00.png":
        return render_opt(folder, filename, only_slot=2), {"source": f"{folder}/{filename}", "singleOptSlot": 2}
    return render_opt(folder, filename), {"source": f"{folder}/{filename}"}


def render(layout: dict[str, object], labeled: bool = False) -> tuple[Image.Image, list[dict[str, object]]]:
    drawable = []
    report_layers = []
    for layer in layout["layers"]:
        if not layer.get("visible", True):
            continue
        image, render_info = layer_image(layer)
        scale = float(layer.get("scale", 1))
        if scale != 1:
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
        x = round(float(layer.get("x", 0)))
        y = round(float(layer.get("y", 0)))
        z = float(layer.get("z", 0))
        evidence = layer_evidence(layer)
        drawable.append((z, x, y, image, layer, evidence))
        report_layers.append(
            {
                "id": layer["id"],
                "folder": layer["folder"],
                "file": layer["file"],
                "x": x,
                "y": y,
                "z": z,
                "scale": scale,
                "renderedSize": [image.width, image.height],
                "renderInfo": render_info,
                "evidence": evidence,
            }
        )

    min_x = min(x for _, x, _, _, _, _ in drawable)
    min_y = min(y for _, _, y, _, _, _ in drawable)
    max_x = max(x + image.width for _, x, _, image, _, _ in drawable)
    max_y = max(y + image.height for _, _, y, image, _, _ in drawable)
    margin = 28
    result = Image.new("RGBA", (max_x - min_x + margin * 2, max_y - min_y + margin * 2), (20, 25, 31, 255))
    draw = ImageDraw.Draw(result)
    font = load_font(10)

    for _, x, y, image, layer, evidence in sorted(drawable, key=lambda item: item[0]):
        px = x - min_x + margin
        py = y - min_y + margin
        result.alpha_composite(image, (px, py))
        if labeled:
            chips = "/".join(str(item) for item in evidence["mapChipIds"])
            label = f"{layer['id']}" if not chips else f"{chips} {layer['id']}"
            draw.rectangle((px, py, px + image.width, py + image.height), outline=(143, 184, 255, 150), width=1)
            draw.text((px + 2, py + 2), label, fill=(244, 247, 250, 255), font=font)
    return result, report_layers


def main() -> int:
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    image, report_layers = render(layout, labeled=False)
    labeled, _ = render(layout, labeled=True)
    image.save(OUT, "PNG")
    labeled.save(LABELED_OUT, "PNG")

    report = {
        "status": "current_best_full_4x4_guided_by_layout_v2",
        "warning": "Offsets are guided by the saved 4x4 composer layout; files and identities are data-backed, native offsets for storehouse/fence are not yet proven.",
        "layoutSource": str(LAYOUT),
        "outputs": {"image": str(OUT), "labeled": str(LABELED_OUT)},
        "mapChips": load_rows(MAPCHIP_CSV, MAPCHIP_IDS),
        "facilities": load_rows(FACILITY_CSV, FACILITY_IDS),
        "layers": report_layers,
    }
    REPORT_OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"wrote {OUT}")
    print(f"wrote {LABELED_OUT}")
    print(f"wrote {REPORT_OUT}")
    print("confirmed full-footprint files: building/town_hall_base_00.png, building/town_hall_tower_00.png, chip/chip_94.png, chip/souko_00.png, wall/fence_05.png")
    print("storehouse evidence: MapChip 252/253 -> chip/img 112 -> souko_00.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())