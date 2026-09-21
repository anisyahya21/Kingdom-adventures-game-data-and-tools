#!/usr/bin/env python3
"""Contact sheet of the rendered logical cells (one row per monster, 2 poses x 2 sides)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

PAD = 6
LABEL_W = 150


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", default="harness-cells.png")
    args = ap.parse_args()

    root = Path(args.dir).resolve()
    geometry = json.loads((root / "harness-geometry.json").read_text(encoding="utf-8"))
    shots = {entry["caseId"]: entry for entry in geometry["cellShots"]}
    cases = sorted(
        shots,
        key=lambda case_id: (
            int(case_id.split("-")[0]),
            int(case_id.split("-")[1].replace("pose", "")),
            case_id.split("-")[2],
        ),
    )
    columns = list(dict.fromkeys("-".join(case_id.split("-")[1:]) for case_id in cases))
    rows = sorted({case_id.split("-")[0] for case_id in cases}, key=int)

    cell_w = cell_h = None
    for entry in geometry["cellShots"]:
        image = Image.open(root / entry["file"])
        cell_w, cell_h = image.size
        break

    width = LABEL_W + len(columns) * (cell_w + PAD) + PAD
    height = 20 + len(rows) * (cell_h + PAD) + PAD
    sheet = Image.new("RGB", (width, height), (24, 24, 28))
    draw = ImageDraw.Draw(sheet)
    for index, column in enumerate(columns):
        draw.text((LABEL_W + index * (cell_w + PAD) + PAD, 4), column, fill=(230, 230, 230))
    for row_index, monster in enumerate(rows):
        y = 20 + row_index * (cell_h + PAD)
        draw.text((4, y + cell_h // 2 - 6), f"monster {monster}", fill=(230, 230, 230))
        for column_index, column in enumerate(columns):
            case_id = f"{monster}-{column}"
            x = LABEL_W + column_index * (cell_w + PAD) + PAD
            if case_id not in shots:
                continue
            image = Image.open(root / shots[case_id]["file"]).convert("RGB")
            sheet.paste(image, (x, y))

    out = root / args.out
    sheet.save(out)
    print(f"{out} ({sheet.size[0]}x{sheet.size[1]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
