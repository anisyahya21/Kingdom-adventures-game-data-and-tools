"""
inf_parser.py — parses all 4 .inf file variants used by KA_assets.

Variants:
  img.inf / seb.inf   tab-delimited:  <TAB>ID<TAB>filename,mode
  scr.inf             tab-delimited:  <TAB>ID<TAB>filename,mode  (same as img.inf)
  optimize_*.inf      key=value text: size = 60,60 / output = optimize\
"""

from __future__ import annotations
from pathlib import Path
from typing import Optional
import warnings


def parse_img_inf(path: str | Path) -> dict[int, str]:
    """
    Parse img.inf / seb.inf / scr.inf.
    Returns {id -> filename_stem_with_extension} (mode stripped).
    Non-contiguous IDs are handled naturally — gaps are just absent keys.
    Rows that cannot be parsed are skipped with a warning.
    """
    result: dict[int, str] = {}
    path = Path(path)
    if not path.exists():
        warnings.warn(f"inf_parser: file not found: {path}")
        return result

    with open(path, encoding="utf-8", errors="replace") as fh:
        for lineno, raw in enumerate(fh, 1):
            line = raw.rstrip("\r\n")
            if not line.strip():
                continue
            parts = line.split("\t")
            # expected format:  <empty>\t<ID>\t<filename>,<mode>
            # Some files have leading tab, some don't — be lenient
            non_empty = [p for p in parts if p.strip()]
            if len(non_empty) < 2:
                continue
            id_str, file_field = non_empty[0], non_empty[1]
            try:
                entry_id = int(id_str.strip())
            except ValueError:
                warnings.warn(f"inf_parser:{path.name}:{lineno}: cannot parse id '{id_str}'")
                continue
            # strip the ,mode suffix
            filename = file_field.split(",")[0].strip()
            result[entry_id] = filename

    return result


def parse_optimize_inf(path: str | Path) -> dict[str, str]:
    """
    Parse optimize_*.inf (key=value text format).
    Returns {key -> value_string}.
    Convenience: 'size_w' and 'size_h' are added as ints when 'size' is present.
    """
    result: dict[str, str] = {}
    path = Path(path)
    if not path.exists():
        warnings.warn(f"inf_parser: optimize .inf not found: {path}")
        return result

    with open(path, encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            result[key.strip()] = val.strip()

    if "size" in result:
        parts = result["size"].split(",")
        if len(parts) == 2:
            try:
                result["size_w"] = int(parts[0].strip())  # type: ignore[assignment]
                result["size_h"] = int(parts[1].strip())  # type: ignore[assignment]
            except ValueError:
                pass

    return result


def get_cell_size(optimize_inf_path: str | Path) -> tuple[int, int]:
    """
    Returns (cell_width, cell_height) from an optimize_*.inf file.
    Falls back to (60, 60) if the file is missing or size is unreadable.
    """
    data = parse_optimize_inf(optimize_inf_path)
    w = data.get("size_w", 60)
    h = data.get("size_h", 60)
    return int(w), int(h)


# Re-export parse_img_inf as parse_scr_inf for clarity
parse_scr_inf = parse_img_inf
