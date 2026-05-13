"""
opt_parser.py — parses .opt binary sprite sheet metadata files.

Binary format (verified from weapon_00.opt):
  Byte 0:   unknown
  Byte 1:   unknown
  Byte 2:   cols  (number of columns in the sprite grid)
  Byte 3:   rows  (number of rows in the sprite grid)
  Then cols×rows records, each exactly 13 bytes:
    [0]       flag:   0x00 = empty slot (skip), 0x01 = has data
    [1..6]    unknown bytes (padding / extra flags)
    [7..8]    x  uint16 little-endian (pixel left edge)
    [9..10]   y  uint16 little-endian (pixel top edge)
    [11..12]  w  uint16 little-endian (sprite width)
    [13..14]  h  uint16 little-endian (sprite height)

Wait — re-check: the plan says "1-byte flag + 6 skip bytes + x/y/w/h uint16 LE"
That is 1 + 6 + 2+2+2+2 = 15 bytes per slot, NOT 13.  Confirmed below.

Slot layout (15 bytes):
  offset 0:    flag          (1 byte)
  offset 1-6:  unknown/skip  (6 bytes)
  offset 7-8:  x             (uint16 LE)
  offset 9-10: y             (uint16 LE)
  offset 11-12: w            (uint16 LE)
  offset 13-14: h            (uint16 LE)
"""

from __future__ import annotations
import struct
import warnings
from pathlib import Path

SLOT_SIZE = 15          # bytes per grid slot
HEADER_OFFSET = 2       # byte index of the cols field
FLAG_HAS_DATA = 0x01
FLAG_EMPTY    = 0x00


def parse_opt(path: str | Path, debug_hex: bool = False) -> dict:
    """
    Parse a .opt binary file.

    Returns:
        {
          "cols": int,
          "rows": int,
          "sprites": [{"u": col, "v": row, "x": px, "y": px, "w": px, "h": px}, ...]
        }

    Empty slots are omitted from the sprites list.
    Malformed data logs a warning and returns partial results.

    Args:
        debug_hex: if True, dumps hex + parsed result side by side to stdout.
    """
    path = Path(path)
    if not path.exists():
        warnings.warn(f"opt_parser: file not found: {path}")
        return {"cols": 0, "rows": 0, "sprites": []}

    data = path.read_bytes()

    if len(data) < 4:
        warnings.warn(f"opt_parser: file too short ({len(data)} bytes): {path}")
        return {"cols": 0, "rows": 0, "sprites": []}

    cols = data[HEADER_OFFSET]
    rows = data[HEADER_OFFSET + 1]
    total_slots = cols * rows
    expected_size = 4 + total_slots * SLOT_SIZE

    if debug_hex:
        print(f"\n=== DEBUG HEX: {path.name} ===")
        print(f"  Header bytes: {data[:4].hex(' ')}")
        print(f"  cols={cols}, rows={rows}, total_slots={total_slots}")
        print(f"  File size: {len(data)} bytes  Expected: {expected_size}")
        print()

    if len(data) < expected_size:
        warnings.warn(
            f"opt_parser: file is {len(data)} bytes but expected {expected_size} "
            f"for {cols}×{rows} grid in {path.name} — will parse as many slots as available"
        )

    sprites = []
    slot_base = 4  # first slot starts after the 4-byte header

    for v in range(rows):
        for u in range(cols):
            offset = slot_base + (v * cols + u) * SLOT_SIZE
            if offset + SLOT_SIZE > len(data):
                break

            flag = data[offset]
            if flag == FLAG_EMPTY:
                if debug_hex:
                    raw = data[offset:offset + SLOT_SIZE]
                    print(f"  slot u={u:2d} v={v:2d}: EMPTY  hex={raw.hex(' ')}")
                continue

            # parse x, y, w, h from offsets 7–14
            x, y, w, h = struct.unpack_from("<HHHH", data, offset + 7)

            sprite = {"u": u, "v": v, "x": x, "y": y, "w": w, "h": h}
            sprites.append(sprite)

            if debug_hex:
                raw = data[offset:offset + SLOT_SIZE]
                print(f"  slot u={u:2d} v={v:2d}: flag={flag:02x} skip={raw[1:7].hex(' ')}  x={x:4d} y={y:4d} w={w:3d} h={h:3d}")

    if debug_hex:
        print(f"\n  Total filled slots: {len(sprites)}\n")

    return {"cols": cols, "rows": rows, "sprites": sprites}


def parse_opt_with_cell_size(
    path: str | Path,
    cell_w: int = 60,
    cell_h: int = 60,
    debug_hex: bool = False,
) -> dict:
    """
    Like parse_opt() but also includes cell_w and cell_h in the returned dict.
    cell_w/h are read from optimize_*.inf by the caller and passed in here.
    """
    result = parse_opt(path, debug_hex=debug_hex)
    result["cell_w"] = cell_w
    result["cell_h"] = cell_h
    return result
