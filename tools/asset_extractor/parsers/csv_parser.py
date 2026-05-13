"""
csv_parser.py — loads all 9 game CSVs with exact column indices.

All column indices are 0-based and verified from direct file reads.
Header rows are skipped by the skip_rows parameter.
"""

from __future__ import annotations
import csv
import warnings
from pathlib import Path
from typing import Optional


def _read_csv(path: str | Path, skip_rows: int = 0) -> list[list[str]]:
    path = Path(path)
    if not path.exists():
        warnings.warn(f"csv_parser: file not found: {path}")
        return []
    rows = []
    with open(path, encoding="utf-8-sig", errors="replace", newline="") as fh:
        reader = csv.reader(fh)
        for _ in range(skip_rows):
            try:
                next(reader)
            except StopIteration:
                return rows
        for row in reader:
            if any(cell.strip() for cell in row):
                rows.append(row)
    return rows


def _get(row: list[str], col: int, default: str = "") -> str:
    try:
        return row[col].strip()
    except IndexError:
        return default


def _int(row: list[str], col: int, default: Optional[int] = None) -> Optional[int]:
    val = _get(row, col)
    if val == "":
        return default
    try:
        return int(float(val))  # handles "3.0" style
    except (ValueError, OverflowError):
        return default


# ---------------------------------------------------------------------------
# Item.csv  (1-row header, data from row 2)
# Columns:  id=0, name=1, category=2, iconU=9, iconV=10
# ---------------------------------------------------------------------------
def load_items(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=1)
    result = []
    for row in rows:
        item_id = _int(row, 0)
        if item_id is None:
            continue
        result.append({
            "id":       item_id,
            "name":     _get(row, 1),
            "category": _int(row, 2),
            "iconU":    _int(row, 9),
            "iconV":    _int(row, 10),
        })
    return result


# ---------------------------------------------------------------------------
# MapChip.csv  (1-row header, data from row 2)
# Source: data/sheet-research/raw-copies/
# Columns: id=0, name=8, res=9, img=10, seb=11, frame=12,
#          iconU=13, iconV=14, relatedDataType=15, relatedDataId=16,
#          layer=20, sizeWidth=22, sizeHeight=23
# ---------------------------------------------------------------------------
def load_mapchips(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=1)
    result = []
    for row in rows:
        chip_id = _int(row, 0)
        if chip_id is None:
            continue
        result.append({
            "id":              chip_id,
            "name":            _get(row, 8),
            "res":             _int(row, 9),
            "img":             _int(row, 10),
            "seb":             _int(row, 11),
            "frame":           _int(row, 12),
            "iconU":           _int(row, 13),
            "iconV":           _int(row, 14),
            "relatedDataType": _int(row, 15),
            "relatedDataId":   _int(row, 16),
            "layer":           _int(row, 20),
            "sizeWidth":       _int(row, 22),
            "sizeHeight":      _int(row, 23),
        })
    return result


# ---------------------------------------------------------------------------
# Monster.csv  (3-row header, data from row 4)
# Columns: id=0, name=1, res=2, img=3, type=4, size=5
# ---------------------------------------------------------------------------
def load_monsters(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=3)
    result = []
    for row in rows:
        mon_id = _int(row, 0)
        if mon_id is None:
            continue
        result.append({
            "id":   mon_id,
            "name": _get(row, 1),
            "res":  _int(row, 2),
            "img":  _int(row, 3),
            "type": _int(row, 4),
            "size": _int(row, 5),
        })
    return result


# ---------------------------------------------------------------------------
# Terrain.csv  (2-row header)
# Columns: id=0, type=1, category=2, res=5, img=6, seb=7, frame=8, res2=9, shoesImg=10
# ---------------------------------------------------------------------------
def load_terrains(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=2)
    result = []
    for row in rows:
        t_id = _int(row, 0)
        if t_id is None:
            continue
        result.append({
            "id":       t_id,
            "type":     _int(row, 1),
            "category": _int(row, 2),
            "res":      _int(row, 5),
            "img":      _int(row, 6),
            "seb":      _int(row, 7),
            "frame":    _int(row, 8),
            "res2":     _int(row, 9),
            "shoesImg": _int(row, 10),
        })
    return result


# ---------------------------------------------------------------------------
# House.csv  (2-row header)
# Columns: id=0, name=3, res=32, img=33, bedId=34, studioId=35,
#          regiId=36, shelfId=37, storageId=38, floorId=39, fenceId=40
# ---------------------------------------------------------------------------
def load_houses(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=2)
    result = []
    for row in rows:
        h_id = _int(row, 0)
        if h_id is None:
            continue
        result.append({
            "id":        h_id,
            "name":      _get(row, 3),
            "res":       _int(row, 32),
            "img":       _int(row, 33),
            "bedId":     _int(row, 34),
            "studioId":  _int(row, 35),
            "regiId":    _int(row, 36),
            "shelfId":   _int(row, 37),
            "storageId": _int(row, 38),
            "floorId":   _int(row, 39),
            "fenceId":   _int(row, 40),
        })
    return result


# ---------------------------------------------------------------------------
# Facility_lookup.csv  (3-row header)
# Columns: id=0, name=1, dataId=18, combination=19, parentChipId=20
#          evolutionChipId = last column
# ---------------------------------------------------------------------------
def load_facilities(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=3)
    result = []
    for row in rows:
        f_id = _int(row, 0)
        if f_id is None:
            continue
        evo = _int(row, len(row) - 1) if row else None
        result.append({
            "id":               f_id,
            "name":             _get(row, 1),
            "dataId":           _int(row, 18),
            "combination":      _int(row, 19),
            "parentChipId":     _int(row, 20),
            "evolutionChipId":  evo,
        })
    return result


# ---------------------------------------------------------------------------
# Job.csv  (3-row header, data from row 4)
# Columns: id=0, name=1,
#   resHead=14, imgHeads[4]=15-18,
#   resBody=19, imgBodys[4]=20-23,
#   resHand=24, imgHands[4]=25-28,
#   resFoot=29, imgFoots[4]=30-33,
#   weapon=34, shield=35
# ---------------------------------------------------------------------------
def load_jobs(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=3)
    result = []
    for row in rows:
        j_id = _int(row, 0)
        if j_id is None:
            continue
        result.append({
            "id":        j_id,
            "name":      _get(row, 1),
            "resHead":   _int(row, 14),
            "imgHeads":  [_int(row, 15), _int(row, 16), _int(row, 17), _int(row, 18)],
            "resBody":   _int(row, 19),
            "imgBodys":  [_int(row, 20), _int(row, 21), _int(row, 22), _int(row, 23)],
            "resHand":   _int(row, 24),
            "imgHands":  [_int(row, 25), _int(row, 26), _int(row, 27), _int(row, 28)],
            "resFoot":   _int(row, 29),
            "imgFoots":  [_int(row, 30), _int(row, 31), _int(row, 32), _int(row, 33)],
            "weapon":    _int(row, 34),
            "shield":    _int(row, 35),
        })
    return result


# ---------------------------------------------------------------------------
# Treasure_lookup.csv  (1-row header)
# Source: data/sheet-research/raw-copies/
# Columns: id=0, name=1, res=2, img=3
# ---------------------------------------------------------------------------
def load_treasures(path: str | Path) -> list[dict]:
    rows = _read_csv(path, skip_rows=1)
    result = []
    for row in rows:
        t_id = _int(row, 0)
        if t_id is None:
            continue
        result.append({
            "id":   t_id,
            "name": _get(row, 1),
            "res":  _int(row, 2),
            "img":  _int(row, 3),
        })
    return result
