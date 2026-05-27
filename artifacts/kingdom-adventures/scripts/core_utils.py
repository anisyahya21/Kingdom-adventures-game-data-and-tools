import hashlib
import re
from pathlib import Path
from statistics import pstdev
from typing import Dict, List, Tuple


def fallback_color_hex(chip_id: int) -> str:
    digest = hashlib.sha256(str(chip_id).encode("utf-8")).hexdigest()
    return f"#{digest[:6]}"


def hex_to_rgba(value: str, alpha: int = 255) -> Tuple[int, int, int, int]:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)


def parse_generated_sprite_name(sprite_source_png: str) -> Tuple[str, int, int] | None:
    stem = Path(sprite_source_png).stem
    match = re.match(r"^chip_(?P<base>.+)_u(?P<u>\d+)_v(?P<v>\d+)$", stem)
    if not match:
        return None
    return (match.group("base"), int(match.group("u")), int(match.group("v")))


def resolve_opt_slot(sprites: List[Dict], u: int, v: int) -> Dict | None:
    for sprite in sprites:
        if int(sprite.get("u", -1)) == u and int(sprite.get("v", -1)) == v:
            return sprite
    return None


def tile_field_int(tile: Dict, field_name: str) -> int | None:
    value = tile.get(field_name)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def deterministic_field_color(field_name: str, value: int, alpha: int = 210) -> Tuple[int, int, int, int]:
    digest = hashlib.sha256(f"{field_name}:{value}".encode("utf-8")).hexdigest()
    return (
        35 + (int(digest[0:2], 16) % 200),
        35 + (int(digest[2:4], 16) % 200),
        35 + (int(digest[4:6], 16) % 200),
        alpha,
    )


def f1_biome_palette(value: int) -> Dict:
    biome_palette = [
        {"label": "grass", "color": (86, 170, 88, 220)},
        {"label": "sand", "color": (206, 176, 108, 220)},
        {"label": "snow", "color": (228, 236, 244, 230)},
        {"label": "swamp", "color": (72, 142, 138, 220)},
        {"label": "volcano", "color": (208, 94, 58, 220)},
        {"label": "rock", "color": (126, 126, 132, 220)},
        {"label": "water", "color": (82, 132, 210, 220)},
    ]
    return biome_palette[int(value) % len(biome_palette)]


def compute_stability_metrics(values: List[float]) -> Dict:
    if not values:
        return {
            "sampleCount": 0,
            "mean": 0.0,
            "min": 0.0,
            "max": 0.0,
            "range": 0.0,
            "stdDev": 0.0,
            "stabilityIndex": 0.0,
        }
    mean_value = float(sum(values) / len(values))
    min_value = float(min(values))
    max_value = float(max(values))
    range_value = float(max_value - min_value)
    std_value = float(pstdev(values)) if len(values) > 1 else 0.0
    stability_index = max(0.0, min(1.0, 1.0 - (range_value * 0.65) - (std_value * 0.55)))
    return {
        "sampleCount": int(len(values)),
        "mean": float(round(mean_value, 4)),
        "min": float(round(min_value, 4)),
        "max": float(round(max_value, 4)),
        "range": float(round(range_value, 4)),
        "stdDev": float(round(std_value, 4)),
        "stabilityIndex": float(round(stability_index, 4)),
    }