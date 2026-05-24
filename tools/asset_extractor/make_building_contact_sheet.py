#!/usr/bin/env python
"""Build a labeled contact sheet for all building PNG assets."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
BUILDING_DIR = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets" / "building"
OUT = ROOT / "tools" / "asset_extractor" / "generated" / "building_all_labeled_sheet.png"


def load_font() -> ImageFont.ImageFont:
    for font_path in [Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/arial.ttf")]:
        if font_path.exists():
            return ImageFont.truetype(str(font_path), 12)
    return ImageFont.load_default()


def main() -> int:
    font = load_font()
    paths = sorted(BUILDING_DIR.glob("*.png"), key=lambda path: path.name.lower())
    entries = []
    for path in paths:
        image = Image.open(path).convert("RGBA")
        if max(image.size) < 70:
            scale = 3
        else:
            scale = 2
        image = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
        entries.append((path.name, image))

    card_w = 220
    card_h = 210
    cols = 5
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * card_w, rows * card_h), (18, 22, 26, 255))
    draw = ImageDraw.Draw(sheet)

    for index, (name, image) in enumerate(entries):
        col = index % cols
        row = index // cols
        x = col * card_w
        y = row * card_h
        draw.rectangle((x + 5, y + 5, x + card_w - 5, y + card_h - 5), outline=(72, 84, 96, 255), width=1)
        image_x = x + (card_w - image.width) // 2
        image_y = y + 12 + max(0, (150 - image.height) // 2)
        sheet.alpha_composite(image, (image_x, image_y))
        draw.text((x + 10, y + 176), name, fill=(232, 237, 242, 255), font=font)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT, "PNG")
    print(f"wrote {OUT}")
    print(f"entries {len(entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())