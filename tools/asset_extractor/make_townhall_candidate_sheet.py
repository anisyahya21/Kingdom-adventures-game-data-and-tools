#!/usr/bin/env python
"""Build a labeled sheet for Town Hall composite candidate parts."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"
OUT = ROOT / "tools" / "asset_extractor" / "generated" / "townhall_candidate_parts.png"
SCALE = 3

CANDIDATES = [
    ("building", "town_hall_base_00.png"),
    ("building", "town_hall_tower_00.png"),
    ("building", "flag_00.png"),
    ("chip", "chip_94.png"),
    ("chip", "souko_00.png"),
    ("building", "obj_58.png"),
    ("building", "obj_59.png"),
    ("building", "obj_60.png"),
    ("building", "obj_53.png"),
    ("building", "obj_54.png"),
    ("building", "obj_55.png"),
    ("building", "obj_57.png"),
    ("building", "obj_61.png"),
]


def load_font() -> ImageFont.ImageFont:
    for font_path in [
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]:
        if font_path.exists():
            return ImageFont.truetype(str(font_path), 13)
    return ImageFont.load_default()


def main() -> int:
    font = load_font()
    entries = []
    missing = []

    for folder, filename in CANDIDATES:
        path = ASSET_ROOT / folder / filename
        if not path.exists():
            missing.append(f"{folder}/{filename}")
            continue
        image = Image.open(path).convert("RGBA")
        image = image.resize((image.width * SCALE, image.height * SCALE), Image.Resampling.NEAREST)
        entries.append((folder, filename, image))

    card_w = 230
    card_h = 230
    cols = 3
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * card_w, rows * card_h), (18, 22, 26, 255))
    draw = ImageDraw.Draw(sheet)

    for idx, (folder, filename, image) in enumerate(entries):
        col = idx % cols
        row = idx // cols
        x = col * card_w
        y = row * card_h
        draw.rectangle((x + 6, y + 6, x + card_w - 6, y + card_h - 6), outline=(72, 84, 96, 255), width=1)
        image_x = x + (card_w - image.width) // 2
        image_y = y + 18 + max(0, (150 - image.height) // 2)
        sheet.alpha_composite(image, (image_x, image_y))
        draw.text((x + 12, y + 178), f"{folder}/{filename}", fill=(232, 237, 242, 255), font=font)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists() and OUT.is_dir():
        raise IsADirectoryError(f"Output path is a directory: {OUT}")
    sheet.save(OUT, "PNG")
    print(f"wrote {OUT}")
    print(f"entries {len(entries)}")
    print(f"missing {len(missing)}")
    for item in missing:
        print(f"missing: {item}")
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())