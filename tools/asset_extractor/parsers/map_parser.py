"""
map_parser.py — Phase 2 stub for .map binary tile files.

Observed binary patterns from dev_map_96_96.map:
  00 00 60 00  — appears repeatedly (tile record type A)
  00 00 22 00  — appears repeatedly (tile record type B)

Full format not yet reverse-engineered.
This stub exposes the scaffolded API so it can be wired into the CLI
without blocking Phase 1 completion.
"""

from __future__ import annotations
from pathlib import Path
import warnings


# Known .map files
MAP_FILES = {
    "dev_96x96":    "dev_map_96_96.map",
    "prod_160x160": "map_160_160.map",
}

# Known repeating byte patterns (for future header detection)
PATTERN_A = bytes([0x00, 0x00, 0x60, 0x00])
PATTERN_B = bytes([0x00, 0x00, 0x22, 0x00])


class MapFile:
    """
    Stub map file reader.
    Phase 2 will implement full tile decoding once the format is confirmed.
    """

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self._data: bytes | None = None

    def load(self) -> None:
        if not self.path.exists():
            warnings.warn(f"map_parser: file not found: {self.path}")
            self._data = b""
            return
        self._data = self.path.read_bytes()

    @property
    def size(self) -> int:
        return len(self._data) if self._data is not None else 0

    def parse_header(self) -> dict:
        """
        Stub: returns raw first 16 bytes as hex for inspection.
        Phase 2 will decode width/height and tile format version.
        """
        if self._data is None:
            self.load()
        return {
            "file":       self.path.name,
            "size_bytes": self.size,
            "header_hex": self._data[:16].hex(" ") if self._data else "",
            "status":     "stub — Phase 2 not yet implemented",
        }

    def get_tile(self, x: int, y: int) -> bytes:
        """
        Stub: returns raw 4 bytes at the guessed tile offset.
        Assumes a simple row-major layout for exploration purposes only.
        Phase 2 will replace this with the confirmed tile stride.
        """
        if self._data is None:
            self.load()
        # Placeholder stride — 4 bytes per tile (matches observed repeating patterns)
        stride = 4
        # Width unknown — use filename hint as fallback
        width = 96 if "96" in self.path.name else 160
        offset = (y * width + x) * stride
        if offset + stride > len(self._data):
            return b"\x00" * stride
        return self._data[offset:offset + stride]
