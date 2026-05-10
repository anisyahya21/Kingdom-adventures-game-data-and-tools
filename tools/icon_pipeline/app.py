from __future__ import annotations

import csv
import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from flask import Flask, Response, jsonify, render_template, request, send_from_directory
from PIL import Image
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parents[1]

INPUT_DIR = BASE_DIR / "input" / "screenshots"
PROCESSED_INPUT_DIR = BASE_DIR / "input" / "processed_screenshots"
RAW_CROPS_DIR = BASE_DIR / "output" / "raw_crops"
MAPPED_ICONS_DIR = BASE_DIR / "output" / "mapped_icons"
DEBUG_DIR = BASE_DIR / "output" / "debug"
MAPPING_JSON = BASE_DIR / "output" / "icon_mapping.json"
MAPPING_CSV = BASE_DIR / "output" / "icon_mapping.csv"
EQUIPMENT_CONFIG_JSON = BASE_DIR / "output" / "equipment_crop_config.json"
RAW_CROP_METADATA_JSON = BASE_DIR / "output" / "raw_crop_metadata.json"
CAPTURE_LOG_JSON = BASE_DIR / "output" / "capture_log.json"
EQUIPMENT_GOALS_JSON = BASE_DIR / "output" / "equipment_capture_goals.json"
BACKUP_DIR = BASE_DIR / "output" / "backups"
KA_SHARED_JSON = PROJECT_ROOT / "artifacts" / "api-server" / "data" / "ka_shared.json"
KA_API_BASE = os.environ.get("KA_API_BASE", "http://127.0.0.1:3001/api/ka")

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg"}
NAME_SOURCE_FILES = [
    PROJECT_ROOT / "data" / "sheet-research" / "raw-copies" / "KA GameData - Equip.csv",
    PROJECT_ROOT / "data" / "Sheet csv" / "KA GameData - Item.csv",
]

EQUIPMENT_NAME_OVERRIDES = {
    "192": "B/ Legendary Shield (B)",
    "198": "B/ Legendary Shield (R)",
    "235": "E/ Hat (B)",
    "237": "E/ Hat (R)",
}

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 256 * 1024 * 1024

EVENT_SUBSCRIBERS: list[queue.Queue[str]] = []


def broadcast_event(event_name: str) -> None:
    stale: list[queue.Queue[str]] = []
    for subscriber in EVENT_SUBSCRIBERS:
        try:
            subscriber.put_nowait(event_name)
        except queue.Full:
            stale.append(subscriber)
    for subscriber in stale:
        if subscriber in EVENT_SUBSCRIBERS:
            EVENT_SUBSCRIBERS.remove(subscriber)


def ensure_dirs() -> None:
    for path in [INPUT_DIR, PROCESSED_INPUT_DIR, RAW_CROPS_DIR, MAPPED_ICONS_DIR, DEBUG_DIR, BACKUP_DIR]:
        path.mkdir(parents=True, exist_ok=True)
    if not MAPPING_JSON.exists():
        MAPPING_JSON.write_text("{}", encoding="utf-8")
    if not MAPPING_CSV.exists():
        write_mapping_csv({})


def is_allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def image_files(path: Path) -> list[str]:
    if not path.exists():
        return []
    return sorted(p.name for p in path.iterdir() if p.is_file() and is_allowed_file(p.name))


def load_mapping() -> dict[str, str]:
    ensure_dirs()
    try:
        data = json.loads(MAPPING_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return {str(k): str(v) for k, v in data.items() if str(v).strip()}


def write_mapping_csv(mapping: dict[str, str]) -> None:
    with MAPPING_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["raw_filename", "mapped_name"])
        for raw_filename, mapped_name in sorted(mapping.items()):
            writer.writerow([raw_filename, mapped_name])


def save_mapping(mapping: dict[str, str]) -> None:
    cleaned = {
        str(raw_filename): str(mapped_name).strip()
        for raw_filename, mapped_name in mapping.items()
        if str(mapped_name).strip()
    }
    MAPPING_JSON.write_text(json.dumps(cleaned, indent=2, ensure_ascii=False), encoding="utf-8")
    write_mapping_csv(cleaned)


def png_data_url(path: Path) -> str:
    import base64

    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def normalize_name(value: str) -> str:
    value = re.sub(r"<pic=[^>]*>", "", value or "", flags=re.IGNORECASE).strip()
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"^([A-Z])\s*/\s+", r"\1- ", value)
    return value


def website_equipment_name(value: str) -> str:
    return re.sub(r"^([FSABCDE])-\s+", r"\1/ ", value.strip(), flags=re.IGNORECASE)


def load_ka_shared() -> dict[str, object]:
    if not KA_SHARED_JSON.exists():
        return {}
    try:
        return json.loads(KA_SHARED_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def write_ka_shared(shared: dict[str, object]) -> None:
    KA_SHARED_JSON.parent.mkdir(parents=True, exist_ok=True)
    KA_SHARED_JSON.write_text(json.dumps(shared, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def try_put_equip_icons_to_api(equip_icons: dict[str, str]) -> bool:
    payload = json.dumps(
        {
            "data": equip_icons,
            "history": {
                "userName": "Icon Pipeline",
                "changeType": "equip-icon",
                "description": "Published mapped equipment icons from local icon pipeline",
            },
        }
    ).encode("utf-8")
    request_obj = urllib.request.Request(
        f"{KA_API_BASE}/shared/icons/equip",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    try:
        with urllib.request.urlopen(request_obj, timeout=2) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def publish_mapped_icons_to_website(mapping: dict[str, str]) -> dict[str, object]:
    shared = load_ka_shared()
    equip_icons = shared.get("equipIcons")
    if not isinstance(equip_icons, dict):
        equip_icons = {}

    published = 0
    missing_sources: list[str] = []
    skipped: list[str] = []

    for raw_filename, mapped_name in sorted(mapping.items()):
        source = RAW_CROPS_DIR / raw_filename
        if not source.exists():
            missing_sources.append(raw_filename)
            continue
        if source.suffix.lower() != ".png":
            skipped.append(raw_filename)
            continue

        website_name = website_equipment_name(mapped_name)
        data_url = png_data_url(source)
        equip_icons[f"equip:{website_name}"] = data_url
        # Keep bare-name keys too, because a few consumers historically used them.
        equip_icons[website_name] = data_url
        published += 1

    shared["equipIcons"] = equip_icons
    write_ka_shared(shared)
    api_updated = try_put_equip_icons_to_api(equip_icons)
    return {
        "published": published,
        "missingSources": missing_sources,
        "skipped": skipped,
        "apiUpdated": api_updated,
        "sharedFile": str(KA_SHARED_JSON.relative_to(PROJECT_ROOT)),
    }


def equipment_display_name(row: dict[str, str]) -> str:
    raw_id = str(row.get("") or row.get("id") or "").strip()
    return normalize_name(EQUIPMENT_NAME_OVERRIDES.get(raw_id, row.get("name", "")))


def load_name_source(path: Path) -> list[str]:
    if not path.exists():
        return []

    names: list[str] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))

    header_index = None
    name_col = None
    for index, row in enumerate(rows[:10]):
        lowered = [cell.strip().lower() for cell in row]
        if "name" in lowered:
            header_index = index
            name_col = lowered.index("name")
            break

    if header_index is None or name_col is None:
        return []

    id_col = None
    header = [cell.strip().lower() for cell in rows[header_index]]
    if "" in header:
        id_col = header.index("")
    elif "id" in header:
        id_col = header.index("id")

    is_equipment_source = path == NAME_SOURCE_FILES[0]
    for row in rows[header_index + 1 :]:
        if len(row) <= name_col:
            continue
        raw_id = row[id_col].strip() if id_col is not None and len(row) > id_col else ""
        name = normalize_name(EQUIPMENT_NAME_OVERRIDES.get(raw_id, row[name_col])) if is_equipment_source else normalize_name(row[name_col])
        if name and name.lower() != "name":
            names.append(name)
    return names


def load_raw_crop_metadata() -> dict[str, dict[str, str]]:
    if not RAW_CROP_METADATA_JSON.exists():
        return {}
    try:
        data = json.loads(RAW_CROP_METADATA_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def save_raw_crop_metadata(metadata: dict[str, dict[str, str]]) -> None:
    RAW_CROP_METADATA_JSON.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def load_capture_log() -> list[dict[str, str]]:
    if not CAPTURE_LOG_JSON.exists():
        return []
    try:
        data = json.loads(CAPTURE_LOG_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    entries = []
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        entries.append(
            {
                "id": str(item.get("id", "")),
                "name": name,
                "slotKind": str(item.get("slotKind", "")),
                "note": str(item.get("note", "")),
            }
        )
    return entries


def save_capture_log(entries: list[dict[str, str]]) -> None:
    CAPTURE_LOG_JSON.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")


SLOT_ORDER = ["head", "weapon", "shield", "armor", "accessory"]
RANKED_EQUIPMENT_RE = re.compile(r"^[FSABCDE]-\s+")


def load_equipment_goals() -> dict[str, object]:
    if not EQUIPMENT_GOALS_JSON.exists():
        return {"goals": {}, "skipped": []}
    try:
        data = json.loads(EQUIPMENT_GOALS_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"goals": {}, "skipped": []}
    if not isinstance(data, dict):
        return {"goals": {}, "skipped": []}
    goals = data.get("goals") if isinstance(data.get("goals"), dict) else {}
    skipped = data.get("skipped") if isinstance(data.get("skipped"), list) else []
    return {"goals": goals, "skipped": skipped}


def save_equipment_goals(goals: dict[str, object]) -> None:
    EQUIPMENT_GOALS_JSON.write_text(json.dumps(goals, indent=2, ensure_ascii=False), encoding="utf-8")


def infer_slot_for_equipment_name(name: str) -> str:
    target = website_equipment_name(name).lower()
    for slot_kind, names in load_equipment_names_by_slot().items():
        if any(website_equipment_name(candidate).lower() == target for candidate in names):
            return slot_kind
    return ""


def skipped_goal_records() -> list[dict[str, str]]:
    skipped = load_equipment_goals().get("skipped", [])
    if not isinstance(skipped, list):
        return []
    records: list[dict[str, str]] = []
    for item in skipped:
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            slot_kind = str(item.get("slotKind", "")).strip()
        else:
            name = str(item).strip()
            slot_kind = infer_slot_for_equipment_name(name)
        if name:
            records.append({"name": name, "slotKind": slot_kind})
    return records


def equipment_progress() -> dict[str, int]:
    all_targets = {
        website_equipment_name(name).lower()
        for names in load_equipment_names_by_slot().values()
        for name in names
    }
    fulfilled = {
        website_equipment_name(name).lower()
        for name in load_mapping().values()
        if name
    }
    fulfilled.update(
        website_equipment_name(entry["name"]).lower()
        for entry in load_capture_log()
        if entry.get("name")
    )
    skipped = {
        website_equipment_name(record["name"]).lower()
        for record in skipped_goal_records()
    }
    fulfilled_in_targets = fulfilled & all_targets
    skipped_in_targets = (skipped & all_targets) - fulfilled_in_targets
    neither = all_targets - fulfilled_in_targets - skipped_in_targets
    return {
        "total": len(all_targets),
        "fulfilled": len(fulfilled_in_targets),
        "skipped": len(skipped_in_targets),
        "neitherMappedNorSkipped": len(neither),
    }


def cleanup_fulfilled_planning_state() -> dict[str, int]:
    mapped_names = {
        website_equipment_name(name).lower()
        for name in load_mapping().values()
        if name
    }

    capture_log = load_capture_log()
    kept_capture_log = [
        entry for entry in capture_log
        if website_equipment_name(entry["name"]).lower() not in mapped_names
    ]
    save_capture_log(kept_capture_log)

    goals_state = load_equipment_goals()
    goals = goals_state.get("goals", {})
    if not isinstance(goals, dict):
        goals = {}
    skipped = goals_state.get("skipped", [])
    if not isinstance(skipped, list):
        skipped = []

    kept_goals = {
        str(slot): str(name)
        for slot, name in goals.items()
        if website_equipment_name(str(name)).lower() not in mapped_names
    }
    kept_skipped = []
    for item in skipped:
        item_name = str(item.get("name", "") if isinstance(item, dict) else item).strip()
        if item_name and website_equipment_name(item_name).lower() not in mapped_names:
            kept_skipped.append(item)

    goals_state["goals"] = kept_goals
    goals_state["skipped"] = kept_skipped
    save_equipment_goals(goals_state)
    ensure_equipment_goals()

    return {
        "removedCaptureLog": len(capture_log) - len(kept_capture_log),
        "removedGoals": len(goals) - len(kept_goals),
        "removedSkipped": len(skipped) - len(kept_skipped),
    }


def create_backup_snapshot() -> Path:
    ensure_dirs()
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    backup_path = BACKUP_DIR / f"icon_pipeline_backup_{timestamp}.zip"
    include_files = [
        MAPPING_JSON,
        MAPPING_CSV,
        RAW_CROP_METADATA_JSON,
        CAPTURE_LOG_JSON,
        EQUIPMENT_GOALS_JSON,
        EQUIPMENT_CONFIG_JSON,
    ]
    include_dirs = [RAW_CROPS_DIR, MAPPED_ICONS_DIR, DEBUG_DIR, PROCESSED_INPUT_DIR]
    with zipfile.ZipFile(backup_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in include_files:
            if path.exists():
                archive.write(path, path.relative_to(BASE_DIR))
        for directory in include_dirs:
            if not directory.exists():
                continue
            for path in directory.rglob("*"):
                if path.is_file():
                    archive.write(path, path.relative_to(BASE_DIR))
    return backup_path


def done_equipment_names() -> set[str]:
    done = {website_equipment_name(name) for name in load_mapping().values()}
    done.update(website_equipment_name(entry["name"]) for entry in load_capture_log())
    return done


def remove_capture_log_name(name: str) -> bool:
    target = website_equipment_name(name).lower()
    entries = load_capture_log()
    kept = [entry for entry in entries if website_equipment_name(entry["name"]).lower() != target]
    if len(kept) == len(entries):
        return False
    save_capture_log(kept)
    return True


def requeue_requested_item(name: str, slot_kind: str) -> None:
    if not name or slot_kind not in SLOT_ORDER:
        return
    goals_state = load_equipment_goals()
    goals = goals_state.get("goals", {})
    if not isinstance(goals, dict):
        goals = {}
    skipped = goals_state.get("skipped", [])
    if not isinstance(skipped, list):
        skipped = []

    target_key = website_equipment_name(name).lower()
    goals_contains = any(website_equipment_name(str(value)).lower() == target_key for value in goals.values())
    skipped_contains = any(
        website_equipment_name(str(item.get("name", "") if isinstance(item, dict) else item)).lower() == target_key
        for item in skipped
    )
    if not goals_contains and not skipped_contains:
        skipped.insert(0, {"name": name, "slotKind": slot_kind})
    goals_state["goals"] = goals
    goals_state["skipped"] = skipped
    save_equipment_goals(goals_state)


def handle_mapping_corrections(previous_mapping: dict[str, str], next_mapping: dict[str, str]) -> list[str]:
    metadata = load_raw_crop_metadata()
    requeued: list[str] = []
    for raw_filename, new_name in next_mapping.items():
        old_name = previous_mapping.get(raw_filename, "")
        if not old_name or website_equipment_name(old_name).lower() == website_equipment_name(new_name).lower():
            continue
        crop_metadata = metadata.get(raw_filename, {})
        requested_name = str(crop_metadata.get("requestedName", "")).strip()
        slot_kind = str(crop_metadata.get("slotKind", "")).strip()
        if not requested_name:
            continue
        if website_equipment_name(requested_name).lower() == website_equipment_name(new_name).lower():
            continue
        remove_capture_log_name(requested_name)
        requeue_requested_item(requested_name, slot_kind)
        crop_metadata["correctedFromRequestedName"] = requested_name
        crop_metadata["requestedName"] = ""
        metadata[raw_filename] = crop_metadata
        requeued.append(requested_name)
    if requeued:
        save_raw_crop_metadata(metadata)
    return requeued


def remove_raw_crop_file(raw_filename: str, metadata: dict[str, dict[str, str]] | None = None) -> None:
    target = RAW_CROPS_DIR / Path(raw_filename).name
    if target.exists() and target.is_file():
        target.unlink()
    if metadata is not None:
        metadata.pop(raw_filename, None)


def choose_next_goal(slot_kind: str, avoid: set[str] | None = None) -> str:
    avoid = avoid or set()
    names_by_slot = load_equipment_names_by_slot()
    done = done_equipment_names()
    goals_state = load_equipment_goals()
    current_goals = goals_state.get("goals", {})
    active = {website_equipment_name(str(value)) for value in current_goals.values() if value}
    skipped = {website_equipment_name(record["name"]) for record in skipped_goal_records()}
    for name in names_by_slot.get(slot_kind, []):
        if not RANKED_EQUIPMENT_RE.match(name):
            continue
        website_name = website_equipment_name(name)
        if website_name in done or website_name in active or website_name in skipped or website_name in avoid:
            continue
        return name
    return ""


def ensure_equipment_goals() -> dict[str, object]:
    goals_state = load_equipment_goals()
    goals = {str(k): str(v) for k, v in (goals_state.get("goals") or {}).items() if str(v).strip()}
    changed = False
    for slot_kind in SLOT_ORDER:
        if not goals.get(slot_kind):
            next_goal = choose_next_goal(slot_kind)
            if next_goal:
                goals[slot_kind] = next_goal
                changed = True
    goals_state["goals"] = goals
    if changed:
        save_equipment_goals(goals_state)
    return goals_state


def advance_equipment_goals(completed_slots: list[str]) -> dict[str, object]:
    goals_state = load_equipment_goals()
    goals = {str(k): str(v) for k, v in (goals_state.get("goals") or {}).items() if str(v).strip()}
    for slot_kind in completed_slots:
        goals.pop(slot_kind, None)
    goals_state["goals"] = goals
    save_equipment_goals(goals_state)
    return ensure_equipment_goals()


def load_equipment_names_by_slot() -> dict[str, list[str]]:
    path = NAME_SOURCE_FILES[0]
    slots = {
        "head": set(),
        "weapon": set(),
        "shield": set(),
        "armor": set(),
        "accessory": set(),
    }
    if not path.exists():
        return {key: [] for key in slots}

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))

    if not rows:
        return {key: [] for key in slots}

    header = [cell.strip().lower() for cell in rows[0]]
    try:
        name_col = header.index("name")
        category_col = header.index("category")
        type_col = header.index("type")
    except ValueError:
        return {key: [] for key in slots}

    id_col = 0
    for row in rows[1:]:
        if len(row) <= max(name_col, category_col, type_col, id_col):
            continue
        raw_id = row[id_col].strip()
        name = normalize_name(EQUIPMENT_NAME_OVERRIDES.get(raw_id, row[name_col]))
        if not name:
            continue
        category = str(row[category_col]).strip()
        item_type = str(row[type_col]).strip()
        if category == "0":
            slots["weapon"].add(name)
        if item_type == "11":
            slots["shield"].add(name)
        elif item_type == "12":
            slots["armor"].add(name)
        elif item_type == "13":
            slots["head"].add(name)
        elif item_type == "14":
            slots["accessory"].add(name)

    return {key: sorted(values) for key, values in slots.items()}


def name_source_status() -> list[dict[str, object]]:
    statuses = []
    labels = ["Equipment", "Items"]
    for label, path in zip(labels, NAME_SOURCE_FILES):
        names = load_name_source(path)
        statuses.append(
            {
                "label": label,
                "path": str(path.relative_to(PROJECT_ROOT)) if path.exists() else str(path),
                "exists": path.exists(),
                "rows": len(names),
                "unique": len(set(names)),
            }
        )
    return statuses


def duplicate_names(mapping: dict[str, str]) -> set[str]:
    counts: dict[str, int] = {}
    for name in mapping.values():
        counts[name] = counts.get(name, 0) + 1
    return {name for name, count in counts.items() if count > 1}


def exact_image_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def duplicate_image_groups(paths: list[Path]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    for path in paths:
        try:
            groups.setdefault(exact_image_hash(path), []).append(path.name)
        except OSError:
            continue

    duplicate_lookup: dict[str, list[str]] = {}
    for group in groups.values():
        if len(group) < 2:
            continue
        sorted_group = sorted(group)
        for name in sorted_group:
            duplicate_lookup[name] = [other for other in sorted_group if other != name]
    return duplicate_lookup


def default_equipment_boxes() -> list[dict[str, int | str]]:
    return [
        {"label": "slot_1", "left": 833, "top": 1610, "right": 974, "bottom": 1751},
        {"label": "slot_2", "left": 981, "top": 1610, "right": 1122, "bottom": 1751},
        {"label": "slot_3", "left": 1128, "top": 1610, "right": 1269, "bottom": 1751},
        {"label": "slot_4", "left": 1275, "top": 1610, "right": 1416, "bottom": 1751},
        {"label": "slot_5", "left": 1422, "top": 1610, "right": 1563, "bottom": 1751},
    ]


def load_equipment_config() -> dict[str, object]:
    if not EQUIPMENT_CONFIG_JSON.exists():
        return {"expectedScreenSize": [1668, 2388], "boxes": default_equipment_boxes()}
    try:
        data = json.loads(EQUIPMENT_CONFIG_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"expectedScreenSize": [1668, 2388], "boxes": default_equipment_boxes()}
    if not isinstance(data, dict) or not isinstance(data.get("boxes"), list):
        return {"expectedScreenSize": [1668, 2388], "boxes": default_equipment_boxes()}
    return data


def save_equipment_config(data: dict[str, object]) -> None:
    boxes = []
    for index, box in enumerate(data.get("boxes", []), start=1):
        if not isinstance(box, dict):
            continue
        left = int(box["left"])
        top = int(box["top"])
        right = int(box["right"])
        bottom = int(box["bottom"])
        if right <= left or bottom <= top:
            raise ValueError("Crop boxes must have positive width and height.")
        boxes.append(
            {
                "label": str(box.get("label") or f"slot_{index}"),
                "left": left,
                "top": top,
                "right": right,
                "bottom": bottom,
            }
        )
    if len(boxes) != 5:
        raise ValueError("Equipment crop config must contain exactly 5 boxes.")
    output = {"expectedScreenSize": data.get("expectedScreenSize", [1668, 2388]), "boxes": boxes}
    EQUIPMENT_CONFIG_JSON.write_text(json.dumps(output, indent=2), encoding="utf-8")


def run_script(script_name: str, extra_env: dict[str, str] | None = None) -> tuple[int, str]:
    script_path = BASE_DIR / script_name
    if not script_path.exists():
        return 1, f"Missing script: {script_path}"

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(PROJECT_ROOT),
        env={**os.environ, **(extra_env or {})},
        text=True,
        capture_output=True,
        check=False,
    )
    output = (result.stdout or "").strip()
    error = (result.stderr or "").strip()
    combined = "\n".join(part for part in [output, error] if part)
    return result.returncode, combined


@app.route("/")
def index():
    ensure_dirs()
    return render_template("index.html")


@app.route("/api/events")
def events():
    subscriber: queue.Queue[str] = queue.Queue(maxsize=20)
    EVENT_SUBSCRIBERS.append(subscriber)

    def stream():
        try:
            yield "event: connected\ndata: ok\n\n"
            while True:
                try:
                    event_name = subscriber.get(timeout=25)
                    yield f"event: {event_name}\ndata: {int(time.time())}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            if subscriber in EVENT_SUBSCRIBERS:
                EVENT_SUBSCRIBERS.remove(subscriber)

    return Response(stream(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.route("/api/state")
def state():
    ensure_dirs()
    mapping = load_mapping()
    metadata = load_raw_crop_metadata()
    dupes = duplicate_names(mapping)
    raw_paths = sorted(p for p in RAW_CROPS_DIR.iterdir() if p.is_file() and p.suffix.lower() == ".png")
    duplicate_images = duplicate_image_groups(raw_paths)
    crops = []
    for filename in [path.name for path in raw_paths]:
        mapped_name = mapping.get(filename, "")
        crop_metadata = metadata.get(filename, {})
        crops.append(
            {
                "filename": filename,
                "url": f"/raw_crops/{filename}",
                "mappedName": mapped_name,
                "isDuplicate": bool(mapped_name and mapped_name in dupes),
                "slotKind": crop_metadata.get("slotKind", ""),
                "slotIndex": crop_metadata.get("slotIndex", ""),
                "sourceScreenshot": crop_metadata.get("sourceScreenshot", ""),
                "duplicateImages": duplicate_images.get(filename, []),
            }
        )

    names = sorted(set(name for source in NAME_SOURCE_FILES for name in load_name_source(source)))
    equipmentNamesBySlot = load_equipment_names_by_slot()
    return jsonify(
        {
            "screenshots": image_files(INPUT_DIR),
            "processedScreenshots": image_files(PROCESSED_INPUT_DIR),
            "crops": crops,
            "names": names,
            "equipmentNamesBySlot": equipmentNamesBySlot,
            "nameSources": name_source_status(),
            "mapping": mapping,
            "duplicateNames": sorted(dupes),
            "debugImages": image_files(DEBUG_DIR),
            "captureLog": load_capture_log(),
            "equipmentGoals": ensure_equipment_goals().get("goals", {}),
            "skippedEquipmentGoals": skipped_goal_records(),
            "equipmentProgress": equipment_progress(),
        }
    )


@app.route("/api/equipment-config")
def equipment_config():
    screenshots = image_files(INPUT_DIR)
    return jsonify(
        {
            "config": load_equipment_config(),
            "preview": f"/input/screenshots/{screenshots[0]}" if screenshots else "",
        }
    )


@app.route("/api/equipment-config", methods=["POST"])
def update_equipment_config():
    payload = request.get_json(silent=True) or {}
    try:
        save_equipment_config(payload)
    except (KeyError, TypeError, ValueError) as error:
        return jsonify({"ok": False, "error": str(error)}), 400
    return jsonify({"ok": True, "config": load_equipment_config()})


@app.route("/api/upload", methods=["POST"])
def upload():
    ensure_dirs()
    saved = 0
    skipped: list[str] = []
    for uploaded in request.files.getlist("screenshots"):
        if not uploaded or not uploaded.filename:
            continue
        if not is_allowed_file(uploaded.filename):
            skipped.append(uploaded.filename)
            continue
        safe_name = secure_filename(uploaded.filename)
        if not safe_name:
            skipped.append(uploaded.filename)
            continue

        target = INPUT_DIR / safe_name
        stem = target.stem
        suffix = target.suffix
        counter = 2
        while target.exists():
            target = INPUT_DIR / f"{stem}_{counter}{suffix}"
            counter += 1
        uploaded.save(target)
        saved += 1
    if saved:
        broadcast_event("state-changed")
    return jsonify({"saved": saved, "skipped": skipped})


@app.route("/api/uploads", methods=["DELETE"])
def clear_uploads():
    ensure_dirs()
    removed = 0
    for path in INPUT_DIR.iterdir():
        if path.is_file() and is_allowed_file(path.name):
            path.unlink()
            removed += 1
    if removed:
        broadcast_event("state-changed")
    return jsonify({"removed": removed})


@app.route("/api/run/<cropper>", methods=["POST"])
def run_cropper(cropper: str):
    scripts = {
        "equipment": "crop_profile_equipment.py",
        "inventory": "crop_inventory_items.py",
    }
    script_name = scripts.get(cropper)
    if not script_name:
        return jsonify({"ok": False, "log": f"Unknown cropper: {cropper}"}), 404
    code, log = run_script(script_name)
    broadcast_event("state-changed")
    return jsonify({"ok": code == 0, "exitCode": code, "log": log})


@app.route("/api/equipment-goals/skip/<slot_kind>", methods=["POST"])
def skip_equipment_goal(slot_kind: str):
    if slot_kind not in SLOT_ORDER:
        return jsonify({"ok": False, "error": "Unknown slot."}), 404
    goals_state = load_equipment_goals()
    goals = goals_state.get("goals", {})
    if not isinstance(goals, dict):
        goals = {}
    skipped = goals_state.get("skipped", [])
    if not isinstance(skipped, list):
        skipped = []
    current = str(goals.get(slot_kind, "")).strip()
    if current:
        skipped.append({"name": current, "slotKind": slot_kind})
    goals.pop(slot_kind, None)
    goals_state["goals"] = goals
    goals_state["skipped"] = skipped
    save_equipment_goals(goals_state)
    next_state = ensure_equipment_goals()
    broadcast_event("state-changed")
    return jsonify({"ok": True, "goals": next_state.get("goals", {})})


@app.route("/api/equipment-goals/restore", methods=["POST"])
def restore_equipment_goal():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    slot_kind = str(payload.get("slotKind", "")).strip() or infer_slot_for_equipment_name(name)
    if not name or slot_kind not in SLOT_ORDER:
        return jsonify({"ok": False, "error": "Name and valid slot are required."}), 400

    goals_state = load_equipment_goals()
    goals = goals_state.get("goals", {})
    if not isinstance(goals, dict):
        goals = {}
    skipped = goals_state.get("skipped", [])
    if not isinstance(skipped, list):
        skipped = []

    target_key = website_equipment_name(name).lower()
    filtered_skipped = []
    for item in skipped:
        item_name = str(item.get("name", "") if isinstance(item, dict) else item).strip()
        if website_equipment_name(item_name).lower() != target_key:
            filtered_skipped.append(item)

    goals[slot_kind] = name
    goals_state["goals"] = goals
    goals_state["skipped"] = filtered_skipped
    save_equipment_goals(goals_state)
    broadcast_event("state-changed")
    return jsonify({"ok": True, "goals": goals, "skipped": skipped_goal_records()})


@app.route("/api/equipment-goals/unskip", methods=["POST"])
def unskip_equipment_goal():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify({"ok": False, "error": "Name is required."}), 400
    goals_state = load_equipment_goals()
    skipped = goals_state.get("skipped", [])
    if not isinstance(skipped, list):
        skipped = []
    target_key = website_equipment_name(name).lower()
    goals_state["skipped"] = [item for item in skipped if website_equipment_name(str(item)).lower() != target_key]
    save_equipment_goals(goals_state)
    next_state = ensure_equipment_goals()
    broadcast_event("state-changed")
    return jsonify({"ok": True, "goals": next_state.get("goals", {}), "skipped": skipped_goal_records()})


@app.route("/api/equipment-goals/process", methods=["POST"])
def process_goal_screenshot():
    ensure_dirs()
    before = set(image_files(RAW_CROPS_DIR))
    goals = ensure_equipment_goals().get("goals", {})
    queued_screenshots = image_files(INPUT_DIR)
    if not queued_screenshots:
        return jsonify({"ok": False, "error": "Upload one profile screenshot first."}), 400
    if len(queued_screenshots) != 1:
        return jsonify({"ok": False, "error": f"Goal mode needs exactly 1 uploaded screenshot. Current queue has {len(queued_screenshots)}. Clear uploads or process the old queue first."}), 400

    code, log = run_script("crop_profile_equipment.py")
    after = set(image_files(RAW_CROPS_DIR))
    created = sorted(after - before)
    metadata = load_raw_crop_metadata()
    mapping = load_mapping()
    capture_log = load_capture_log()
    capture_keys = {website_equipment_name(entry["name"]).lower() for entry in capture_log}
    completed_slots: list[str] = []

    for raw_filename in created:
        slot_kind = metadata.get(raw_filename, {}).get("slotKind", "")
        goal_name = str(goals.get(slot_kind, "")).strip() if isinstance(goals, dict) else ""
        if not slot_kind or not goal_name:
            remove_raw_crop_file(raw_filename, metadata)
            continue
        mapping[raw_filename] = goal_name
        metadata.setdefault(raw_filename, {})["requestedName"] = goal_name
        completed_slots.append(slot_kind)
        website_name = website_equipment_name(goal_name)
        if website_name.lower() not in capture_keys:
            capture_log.insert(
                0,
                {
                    "id": f"capture_{int(time.time() * 1000)}_{slot_kind}",
                    "name": goal_name,
                    "slotKind": slot_kind,
                    "note": "auto from requested screenshot",
                },
            )
            capture_keys.add(website_name.lower())

    save_mapping(mapping)
    save_raw_crop_metadata(metadata)
    save_capture_log(capture_log)
    next_goals = advance_equipment_goals(completed_slots)
    publish_result = publish_mapped_icons_to_website(mapping)
    broadcast_event("state-changed")
    return jsonify(
        {
            "ok": code == 0,
            "exitCode": code,
            "log": log,
            "created": created,
            "mapped": len(completed_slots),
            "goals": next_goals.get("goals", {}),
            "publish": publish_result,
        }
    )


@app.route("/api/equipment-goals/upload-process", methods=["POST"])
def upload_and_process_goal_screenshot():
    ensure_dirs()
    uploaded = request.files.get("screenshot")
    if not uploaded or not uploaded.filename:
        return jsonify({"ok": False, "error": "Choose one screenshot first."}), 400
    if not is_allowed_file(uploaded.filename):
        return jsonify({"ok": False, "error": "Screenshot must be PNG/JPG/JPEG."}), 400

    safe_name = secure_filename(uploaded.filename) or "goal_screenshot.png"
    target = INPUT_DIR / f"goal_{int(time.time() * 1000)}_{safe_name}"
    uploaded.save(target)

    before = set(image_files(RAW_CROPS_DIR))
    goals = ensure_equipment_goals().get("goals", {})
    code, log = run_script("crop_profile_equipment.py", {"ICON_PIPELINE_SINGLE_SCREENSHOT": str(target)})
    after = set(image_files(RAW_CROPS_DIR))
    created = sorted(after - before)
    metadata = load_raw_crop_metadata()
    mapping = load_mapping()
    capture_log = load_capture_log()
    capture_keys = {website_equipment_name(entry["name"]).lower() for entry in capture_log}
    completed_slots: list[str] = []

    for raw_filename in created:
        slot_kind = metadata.get(raw_filename, {}).get("slotKind", "")
        goal_name = str(goals.get(slot_kind, "")).strip() if isinstance(goals, dict) else ""
        if not slot_kind or not goal_name:
            remove_raw_crop_file(raw_filename, metadata)
            continue
        mapping[raw_filename] = goal_name
        metadata.setdefault(raw_filename, {})["requestedName"] = goal_name
        completed_slots.append(slot_kind)
        website_name = website_equipment_name(goal_name)
        if website_name.lower() not in capture_keys:
            capture_log.insert(
                0,
                {
                    "id": f"capture_{int(time.time() * 1000)}_{slot_kind}",
                    "name": goal_name,
                    "slotKind": slot_kind,
                    "note": "auto from requested screenshot",
                },
            )
            capture_keys.add(website_name.lower())

    save_mapping(mapping)
    save_raw_crop_metadata(metadata)
    save_capture_log(capture_log)
    next_goals = advance_equipment_goals(completed_slots)
    publish_result = publish_mapped_icons_to_website(mapping)
    broadcast_event("state-changed")
    return jsonify(
        {
            "ok": code == 0,
            "exitCode": code,
            "log": log,
            "created": created,
            "mapped": len(completed_slots),
            "goals": next_goals.get("goals", {}),
            "publish": publish_result,
        }
    )


@app.route("/api/mapping", methods=["POST"])
def update_mapping():
    ensure_dirs()
    payload = request.get_json(silent=True) or {}
    incoming = payload.get("mapping", {})
    if not isinstance(incoming, dict):
        return jsonify({"ok": False, "error": "Expected mapping object."}), 400
    previous_mapping = load_mapping()
    save_mapping(incoming)
    mapping = load_mapping()
    requeued = handle_mapping_corrections(previous_mapping, mapping)
    publish_result = publish_mapped_icons_to_website(mapping) if bool(payload.get("publish")) else None
    broadcast_event("state-changed")
    return jsonify(
        {
            "ok": True,
            "mapping": mapping,
            "duplicateNames": sorted(duplicate_names(mapping)),
            "publish": publish_result,
            "requeued": requeued,
        }
    )


@app.route("/api/capture-log", methods=["POST"])
def update_capture_log():
    payload = request.get_json(silent=True) or {}
    entries = payload.get("entries", [])
    if not isinstance(entries, list):
        return jsonify({"ok": False, "error": "Expected entries list."}), 400
    cleaned = []
    for index, item in enumerate(entries):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        cleaned.append(
            {
                "id": str(item.get("id") or f"capture_{index + 1}"),
                "name": name,
                "slotKind": str(item.get("slotKind", "")),
                "note": str(item.get("note", "")),
            }
        )
    save_capture_log(cleaned)
    broadcast_event("state-changed")
    return jsonify({"ok": True, "entries": load_capture_log()})


@app.route("/api/cleanup-fulfilled", methods=["POST"])
def cleanup_fulfilled():
    result = cleanup_fulfilled_planning_state()
    broadcast_event("state-changed")
    return jsonify({"ok": True, **result, "progress": equipment_progress()})


@app.route("/api/finalize", methods=["POST"])
def finalize():
    code, log = run_script("finalize_mapped_icons.py")
    broadcast_event("state-changed")
    return jsonify({"ok": code == 0, "exitCode": code, "log": log})


@app.route("/api/backup", methods=["POST"])
def backup_snapshot():
    backup_path = create_backup_snapshot()
    return jsonify({"ok": True, "backup": str(backup_path.relative_to(PROJECT_ROOT))})


@app.route("/api/mapped-icons", methods=["DELETE"])
def clear_mapped_icons():
    ensure_dirs()
    removed = 0
    for path in MAPPED_ICONS_DIR.iterdir():
        if path.is_file() and path.suffix.lower() == ".png":
            path.unlink()
            removed += 1
    if removed:
        broadcast_event("state-changed")
    return jsonify({"removed": removed})


@app.route("/api/raw-crops", methods=["DELETE"])
def clear_raw_crops():
    ensure_dirs()
    mapping = load_mapping()
    metadata = load_raw_crop_metadata()
    removed = 0
    for path in RAW_CROPS_DIR.iterdir():
        if path.is_file() and path.suffix.lower() == ".png":
            path.unlink()
            mapping.pop(path.name, None)
            metadata.pop(path.name, None)
            removed += 1
    save_mapping(mapping)
    save_raw_crop_metadata(metadata)
    if removed:
        broadcast_event("state-changed")
    return jsonify({"removed": removed})


@app.route("/api/raw-crops/<path:filename>", methods=["DELETE"])
def delete_raw_crop(filename: str):
    ensure_dirs()
    safe_name = Path(filename).name
    target = RAW_CROPS_DIR / safe_name
    if not target.exists() or not target.is_file() or target.suffix.lower() != ".png":
        return jsonify({"ok": False, "error": "Raw crop not found."}), 404

    target.unlink()
    mapping = load_mapping()
    mapping.pop(safe_name, None)
    save_mapping(mapping)
    metadata = load_raw_crop_metadata()
    metadata.pop(safe_name, None)
    save_raw_crop_metadata(metadata)
    broadcast_event("state-changed")
    return jsonify({"ok": True, "removed": safe_name})


@app.route("/raw_crops/<path:filename>")
def raw_crop_file(filename: str):
    return send_from_directory(RAW_CROPS_DIR, filename)


@app.route("/input/screenshots/<path:filename>")
def input_screenshot_file(filename: str):
    return send_from_directory(INPUT_DIR, filename)


@app.route("/debug/<path:filename>")
def debug_file(filename: str):
    return send_from_directory(DEBUG_DIR, filename)


@app.route("/mapped_icons/<path:filename>")
def mapped_icon_file(filename: str):
    return send_from_directory(MAPPED_ICONS_DIR, filename)


if __name__ == "__main__":
    ensure_dirs()
    host = os.environ.get("ICON_PIPELINE_HOST", "127.0.0.1")
    port = int(os.environ.get("ICON_PIPELINE_PORT", "5057"))
    app.run(host=host, port=port, debug=False)
