"""
res_mapper.py — discovers the directory mapping for every res value found in all CSVs.

Strategy:
1. Collect all distinct res values from all 9 CSVs
2. For each res value, score every KA_assets subdirectory as a candidate:
   - Primary signal: max img.inf ID in that dir >= max img-column value for this res in CSV
   - Secondary signals: filename pattern matches against CSV entity names
3. Output res_directory_candidates.json
4. Merge confirmed seeds + scored candidates into config.RES_RESOLVED for downstream use
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import config
from parsers.inf_parser import parse_img_inf
from parsers.csv_parser import (
    load_items, load_mapchips, load_monsters, load_terrains,
    load_houses, load_jobs, load_treasures, load_facilities,
)


def _collect_res_img_ranges(
) -> dict[int, dict]:
    """
    For each distinct res value found across all CSVs, collect:
      - max img value seen (for scoring against img.inf entry counts)
      - sample CSV source names (for pattern matching)
      - source CSV names
    Returns {res_value -> {"max_img": int, "sources": [str], "sample_names": [str]}}
    """
    res_data: dict[int, dict] = {}

    def _record(res: Optional[int], img: Optional[int], source: str, name: str = "") -> None:
        if res is None:
            return
        if res not in res_data:
            res_data[res] = {"max_img": 0, "sources": [], "sample_names": []}
        entry = res_data[res]
        if img is not None and img > entry["max_img"]:
            entry["max_img"] = img
        if source not in entry["sources"]:
            entry["sources"].append(source)
        if name and len(entry["sample_names"]) < 5:
            entry["sample_names"].append(name)

    # MapChip
    try:
        for r in load_mapchips(config.CSV_MAPCHIP):
            _record(r["res"], r["img"], "MapChip", r.get("name", ""))
    except Exception as e:
        warnings.warn(f"res_mapper: MapChip load error: {e}")

    # Terrain
    try:
        for r in load_terrains(config.CSV_TERRAIN):
            _record(r["res"], r["img"], "Terrain")
            _record(r["res2"], r["shoesImg"], "Terrain.res2")
    except Exception as e:
        warnings.warn(f"res_mapper: Terrain load error: {e}")

    # Monster
    try:
        for r in load_monsters(config.CSV_MONSTER):
            _record(r["res"], r["img"], "Monster", r.get("name", ""))
    except Exception as e:
        warnings.warn(f"res_mapper: Monster load error: {e}")

    # House
    try:
        for r in load_houses(config.CSV_HOUSE):
            _record(r["res"], r["img"], "House", r.get("name", ""))
    except Exception as e:
        warnings.warn(f"res_mapper: House load error: {e}")

    # Job (all 4 res* fields)
    try:
        for r in load_jobs(config.CSV_JOB):
            for res_field, img_list in [
                (r["resHead"], r["imgHeads"]),
                (r["resBody"], r["imgBodys"]),
                (r["resHand"], r["imgHands"]),
                (r["resFoot"], r["imgFoots"]),
            ]:
                for img in img_list:
                    _record(res_field, img, "Job", r.get("name", ""))
    except Exception as e:
        warnings.warn(f"res_mapper: Job load error: {e}")

    # Treasure
    try:
        for r in load_treasures(config.CSV_TREASURE):
            _record(r["res"], r["img"], "Treasure", r.get("name", ""))
    except Exception as e:
        warnings.warn(f"res_mapper: Treasure load error: {e}")

    return res_data


def _score_directory(
    dir_path: Path,
    res_val: int,
    max_img: int,
    sample_names: list[str],
) -> dict:
    """
    Score a single KA_assets subdirectory as a candidate for the given res value.
    Returns {"dir": str, "matchScore": float, "reason": str, "max_inf_id": int}
    """
    inf_path = dir_path / "img.inf"
    if not inf_path.exists():
        return {"dir": dir_path.name, "matchScore": 0.0, "reason": "no img.inf", "max_inf_id": 0}

    try:
        inf_data = parse_img_inf(inf_path)
    except Exception:
        return {"dir": dir_path.name, "matchScore": 0.0, "reason": "img.inf parse error", "max_inf_id": 0}

    max_inf_id = max(inf_data.keys()) if inf_data else 0
    score = 0.0
    reasons = []

    # Signal 1: max img.inf ID covers max CSV img value
    if max_inf_id >= max_img and max_img > 0:
        score += 0.5
        reasons.append(f"img.inf max_id={max_inf_id} >= csv max_img={max_img}")
    elif max_inf_id > 0:
        # Partial credit if within 2× range
        ratio = min(max_inf_id, max_img) / max(max_inf_id, max_img)
        score += 0.3 * ratio
        reasons.append(f"partial range match: inf={max_inf_id} csv={max_img} ratio={ratio:.2f}")

    # Signal 2: known seed match
    seed_dir = config.RES_SEEDS.get(res_val)
    if seed_dir and seed_dir == dir_path.name:
        score = 1.0
        reasons = [f"confirmed seed: res={res_val} → {dir_path.name}"]

    # Signal 3: directory name appears in sample CSV names (fuzzy)
    dir_name_lower = dir_path.name.lower()
    for name in sample_names:
        if dir_name_lower in name.lower() or name.lower() in dir_name_lower:
            score += 0.2
            reasons.append(f"name hint: '{name}' ~ '{dir_path.name}'")
            break

    # Signal 4: PNG filenames in dir hint at res category
    png_files = list(dir_path.glob("*.png"))[:5]
    for png in png_files:
        stem = png.stem.lower()
        if dir_name_lower in stem:
            score += 0.1
            reasons.append(f"PNG name '{png.name}' matches dir")
            break

    score = min(1.0, score)
    return {
        "dir": dir_path.name,
        "matchScore": round(score, 3),
        "reason": "; ".join(reasons) if reasons else "no signal",
        "max_inf_id": max_inf_id,
    }


def run(write_output: bool = True) -> dict[int, list[dict]]:
    """
    Main entry point.  Returns {res_value -> [scored_candidate, ...]} sorted by score desc.
    Also updates config.RES_RESOLVED in place.
    """
    config.DISCOVERY_DIR.mkdir(parents=True, exist_ok=True)

    res_data = _collect_res_img_ranges()

    all_dirs = [d for d in config.KA_ASSETS_DIR.iterdir() if d.is_dir()]

    output: dict[int, dict] = {}

    for res_val, info in sorted(res_data.items()):
        max_img = info["max_img"]
        sample_names = info["sample_names"]

        # Check confirmed seeds first
        seed_dir = config.RES_SEEDS.get(res_val) or config.RES_OVERRIDES.get(res_val)

        candidates = []
        for d in all_dirs:
            cand = _score_directory(d, res_val, max_img, sample_names)
            candidates.append(cand)

        candidates.sort(key=lambda c: c["matchScore"], reverse=True)

        best = candidates[0] if candidates else None
        if seed_dir:
            status = "confirmed"
        elif best and best["matchScore"] >= 0.5:
            status = "candidate"
        else:
            status = "unresolved"

        output[res_val] = {
            "res": res_val,
            "max_img_in_csv": max_img,
            "sources": info["sources"],
            "sample_names": info["sample_names"],
            "status": status,
            "confirmed_dir": seed_dir,
            "candidates": candidates[:5],  # top 5
        }

    # Populate config.RES_RESOLVED
    config.RES_RESOLVED.clear()
    config.RES_RESOLVED.update(config.RES_SEEDS)
    config.RES_RESOLVED.update(config.RES_OVERRIDES)
    for res_val, entry in output.items():
        if res_val not in config.RES_RESOLVED and entry["status"] == "candidate":
            best_dir = entry["candidates"][0]["dir"] if entry["candidates"] else None
            if best_dir:
                config.RES_RESOLVED[res_val] = best_dir

    if write_output:
        out_path = config.DISCOVERY_DIR / "res_directory_candidates.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(list(output.values()), fh, indent=2)
        print(f"[res_mapper] wrote {out_path}")
        _print_summary(output)

    return output


def _print_summary(output: dict[int, dict]) -> None:
    confirmed = sum(1 for e in output.values() if e["status"] == "confirmed")
    candidate = sum(1 for e in output.values() if e["status"] == "candidate")
    unresolved = sum(1 for e in output.values() if e["status"] == "unresolved")
    print(f"[res_mapper] {len(output)} res values: "
          f"{confirmed} confirmed, {candidate} candidate, {unresolved} unresolved")
    for e in output.values():
        if e["status"] == "unresolved":
            print(f"  UNRESOLVED: res={e['res']} sources={e['sources']} max_img={e['max_img_in_csv']}")
