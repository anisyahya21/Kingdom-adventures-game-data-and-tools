#!/usr/bin/env python
"""Render a data-driven Town Hall composite attempt from opt records and saved layout."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
PROJECT_ASSETS = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"
DESKTOP_ASSETS = Path("c:/Users/anisb/OneDrive/Desktop/KA_assets")
OUT_DIR = ROOT / "tools" / "asset_extractor" / "generated"
LAYOUT = OUT_DIR / "townhall_user_approx_layout_2026-05-15_v2.json"
OUT = OUT_DIR / "townhall_render_attempt_opt_v2.png"
LABELED_OUT = OUT_DIR / "townhall_render_attempt_opt_v2_labeled.png"
SPRITE_OUT = OUT_DIR / "townhall_opt_sprites_preview.png"
FLAG_FRAME_OUT = OUT_DIR / "townhall_flag_single_frame.png"


@dataclass(frozen=True)
class OptRecord:
    draw_x: int
    draw_y: int
    src_x: int
    src_y: int
    width: int
    height: int


@dataclass(frozen=True)
class OptData:
    width: int
    height: int
    records: list[OptRecord]


def s16(data: bytes) -> int:
    return int.from_bytes(data, "big", signed=True)


def u16(data: bytes) -> int:
    return int.from_bytes(data, "big")


def asset_path(folder: str, filename: str) -> Path:
    for root in [PROJECT_ASSETS, DESKTOP_ASSETS]:
        path = root / folder / filename
        if path.exists():
            return path
    raise FileNotFoundError(f"Missing asset {folder}/{filename}")


def opt_path(folder: str, stem: str) -> Path | None:
    paths = []
    for root in [DESKTOP_ASSETS, PROJECT_ASSETS]:
        path = root / folder / f"{stem}.opt"
        if path.exists():
            paths.append(path)
    if not paths:
        return None
    return max(paths, key=lambda path: path.stat().st_size)


def parse_opt(folder: str, stem: str) -> OptData | None:
    path = opt_path(folder, stem)
    if path is None:
        return None
    data = path.read_bytes()
    if len(data) < 4:
        return None
    width, height, count = data[0], data[1], data[2]
    records: list[OptRecord] = []
    pos = 4
    for _ in range(count):
        record = data[pos : pos + 15]
        pos += 15
        if len(record) < 15:
            break
        records.append(
            OptRecord(
                draw_x=s16(record[3:5]),
                draw_y=s16(record[5:7]),
                src_x=s16(record[7:9]),
                src_y=s16(record[9:11]),
                width=u16(record[11:13]),
                height=u16(record[13:15]),
            )
        )
    return OptData(width=width, height=height, records=records)


def render_opt(folder: str, filename: str, frame: int | None = None) -> Image.Image:
    stem = Path(filename).stem
    source = Image.open(asset_path(folder, filename)).convert("RGBA")
    opt = parse_opt(folder, stem)
    if opt is None:
        return source
    canvas = Image.new("RGBA", (opt.width, opt.height), (0, 0, 0, 0))
    records = opt.records if frame is None else opt.records[frame : frame + 1]
    for record in records:
        crop = source.crop((record.src_x, record.src_y, record.src_x + record.width, record.src_y + record.height))
        canvas.alpha_composite(crop, (record.draw_x, record.draw_y))
    return canvas


def render_fence_component(kind: str) -> Image.Image:
    full = Image.open(asset_path("wall", "fence_05.png")).convert("RGBA")
    opt = parse_opt("wall", "fence_05")
    if opt is None:
        raise RuntimeError("Missing fence_05.opt")
    index = {"pillar": 0, "canopy": 1, "corner_base": 2}[kind]
    record = opt.records[index]
    canvas = Image.new("RGBA", (opt.width, opt.height), (0, 0, 0, 0))
    crop = full.crop((record.src_x, record.src_y, record.src_x + record.width, record.src_y + record.height))
    canvas.alpha_composite(crop, (record.draw_x, record.draw_y))
    return canvas


def layer_image(layer: dict[str, object]) -> Image.Image:
    folder = str(layer["folder"])
    file = str(layer["file"])
    if folder == "composer_part" and "fence_05" in file:
        if "pillar" in file:
            return render_fence_component("pillar")
        if "corner" in file:
            return render_fence_component("corner_base")
        return render_fence_component("canopy")
    if folder == "building" and file == "flag_00.png":
        return render_opt(folder, file, frame=2)
    return render_opt(folder, file)


def load_font() -> ImageFont.ImageFont:
    for path in [Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/arial.ttf")]:
        if path.exists():
            return ImageFont.truetype(str(path), 11)
    return ImageFont.load_default()


def render_layers(layout: dict[str, object], labeled: bool = False) -> Image.Image:
    drawable = []
    for layer in layout["layers"]:
        if not layer.get("visible", True):
            continue
        image = layer_image(layer)
        scale = float(layer.get("scale", 1))
        if scale != 1:
            image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.NEAREST)
        x = round(float(layer.get("x", 0)))
        y = round(float(layer.get("y", 0)))
        z = float(layer.get("z", 0))
        drawable.append((z, x, y, image, layer))

    min_x = min(x for _, x, _, _, _ in drawable)
    min_y = min(y for _, _, y, _, _ in drawable)
    max_x = max(x + image.width for _, x, _, image, _ in drawable)
    max_y = max(y + image.height for _, _, y, image, _ in drawable)
    margin = 28
    result = Image.new("RGBA", (max_x - min_x + margin * 2, max_y - min_y + margin * 2), (20, 25, 31, 255))
    draw = ImageDraw.Draw(result)
    font = load_font()

    for z, x, y, image, layer in sorted(drawable, key=lambda item: item[0]):
        px = x - min_x + margin
        py = y - min_y + margin
        result.alpha_composite(image, (px, py))
        if labeled:
            draw.rectangle((px, py, px + image.width, py + image.height), outline=(143, 184, 255, 160), width=1)
            draw.text((px + 2, py + 2), str(layer.get("id", layer.get("file"))), fill=(231, 237, 245, 255), font=font)

    return result


def make_sprite_preview() -> Image.Image:
    entries = [
        ("chip_94 opt", render_opt("chip", "chip_94.png")),
        ("souko_00 raw", render_opt("chip", "souko_00.png")),
        ("town base opt", render_opt("building", "town_hall_base_00.png")),
        ("town tower opt", render_opt("building", "town_hall_tower_00.png")),
        ("flag frame", render_opt("building", "flag_00.png", frame=2)),
        ("fence_05 full opt", render_opt("wall", "fence_05.png")),
        ("fence_05 canopy rec", render_fence_component("canopy")),
        ("fence_05 pillar rec", render_fence_component("pillar")),
        ("fence_05 base rec", render_fence_component("corner_base")),
        ("fence_06 full opt", render_opt("wall", "fence_06.png")),
    ]
    font = load_font()
    card_w, card_h = 210, 190
    cols = 2
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * card_w, rows * card_h), (20, 25, 31, 255))
    draw = ImageDraw.Draw(sheet)
    for index, (label, image) in enumerate(entries):
        col = index % cols
        row = index // cols
        x = col * card_w
        y = row * card_h
        draw.rectangle((x + 6, y + 6, x + card_w - 6, y + card_h - 6), outline=(72, 84, 96, 255))
        scaled = image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST)
        sheet.alpha_composite(scaled, (x + (card_w - scaled.width) // 2, y + 18))
        draw.text((x + 10, y + card_h - 28), label, fill=(231, 237, 245, 255), font=font)
    return sheet


def main() -> int:
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    render_layers(layout).save(OUT, "PNG")
    render_layers(layout, labeled=True).save(LABELED_OUT, "PNG")
    make_sprite_preview().save(SPRITE_OUT, "PNG")
    render_opt("building", "flag_00.png", frame=2).save(FLAG_FRAME_OUT, "PNG")
    print(f"wrote {OUT}")
    print(f"wrote {LABELED_OUT}")
    print(f"wrote {SPRITE_OUT}")
    print(f"wrote {FLAG_FRAME_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
