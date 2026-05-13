"""
atlas_parser.py — parses ImageAtlas*.txt (UI sprite atlas) files.

Format:
  Line 1:   base value (e.g. "512")
  Section 1: x,y coordinate pairs (UV position indices)
  Count line: integer  (signals transition between sections)
  Section 2: filename.png,x,y,w,h  records (pixel positions in atlas PNG)

Returns list of AtlasSprite dicts.
Does NOT crash if the source PNG is absent — emits a warning instead.
"""

from __future__ import annotations
from pathlib import Path
from typing import NamedTuple
import warnings


class AtlasSprite(NamedTuple):
    filename: str
    x: int
    y: int
    w: int
    h: int


def parse_atlas_txt(path: str | Path) -> list[AtlasSprite]:
    """
    Parse one ImageAtlas*.txt file.
    Returns a list of AtlasSprite namedtuples.
    Rows that cannot be parsed are skipped with a warning.
    """
    sprites: list[AtlasSprite] = []
    path = Path(path)
    if not path.exists():
        warnings.warn(f"atlas_parser: file not found: {path}")
        return sprites

    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = [ln.rstrip("\r\n") for ln in fh]

    # Skip blank lines, strip whitespace
    lines = [ln.strip() for ln in lines if ln.strip()]

    if not lines:
        return sprites

    # Line 0 is the base value — ignore it
    idx = 1

    # Section 1: x,y pairs until we hit a line that is a bare integer
    # (the count line separating sections)
    in_section1 = True
    while idx < len(lines):
        ln = lines[idx]
        # Detect the count line: a bare positive integer with no comma
        if "," not in ln:
            try:
                int(ln)
                # This IS the count line — advance past it, enter section 2
                idx += 1
                in_section1 = False
                break
            except ValueError:
                pass
        idx += 1

    # Section 2: filename.png,x,y,w,h
    while idx < len(lines):
        ln = lines[idx]
        idx += 1
        if not ln:
            continue
        parts = ln.split(",")
        if len(parts) < 5:
            warnings.warn(f"atlas_parser:{path.name}: malformed sprite record: '{ln}'")
            continue
        filename = parts[0].strip()
        try:
            x, y, w, h = int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4])
        except ValueError:
            warnings.warn(f"atlas_parser:{path.name}: non-integer coords in: '{ln}'")
            continue
        sprites.append(AtlasSprite(filename=filename, x=x, y=y, w=w, h=h))

    return sprites


def load_all_atlases(ka_assets_dir: str | Path) -> dict[int, list[AtlasSprite]]:
    """
    Load ImageAtlas0.txt … ImageAtlas6.txt from the image_atlas subdirectory.
    Returns {atlas_index -> [AtlasSprite, ...]}
    """
    ka_assets_dir = Path(ka_assets_dir)
    atlas_dir = ka_assets_dir / "image_atlas"
    result: dict[int, list[AtlasSprite]] = {}

    for i in range(7):
        txt_path = atlas_dir / f"ImageAtlas{i}.txt"
        sprites = parse_atlas_txt(txt_path)
        if sprites:
            result[i] = sprites
        else:
            # Warn but don't crash — file may not exist for all indices
            if not txt_path.exists():
                warnings.warn(f"atlas_parser: ImageAtlas{i}.txt not found — skipping")

    return result
