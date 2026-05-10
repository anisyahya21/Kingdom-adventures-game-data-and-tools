from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "input" / "screenshots"
PROCESSED_INPUT_DIR = BASE_DIR / "input" / "processed_screenshots"
RAW_CROPS_DIR = BASE_DIR / "output" / "raw_crops"
DEBUG_DIR = BASE_DIR / "output" / "debug"
CONFIG_PATH = BASE_DIR / "output" / "equipment_crop_config.json"
METADATA_PATH = BASE_DIR / "output" / "raw_crop_metadata.json"

OUTPUT_SIZE = 256
EXPECTED_SCREEN_SIZE = (1668, 2388)
SCALE_COORDINATES_WHEN_SIZE_DIFFERS = True
DEBUG_SAVE_OVERLAY = True


@dataclass(frozen=True)
class CropBox:
    label: str
    left: int
    top: int
    right: int
    bottom: int


# Five fixed equipment slots from the bottom equipment row at 1668x2388.
# The local UI can save a calibrated replacement to output/equipment_crop_config.json.
DEFAULT_EQUIPMENT_CROP_BOXES = [
    CropBox("slot_1", 833, 1610, 974, 1751),
    CropBox("slot_2", 981, 1610, 1122, 1751),
    CropBox("slot_3", 1128, 1610, 1269, 1751),
    CropBox("slot_4", 1275, 1610, 1416, 1751),
    CropBox("slot_5", 1422, 1610, 1563, 1751),
]

SLOT_KINDS = ["head", "weapon", "shield", "armor", "accessory"]


def ensure_dirs() -> None:
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    RAW_CROPS_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)


def image_files() -> list[Path]:
    single_file = os.environ.get("ICON_PIPELINE_SINGLE_SCREENSHOT")
    if single_file:
        path = Path(single_file)
        return [path] if path.exists() else []
    allowed = {".png", ".jpg", ".jpeg"}
    return sorted(p for p in INPUT_DIR.iterdir() if p.is_file() and p.suffix.lower() in allowed)


def load_crop_boxes() -> list[CropBox]:
    if not CONFIG_PATH.exists():
        return DEFAULT_EQUIPMENT_CROP_BOXES
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"Invalid equipment crop config, using defaults: {CONFIG_PATH}")
        return DEFAULT_EQUIPMENT_CROP_BOXES

    boxes = []
    for index, item in enumerate(data.get("boxes", []), start=1):
        try:
            boxes.append(
                CropBox(
                    str(item.get("label") or f"slot_{index}"),
                    int(item["left"]),
                    int(item["top"]),
                    int(item["right"]),
                    int(item["bottom"]),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return boxes or DEFAULT_EQUIPMENT_CROP_BOXES


def load_metadata() -> dict[str, dict[str, str]]:
    if not METADATA_PATH.exists():
        return {}
    try:
        data = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def save_metadata(metadata: dict[str, dict[str, str]]) -> None:
    METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def unique_processed_path(path: Path) -> Path:
    target = PROCESSED_INPUT_DIR / path.name
    counter = 2
    while target.exists():
        target = PROCESSED_INPUT_DIR / f"{path.stem}_{counter}{path.suffix}"
        counter += 1
    return target


def next_raw_index() -> int:
    existing = sorted(RAW_CROPS_DIR.glob("raw_*.png"))
    if not existing:
        return 1
    indexes = []
    for path in existing:
        try:
            indexes.append(int(path.stem.split("_", 1)[1]))
        except (IndexError, ValueError):
            continue
    return max(indexes, default=0) + 1


def scaled_box(box: CropBox, size: tuple[int, int]) -> tuple[int, int, int, int]:
    width, height = size
    expected_width, expected_height = EXPECTED_SCREEN_SIZE
    if size == EXPECTED_SCREEN_SIZE:
        return box.left, box.top, box.right, box.bottom
    if not SCALE_COORDINATES_WHEN_SIZE_DIFFERS:
        raise ValueError(f"Expected {EXPECTED_SCREEN_SIZE}, got {size}")

    sx = width / expected_width
    sy = height / expected_height
    return (
        round(box.left * sx),
        round(box.top * sy),
        round(box.right * sx),
        round(box.bottom * sy),
    )


def crop_square(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    left, top, right, bottom = box
    crop = image.crop((left, top, right, bottom))
    return crop.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)


def save_debug_overlay(image: Image.Image, boxes: list[tuple[CropBox, tuple[int, int, int, int]]], target: Path) -> None:
    overlay = image.copy().convert("RGB")
    draw = ImageDraw.Draw(overlay)
    for crop_box, coords in boxes:
        draw.rectangle(coords, outline=(255, 40, 40), width=6)
        draw.text((coords[0] + 8, coords[1] + 8), crop_box.label, fill=(255, 40, 40))
    overlay.thumbnail((900, 1400), Image.Resampling.LANCZOS)
    overlay.save(target)


def main() -> int:
    ensure_dirs()
    screenshots = image_files()
    if not screenshots:
        print(f"No screenshots found in {INPUT_DIR}")
        return 1

    raw_index = next_raw_index()
    crop_boxes = load_crop_boxes()
    metadata = load_metadata()
    saved = 0
    skipped = 0

    for screenshot in screenshots:
        with Image.open(screenshot) as image:
            image = image.convert("RGBA")
            if image.size != EXPECTED_SCREEN_SIZE:
                message = f"{screenshot.name}: size {image.size}, expected {EXPECTED_SCREEN_SIZE}"
                if SCALE_COORDINATES_WHEN_SIZE_DIFFERS:
                    print(f"Scaling crop coordinates for {message}")
                else:
                    print(f"Skipping {message}")
                    skipped += 1
                    continue

            debug_boxes: list[tuple[CropBox, tuple[int, int, int, int]]] = []
            for slot_index, crop_box in enumerate(crop_boxes):
                coords = scaled_box(crop_box, image.size)
                left, top, right, bottom = coords
                if left < 0 or top < 0 or right > image.width or bottom > image.height:
                    print(f"Skipping {screenshot.name} {crop_box.label}: crop outside image bounds")
                    skipped += 1
                    continue

                output = RAW_CROPS_DIR / f"raw_{raw_index:06d}.png"
                crop_square(image, coords).save(output)
                slot_kind = SLOT_KINDS[slot_index] if slot_index < len(SLOT_KINDS) else crop_box.label
                metadata[output.name] = {
                    "cropper": "equipment",
                    "slotIndex": str(slot_index + 1),
                    "slotKind": slot_kind,
                    "slotLabel": crop_box.label,
                    "sourceScreenshot": screenshot.name,
                }
                debug_boxes.append((crop_box, coords))
                raw_index += 1
                saved += 1

            if DEBUG_SAVE_OVERLAY:
                save_debug_overlay(image, debug_boxes, DEBUG_DIR / f"{screenshot.stem}_equipment_debug.jpg")

        screenshot.rename(unique_processed_path(screenshot))

    save_metadata(metadata)
    print(f"Equipment cropper complete. Saved: {saved}. Skipped: {skipped}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
