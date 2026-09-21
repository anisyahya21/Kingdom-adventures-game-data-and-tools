#!/usr/bin/env python3
"""Side-by-side debug view for one shot: screenshot | reference | amplified difference."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

MAGENTA = (255, 0, 255, 255)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shot", required=True)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--scale", type=int, default=8)
    args = ap.parse_args()

    shot = Image.open(args.shot).convert("RGBA")
    crop = Image.open(args.reference).convert("RGBA")
    expected = Image.alpha_composite(Image.new("RGBA", crop.size, MAGENTA), crop)

    differing = 0
    bbox = None
    max_delta = 0
    if shot.size == expected.size:
        a, b = shot.load(), expected.load()
        for y in range(shot.height):
            for x in range(shot.width):
                delta = max(abs(a[x, y][i] - b[x, y][i]) for i in range(4))
                max_delta = max(max_delta, delta)
                if delta > 0:
                    differing += 1
                    bbox = (
                        x if bbox is None else min(bbox[0], x),
                        y if bbox is None else min(bbox[1], y),
                        x if bbox is None else max(bbox[2], x),
                        y if bbox is None else max(bbox[3], y),
                    )

    width = shot.width + expected.width + 8
    height = max(shot.height, expected.height)
    panel = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    panel.paste(shot, (0, 0))
    panel.paste(expected, (shot.width + 8, 0))

    diff = Image.new("RGBA", shot.size, (0, 0, 0, 255)) if shot.size == expected.size else None
    if diff is not None:
        a, b, d = shot.load(), expected.load(), diff.load()
        for y in range(shot.height):
            for x in range(shot.width):
                delta = max(abs(a[x, y][i] - b[x, y][i]) for i in range(4))
                d[x, y] = (min(255, delta * 4), min(255, delta * 4), 0, 255)

    out = Path(args.out)
    panel.resize((panel.width * args.scale, panel.height * args.scale), Image.NEAREST).save(out)
    if diff is not None:
        diff.resize((diff.width * args.scale, diff.height * args.scale), Image.NEAREST).save(
            out.with_name(out.stem + "-diff.png")
        )
    print(
        f"shot {shot.size} reference {crop.size} differing {differing} "
        f"maxDelta {max_delta} bbox {bbox} -> {out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
