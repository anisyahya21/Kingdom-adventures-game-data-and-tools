"""
icon_sheet_finder.py — auto-discovers the packed sprite sheet(s) for Item.csv icons.

The item icon sheets are not confirmed present in the workspace.
This module scans all KA_assets subdirectories for PNG candidates that could
be item icon packed sheets, cross-matches against Item.csv iconU/iconV ranges,
and outputs a JSON report of candidates and unresolved items.
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import config
from parsers.inf_parser import parse_img_inf
from parsers.opt_parser import parse_opt
from parsers.csv_parser import load_items

# Likely cell sizes for item icons (pixels)
CANDIDATE_CELL_SIZES = [24, 30, 36, 48, 60]


def _is_candidate_png(png_path: Path) -> bool:
    """True if the PNG filename or directory suggests it could be an icon sheet."""
    stem = png_path.stem.lower()
    keywords = ["icon", "item", "ui", "menu", "hud", "status", "inv"]
    return any(kw in stem for kw in keywords)


def _get_png_dimensions(png_path: Path) -> tuple[int, int] | None:
    """Returns (width, height) of a PNG using Pillow, or None on error."""
    try:
        from PIL import Image
        with Image.open(png_path) as img:
            return img.size  # (width, height)
    except Exception:
        return None


def _score_sheet(
    png_path: Path,
    opt_data: dict | None,
    max_u: int,
    max_v: int,
    dims: tuple[int, int] | None,
) -> float:
    """Score a PNG as a candidate icon sheet. Returns 0.0–1.0."""
    score = 0.0

    if _is_candidate_png(png_path):
        score += 0.3

    if opt_data:
        cols = opt_data.get("cols", 0)
        rows = opt_data.get("rows", 0)
        if cols > max_u and rows > max_v:
            score += 0.4
        elif cols >= max_u or rows >= max_v:
            score += 0.2
        sprite_count = len(opt_data.get("sprites", []))
        if sprite_count > 0:
            score += 0.1

    if dims:
        w, h = dims
        for cell in CANDIDATE_CELL_SIZES:
            if w % cell == 0 and h % cell == 0:
                cols_est = w // cell
                rows_est = h // cell
                if cols_est > max_u and rows_est > max_v:
                    score += 0.2
                    break

    return min(1.0, score)


def run(write_output: bool = True) -> dict:
    """
    Scans KA_assets for item icon sheet candidates.
    Returns {
      "candidates": [{path, score, cols, rows, has_opt}],
      "items": [{itemId, name, iconU, iconV, status, candidates}]
    }
    """
    config.DISCOVERY_DIR.mkdir(parents=True, exist_ok=True)

    # Load Item.csv
    try:
        items = load_items(config.CSV_ITEM)
    except Exception as e:
        warnings.warn(f"icon_sheet_finder: cannot load Item.csv: {e}")
        items = []

    if not items:
        print("[icon_sheet_finder] no items loaded — skipping")
        return {"candidates": [], "items": []}

    # Compute max iconU/iconV per category
    cat_ranges: dict[int, dict] = {}
    for item in items:
        u = item.get("iconU") or 0
        v = item.get("iconV") or 0
        cat = item.get("category") or 0
        if cat not in cat_ranges:
            cat_ranges[cat] = {"max_u": 0, "max_v": 0}
        cat_ranges[cat]["max_u"] = max(cat_ranges[cat]["max_u"], u)
        cat_ranges[cat]["max_v"] = max(cat_ranges[cat]["max_v"], v)

    global_max_u = max((r["max_u"] for r in cat_ranges.values()), default=0)
    global_max_v = max((r["max_v"] for r in cat_ranges.values()), default=0)

    # Scan all subdirectories for PNG candidates
    sheet_candidates: list[dict] = []

    for subdir in config.KA_ASSETS_DIR.iterdir():
        if not subdir.is_dir():
            continue
        for png_path in subdir.glob("*.png"):
            dims = _get_png_dimensions(png_path)
            if dims is None:
                continue

            opt_path = png_path.with_suffix(".opt")
            opt_data = parse_opt(opt_path) if opt_path.exists() else None

            score = _score_sheet(png_path, opt_data, global_max_u, global_max_v, dims)
            if score <= 0:
                continue

            rel = str(png_path.relative_to(config.KA_ASSETS_DIR)).replace("\\", "/")
            sheet_candidates.append({
                "path":     rel,
                "score":    round(score, 3),
                "dims":     list(dims),
                "has_opt":  opt_data is not None,
                "opt_cols": opt_data.get("cols", 0) if opt_data else 0,
                "opt_rows": opt_data.get("rows", 0) if opt_data else 0,
            })

    sheet_candidates.sort(key=lambda c: c["score"], reverse=True)

    # Match items to candidates
    top_candidates = sheet_candidates[:3]

    item_results = []
    for item in items:
        u = item.get("iconU")
        v = item.get("iconV")
        matched = []
        for cand in top_candidates:
            cols = cand["opt_cols"]
            rows = cand["opt_rows"]
            if u is not None and v is not None and cols > u and rows > v:
                matched.append({"path": cand["path"], "confidence": "HIGH" if cand["score"] >= 0.7 else "MEDIUM"})

        if matched:
            status = "candidate"
        elif u is None or v is None:
            status = "no_coords"
        else:
            status = "unresolved"

        item_results.append({
            "itemId":     item["id"],
            "name":       item["name"],
            "category":   item["category"],
            "iconU":      u,
            "iconV":      v,
            "status":     status,
            "candidates": matched,
        })

    result = {
        "global_max_u": global_max_u,
        "global_max_v": global_max_v,
        "candidates":   sheet_candidates[:10],
        "items":        item_results,
    }

    if write_output:
        out_path = config.DISCOVERY_DIR / "unknown_item_icon_sources.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2)
        print(f"[icon_sheet_finder] wrote {out_path}")
        resolved = sum(1 for i in item_results if i["status"] == "candidate")
        unresolved = sum(1 for i in item_results if i["status"] == "unresolved")
        print(f"[icon_sheet_finder] {len(items)} items: {resolved} with candidate sheet, {unresolved} unresolved")
        print(f"[icon_sheet_finder] {len(sheet_candidates)} sheet candidates found")

    return result
