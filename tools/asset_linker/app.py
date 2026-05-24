from __future__ import annotations

import csv
import json
import os
import re
import socket
from pathlib import Path
from typing import Any

from flask import Flask, Response, abort, jsonify, render_template, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parents[1]
ASSETS_BASE = PROJECT_ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets"
FACILITY_CSV = PROJECT_ROOT / "data" / "Sheet csv" / "KA GameData - Facility_lookup.csv"
BUILDING_CSV = PROJECT_ROOT / "data" / "Sheet csv" / "KA GameData - House.csv"
OUTPUT_DIR = BASE_DIR / "output"
MAPPING_FILE = OUTPUT_DIR / "asset_mapping.json"
PORT = int(os.environ.get("PORT", "5059"))
HOST = os.environ.get("HOST", "127.0.0.1")
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
PIECE_CATEGORIES = {"head", "body", "hand", "foot", "hat", "hair", "eye", "face", "weapon", "accessory", "armor"}
DEBUG = os.environ.get("ASSET_LINKER_DEBUG", "0") in {"1", "true", "yes", "on"}

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["JSON_SORT_KEYS"] = False


def ensure_output_dir() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not MAPPING_FILE.exists():
        MAPPING_FILE.write_text("{}", encoding="utf-8")


def in_asset_root(path: Path) -> bool:
    try:
        path.resolve().relative_to(ASSETS_BASE.resolve())
        return True
    except ValueError:
        return False


def get_network_urls() -> dict[str, str | None]:
    if HOST == "0.0.0.0":
        local_url = f"http://localhost:{PORT}"
    elif HOST in {"127.0.0.1", "localhost"}:
        local_url = f"http://{HOST}:{PORT}"
    else:
        local_url = f"http://{HOST}:{PORT}"

    lan_url = None
    if HOST == "0.0.0.0":
        try:
            host = socket.gethostname()
            ip = socket.gethostbyname(host)
            if ip and not ip.startswith("127."):
                lan_url = f"http://{ip}:{PORT}"
        except OSError:
            lan_url = None
    return {"localUrl": local_url, "lanUrl": lan_url}


def normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def load_buildings() -> list[dict[str, Any]]:
    if FACILITY_CSV.exists():
        csv_path = FACILITY_CSV
        name_index = 1
    elif BUILDING_CSV.exists():
        csv_path = BUILDING_CSV
        name_index = None
    else:
        return []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle)
        rows = [row for row in reader if row and any(cell.strip() for cell in row)]

    if csv_path == FACILITY_CSV:
        data_rows: list[dict[str, Any]] = []
        for row in rows[3:]:
            if len(row) <= name_index:
                continue
            if not row[0].strip() or not row[name_index].strip():
                continue
            try:
                building_id = int(row[0])
            except ValueError:
                continue
            data_rows.append({"id": building_id, "name": row[name_index].strip()})
        return data_rows

    header_row = None
    for row in rows[:5]:
        lowered = [cell.strip().lower() for cell in row]
        if "name" in lowered and "img" in lowered:
            header_row = row
            break

    data_rows = []
    if header_row is not None:
        name_index = [cell.strip().lower() for cell in header_row].index("name")
        id_index = 0
        for row in rows:
            if len(row) > name_index and row[name_index].strip().lower() == "name":
                continue
            if len(row) > name_index and row[name_index].strip():
                try:
                    building_id = int(row[id_index])
                except ValueError:
                    continue
                data_rows.append({"id": building_id, "name": row[name_index].strip()})
    else:
        for row in rows[1:]:
            if len(row) >= 4:
                try:
                    building_id = int(row[0])
                except ValueError:
                    continue
                data_rows.append({"id": building_id, "name": row[3].strip()})

    return data_rows


def scan_assets() -> list[dict[str, Any]]:
    if not ASSETS_BASE.exists():
        if DEBUG:
            print(f"DEBUG: asset root missing {ASSETS_BASE}")
        return []

    if DEBUG:
        print(f"DEBUG: scanning assets in {ASSETS_BASE}")

    assets: list[dict[str, Any]] = []
    for path in sorted(ASSETS_BASE.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
            continue

        relative_path = path.relative_to(ASSETS_BASE).as_posix()
        folder = relative_path.split("/", 1)[0]
        name = path.stem
        asset_url = f"/asset/{relative_path}"
        if DEBUG:
            print(f"DEBUG: found asset {relative_path} -> {asset_url}")
        assets.append({
            "relativePath": relative_path,
            "folder": folder,
            "name": name,
            "filename": path.name,
            "isPiece": folder.lower() in PIECE_CATEGORIES,
            "assetUrl": asset_url,
        })
    if DEBUG:
        print(f"DEBUG: found {len(assets)} assets")
    return assets


def guess_building_for_asset(asset: dict[str, Any], buildings: list[dict[str, Any]]) -> dict[str, Any] | None:
    """
    Match building assets to facility/building records.
    
    WARNING: Do NOT use numeric filename patterns (e.g., building_26.png -> facility 26).
    Building PNG filenames are arbitrary and do not correspond to facility IDs.
    
    The authoritative mapping is: building/img.inf -> MapChip (res=23) -> Facility_lookup.
    For simplicity, this tool only uses name-based fuzzy matching.
    For proper asset->facility linking, use the asset_extractor registry.
    """
    basename = asset["name"].lower()
    folder = asset["folder"].lower()

    if folder != "building":
        if DEBUG:
            print(f"DEBUG: skipping non-building asset for matching: {asset['relativePath']}")
        return None

    # Name-based fuzzy matching only
    for building in buildings:
        normalized_name = normalize_text(building["name"])
        if normalized_name and all(token in basename for token in normalized_name.split() if len(token) > 2):
            return {"buildingId": building["id"], "buildingName": building["name"], "matchType": "name"}

    return None


def build_summary() -> dict[str, Any]:
    buildings = load_buildings()
    assets = scan_assets()
    saved_mapping = load_saved_mapping()
    building_map = {building["id"]: building for building in buildings}

    asset_matches = []
    building_matches: dict[int, dict[str, Any]] = {}
    piece_counts: dict[str, int] = {}

    for asset in assets:
        match = None
        mapping_value = saved_mapping.get(asset["relativePath"])
        if mapping_value is not None:
            try:
                building_id = int(mapping_value)
            except (TypeError, ValueError):
                building_id = None
            if building_id is not None and building_id in building_map:
                match = {
                    "buildingId": building_id,
                    "buildingName": building_map[building_id]["name"],
                    "matchType": "manual",
                }

        if match is None:
            match = guess_building_for_asset(asset, buildings)

        asset["match"] = match
        if asset["isPiece"]:
            piece_counts[asset["folder"]] = piece_counts.get(asset["folder"], 0) + 1
        if match is not None:
            building_matches.setdefault(match["buildingId"], {"buildingId": match["buildingId"], "buildingName": match["buildingName"], "assets": []})
            building_matches[match["buildingId"]]["assets"].append(asset)

    groups: dict[str, int] = {}
    for asset in assets:
        groups[asset["folder"]] = groups.get(asset["folder"], 0) + 1

    unmatched_assets = [asset for asset in assets if asset["match"] is None and not asset["isPiece"]]
    unmatched_buildings = [building for building in buildings if building["id"] not in building_matches]

    return {
        "assets": assets,
        "assetCount": len(assets),
        "groups": groups,
        "pieceCounts": piece_counts,
        "buildings": buildings,
        "buildingMatches": sorted(building_matches.values(), key=lambda value: value["buildingName"]),
        "unmatchedAssets": unmatched_assets,
        "unmatchedBuildings": unmatched_buildings,
        "savedMapping": saved_mapping,
    }


def load_saved_mapping() -> dict[str, Any]:
    if not MAPPING_FILE.exists():
        return {}
    try:
        return json.loads(MAPPING_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


@app.route("/")
def index() -> str:
    return render_template("index.html", network=get_network_urls())


@app.route("/api/summary")
def api_summary() -> Any:
    return jsonify(build_summary())


@app.route("/api/asset/<path:relative_path>")
@app.route("/asset/<path:relative_path>")
def asset_file(relative_path: str) -> Any:
    normalized = Path(relative_path)
    if DEBUG:
        print(f"DEBUG: asset request relative_path={relative_path!r}, normalized={normalized!r}")
    if normalized.is_absolute() or ".." in normalized.parts:
        if DEBUG:
            print(f"DEBUG: invalid asset request {relative_path}")
        abort(404)
    path = (ASSETS_BASE / normalized).resolve()
    if not path.exists() or not in_asset_root(path):
        if DEBUG:
            print(f"DEBUG: asset not served path={path}, exists={path.exists()}, in_root={in_asset_root(path)}")
        abort(404)
    if DEBUG:
        print(f"DEBUG: serving asset {path}")
    return send_from_directory(str(ASSETS_BASE), normalized.as_posix())


@app.route("/api/mapping")
def api_mapping() -> Any:
    return jsonify(load_saved_mapping())


@app.route("/api/mapping", methods=["POST"])
def api_save_mapping() -> Any:
    if not request.is_json:
        return jsonify({"error": "Expected JSON body"}), 400
    mapping = request.get_json()
    if not isinstance(mapping, dict):
        return jsonify({"error": "Expected JSON object"}), 400
    ensure_output_dir()
    MAPPING_FILE.write_text(json.dumps(mapping, indent=2, ensure_ascii=False), encoding="utf-8")
    return jsonify({"saved": True, "path": str(MAPPING_FILE.relative_to(PROJECT_ROOT))})


if __name__ == "__main__":
    ensure_output_dir()
    app.run(host=HOST, port=PORT)
