from __future__ import annotations

import json
import re
import shutil
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
RAW_CROPS_DIR = BASE_DIR / "output" / "raw_crops"
MAPPED_ICONS_DIR = BASE_DIR / "output" / "mapped_icons"
MAPPING_JSON = BASE_DIR / "output" / "icon_mapping.json"

WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
}


def load_mapping() -> dict[str, str]:
    if not MAPPING_JSON.exists():
        return {}
    try:
        data = json.loads(MAPPING_JSON.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raise ValueError(f"Invalid JSON: {MAPPING_JSON}")
    return {str(k): str(v).strip() for k, v in data.items() if str(v).strip()}


def safe_filename(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    if not cleaned:
        cleaned = "unnamed_icon"
    if cleaned.upper() in WINDOWS_RESERVED_NAMES:
        cleaned = f"{cleaned}_icon"
    return cleaned[:180]


def unique_target(base_name: str, used: set[str]) -> tuple[Path, bool]:
    candidate_name = f"{base_name}.png"
    candidate = MAPPED_ICONS_DIR / candidate_name
    suffix = 2
    had_conflict = candidate_name.lower() in used or candidate.exists()
    while candidate_name.lower() in used or candidate.exists():
        candidate_name = f"{base_name}_{suffix}.png"
        candidate = MAPPED_ICONS_DIR / candidate_name
        suffix += 1
    used.add(candidate_name.lower())
    return candidate, had_conflict


def main() -> int:
    MAPPED_ICONS_DIR.mkdir(parents=True, exist_ok=True)
    mapping = load_mapping()
    if not mapping:
        print("No mappings found. Nothing to finalize.")
        return 1

    mapped = 0
    skipped = 0
    missing_sources = 0
    conflicts = 0
    used_targets: set[str] = set()

    for raw_filename, mapped_name in sorted(mapping.items()):
        source = RAW_CROPS_DIR / raw_filename
        if not source.exists():
            print(f"Missing source crop: {raw_filename}")
            missing_sources += 1
            skipped += 1
            continue

        target, had_conflict = unique_target(safe_filename(mapped_name), used_targets)
        if had_conflict:
            conflicts += 1
            print(f"Duplicate/output conflict for '{mapped_name}', wrote {target.name}")

        shutil.copy2(source, target)
        mapped += 1

    unmapped = len([p for p in RAW_CROPS_DIR.glob("*.png") if p.name not in mapping])
    print("Finalize complete.")
    print(f"Mapped files: {mapped}")
    print(f"Skipped files: {skipped}")
    print(f"Conflicts handled with suffixes: {conflicts}")
    print(f"Missing source crops: {missing_sources}")
    print(f"Raw crops without mappings: {unmapped}")
    print(f"Output folder: {MAPPED_ICONS_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
