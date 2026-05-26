#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Export cropped rank icons (F,E,D,C,B,A,S) from rank_2x.png."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image


RANK_LABELS = ["F", "E", "D", "C", "B", "A", "S"]


def alpha_trim(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return image
    return image.crop(bbox)


def export_rank_icons(source_png: Path, output_dir: Path) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)

    sheet = Image.open(source_png).convert("RGBA")
    cols = len(RANK_LABELS)
    cell_w = sheet.width // cols
    cell_h = sheet.height

    icons: list[dict[str, object]] = []
    for index, label in enumerate(RANK_LABELS, start=1):
        src_x = (index - 1) * cell_w
        tile = sheet.crop((src_x, 0, src_x + cell_w, cell_h))
        cropped = alpha_trim(tile)

        filename = f"rank_{label.lower()}.png"
        cropped.save(output_dir / filename, "PNG")

        icons.append(
            {
                "id": index,
                "name": f"Rank {label}",
                "rankLabel": label,
                "filename": filename,
                "srcX": src_x,
                "srcY": 0,
                "srcW": cell_w,
                "srcH": cell_h,
                "cropW": cropped.width,
                "cropH": cropped.height,
                "sheet": source_png.name,
            }
        )

    manifest = {
        "sheet": source_png.name,
        "cols": cols,
        "cellWidth": cell_w,
        "cellHeight": cell_h,
        "icons": icons,
    }
    with (output_dir / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return manifest


def copy_to_public(source_dir: Path, public_dir: Path):
    public_dir.mkdir(parents=True, exist_ok=True)
    for item in source_dir.iterdir():
        if item.is_file():
            shutil.copy2(item, public_dir / item.name)


def main():
    repo_root = Path(__file__).resolve().parents[2]
    workspace_root = repo_root.parent

    source_png = workspace_root / "KA-Legacy-Archive" / "kingdom-adventures-tmp" / "KA_assets" / "com" / "rank_2x.png"
    output_dir = repo_root / "website_icons" / "ranks"
    public_dir = repo_root / "artifacts" / "kingdom-adventures" / "public" / "website_icons" / "ranks"

    if not source_png.exists():
        raise FileNotFoundError("Missing rank_2x.png in KA-Legacy-Archive KA_assets/com")

    export_rank_icons(source_png, output_dir)
    copy_to_public(output_dir, public_dir)

    print(f"Exported rank icons: {output_dir}")
    print(f"Public rank icons:   {public_dir}")


if __name__ == "__main__":
    main()
