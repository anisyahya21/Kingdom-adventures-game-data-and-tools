#!/usr/bin/env python
"""Export confirmed facility review labels as website-ready PNG icons."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DIR = ROOT / "artifacts" / "kingdom-adventures" / "tmp" / "KA_assets" / "building"
DEFAULT_OUTPUT_DIR = ROOT / "website_icons" / "facilities_confirmed"


def slugify(value: str) -> str:
    lowered = value.lower().replace("'", "")
    slug = re.sub(r"[^a-z0-9]+", "_", lowered).strip("_")
    return slug or "unnamed"


def parse_meta(meta_values: list[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for value in meta_values:
        if ":" not in value:
            continue
        key, raw_value = value.split(":", 1)
        parsed[key.strip()] = raw_value.strip()
    return parsed


def load_labels_from_browser_result(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    marker = "Result: "
    start = text.find(marker)
    if start == -1:
        raise ValueError(f"Could not find '{marker.strip()}' in {path}")

    payload = text[start + len(marker) :]
    decoder = json.JSONDecoder()
    result, _ = decoder.raw_decode(payload)
    labels_text = result.get("labels")
    if not labels_text:
        return {}
    return json.loads(labels_text)


def load_labels(path: Path, browser_result: bool) -> dict[str, Any]:
    if browser_result:
        return load_labels_from_browser_result(path)
    return json.loads(path.read_text(encoding="utf-8"))


def int_or_none(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def export_icon(source_path: Path, output_path: Path, scale: int) -> tuple[int, int, int, int]:
    with Image.open(source_path).convert("RGBA") as source_image:
        original_width, original_height = source_image.size
        if scale > 1:
            output_image = source_image.resize(
                (original_width * scale, original_height * scale),
                Image.Resampling.NEAREST,
            )
        else:
            output_image = source_image.copy()
        output_image.save(output_path, "PNG")
        return original_width, original_height, output_image.width, output_image.height


def build_record(label_key: str, label: dict[str, Any], index: int) -> dict[str, Any]:
    meta = parse_meta(label.get("meta") or [])
    title = label.get("title") or "Confirmed Facility"
    source_file = label.get("file") or ""
    facility_match = re.match(r"Facility\s+(\d+):\s*(.+)", title)
    mapchip_match = re.match(r"MapChip\s+(\d+):\s*(.+)", title)

    if facility_match:
        entity_type = "facility"
        entity_id = int(facility_match.group(1))
        name = facility_match.group(2).strip()
        filename = f"facility_{entity_id:03d}_{slugify(name)}.png"
    elif mapchip_match:
        entity_type = "mapchip"
        entity_id = int(mapchip_match.group(1))
        name = mapchip_match.group(2).strip()
        filename = f"mapchip_{entity_id:03d}_{slugify(name)}.png"
    else:
        entity_type = "review_item"
        entity_id = index
        name = title.strip()
        filename = f"review_{index:03d}_{slugify(name)}.png"

    return {
        "id": entity_id,
        "type": entity_type,
        "name": name,
        "title": title,
        "filename": filename,
        "sourceFile": source_file,
        "reviewKey": label_key,
        "status": label.get("status"),
        "imageId": int_or_none(meta.get("img")),
        "chipId": int_or_none(meta.get("chip")),
        "relatedDataType": int_or_none(meta.get("rdt")),
        "relatedDataId": int_or_none(meta.get("rid")),
        "seb": int_or_none(meta.get("seb")),
        "mapSize": meta.get("size"),
        "confirmedAt": label.get("updatedAt"),
    }


def export_confirmed_icons(
    labels: dict[str, Any],
    source_dir: Path,
    output_dir: Path,
    scale: int,
    clean: bool,
) -> dict[str, Any]:
    if clean and output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, Any]] = []
    missing: list[dict[str, str]] = []
    used_filenames: set[str] = set()

    correct_labels = [
        (label_key, label)
        for label_key, label in labels.items()
        if isinstance(label, dict) and label.get("status") == "correct"
    ]

    for index, (label_key, label) in enumerate(correct_labels, start=1):
        record = build_record(label_key, label, index)
        source_file = record["sourceFile"]
        source_path = source_dir / source_file

        if not source_file or not source_path.exists():
            missing.append({"title": record["title"], "sourceFile": source_file})
            continue

        filename = record["filename"]
        if filename in used_filenames:
            stem = Path(filename).stem
            suffix = Path(filename).suffix
            filename = f"{stem}_{index:03d}{suffix}"
            record["filename"] = filename
        used_filenames.add(filename)

        output_path = output_dir / filename
        original_width, original_height, width, height = export_icon(source_path, output_path, scale)
        record.update(
            {
                "path": f"facilities_confirmed/{filename}",
                "sourcePath": f"artifacts/kingdom-adventures/tmp/KA_assets/building/{source_file}",
                "scale": scale,
                "originalWidth": original_width,
                "originalHeight": original_height,
                "width": width,
                "height": height,
            }
        )
        records.append(record)

    manifest = {
        "version": "1.0",
        "category": "facilities_confirmed",
        "scale": scale,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "KA Facility Mapping Review localStorage labels",
        "count": len(records),
        "missingCount": len(missing),
        "icons": records,
        "missing": missing,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("labels", type=Path, help="Labels JSON file, or a Copilot browser result content.txt")
    parser.add_argument("--browser-result", action="store_true", help="Parse labels from a run_playwright_code result file")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--scale", type=int, default=4)
    parser.add_argument("--clean", action="store_true", help="Delete the output folder before exporting")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.scale < 1:
        raise ValueError("--scale must be 1 or greater")

    labels = load_labels(args.labels, args.browser_result)
    manifest = export_confirmed_icons(labels, args.source_dir, args.output, args.scale, args.clean)
    print(f"Exported {manifest['count']} confirmed facility icons to {args.output}")
    if manifest["missingCount"]:
        print(f"Missing source files: {manifest['missingCount']}")
    print(args.output / "manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())