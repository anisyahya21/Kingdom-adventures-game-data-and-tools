"""
opt_parser.py — parses .opt binary sprite sheet metadata files.

Binary format (v11 sequential specification):
  Bytes 0-3:  cellWidth, cellHeight, cols, rows (4 bytes header)
  
  Then sequential variable-length slot records in row-major order (v outer, u inner):
    Empty slot:  0x00 flag (1 byte total)
    Filled slot: 0x01 flag + 3 unknown + dest_x + dest_y + src_x + src_y + width + height
                 (15 bytes total: 1 flag + 3 unknown + 4 uint16 LE + 1 uint8)
  
  Filled slot layout (15 bytes):
    offset 0:    0x01 flag
    offset 1-3:  unknown/reserved (commonly ff ff 00)
    offset 4-5:  dest_x  (uint16 LE) - destination X on icon canvas
    offset 6-7:  dest_y  (uint16 LE) - destination Y on icon canvas
    offset 8-9:  src_x   (uint16 LE) - source X in PNG
    offset 10-11: src_y  (uint16 LE) - source Y in PNG
    offset 12-13: width  (uint16 LE) - source width
    offset 14:   height  (uint8)     - source height
  
  Trailing slots may be implicit empty if file ends before grid complete.
  Short filled records may occur at EOF (missing width/height bytes).
  
  CRITICAL: Do NOT use fixed-stride offsets (offset = 4 + index * 15).
  Empty slots consume 1 byte, not 15. Parser must advance sequentially.
"""

from __future__ import annotations
import struct
import warnings
from pathlib import Path

FLAG_HAS_DATA = 0x01
FLAG_EMPTY    = 0x00


def parse_opt(path: str | Path, debug_hex: bool = False) -> dict:
    """
    Parse a .opt binary file using sequential variable-length slot parsing.

    Returns:
        {
          "cell_width": int,    # from header byte 0
          "cell_height": int,   # from header byte 1
          "cols": int,          # from header byte 2
          "rows": int,          # from header byte 3
          "sprites": [{"u": col, "v": row, "x": src_x, "y": src_y, 
                       "dest_x": px, "dest_y": px, "src_x": px, "src_y": px, 
                       "w": px, "h": px, "status": str}, ...]
        }

    Sprite records include both old field names (x, y) and new field names
    (src_x, src_y, dest_x, dest_y) for backwards compatibility.

    Empty slots are omitted from the sprites list.
    Implicit empty slots (EOF before grid complete) are also omitted.
    Short recovered slots have estimated w/h and status="short_recovered".

    Args:
        debug_hex: if True, dumps parsing progress to stdout.
    """
    path = Path(path)
    if not path.exists():
        warnings.warn(f"opt_parser: file not found: {path}")
        return {"cell_width": 16, "cell_height": 16, "cols": 0, "rows": 0, "sprites": []}

    data = path.read_bytes()

    if len(data) < 4:
        warnings.warn(f"opt_parser: file too short ({len(data)} bytes): {path}")
        return {"cell_width": 16, "cell_height": 16, "cols": 0, "rows": 0, "sprites": []}

    cell_width, cell_height, cols, rows = data[0], data[1], data[2], data[3]

    if debug_hex:
        print(f"\n=== DEBUG: {path.name} ===")
        print(f"  Header: {data[:4].hex(' ')}")
        print(f"  cell_width={cell_width}, cell_height={cell_height}, cols={cols}, rows={rows}")
        print(f"  File size: {len(data)} bytes")
        print()

    sprites = []
    pos = 4  # Start after 4-byte header

    for v in range(rows):
        for u in range(cols):
            if pos >= len(data):
                # Implicit empty - file ended before this slot
                if debug_hex:
                    print(f"  slot u={u:2d} v={v:2d}: implicit_empty (EOF)")
                continue

            flag = data[pos]

            if flag == FLAG_EMPTY:
                if debug_hex:
                    print(f"  slot u={u:2d} v={v:2d}: empty")
                pos += 1
                continue

            elif flag == FLAG_HAS_DATA:
                if pos + 15 <= len(data):
                    # Complete filled record
                    dest_x, dest_y, src_x, src_y, width = struct.unpack_from("<HHHHH", data, pos + 4)
                    height = data[pos + 14]
                    
                    sprite = {
                        "u": u,
                        "v": v,
                        "x": src_x,        # backwards compat
                        "y": src_y,        # backwards compat
                        "dest_x": dest_x,
                        "dest_y": dest_y,
                        "src_x": src_x,
                        "src_y": src_y,
                        "w": width,
                        "h": height,
                        "status": "filled"
                    }
                    sprites.append(sprite)
                    
                    if debug_hex:
                        raw = data[pos:pos+15]
                        print(f"  slot u={u:2d} v={v:2d}: filled  dest=({dest_x},{dest_y}) src=({src_x},{src_y},{width},{height})  hex={raw.hex(' ')}")
                    
                    pos += 15

                elif pos + 12 <= len(data):
                    # Short record with all 4 coordinates (8 bytes)
                    dest_x, dest_y, src_x, src_y = struct.unpack_from("<HHHH", data, pos + 4)
                    w = cell_width - dest_x
                    h = cell_height - dest_y
                    
                    sprite = {
                        "u": u,
                        "v": v,
                        "x": src_x,        # backwards compat
                        "y": src_y,        # backwards compat
                        "dest_x": dest_x,
                        "dest_y": dest_y,
                        "src_x": src_x,
                        "src_y": src_y,
                        "w": max(0, w),
                        "h": max(0, h),
                        "status": "short_recovered"
                    }
                    sprites.append(sprite)
                    
                    if debug_hex:
                        print(f"  slot u={u:2d} v={v:2d}: short_recovered  dest=({dest_x},{dest_y}) src=({src_x},{src_y}) recovered_size=({w},{h})")
                    
                    pos = len(data)

                elif pos + 11 <= len(data):
                    # Very short record with only 3.5 coordinates (7 bytes)
                    dest_x, dest_y, src_x = struct.unpack_from("<HHH", data, pos + 4)
                    src_y = data[pos + 10] if pos + 10 < len(data) else 0
                    w = cell_width - dest_x
                    h = cell_height - dest_y
                    
                    sprite = {
                        "u": u,
                        "v": v,
                        "x": src_x,        # backwards compat
                        "y": src_y,        # backwards compat
                        "dest_x": dest_x,
                        "dest_y": dest_y,
                        "src_x": src_x,
                        "src_y": src_y,
                        "w": max(0, w),
                        "h": max(0, h),
                        "status": "short_recovered"
                    }
                    sprites.append(sprite)
                    
                    if debug_hex:
                        print(f"  slot u={u:2d} v={v:2d}: very_short_recovered  dest=({dest_x},{dest_y}) src=({src_x},{src_y}) recovered_size=({w},{h})")
                    
                    pos = len(data)

                else:
                    # Corrupt - not enough bytes
                    if debug_hex:
                        print(f"  slot u={u:2d} v={v:2d}: corrupt (insufficient bytes)")
                    pos = len(data)

            else:
                # Unknown flag
                if debug_hex:
                    print(f"  slot u={u:2d} v={v:2d}: unknown_flag 0x{flag:02x}")
                pos += 1

    if debug_hex:
        print(f"\n  Total filled/recovered slots: {len(sprites)}\n")

    return {
        "cell_width": cell_width,
        "cell_height": cell_height,
        "cols": cols,
        "rows": rows,
        "sprites": sprites
    }


def parse_opt_with_cell_size(
    path: str | Path,
    cell_w: int = 60,
    cell_h: int = 60,
    debug_hex: bool = False,
) -> dict:
    """
    Like parse_opt() but overrides cell dimensions from external source.
    Note: Sequential parser reads cell dimensions from header bytes 0-1,
    so this override should only be used when header values are known to be wrong.
    """
    result = parse_opt(path, debug_hex=debug_hex)
    result["cell_w"] = cell_w
    result["cell_h"] = cell_h
    # Keep cell_width/cell_height from header for backwards compatibility
    return result
