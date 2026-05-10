from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw


BASE_DIR = Path(__file__).resolve().parent
INPUT_DIR = BASE_DIR / "input" / "screenshots"
RAW_CROPS_DIR = BASE_DIR / "output" / "raw_crops"
DEBUG_DIR = BASE_DIR / "output" / "debug"

OUTPUT_SIZE = 256
EXPECTED_SCREEN_SIZE = (1668, 2388)
SCALE_COORDINATES_WHEN_SIZE_DIFFERS = True
SKIP_PARTIAL_SLOTS = True
DEBUG_SAVE_OVERLAY = True

# Configure the visible inventory grid here. Values are for 1668x2388 screenshots.
GRID_SETTINGS = {
    "left": 118,
    "top": 456,
    "slot_width": 282,
    "slot_height": 336,
    "gap_x": 22,
    "gap_y": 22,
    "columns": 5,
    "rows": 5,
}

# Relative to each slot: crop the icon-safe square and avoid name/quantity/level text.
ICON_CROP_RELATIVE_BOX = {
    "left": 36,
    "top": 28,
    "right": 246,
    "bottom": 238,
}


@dataclass(frozen=True)
class SlotCrop:
    label: str
    coords: tuple[int, int, int, int]


def ensure_dirs() -> None:
    RAW_CROPS_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)


def image_files() -> list[Path]:
    allowed = {".png", ".jpg", ".jpeg"}
    return sorted(p for p in INPUT_DIR.iterdir() if p.is_file() and p.suffix.lower() in allowed)


def next_raw_index() -> int:
    indexes = []
    for path in RAW_CROPS_DIR.glob("raw_*.png"):
        try:
            indexes.append(int(path.stem.split("_", 1)[1]))
        except (IndexError, ValueError):
            continue
    return max(indexes, default=0) + 1


def scale_value(value: int, source: int, target: int) -> int:
    return round(value * target / source)


def scaled_settings(size: tuple[int, int]) -> tuple[dict[str, int], dict[str, int]]:
    width, height = size
    expected_width, expected_height = EXPECTED_SCREEN_SIZE
    if size != EXPECTED_SCREEN_SIZE and not SCALE_COORDINATES_WHEN_SIZE_DIFFERS:
        raise ValueError(f"Expected {EXPECTED_SCREEN_SIZE}, got {size}")

    grid = dict(GRID_SETTINGS)
    relative = dict(ICON_CROP_RELATIVE_BOX)
    if size == EXPECTED_SCREEN_SIZE:
        return grid, relative

    for key in ["left", "slot_width", "gap_x"]:
        grid[key] = scale_value(grid[key], expected_width, width)
    for key in ["top", "slot_height", "gap_y"]:
        grid[key] = scale_value(grid[key], expected_height, height)
    for key in ["left", "right"]:
        relative[key] = scale_value(relative[key], expected_width, width)
    for key in ["top", "bottom"]:
        relative[key] = scale_value(relative[key], expected_height, height)
    return grid, relative


def build_slot_crops(size: tuple[int, int]) -> list[SlotCrop]:
    grid, relative = scaled_settings(size)
    crops: list[SlotCrop] = []
    width, height = size

    for row in range(grid["rows"]):
        for column in range(grid["columns"]):
            slot_left = grid["left"] + column * (grid["slot_width"] + grid["gap_x"])
            slot_top = grid["top"] + row * (grid["slot_height"] + grid["gap_y"])
            slot_right = slot_left + grid["slot_width"]
            slot_bottom = slot_top + grid["slot_height"]
            if SKIP_PARTIAL_SLOTS and (slot_left < 0 or slot_top < 0 or slot_right > width or slot_bottom > height):
                continue

            left = slot_left + relative["left"]
            top = slot_top + relative["top"]
            right = slot_left + relative["right"]
            bottom = slot_top + relative["bottom"]
            if left < 0 or top < 0 or right > width or bottom > height:
                continue
            crops.append(SlotCrop(f"r{row + 1}c{column + 1}", (left, top, right, bottom)))
    return crops


def save_debug_overlay(image: Image.Image, crops: list[SlotCrop], target: Path) -> None:
    overlay = image.copy().convert("RGB")
    draw = ImageDraw.Draw(overlay)
    for crop in crops:
        draw.rectangle(crop.coords, outline=(40, 160, 255), width=5)
        draw.text((crop.coords[0] + 6, crop.coords[1] + 6), crop.label, fill=(40, 160, 255))
    overlay.thumbnail((900, 1400), Image.Resampling.LANCZOS)
    overlay.save(target)


def main() -> int:
    ensure_dirs()
    screenshots = image_files()
    if not screenshots:
        print(f"No screenshots found in {INPUT_DIR}")
        return 1

    raw_index = next_raw_index()
    saved = 0

    for screenshot in screenshots:
        with Image.open(screenshot) as image:
            image = image.convert("RGBA")
            if image.size != EXPECTED_SCREEN_SIZE:
                print(f"{screenshot.name}: size {image.size}, expected {EXPECTED_SCREEN_SIZE}; scaling grid settings.")

            crops = build_slot_crops(image.size)
            for crop in crops:
                output = RAW_CROPS_DIR / f"raw_{raw_index:06d}.png"
                image.crop(crop.coords).resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS).save(output)
                raw_index += 1
                saved += 1

            if DEBUG_SAVE_OVERLAY:
                save_debug_overlay(image, crops, DEBUG_DIR / f"{screenshot.stem}_inventory_debug.jpg")

    print(f"Inventory cropper complete. Saved: {saved}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
