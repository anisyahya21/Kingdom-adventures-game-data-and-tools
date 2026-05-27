import hashlib
import json
import re
import sys
from collections import deque
from statistics import median, pstdev
from pathlib import Path
from typing import Dict, List, Tuple

from PIL import Image, ImageDraw


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


def build_anchor_metadata(
    sprite_source_png: str,
    ka_chip_dir: Path,
    parse_opt,
) -> Dict:
    parsed = parse_generated_sprite_name(sprite_source_png)
    if not parsed:
        return {
            "status": "fallback",
            "reason": "sprite_name_parse_failed",
        }

    base_name, u, v = parsed
    source_png_path = ka_chip_dir / f"{base_name}.png"
    opt_path = ka_chip_dir / f"{base_name}.opt"
    optinfo_path = ka_chip_dir / f"{base_name}.optinfo"

    if not source_png_path.exists():
        return {
            "status": "fallback",
            "reason": "source_png_missing",
            "baseName": base_name,
        }

    if not opt_path.exists():
        return {
            "status": "fallback",
            "reason": "opt_missing",
            "baseName": base_name,
            "sourceImagePath": str(source_png_path),
            "optinfoPath": str(optinfo_path) if optinfo_path.exists() else None,
        }

    try:
        opt_data = parse_opt(opt_path)
    except Exception as exc:  # pragma: no cover
        return {
            "status": "fallback",
            "reason": "opt_parse_failed",
            "baseName": base_name,
            "error": str(exc),
        }

    slot = resolve_opt_slot(opt_data.get("sprites", []), u, v)
    if not slot:
        return {
            "status": "fallback",
            "reason": "opt_slot_missing",
            "baseName": base_name,
            "slot": {"u": u, "v": v},
            "canvasSize": {
                "w": int(opt_data.get("cell_width", 0)),
                "h": int(opt_data.get("cell_height", 0)),
            },
        }

    source_image_size = Image.open(source_png_path).convert("RGBA").size
    cell_w = int(opt_data.get("cell_width", 0))
    cell_h = int(opt_data.get("cell_height", 0))
    dest_x = int(slot.get("dest_x", 0))
    dest_y = int(slot.get("dest_y", 0))
    src_x = int(slot.get("src_x", 0))
    src_y = int(slot.get("src_y", 0))
    frame_w = int(slot.get("w", 0))
    frame_h = int(slot.get("h", 0))
    draw_origin = {"x": cell_w // 2, "y": cell_h}

    return {
        "status": "metadata",
        "reason": "opt_slot",
        "baseName": base_name,
        "slot": {"u": u, "v": v},
        "sourceImagePath": str(source_png_path),
        "sourceImageSize": {"w": int(source_image_size[0]), "h": int(source_image_size[1])},
        "optPath": str(opt_path),
        "optinfoPath": str(optinfo_path) if optinfo_path.exists() else None,
        "canvasSize": {"w": cell_w, "h": cell_h},
        "frameRect": {"x": src_x, "y": src_y, "w": frame_w, "h": frame_h},
        "offset": {"x": dest_x, "y": dest_y},
        "drawOrigin": draw_origin,
        "anchor": {
            "x": draw_origin["x"] - dest_x,
            "y": draw_origin["y"] - dest_y,
        },
    }


def compute_seam_metrics(draw_ops: List[Dict]) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {}
    for op in draw_ops:
        if op["opType"] == "sprite":
            by_cell[(int(op["x"]), int(op["y"]))] = op

    east_gaps: List[int] = []
    south_gaps: List[int] = []

    for (x, y), op in by_cell.items():
        east = by_cell.get((x + 1, y))
        south = by_cell.get((x, y + 1))

        if east is not None:
            east_gap = int(east["left"]) - (int(op["left"]) + int(op["width"]))
            east_gaps.append(east_gap)
        if south is not None:
            south_gap = int(south["top"]) - (int(op["top"]) + int(op["height"]))
            south_gaps.append(south_gap)

    def summarize(values: List[int]) -> Dict:
        if not values:
            return {"pairCount": 0, "avg": 0, "avgPositiveGap": 0, "maxPositiveGap": 0}
        positives = [value for value in values if value > 0]
        return {
            "pairCount": len(values),
            "avg": sum(values) / len(values),
            "avgPositiveGap": (sum(positives) / len(positives)) if positives else 0,
            "maxPositiveGap": max(positives) if positives else 0,
        }

    return {
        "east": summarize(east_gaps),
        "south": summarize(south_gaps),
    }


def classify_floor_family(map_chip_name: str, semantic_group: str) -> str | None:
    name = map_chip_name.lower()
    semantic = semantic_group.lower()

    if "road" in name or "path" in name:
        return "road_path"
    if "grass" in name:
        return "grass"
    if "sand" in name or "desert" in name:
        return "sand"
    if "rock" in name or "stone" in name:
        return "rock"
    if "snow" in name:
        return "snow"

    if "terrain" in semantic:
        if "snow" in name:
            return "snow"
        if "sand" in name or "desert" in name:
            return "sand"

    return None


def measure_sprite_footprint(sprite_path: Path) -> Dict:
    image = Image.open(sprite_path).convert("RGBA")
    width, height = image.size
    alpha = image.split()[3]
    bbox = alpha.getbbox()

    if bbox is None:
        return {
            "spritePath": str(sprite_path).replace("\\", "/"),
            "size": {"w": int(width), "h": int(height)},
            "visibleBounds": {"x": 0, "y": 0, "w": 0, "h": 0},
            "transparentPadding": {
                "left": int(width),
                "top": int(height),
                "right": 0,
                "bottom": 0,
            },
            "visiblePixelCount": 0,
            "visibleAreaRatio": 0,
        }

    left, top, right, bottom = bbox
    vis_w = max(0, right - left)
    vis_h = max(0, bottom - top)
    visible_pixels = alpha.crop(bbox).point(lambda value: 255 if value > 0 else 0).histogram()[255]
    total_pixels = max(1, width * height)

    return {
        "spritePath": str(sprite_path).replace("\\", "/"),
        "size": {"w": int(width), "h": int(height)},
        "visibleBounds": {"x": int(left), "y": int(top), "w": int(vis_w), "h": int(vis_h)},
        "transparentPadding": {
            "left": int(left),
            "top": int(top),
            "right": int(width - right),
            "bottom": int(height - bottom),
        },
        "visiblePixelCount": int(visible_pixels),
        "visibleAreaRatio": float(visible_pixels / total_pixels),
    }


def infer_spacing_from_measurements(input_data: Dict, ka_website_root: Path, tile_width: int, tile_height: int) -> Dict:
    families = {
        "grass": [],
        "sand": [],
        "road_path": [],
        "rock": [],
        "snow": [],
    }
    seen_paths: set[str] = set()

    for resolution in input_data.get("visualResolutions", []):
        if not resolution.get("resolved"):
            continue

        sprite_rel = resolution.get("spriteSourcePng")
        if not sprite_rel:
            continue

        map_chip_name = str(resolution.get("mapChipName", ""))
        semantic_group = str(resolution.get("semanticGroup", ""))
        family = classify_floor_family(map_chip_name, semantic_group)
        if family is None:
            continue

        sprite_abs = (ka_website_root / sprite_rel).resolve()
        sprite_key = str(sprite_abs)
        if sprite_key in seen_paths:
            continue
        if not sprite_abs.exists():
            continue

        seen_paths.add(sprite_key)
        families[family].append(
            {
                "mapChipId": int(resolution.get("mapChipId", -1)),
                "mapChipName": map_chip_name,
                "semanticGroup": semantic_group,
                "measurement": measure_sprite_footprint(sprite_abs),
            }
        )

    measured_widths: List[int] = []
    measured_heights: List[int] = []
    measured_bbox_widths: List[int] = []
    measured_bbox_heights: List[int] = []

    family_reports: Dict[str, Dict] = {}
    for family, entries in families.items():
        entries = entries[:8]
        families[family] = entries

        widths = [int(item["measurement"]["size"]["w"]) for item in entries]
        heights = [int(item["measurement"]["size"]["h"]) for item in entries]
        bbox_widths = [int(item["measurement"]["visibleBounds"]["w"]) for item in entries if int(item["measurement"]["visibleBounds"]["w"]) > 0]
        bbox_heights = [int(item["measurement"]["visibleBounds"]["h"]) for item in entries if int(item["measurement"]["visibleBounds"]["h"]) > 0]

        measured_widths.extend(widths)
        measured_heights.extend(heights)
        measured_bbox_widths.extend(bbox_widths)
        measured_bbox_heights.extend(bbox_heights)

        family_reports[family] = {
            "sampleCount": len(entries),
            "medianSpriteSize": {
                "w": int(round(median(widths))) if widths else 0,
                "h": int(round(median(heights))) if heights else 0,
            },
            "medianVisibleBounds": {
                "w": int(round(median(bbox_widths))) if bbox_widths else 0,
                "h": int(round(median(bbox_heights))) if bbox_heights else 0,
            },
            "samples": entries,
        }

    global_median_w = int(round(median(measured_widths))) if measured_widths else tile_width
    global_median_h = int(round(median(measured_heights))) if measured_heights else tile_height
    global_median_bbox_w = int(round(median(measured_bbox_widths))) if measured_bbox_widths else global_median_w
    global_median_bbox_h = int(round(median(measured_bbox_heights))) if measured_bbox_heights else global_median_h

    inferred_step_x = max(8, int(round(global_median_bbox_w / 2)))
    inferred_step_y = max(8, int(round(global_median_bbox_h / 2)))
    inferred_tile_width = inferred_step_x * 2
    inferred_tile_height = inferred_step_y * 2

    legacy_step_x = tile_width // 2
    legacy_step_y = tile_height // 2

    legacy_overlap_x = 1 - (legacy_step_x / max(1, global_median_bbox_w))
    legacy_overlap_y = 1 - (legacy_step_y / max(1, global_median_bbox_h))
    calibrated_overlap_x = 1 - (inferred_step_x / max(1, global_median_bbox_w))
    calibrated_overlap_y = 1 - (inferred_step_y / max(1, global_median_bbox_h))

    return {
        "families": family_reports,
        "globalMedians": {
            "spriteSize": {"w": global_median_w, "h": global_median_h},
            "visibleBounds": {"w": global_median_bbox_w, "h": global_median_bbox_h},
        },
        "legacyProjection": {
            "tileWidth": int(tile_width),
            "tileHeight": int(tile_height),
            "tileStepX": int(legacy_step_x),
            "tileStepY": int(legacy_step_y),
            "overlapRatios": {
                "x": float(legacy_overlap_x),
                "y": float(legacy_overlap_y),
            },
        },
        "calibratedProjection": {
            "tileWidth": int(inferred_tile_width),
            "tileHeight": int(inferred_tile_height),
            "tileStepX": int(inferred_step_x),
            "tileStepY": int(inferred_step_y),
            "overlapRatios": {
                "x": float(calibrated_overlap_x),
                "y": float(calibrated_overlap_y),
            },
        },
    }


def build_family_render_profiles() -> Dict[str, Dict]:
    return {
        "terrainFloor": {
            "stepScaleX": 1.0,
            "stepScaleY": 1.0,
            "anchorAdjustX": 0,
            "anchorAdjustY": 0,
            "drawPriority": 0,
            "elevationOffsetY": 0,
            "overlapPaddingX": 1,
            "overlapPaddingY": 1,
            "anchorBiasX": 0,
            "anchorBiasY": 0,
            "edgeBlendMode": "soft",
            "terrainConnectionMode": "continuous",
            "foundationMode": "none",
            "allowNeighborBleed": True,
            "zBias": 0,
        },
        "overlayFoundation": {
            "stepScaleX": 1.0,
            "stepScaleY": 1.0,
            "anchorAdjustX": 0,
            "anchorAdjustY": -1,
            "drawPriority": 1,
            "elevationOffsetY": -2,
            "overlapPaddingX": 0,
            "overlapPaddingY": 1,
            "anchorBiasX": 0,
            "anchorBiasY": -1,
            "edgeBlendMode": "foundation-soft",
            "terrainConnectionMode": "attach",
            "foundationMode": "overlay",
            "allowNeighborBleed": True,
            "zBias": 2,
        },
        "edgeTransition": {
            "stepScaleX": 1.0,
            "stepScaleY": 1.0,
            "anchorAdjustX": 0,
            "anchorAdjustY": 0,
            "drawPriority": 1,
            "elevationOffsetY": -1,
            "overlapPaddingX": 1,
            "overlapPaddingY": 1,
            "anchorBiasX": 0,
            "anchorBiasY": 0,
            "edgeBlendMode": "boundary",
            "terrainConnectionMode": "transition",
            "foundationMode": "edge",
            "allowNeighborBleed": True,
            "zBias": 3,
        },
        "raisedFloor": {
            "stepScaleX": 1.0,
            "stepScaleY": 1.0,
            "anchorAdjustX": 0,
            "anchorAdjustY": -2,
            "drawPriority": 2,
            "elevationOffsetY": -6,
            "overlapPaddingX": 0,
            "overlapPaddingY": 1,
            "anchorBiasX": 0,
            "anchorBiasY": -1,
            "edgeBlendMode": "stacked",
            "terrainConnectionMode": "separate",
            "foundationMode": "platform",
            "allowNeighborBleed": False,
            "zBias": 6,
        },
        "indoorFloor": {
            "stepScaleX": 1.0,
            "stepScaleY": 1.0,
            "anchorAdjustX": 0,
            "anchorAdjustY": -1,
            "drawPriority": 2,
            "elevationOffsetY": -4,
            "overlapPaddingX": 0,
            "overlapPaddingY": 1,
            "anchorBiasX": 0,
            "anchorBiasY": -1,
            "edgeBlendMode": "indoor-soft",
            "terrainConnectionMode": "bounded",
            "foundationMode": "indoor",
            "allowNeighborBleed": False,
            "zBias": 5,
        },
        "objectLike": {
            "stepScaleX": 1.0,
            "stepScaleY": 1.0,
            "anchorAdjustX": 0,
            "anchorAdjustY": -2,
            "drawPriority": 3,
            "elevationOffsetY": -8,
            "overlapPaddingX": 0,
            "overlapPaddingY": 0,
            "anchorBiasX": 0,
            "anchorBiasY": -1,
            "edgeBlendMode": "hard",
            "terrainConnectionMode": "independent",
            "foundationMode": "object",
            "allowNeighborBleed": False,
            "zBias": 10,
        },
        "unresolvedFallback": {
            "stepScaleX": 1.0,
            "stepScaleY": 1.0,
            "anchorAdjustX": 0,
            "anchorAdjustY": 0,
            "drawPriority": 0,
            "elevationOffsetY": 0,
            "overlapPaddingX": 0,
            "overlapPaddingY": 0,
            "anchorBiasX": 0,
            "anchorBiasY": 0,
            "edgeBlendMode": "none",
            "terrainConnectionMode": "unknown",
            "foundationMode": "none",
            "allowNeighborBleed": False,
            "zBias": -1,
        },
    }


def get_family_render_pass(family: str) -> str:
    if family == "terrainFloor":
        return "terrain_base"
    if family in {"overlayFoundation", "edgeTransition"}:
        return "overlay_foundation"
    if family in {"raisedFloor", "indoorFloor"}:
        return "elevated_platform"
    return "object_like"


def get_render_pass_order(pass_name: str) -> int:
    order = {
        "terrain_base": 0,
        "semantic_foundation": 1,
        "overlay_foundation": 2,
        "semantic_overlay": 3,
        "elevated_platform": 4,
        "object_like": 5,
    }
    return int(order.get(pass_name, 99))


def family_debug_color(family: str) -> Tuple[int, int, int, int]:
    colors = {
        "terrainFloor": (60, 170, 90, 190),
        "overlayFoundation": (200, 160, 70, 190),
        "edgeTransition": (224, 120, 80, 190),
        "raisedFloor": (94, 154, 230, 190),
        "indoorFloor": (160, 122, 210, 190),
        "objectLike": (220, 96, 138, 190),
        "unresolvedFallback": (130, 130, 130, 190),
    }
    return colors.get(family, (120, 120, 120, 190))


def terrain_composition_color(composition_type: str, seed_value: int) -> Tuple[int, int, int, int]:
    palette = {
        "connectedDirtRegions": (132, 106, 78),
        "sandDesertContinuity": (190, 166, 102),
        "swampWaterContinuity": (72, 118, 128),
        "indoorFloorContinuity": (126, 118, 140),
        "roadPathContinuity": (122, 114, 96),
        "reclaimedLandContinuity": (116, 126, 96),
        "unresolved": (118, 118, 118),
    }
    base = palette.get(composition_type, palette["unresolved"])
    digest = hashlib.sha256(f"{composition_type}:{seed_value}".encode("utf-8")).hexdigest()
    offset = (int(digest[0:2], 16) % 18) - 9
    return (
        max(25, min(230, base[0] + offset)),
        max(25, min(230, base[1] + offset)),
        max(25, min(230, base[2] + offset)),
        230,
    )


def mapchip_cluster_base_color(cluster: str) -> Tuple[int, int, int]:
    palette = {
        "dirtSoilFamily": (132, 108, 82),
        "swampWaterFamily": (76, 124, 138),
        "indoorFloorFamily": (130, 120, 146),
        "roadPathFamily": (142, 132, 104),
        "platformElevatedFamily": (108, 146, 196),
        "overlayFoundationFamily": (162, 138, 100),
        "unknownFamily": (120, 120, 120),
    }
    return palette.get(cluster, palette["unknownFamily"])


def mapchip_visual_color(
    *,
    mapchip_cluster: str,
    f2: int,
    compatibility: float,
    continuity_score: float,
    confidence: float,
) -> Tuple[int, int, int, int]:
    base = mapchip_cluster_base_color(mapchip_cluster)
    digest = hashlib.sha256(f"{mapchip_cluster}:{f2}".encode("utf-8")).hexdigest()
    variance = (int(digest[0:2], 16) % 14) - 7

    compat_boost = int(max(0.0, min(1.0, compatibility)) * 18)
    continuity_boost = int(max(0.0, min(1.0, continuity_score)) * 16)
    confidence_boost = int(max(0.0, min(1.0, confidence)) * 12)

    return (
        max(28, min(230, base[0] + variance + compat_boost // 2)),
        max(28, min(230, base[1] + variance + continuity_boost // 2)),
        max(28, min(230, base[2] + variance + confidence_boost // 2)),
        228,
    )


def analyze_region_transitions(draw_ops: List[Dict]) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {
        (int(op["x"]), int(op["y"])): op
        for op in draw_ops
    }

    mixed_adjacency_counts: Dict[str, int] = {}
    transition_candidates: List[Dict] = []
    unresolved_overlay_candidates: Dict[int, Dict] = {}
    edge_conflict_candidates: List[Dict] = []
    cliff_platform_boundaries: List[Dict] = []
    mixed_coords: set[Tuple[int, int]] = set()

    elevated_families = {"raisedFloor", "indoorFloor"}

    for (x, y), op in by_cell.items():
        for dx, dy, side in [(1, 0, "east"), (0, 1, "south")]:
            neighbor = by_cell.get((x + dx, y + dy))
            if neighbor is None:
                continue

            family_a = str(op.get("family", "unresolvedFallback"))
            family_b = str(neighbor.get("family", "unresolvedFallback"))
            if family_a == family_b:
                continue

            mixed_coords.add((x, y))
            mixed_coords.add((x + dx, y + dy))

            key = "|".join(sorted([family_a, family_b]))
            mixed_adjacency_counts[key] = mixed_adjacency_counts.get(key, 0) + 1

            transition = {
                "from": {"x": x, "y": y, "family": family_a, "f2": int(op.get("f2", -1))},
                "to": {"x": x + dx, "y": y + dy, "family": family_b, "f2": int(neighbor.get("f2", -1))},
                "side": side,
                "isTerrainToOverlay": (family_a == "terrainFloor" and family_b == "overlayFoundation")
                or (family_b == "terrainFloor" and family_a == "overlayFoundation"),
                "isCliffOrPlatformBoundary": (family_a in elevated_families and family_b not in elevated_families)
                or (family_b in elevated_families and family_a not in elevated_families),
                "isEdgeTransitionInvolved": family_a == "edgeTransition" or family_b == "edgeTransition",
            }
            transition_candidates.append(transition)

            if transition["isTerrainToOverlay"] and (
                op.get("opType") == "fallback"
                or neighbor.get("opType") == "fallback"
                or family_a == "unresolvedFallback"
                or family_b == "unresolvedFallback"
            ):
                for candidate in [op, neighbor]:
                    candidate_f2 = int(candidate.get("f2", -1))
                    if candidate_f2 < 0:
                        continue
                    existing = unresolved_overlay_candidates.get(candidate_f2)
                    reason = "terrain_overlay_with_fallback_or_unresolved"
                    if existing is None:
                        unresolved_overlay_candidates[candidate_f2] = {
                            "f2": candidate_f2,
                            "mapChipName": str(candidate.get("mapChipName", "")),
                            "family": str(candidate.get("family", "unknown")),
                            "count": 1,
                            "reason": reason,
                        }
                    else:
                        existing["count"] += 1

            z_a = int(op.get("zSort", 0))
            z_b = int(neighbor.get("zSort", 0))
            if abs(z_a - z_b) >= 8:
                edge_conflict_candidates.append(
                    {
                        "cellA": {"x": x, "y": y, "family": family_a, "z": z_a, "f2": int(op.get("f2", -1))},
                        "cellB": {"x": x + dx, "y": y + dy, "family": family_b, "z": z_b, "f2": int(neighbor.get("f2", -1))},
                        "reason": "large_z_delta_on_adjacent_cells",
                    }
                )

            if transition["isCliffOrPlatformBoundary"]:
                cliff_platform_boundaries.append(transition)

    return {
        "mixedFamilyAdjacencyCounts": {
            key: int(value)
            for key, value in sorted(mixed_adjacency_counts.items(), key=lambda item: (-item[1], item[0]))
        },
        "transitionCandidates": transition_candidates[:200],
        "unresolvedOverlayCandidates": sorted(
            unresolved_overlay_candidates.values(),
            key=lambda item: (-item["count"], item["f2"]),
        )[:80],
        "edgeConflictCandidates": edge_conflict_candidates[:120],
        "cliffPlatformBoundaries": cliff_platform_boundaries[:120],
        "mixedCoords": [{"x": x, "y": y} for x, y in sorted(mixed_coords)],
    }


def is_foundation_like(map_chip_name: str, semantic_group: str, family: str) -> bool:
    name = map_chip_name.lower()
    semantic = semantic_group.lower()
    if family in {"overlayFoundation", "edgeTransition"}:
        return True
    return bool(re.search(r"foundation|base|support|pillar|platform|deck|bridge|edge|border|frame", name)) or (
        "overlay" in semantic or "special overlay" in semantic
    )


def choose_semantic_pass_for_op(op: Dict) -> str | None:
    family = str(op.get("family", "unresolvedFallback"))
    map_chip_name = str(op.get("mapChipName", ""))
    semantic_group = str(op.get("semanticGroup", "unknown"))
    confidence = float(op.get("familyClassification", {}).get("confidence", 0.0))

    if is_foundation_like(map_chip_name, semantic_group, family) and confidence >= 0.55:
        return "semantic_foundation"

    if family in {"overlayFoundation", "edgeTransition"}:
        return "semantic_overlay"

    if "overlay" in semantic_group.lower() and confidence >= 0.4:
        return "semantic_overlay"

    return None


def group_connected_ops(draw_ops: List[Dict], accepted_families: set[str], min_size: int = 2) -> List[Dict]:
    by_cell: Dict[Tuple[int, int], Dict] = {
        (int(op["x"]), int(op["y"])): op
        for op in draw_ops
        if str(op.get("family", "")) in accepted_families
    }
    visited: set[Tuple[int, int]] = set()
    groups: List[Dict] = []
    next_id = 1

    for cell in sorted(by_cell.keys()):
        if cell in visited:
            continue

        queue: deque[Tuple[int, int]] = deque([cell])
        visited.add(cell)
        members: List[Dict] = []

        while queue:
            cx, cy = queue.popleft()
            op = by_cell.get((cx, cy))
            if op is None:
                continue
            members.append(op)
            for nx, ny in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]:
                if (nx, ny) in visited:
                    continue
                if (nx, ny) not in by_cell:
                    continue
                visited.add((nx, ny))
                queue.append((nx, ny))

        if len(members) < min_size:
            continue

        xs = [int(item["x"]) for item in members]
        ys = [int(item["y"]) for item in members]
        width = (max(xs) - min(xs)) + 1
        height = (max(ys) - min(ys)) + 1
        families = sorted({str(item.get("family", "unknown")) for item in members})
        avg_elevation = sum(int(item.get("elevationAppliedY", 0)) for item in members) / max(1, len(members))

        groups.append(
            {
                "groupId": next_id,
                "memberCount": len(members),
                "families": families,
                "bounds": {
                    "x": min(xs),
                    "y": min(ys),
                    "width": width,
                    "height": height,
                },
                "avgElevationY": float(avg_elevation),
                "memberCells": [{"x": int(item["x"]), "y": int(item["y"]), "f2": int(item.get("f2", -1))} for item in members],
            }
        )
        next_id += 1

    return groups


def analyze_semantic_foundations(draw_ops: List[Dict], transition_analysis: Dict) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {(int(op["x"]), int(op["y"])): op for op in draw_ops}
    candidates: List[Dict] = []
    overlay_interaction_counts = {
        "overlayOnTerrain": 0,
        "overlayOnElevated": 0,
        "overlayNearObjectLike": 0,
    }

    for op in draw_ops:
        family = str(op.get("family", "unresolvedFallback"))
        name = str(op.get("mapChipName", ""))
        semantic = str(op.get("semanticGroup", "unknown"))
        x = int(op["x"])
        y = int(op["y"])
        neighbors = [
            by_cell.get((x + 1, y)),
            by_cell.get((x - 1, y)),
            by_cell.get((x, y + 1)),
            by_cell.get((x, y - 1)),
        ]
        neighbors = [item for item in neighbors if item is not None]

        support_count = sum(
            1
            for neighbor in neighbors
            if str(neighbor.get("family", "")) in {"terrainFloor", "overlayFoundation", "edgeTransition"}
        )
        elevated_neighbors = sum(
            1
            for neighbor in neighbors
            if str(neighbor.get("family", "")) in {"raisedFloor", "indoorFloor"}
        )

        confidence = 0.0
        reasons: List[str] = []

        if is_foundation_like(name, semantic, family):
            confidence += 0.42
            reasons.append("family_or_name_foundation_like")
        if support_count >= 2:
            confidence += 0.22
            reasons.append("supported_by_neighbor_surface")
        if elevated_neighbors >= 1:
            confidence += 0.2
            reasons.append("adjacent_to_elevated")
        if int(op.get("zSort", 0)) >= 6:
            confidence += 0.08
            reasons.append("z_bias_supportive")

        transition_hits = sum(
            1
            for candidate in transition_analysis.get("transitionCandidates", [])
            if (
                int(candidate.get("from", {}).get("x", -999)) == x
                and int(candidate.get("from", {}).get("y", -999)) == y
            )
            or (
                int(candidate.get("to", {}).get("x", -999)) == x
                and int(candidate.get("to", {}).get("y", -999)) == y
            )
        )
        if transition_hits >= 2:
            confidence += 0.08
            reasons.append("transition_hotspot")

        confidence = min(0.98, confidence)
        if confidence < 0.45:
            continue

        candidate_type = "foundationChip"
        if elevated_neighbors >= 2:
            candidate_type = "platformSupportChip"
        elif family == "terrainFloor" and support_count >= 2 and elevated_neighbors >= 1:
            candidate_type = "terrainReplacementChip"
        elif family == "edgeTransition":
            candidate_type = "edgeSupportTile"

        candidates.append(
            {
                "x": x,
                "y": y,
                "f2": int(op.get("f2", -1)),
                "mapChipName": name,
                "family": family,
                "candidateType": candidate_type,
                "supportNeighborCount": support_count,
                "elevatedNeighborCount": elevated_neighbors,
                "transitionTouchCount": transition_hits,
                "confidence": float(round(confidence, 4)),
                "reasons": reasons,
            }
        )

        if family in {"overlayFoundation", "edgeTransition"}:
            terrain_touch = any(str(n.get("family", "")) == "terrainFloor" for n in neighbors)
            elevated_touch = any(str(n.get("family", "")) in {"raisedFloor", "indoorFloor"} for n in neighbors)
            object_touch = any(str(n.get("family", "")) == "objectLike" for n in neighbors)
            if terrain_touch:
                overlay_interaction_counts["overlayOnTerrain"] += 1
            if elevated_touch:
                overlay_interaction_counts["overlayOnElevated"] += 1
            if object_touch:
                overlay_interaction_counts["overlayNearObjectLike"] += 1

    candidates.sort(key=lambda item: (-item["confidence"], item["y"], item["x"], item["f2"]))

    structured_rectangles: List[Dict] = []
    for group in group_connected_ops(draw_ops, {"raisedFloor", "indoorFloor", "overlayFoundation", "edgeTransition"}, min_size=4):
        bounds = group["bounds"]
        area = int(bounds["width"]) * int(bounds["height"])
        fill_ratio = float(group["memberCount"] / max(1, area))
        if area >= 6 and fill_ratio >= 0.5:
            structured_rectangles.append(
                {
                    "groupId": int(group["groupId"]),
                    "bounds": bounds,
                    "memberCount": int(group["memberCount"]),
                    "fillRatio": float(round(fill_ratio, 4)),
                    "confidence": float(round(min(0.95, 0.4 + fill_ratio * 0.5), 4)),
                }
            )

    return {
        "semanticFoundationCandidates": candidates[:160],
        "overlayInteractionStats": overlay_interaction_counts,
        "structuredRectangularFormations": structured_rectangles[:80],
    }


def build_grouped_structures(draw_ops: List[Dict], semantic_foundation_candidates: List[Dict]) -> Dict:
    platform_groups = group_connected_ops(draw_ops, {"raisedFloor"}, min_size=3)
    indoor_groups = group_connected_ops(draw_ops, {"indoorFloor"}, min_size=3)
    overlay_groups = group_connected_ops(draw_ops, {"overlayFoundation", "edgeTransition"}, min_size=2)
    facility_groups = group_connected_ops(draw_ops, {"raisedFloor", "indoorFloor", "overlayFoundation", "objectLike"}, min_size=5)

    foundation_cells = {(int(item["x"]), int(item["y"])) for item in semantic_foundation_candidates if float(item.get("confidence", 0.0)) >= 0.55}

    grouped_structures: List[Dict] = []
    for label, groups in [
        ("platformRegion", platform_groups),
        ("indoorAssembly", indoor_groups),
        ("overlayCluster", overlay_groups),
        ("facilityFootprint", facility_groups),
    ]:
        for group in groups:
            member_cells = {(int(cell["x"]), int(cell["y"])) for cell in group.get("memberCells", [])}
            foundation_overlap = len(member_cells & foundation_cells)
            confidence = 0.35
            confidence += min(0.3, float(group["memberCount"]) / 24.0)
            if label in {"platformRegion", "indoorAssembly"} and float(group.get("avgElevationY", 0.0)) <= -3:
                confidence += 0.15
            if label in {"facilityFootprint", "overlayCluster"} and foundation_overlap > 0:
                confidence += 0.2

            grouped_structures.append(
                {
                    "groupId": f"{label}-{group['groupId']}",
                    "structureType": label,
                    "bounds": group["bounds"],
                    "memberCount": int(group["memberCount"]),
                    "families": group["families"],
                    "avgElevationY": float(group.get("avgElevationY", 0.0)),
                    "foundationOverlapCount": foundation_overlap,
                    "confidence": float(round(min(0.96, confidence), 4)),
                    "memberCells": group.get("memberCells", []),
                }
            )

    grouped_structures.sort(key=lambda item: (-item["confidence"], item["structureType"], item["groupId"]))
    return {
        "groupedStructures": grouped_structures,
        "groupSummary": {
            "platformRegionCount": len(platform_groups),
            "indoorAssemblyCount": len(indoor_groups),
            "overlayClusterCount": len(overlay_groups),
            "facilityFootprintCount": len(facility_groups),
        },
    }


def analyze_facility_patterns(draw_ops: List[Dict], grouped_structures: List[Dict], semantic_report: Dict) -> Dict:
    by_cell = {(int(op["x"]), int(op["y"])): op for op in draw_ops}
    terrain_mutation_candidates: List[Dict] = []
    facility_pattern_candidates: List[Dict] = []
    suspicious_elevated_assemblies: List[Dict] = []

    foundation_cells = {
        (int(item["x"]), int(item["y"]))
        for item in semantic_report.get("semanticFoundationCandidates", [])
        if float(item.get("confidence", 0.0)) >= 0.55
    }

    for op in draw_ops:
        family = str(op.get("family", "unresolvedFallback"))
        if family != "terrainFloor":
            continue
        x = int(op["x"])
        y = int(op["y"])
        neighbors = [
            by_cell.get((x + 1, y)),
            by_cell.get((x - 1, y)),
            by_cell.get((x, y + 1)),
            by_cell.get((x, y - 1)),
        ]
        neighbors = [n for n in neighbors if n is not None]
        non_terrain = [n for n in neighbors if str(n.get("family", "")) != "terrainFloor"]
        nearby_foundation = sum(1 for n in neighbors if (int(n["x"]), int(n["y"])) in foundation_cells)
        if len(non_terrain) >= 3 and nearby_foundation >= 1:
            confidence = min(0.93, 0.4 + len(non_terrain) * 0.12 + nearby_foundation * 0.1)
            terrain_mutation_candidates.append(
                {
                    "x": x,
                    "y": y,
                    "f2": int(op.get("f2", -1)),
                    "confidence": float(round(confidence, 4)),
                    "reason": "terrain_interruption_near_foundation",
                }
            )

    for group in grouped_structures:
        bounds = group.get("bounds", {})
        width = int(bounds.get("width", 0))
        height = int(bounds.get("height", 0))
        area = max(1, width * height)
        density = float(group.get("memberCount", 0) / area)
        repeated_footprint = width >= 2 and height >= 2
        confidence = float(group.get("confidence", 0.0))

        if group.get("structureType") == "facilityFootprint":
            if repeated_footprint:
                confidence = min(0.97, confidence + 0.1)
            facility_pattern_candidates.append(
                {
                    "groupId": group.get("groupId"),
                    "bounds": bounds,
                    "memberCount": int(group.get("memberCount", 0)),
                    "density": float(round(density, 4)),
                    "repeatedFootprintDimensions": {"w": width, "h": height},
                    "foundationOverlapCount": int(group.get("foundationOverlapCount", 0)),
                    "confidence": float(round(confidence, 4)),
                }
            )

        if group.get("structureType") in {"platformRegion", "indoorAssembly"} and float(group.get("avgElevationY", 0.0)) <= -3:
            if density < 0.45:
                suspicious_elevated_assemblies.append(
                    {
                        "groupId": group.get("groupId"),
                        "bounds": bounds,
                        "density": float(round(density, 4)),
                        "avgElevationY": float(group.get("avgElevationY", 0.0)),
                        "confidence": float(round(min(0.92, confidence + 0.18), 4)),
                        "reason": "elevated_fragmented_assembly",
                    }
                )

    facility_pattern_candidates.sort(key=lambda item: (-item["confidence"], item["groupId"]))
    terrain_mutation_candidates.sort(key=lambda item: (-item["confidence"], item["y"], item["x"]))
    suspicious_elevated_assemblies.sort(key=lambda item: (-item["confidence"], item["groupId"]))

    footprint_histogram: Dict[str, int] = {}
    for item in facility_pattern_candidates:
        dims = item.get("repeatedFootprintDimensions", {})
        key = f"{int(dims.get('w', 0))}x{int(dims.get('h', 0))}"
        footprint_histogram[key] = footprint_histogram.get(key, 0) + 1

    return {
        "facilityPatternCandidates": facility_pattern_candidates[:80],
        "terrainMutationCandidates": terrain_mutation_candidates[:120],
        "suspiciousElevatedAssemblies": suspicious_elevated_assemblies[:60],
        "repeatedFootprintDimensions": {
            key: int(value)
            for key, value in sorted(footprint_histogram.items(), key=lambda item: (-item[1], item[0]))
        },
    }


def analyze_placement_semantics(
    draw_ops: List[Dict],
    semantic_analysis: Dict,
    grouping_analysis: Dict,
    facility_analysis: Dict,
    transition_analysis: Dict,
) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {(int(op["x"]), int(op["y"])): op for op in draw_ops}
    foundation_cells = {
        (int(item.get("x", -999)), int(item.get("y", -999)))
        for item in semantic_analysis.get("semanticFoundationCandidates", [])
        if float(item.get("confidence", 0.0)) >= 0.55
    }

    semantic_by_cell: Dict[Tuple[int, int], Dict] = {}
    counts: Dict[str, int] = {
        "buildableOutdoorTerrain": 0,
        "indoorOnlyTerrain": 0,
        "blockedOccupiedTerrain": 0,
        "waterReclaimedTerrain": 0,
        "roadConnectedTerrain": 0,
        "foundationSupportedTerrain": 0,
        "elevatedPlatformSupportedTerrain": 0,
        "unresolved": 0,
    }

    indoor_outdoor_stats = {
        "indoorOnly": 0,
        "outdoorCapable": 0,
        "indoorOnlyViolations": 0,
        "unresolved": 0,
    }
    support_diagnostics = {
        "unsupportedPlacements": [],
        "indoorOnlyViolations": [],
        "roadDisconnectionCandidates": [],
        "reclaimedLandEdgeConsistency": [],
    }
    reclaimed_land_candidates: List[Dict] = []
    overlap_conflicts: List[Dict] = []
    confidence_values: List[float] = []

    seen_cells: Dict[Tuple[int, int], List[int]] = {}
    for op in draw_ops:
        key = (int(op["x"]), int(op["y"]))
        seen_cells.setdefault(key, []).append(int(op.get("f2", -1)))

    for (cx, cy), f2_values in seen_cells.items():
        unique_f2 = sorted({value for value in f2_values if value >= 0})
        if len(unique_f2) >= 2:
            overlap_conflicts.append(
                {
                    "x": cx,
                    "y": cy,
                    "f2Ids": unique_f2,
                    "reason": "multiple_structures_same_cell",
                    "confidence": 0.92,
                }
            )

    for op in draw_ops:
        x = int(op["x"])
        y = int(op["y"])
        f2 = int(op.get("f2", -1))
        family = str(op.get("family", "unresolvedFallback"))
        name = str(op.get("mapChipName", "")).lower()
        semantic = str(op.get("semanticGroup", "unknown")).lower()

        neighbors = [
            by_cell.get((x + 1, y)),
            by_cell.get((x - 1, y)),
            by_cell.get((x, y + 1)),
            by_cell.get((x, y - 1)),
        ]
        neighbors = [item for item in neighbors if item is not None]

        indoor_neighbors = sum(1 for item in neighbors if str(item.get("family", "")) == "indoorFloor")
        terrain_neighbors = sum(1 for item in neighbors if str(item.get("family", "")) == "terrainFloor")
        road_neighbors = sum(
            1
            for item in neighbors
            if re.search(r"road|path|street|connector|route|track", str(item.get("mapChipName", "")).lower())
        )
        support_neighbors = sum(
            1
            for item in neighbors
            if str(item.get("family", "")) in {"overlayFoundation", "edgeTransition", "terrainFloor"}
        )

        category_scores = {
            "buildableOutdoorTerrain": 0.0,
            "indoorOnlyTerrain": 0.0,
            "blockedOccupiedTerrain": 0.0,
            "waterReclaimedTerrain": 0.0,
            "roadConnectedTerrain": 0.0,
            "foundationSupportedTerrain": 0.0,
            "elevatedPlatformSupportedTerrain": 0.0,
        }
        reasons: List[str] = []

        if family == "terrainFloor":
            category_scores["buildableOutdoorTerrain"] += 0.55
            reasons.append("terrain_floor_signal")
        if "special indoor" in semantic or family == "indoorFloor" or re.search(r"indoor|room|hall|corridor|floor", name):
            category_scores["indoorOnlyTerrain"] += 0.6
            reasons.append("indoor_signal")
        if family in {"objectLike", "unresolvedFallback"} or re.search(r"wall|gate|tower|tree|house|statue|blocking", name):
            category_scores["blockedOccupiedTerrain"] += 0.5
            reasons.append("occupied_or_object_signal")
        if re.search(r"water|swamp|river|sea|lake|pond|shore|reclaim|reclaimed|landfill|dock", name) or re.search(r"water|shore", semantic):
            category_scores["waterReclaimedTerrain"] += 0.62
            reasons.append("water_or_reclaimed_signal")
        if re.search(r"road|path|street|connector|route|track|bridge", name) or "road/path" in semantic:
            category_scores["roadConnectedTerrain"] += 0.58
            reasons.append("road_signal")
        if (x, y) in foundation_cells or family in {"overlayFoundation", "edgeTransition"}:
            category_scores["foundationSupportedTerrain"] += 0.6
            reasons.append("foundation_support_signal")
        if family in {"raisedFloor", "indoorFloor"}:
            category_scores["elevatedPlatformSupportedTerrain"] += 0.58
            reasons.append("elevated_signal")

        if terrain_neighbors >= 2:
            category_scores["buildableOutdoorTerrain"] += 0.18
        if indoor_neighbors >= 2:
            category_scores["indoorOnlyTerrain"] += 0.2
        if road_neighbors >= 1:
            category_scores["roadConnectedTerrain"] += 0.16
        if support_neighbors >= 2:
            category_scores["foundationSupportedTerrain"] += 0.14
        if family in {"raisedFloor", "indoorFloor"} and support_neighbors >= 1:
            category_scores["elevatedPlatformSupportedTerrain"] += 0.2

        sorted_scores = sorted(category_scores.items(), key=lambda item: item[1], reverse=True)
        top_label, top_score = sorted_scores[0]
        second_score = sorted_scores[1][1] if len(sorted_scores) >= 2 else 0.0
        unresolved = top_score < 0.52 or (top_score - second_score) < 0.1

        if unresolved:
            category = "unresolved"
            confidence = float(round(max(0.2, min(0.5, top_score)), 4))
            indoor_outdoor_stats["unresolved"] += 1
        else:
            category = top_label
            confidence = float(round(min(0.97, top_score), 4))
            counts[category] += 1

        counts["unresolved"] += 1 if category == "unresolved" else 0
        confidence_values.append(confidence)

        is_indoor = category == "indoorOnlyTerrain"
        if is_indoor:
            indoor_outdoor_stats["indoorOnly"] += 1
            if indoor_neighbors == 0 and terrain_neighbors >= 2:
                support_diagnostics["indoorOnlyViolations"].append(
                    {
                        "x": x,
                        "y": y,
                        "f2": f2,
                        "reason": "indoor_tile_surrounded_by_outdoor",
                        "confidence": float(round(min(0.94, 0.6 + terrain_neighbors * 0.08), 4)),
                    }
                )
                indoor_outdoor_stats["indoorOnlyViolations"] += 1
        elif category != "unresolved":
            indoor_outdoor_stats["outdoorCapable"] += 1

        if category == "elevatedPlatformSupportedTerrain" and support_neighbors == 0 and (x, y) not in foundation_cells:
            support_diagnostics["unsupportedPlacements"].append(
                {
                    "x": x,
                    "y": y,
                    "f2": f2,
                    "reason": "elevated_without_support_relationship",
                    "confidence": float(round(min(0.95, 0.58 + max(0, 2 - terrain_neighbors) * 0.12), 4)),
                }
            )

        if category == "roadConnectedTerrain" and road_neighbors == 0:
            support_diagnostics["roadDisconnectionCandidates"].append(
                {
                    "x": x,
                    "y": y,
                    "f2": f2,
                    "reason": "road_like_tile_without_road_neighbor",
                    "confidence": float(round(min(0.9, 0.56 + support_neighbors * 0.08), 4)),
                }
            )

        if category == "waterReclaimedTerrain":
            reclaimed_confidence = float(round(min(0.95, 0.52 + (0.08 if road_neighbors > 0 else 0.0) + (0.1 if "reclaim" in name else 0.0)), 4))
            reclaimed_land_candidates.append(
                {
                    "x": x,
                    "y": y,
                    "f2": f2,
                    "reason": "water_reclaimed_mutation_candidate",
                    "confidence": reclaimed_confidence,
                }
            )
            if terrain_neighbors == 0:
                support_diagnostics["reclaimedLandEdgeConsistency"].append(
                    {
                        "x": x,
                        "y": y,
                        "f2": f2,
                        "reason": "reclaimed_without_terrain_edge_support",
                        "confidence": float(round(min(0.92, 0.58 + road_neighbors * 0.08), 4)),
                    }
                )

        semantic_by_cell[(x, y)] = {
            "x": x,
            "y": y,
            "f2": f2,
            "category": category,
            "confidence": confidence,
            "scores": {key: float(round(value, 4)) for key, value in category_scores.items()},
            "reasons": reasons[:6],
        }

    for candidate in facility_analysis.get("terrainMutationCandidates", []):
        reclaimed_land_candidates.append(
            {
                "x": int(candidate.get("x", 0)),
                "y": int(candidate.get("y", 0)),
                "f2": int(candidate.get("f2", -1)),
                "reason": "facility_terrain_mutation_signal",
                "confidence": float(candidate.get("confidence", 0.0)),
            }
        )

    placement_conflict_candidates = []
    placement_conflict_candidates.extend(overlap_conflicts)
    placement_conflict_candidates.extend(support_diagnostics["unsupportedPlacements"])
    placement_conflict_candidates.extend(support_diagnostics["indoorOnlyViolations"])
    placement_conflict_candidates.extend(support_diagnostics["roadDisconnectionCandidates"])
    placement_conflict_candidates.extend(support_diagnostics["reclaimedLandEdgeConsistency"])

    buildability_stats = {
        "categoryCounts": counts,
        "resolvedCategories": int(sum(count for key, count in counts.items() if key != "unresolved")),
        "unresolvedCategories": int(counts.get("unresolved", 0)),
    }

    semantic_placement_confidence = {
        "averageConfidence": float(round(sum(confidence_values) / max(1, len(confidence_values)), 4)),
        "highConfidenceCells": int(sum(1 for value in confidence_values if value >= 0.75)),
        "lowConfidenceCells": int(sum(1 for value in confidence_values if value < 0.5)),
    }

    return {
        "semanticByCell": semantic_by_cell,
        "buildabilityStats": buildability_stats,
        "indoorOutdoorStats": indoor_outdoor_stats,
        "placementConflictCandidates": placement_conflict_candidates[:180],
        "supportPlacementDiagnostics": {key: value[:120] for key, value in support_diagnostics.items()},
        "reclaimedLandCandidates": reclaimed_land_candidates[:140],
        "semanticPlacementConfidence": semantic_placement_confidence,
    }


def classify_terrain_composition_type(op: Dict, placement_entry: Dict | None) -> str:
    family = str(op.get("family", "unresolvedFallback"))
    name = str(op.get("mapChipName", "")).lower()
    semantic = str(op.get("semanticGroup", "unknown")).lower()
    placement_category = str((placement_entry or {}).get("category", "unresolved"))

    if placement_category == "waterReclaimedTerrain" or re.search(r"reclaim|reclaimed|landfill|dock|fill", name):
        return "reclaimedLandContinuity"
    if re.search(r"water|swamp|river|sea|lake|pond|shore|marsh", name) or re.search(r"water|shore", semantic):
        return "swampWaterContinuity"
    if family == "indoorFloor":
        return "indoorFloorContinuity"
    if re.search(r"road|path|street|route|connector|track|bridge", name) or "road/path" in semantic:
        return "roadPathContinuity"
    if re.search(r"sand|desert|dune|beach", name) or re.search(r"desert|sand", semantic):
        return "sandDesertContinuity"
    if family == "terrainFloor":
        return "connectedDirtRegions"
    return "unresolved"


def analyze_terrain_composition_groups(draw_ops: List[Dict], placement_semantics: Dict) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {(int(op["x"]), int(op["y"])): op for op in draw_ops}
    semantic_by_cell = placement_semantics.get("semanticByCell", {})

    composition_by_cell: Dict[Tuple[int, int], str] = {}
    for op in draw_ops:
        x = int(op["x"])
        y = int(op["y"])
        placement_entry = semantic_by_cell.get((x, y))
        composition_by_cell[(x, y)] = classify_terrain_composition_type(op, placement_entry)

    visited: set[Tuple[int, int]] = set()
    groups: List[Dict] = []
    group_id = 1

    for cell in sorted(composition_by_cell.keys()):
        if cell in visited:
            continue
        composition_type = composition_by_cell[cell]
        if composition_type == "unresolved":
            continue

        queue: deque[Tuple[int, int]] = deque([cell])
        visited.add(cell)
        members: List[Tuple[int, int]] = []

        while queue:
            cx, cy = queue.popleft()
            members.append((cx, cy))
            for nx, ny in [(cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)]:
                if (nx, ny) in visited:
                    continue
                if composition_by_cell.get((nx, ny)) != composition_type:
                    continue
                visited.add((nx, ny))
                queue.append((nx, ny))

        if len(members) < 2:
            continue

        xs = [x for x, _ in members]
        ys = [y for _, y in members]
        bounds = {
            "x": min(xs),
            "y": min(ys),
            "width": (max(xs) - min(xs)) + 1,
            "height": (max(ys) - min(ys)) + 1,
        }
        area = int(bounds["width"]) * int(bounds["height"])
        continuity_score = float(round(min(0.98, 0.35 + (len(members) / max(1, area)) * 0.5 + min(0.2, len(members) / 40.0)), 4))

        groups.append(
            {
                "groupId": f"composition-{group_id}",
                "compositionType": composition_type,
                "memberCount": len(members),
                "bounds": bounds,
                "continuityScore": continuity_score,
                "memberCells": [{"x": x, "y": y, "f2": int(by_cell[(x, y)].get("f2", -1))} for x, y in members],
            }
        )
        group_id += 1

    groups.sort(key=lambda item: (item["compositionType"], -int(item["memberCount"]), item["groupId"]))

    counts_by_type: Dict[str, int] = {}
    for group in groups:
        key = str(group.get("compositionType", "unresolved"))
        counts_by_type[key] = counts_by_type.get(key, 0) + 1

    return {
        "terrainCompositionGroups": groups[:180],
        "compositionTypeCounts": counts_by_type,
    }


def analyze_f2_mapchip_identity(
    draw_ops: List[Dict],
    terrain_composition_analysis: Dict,
    placement_semantics: Dict,
    transition_analysis: Dict,
    coherence_analysis: Dict,
) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {(int(op["x"]), int(op["y"])): op for op in draw_ops}
    placement_by_cell = placement_semantics.get("semanticByCell", {})

    composition_by_cell: Dict[Tuple[int, int], Dict] = {}
    for group in terrain_composition_analysis.get("terrainCompositionGroups", []):
        composition_type = str(group.get("compositionType", "unresolved"))
        continuity_score = float(group.get("continuityScore", 0.0))
        for member in group.get("memberCells", []):
            composition_by_cell[(int(member.get("x", 0)), int(member.get("y", 0)))] = {
                "compositionType": composition_type,
                "continuityScore": continuity_score,
            }

    f2_buckets: Dict[int, Dict] = {}
    adjacency_pairs: Dict[str, int] = {}
    incompatible_transitions: List[Dict] = []
    isolated_mapchip_candidates: List[Dict] = []
    unsupported_transitions: List[Dict] = []
    indoor_outdoor_conflicts: List[Dict] = []
    reclaimed_inconsistencies: List[Dict] = []

    def bucket_for_f2(f2: int) -> Dict:
        if f2 not in f2_buckets:
            f2_buckets[f2] = {
                "f2": f2,
                "memberCells": [],
                "mapChipNames": {},
                "familyCounts": {},
                "compositionCounts": {},
                "placementCategoryCounts": {},
                "avgSupportWeight": 0.0,
                "avgContinuityWeight": 0.0,
            }
        return f2_buckets[f2]

    for op in draw_ops:
        f2 = int(op.get("f2", -1))
        bucket = bucket_for_f2(f2)
        x = int(op["x"])
        y = int(op["y"])
        family = str(op.get("family", "unresolvedFallback"))
        name = str(op.get("mapChipName", ""))

        composition_entry = composition_by_cell.get((x, y), {})
        composition_type = str(composition_entry.get("compositionType", "unresolved"))
        placement_category = str(placement_by_cell.get((x, y), {}).get("category", "unresolved"))

        bucket["memberCells"].append({"x": x, "y": y, "f2": f2})
        bucket["mapChipNames"][name] = int(bucket["mapChipNames"].get(name, 0)) + 1
        bucket["familyCounts"][family] = int(bucket["familyCounts"].get(family, 0)) + 1
        bucket["compositionCounts"][composition_type] = int(bucket["compositionCounts"].get(composition_type, 0)) + 1
        bucket["placementCategoryCounts"][placement_category] = int(bucket["placementCategoryCounts"].get(placement_category, 0)) + 1
        bucket["avgSupportWeight"] += float(op.get("supportWeight", 0.0))
        bucket["avgContinuityWeight"] += float(op.get("continuityWeight", 0.0))

    def classify_cluster(bucket: Dict) -> Dict:
        composition_counts = bucket.get("compositionCounts", {})
        family_counts = bucket.get("familyCounts", {})
        placement_counts = bucket.get("placementCategoryCounts", {})
        names = " ".join(bucket.get("mapChipNames", {}).keys()).lower()

        scores = {
            "dirtSoilFamily": 0.0,
            "swampWaterFamily": 0.0,
            "indoorFloorFamily": 0.0,
            "roadPathFamily": 0.0,
            "platformElevatedFamily": 0.0,
            "overlayFoundationFamily": 0.0,
        }
        reasons: List[str] = []

        if composition_counts.get("connectedDirtRegions", 0) > 0:
            scores["dirtSoilFamily"] += 0.45
            reasons.append("composition_connected_dirt")
        if composition_counts.get("swampWaterContinuity", 0) > 0 or composition_counts.get("reclaimedLandContinuity", 0) > 0:
            scores["swampWaterFamily"] += 0.46
            reasons.append("composition_water_reclaimed")
        if composition_counts.get("indoorFloorContinuity", 0) > 0 or family_counts.get("indoorFloor", 0) > 0:
            scores["indoorFloorFamily"] += 0.48
            reasons.append("composition_or_family_indoor")
        if composition_counts.get("roadPathContinuity", 0) > 0:
            scores["roadPathFamily"] += 0.46
            reasons.append("composition_road_path")
        if family_counts.get("raisedFloor", 0) > 0:
            scores["platformElevatedFamily"] += 0.45
            reasons.append("family_raised_floor")
        if family_counts.get("overlayFoundation", 0) > 0 or family_counts.get("edgeTransition", 0) > 0:
            scores["overlayFoundationFamily"] += 0.45
            reasons.append("family_overlay_foundation")

        if placement_counts.get("waterReclaimedTerrain", 0) > 0:
            scores["swampWaterFamily"] += 0.24
        if placement_counts.get("roadConnectedTerrain", 0) > 0:
            scores["roadPathFamily"] += 0.24
        if placement_counts.get("indoorOnlyTerrain", 0) > 0:
            scores["indoorFloorFamily"] += 0.22
        if placement_counts.get("foundationSupportedTerrain", 0) > 0:
            scores["overlayFoundationFamily"] += 0.2
        if placement_counts.get("elevatedPlatformSupportedTerrain", 0) > 0:
            scores["platformElevatedFamily"] += 0.2

        if re.search(r"water|swamp|river|sea|lake|shore|reclaim", names):
            scores["swampWaterFamily"] += 0.2
        if re.search(r"indoor|floor|room|hall|corridor", names):
            scores["indoorFloorFamily"] += 0.18
        if re.search(r"road|path|street|connector|route|track", names):
            scores["roadPathFamily"] += 0.18
        if re.search(r"platform|deck|bridge|stair|step", names):
            scores["platformElevatedFamily"] += 0.16
        if re.search(r"foundation|overlay|edge|base|support", names):
            scores["overlayFoundationFamily"] += 0.17

        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        best_label, best_score = ranked[0]
        second_score = ranked[1][1] if len(ranked) >= 2 else 0.0
        uncertain = best_score < 0.5 or (best_score - second_score) < 0.08

        confidence = float(round(min(0.96, best_score), 4))
        if uncertain:
            return {
                "cluster": "unknownFamily",
                "confidence": float(round(max(0.25, min(0.55, best_score)), 4)),
                "reasons": reasons[:6],
            }

        return {
            "cluster": best_label,
            "confidence": confidence,
            "reasons": reasons[:6],
        }

    cluster_by_f2: Dict[int, Dict] = {}
    mapchip_family_clusters: List[Dict] = []
    mapchip_confidences: List[float] = []

    for f2, bucket in sorted(f2_buckets.items(), key=lambda item: item[0]):
        member_count = len(bucket.get("memberCells", []))
        if member_count > 0:
            bucket["avgSupportWeight"] = float(round(float(bucket["avgSupportWeight"]) / member_count, 4))
            bucket["avgContinuityWeight"] = float(round(float(bucket["avgContinuityWeight"]) / member_count, 4))

        cluster = classify_cluster(bucket)
        cluster_by_f2[f2] = cluster
        mapchip_confidences.append(float(cluster.get("confidence", 0.0)))
        mapchip_family_clusters.append(
            {
                "f2": f2,
                "cluster": cluster.get("cluster", "unknownFamily"),
                "confidence": float(cluster.get("confidence", 0.0)),
                "memberCount": member_count,
                "dominantMapChipNames": [
                    name
                    for name, _ in sorted(bucket.get("mapChipNames", {}).items(), key=lambda item: (-item[1], item[0]))[:4]
                ],
                "familyCounts": bucket.get("familyCounts", {}),
                "compositionCounts": bucket.get("compositionCounts", {}),
                "placementCategoryCounts": bucket.get("placementCategoryCounts", {}),
                "avgSupportWeight": float(bucket.get("avgSupportWeight", 0.0)),
                "avgContinuityWeight": float(bucket.get("avgContinuityWeight", 0.0)),
                "reasons": cluster.get("reasons", []),
            }
        )

    cluster_by_cell: Dict[Tuple[int, int], Dict] = {}
    for op in draw_ops:
        x = int(op["x"])
        y = int(op["y"])
        f2 = int(op.get("f2", -1))
        cluster = cluster_by_f2.get(f2, {"cluster": "unknownFamily", "confidence": 0.0})
        cluster_by_cell[(x, y)] = {
            "f2": f2,
            "cluster": str(cluster.get("cluster", "unknownFamily")),
            "confidence": float(cluster.get("confidence", 0.0)),
        }

    for (x, y), op in by_cell.items():
        this = cluster_by_cell.get((x, y), {"cluster": "unknownFamily", "confidence": 0.0, "f2": int(op.get("f2", -1))})
        for nx, ny, side in [(x + 1, y, "east"), (x, y + 1, "south")]:
            neighbor = by_cell.get((nx, ny))
            if neighbor is None:
                continue
            other = cluster_by_cell.get((nx, ny), {"cluster": "unknownFamily", "confidence": 0.0, "f2": int(neighbor.get("f2", -1))})
            key = f"{this['f2']}|{other['f2']}"
            adjacency_pairs[key] = int(adjacency_pairs.get(key, 0)) + 1

            incompatible = this["cluster"] != other["cluster"] and "unknownFamily" not in {this["cluster"], other["cluster"]}
            indoor_conflict = {
                str(placement_by_cell.get((x, y), {}).get("category", "unresolved")),
                str(placement_by_cell.get((nx, ny), {}).get("category", "unresolved")),
            } == {"indoorOnlyTerrain", "buildableOutdoorTerrain"}

            if incompatible:
                incompatible_transitions.append(
                    {
                        "from": {"x": x, "y": y, "f2": int(this["f2"]), "cluster": this["cluster"]},
                        "to": {"x": nx, "y": ny, "f2": int(other["f2"]), "cluster": other["cluster"]},
                        "side": side,
                        "reason": "adjacent_mapchip_cluster_mismatch",
                        "confidence": float(round(min(0.94, 0.52 + max(this["confidence"], other["confidence"]) * 0.4), 4)),
                    }
                )

            if indoor_conflict:
                indoor_outdoor_conflicts.append(
                    {
                        "from": {"x": x, "y": y, "f2": int(this["f2"]), "category": placement_by_cell.get((x, y), {}).get("category", "unresolved")},
                        "to": {"x": nx, "y": ny, "f2": int(other["f2"]), "category": placement_by_cell.get((nx, ny), {}).get("category", "unresolved")},
                        "side": side,
                        "reason": "indoor_outdoor_mapchip_conflict",
                    }
                )

            if this["cluster"] == "platformElevatedFamily" and other["cluster"] in {"swampWaterFamily", "dirtSoilFamily"}:
                unsupported_transitions.append(
                    {
                        "from": {"x": x, "y": y, "f2": int(this["f2"]), "cluster": this["cluster"]},
                        "to": {"x": nx, "y": ny, "f2": int(other["f2"]), "cluster": other["cluster"]},
                        "reason": "platform_transition_requires_support",
                    }
                )

    for op in draw_ops:
        x = int(op["x"])
        y = int(op["y"])
        f2 = int(op.get("f2", -1))
        same_f2_neighbors = 0
        for nx, ny in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]:
            neighbor = by_cell.get((nx, ny))
            if neighbor is None:
                continue
            if int(neighbor.get("f2", -999)) == f2:
                same_f2_neighbors += 1
        if same_f2_neighbors == 0:
            cluster = cluster_by_f2.get(f2, {"cluster": "unknownFamily", "confidence": 0.0})
            isolated_mapchip_candidates.append(
                {
                    "x": x,
                    "y": y,
                    "f2": f2,
                    "cluster": cluster.get("cluster", "unknownFamily"),
                    "reason": "isolated_mapchip_island",
                    "confidence": float(round(min(0.92, 0.44 + float(cluster.get("confidence", 0.0)) * 0.38), 4)),
                }
            )

        category = str(placement_by_cell.get((x, y), {}).get("category", "unresolved"))
        if category == "waterReclaimedTerrain" and cluster_by_f2.get(f2, {}).get("cluster") not in {"swampWaterFamily", "overlayFoundationFamily"}:
            reclaimed_inconsistencies.append(
                {
                    "x": x,
                    "y": y,
                    "f2": f2,
                    "cluster": cluster_by_f2.get(f2, {}).get("cluster", "unknownFamily"),
                    "reason": "reclaimed_land_mapchip_cluster_inconsistency",
                }
            )

    mapchip_family_clusters.sort(key=lambda item: (-item["confidence"], -item["memberCount"], item["f2"]))
    incompatible_transitions.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("from", {}).get("f2", 0))))
    isolated_mapchip_candidates.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("f2", 0))))

    continuity_summary = {
        "incompatibleNeighboringMapchips": incompatible_transitions[:180],
        "suspiciousIsolatedF2Islands": isolated_mapchip_candidates[:180],
        "abruptCompositionBreaks": coherence_analysis.get("terrainContinuityDiagnostics", {}).get("abruptFamilyDiscontinuities", [])[:160],
        "unsupportedMapchipTransitions": unsupported_transitions[:160],
        "indoorOutdoorMapchipConflicts": indoor_outdoor_conflicts[:120],
        "reclaimedLandMapchipInconsistencies": reclaimed_inconsistencies[:140],
    }

    f2_mapchip_stats = {
        "uniqueF2Count": len(f2_buckets),
        "clusterCounts": {
            key: sum(1 for item in mapchip_family_clusters if str(item.get("cluster", "")) == key)
            for key in [
                "dirtSoilFamily",
                "swampWaterFamily",
                "indoorFloorFamily",
                "roadPathFamily",
                "platformElevatedFamily",
                "overlayFoundationFamily",
                "unknownFamily",
            ]
        },
        "adjacencyPairCount": len(adjacency_pairs),
    }

    mapchip_composition_confidence = {
        "averageClusterConfidence": float(round(sum(mapchip_confidences) / max(1, len(mapchip_confidences)), 4)),
        "highConfidenceClusters": int(sum(1 for value in mapchip_confidences if value >= 0.75)),
        "lowConfidenceClusters": int(sum(1 for value in mapchip_confidences if value < 0.5)),
    }

    return {
        "mapchipByCell": cluster_by_cell,
        "f2MapchipStats": f2_mapchip_stats,
        "mapchipFamilyClusters": mapchip_family_clusters[:180],
        "mapchipContinuityDiagnostics": continuity_summary,
        "incompatibleMapchipTransitions": incompatible_transitions[:180],
        "isolatedMapchipCandidates": isolated_mapchip_candidates[:180],
        "mapchipCompositionConfidence": mapchip_composition_confidence,
    }


def analyze_terrain_coherence(
    draw_ops: List[Dict],
    transition_analysis: Dict,
    grouping_analysis: Dict,
    semantic_analysis: Dict,
) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {(int(op["x"]), int(op["y"])): op for op in draw_ops}

    unsupported_elevated_tiles: List[Dict] = []
    isolated_terrain_islands: List[Dict] = []
    abrupt_family_discontinuities: List[Dict] = []
    visually_suspicious_gaps: List[Dict] = []
    disconnected_region_candidates: List[Dict] = []
    floating_region_candidates: List[Dict] = []

    overlay_groups = group_connected_ops(draw_ops, {"overlayFoundation", "edgeTransition"}, min_size=2)
    platform_groups = group_connected_ops(draw_ops, {"raisedFloor", "indoorFloor"}, min_size=2)
    foundation_cells = {
        (int(item["x"]), int(item["y"]))
        for item in semantic_analysis.get("semanticFoundationCandidates", [])
        if float(item.get("confidence", 0.0)) >= 0.55
    }

    terrain_supported_elevated = 0
    platform_support_continuous = 0
    foundation_supported_structures = 0
    overlay_attachment_hits = 0

    for op in draw_ops:
        x = int(op["x"])
        y = int(op["y"])
        family = str(op.get("family", "unresolvedFallback"))
        neighbors = [
            by_cell.get((x + 1, y)),
            by_cell.get((x - 1, y)),
            by_cell.get((x, y + 1)),
            by_cell.get((x, y - 1)),
        ]
        neighbors = [item for item in neighbors if item is not None]

        same_family_neighbors = sum(1 for item in neighbors if str(item.get("family", "")) == family)
        terrain_like_neighbors = sum(
            1 for item in neighbors if str(item.get("family", "")) in {"terrainFloor", "overlayFoundation", "edgeTransition"}
        )

        if family in {"raisedFloor", "indoorFloor"}:
            has_support = terrain_like_neighbors >= 1 or (x, y) in foundation_cells
            if has_support:
                terrain_supported_elevated += 1
            else:
                unsupported_elevated_tiles.append(
                    {
                        "x": x,
                        "y": y,
                        "f2": int(op.get("f2", -1)),
                        "family": family,
                        "reason": "no_terrain_or_foundation_support",
                    }
                )

        if family == "terrainFloor" and same_family_neighbors == 0:
            isolated_terrain_islands.append(
                {
                    "x": x,
                    "y": y,
                    "f2": int(op.get("f2", -1)),
                    "reason": "isolated_terrain_tile",
                }
            )

    for transition in transition_analysis.get("transitionCandidates", []):
        if transition.get("isEdgeTransitionInvolved"):
            continue
        family_a = str(transition.get("from", {}).get("family", ""))
        family_b = str(transition.get("to", {}).get("family", ""))
        if family_a == family_b:
            continue
        if {family_a, family_b} & {"unresolvedFallback"}:
            abrupt_family_discontinuities.append(
                {
                    "from": transition.get("from", {}),
                    "to": transition.get("to", {}),
                    "side": transition.get("side"),
                    "reason": "resolved_unresolved_family_break",
                }
            )

    for transition in transition_analysis.get("edgeConflictCandidates", []):
        visually_suspicious_gaps.append(
            {
                "cellA": transition.get("cellA", {}),
                "cellB": transition.get("cellB", {}),
                "reason": "large_adjacent_z_delta",
            }
        )

    if len(overlay_groups) >= 2:
        for group in overlay_groups[1:]:
            disconnected_region_candidates.append(
                {
                    "regionType": "overlayCluster",
                    "groupId": group.get("groupId"),
                    "bounds": group.get("bounds", {}),
                    "memberCount": int(group.get("memberCount", 0)),
                }
            )

    for group in platform_groups:
        member_cells = {(int(item["x"]), int(item["y"])) for item in group.get("memberCells", [])}
        support_hits = sum(1 for cell in member_cells if cell in foundation_cells)
        continuity = float(support_hits / max(1, len(member_cells)))
        if continuity >= 0.2:
            platform_support_continuous += 1
        else:
            floating_region_candidates.append(
                {
                    "groupId": group.get("groupId"),
                    "bounds": group.get("bounds", {}),
                    "memberCount": int(group.get("memberCount", 0)),
                    "supportContinuity": float(round(continuity, 4)),
                    "reason": "platform_group_low_support_continuity",
                }
            )

    grouped_structures = grouping_analysis.get("groupedStructures", [])
    for group in grouped_structures:
        if int(group.get("foundationOverlapCount", 0)) > 0:
            foundation_supported_structures += 1

    overlay_stats = semantic_analysis.get("overlayInteractionStats", {})
    overlay_attachment_hits = int(overlay_stats.get("overlayOnTerrain", 0)) + int(overlay_stats.get("overlayOnElevated", 0))

    terrain_continuity_score = max(0.0, 1.0 - (len(isolated_terrain_islands) / max(1, len(draw_ops))))
    support_confidence_score = max(0.0, 1.0 - (len(unsupported_elevated_tiles) / max(1, len(draw_ops))))
    discontinuity_penalty = len(abrupt_family_discontinuities) / max(1, len(transition_analysis.get("transitionCandidates", [])) or 1)
    abrupt_discontinuity_score = max(0.0, 1.0 - discontinuity_penalty)
    overlay_attachment_score = min(1.0, overlay_attachment_hits / max(1, len(overlay_groups) + 1))

    coherence_scores = {
        "terrainContinuity": float(round(terrain_continuity_score, 4)),
        "supportConfidence": float(round(support_confidence_score, 4)),
        "abruptDiscontinuity": float(round(abrupt_discontinuity_score, 4)),
        "overlayAttachment": float(round(overlay_attachment_score, 4)),
        "overall": float(round((terrain_continuity_score + support_confidence_score + abrupt_discontinuity_score + overlay_attachment_score) / 4.0, 4)),
    }

    support_relationship_stats = {
        "terrainSupportedElevatedTiles": int(terrain_supported_elevated),
        "unsupportedElevatedTiles": len(unsupported_elevated_tiles),
        "platformSupportContinuousGroups": int(platform_support_continuous),
        "floatingPlatformGroups": len(floating_region_candidates),
        "foundationSupportedStructures": int(foundation_supported_structures),
        "overlayAttachmentHits": int(overlay_attachment_hits),
    }

    terrain_continuity_diagnostics = {
        "unsupportedElevatedTiles": unsupported_elevated_tiles[:120],
        "isolatedTerrainIslands": isolated_terrain_islands[:120],
        "abruptFamilyDiscontinuities": abrupt_family_discontinuities[:140],
        "visuallySuspiciousGaps": visually_suspicious_gaps[:140],
    }

    disconnected_region_candidates.extend(
        {
            "regionType": "platformGroup",
            "groupId": item.get("groupId"),
            "bounds": item.get("bounds", {}),
            "memberCount": item.get("memberCount", 0),
            "reason": item.get("reason"),
        }
        for item in floating_region_candidates
    )

    return {
        "coherenceScores": coherence_scores,
        "supportRelationshipStats": support_relationship_stats,
        "disconnectedRegionCandidates": disconnected_region_candidates[:120],
        "floatingRegionCandidates": floating_region_candidates[:80],
        "terrainContinuityDiagnostics": terrain_continuity_diagnostics,
    }


def apply_continuity_refinement_pass(draw_ops: List[Dict], coherence_analysis: Dict, terrain_composition_analysis: Dict | None = None) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {(int(op["x"]), int(op["y"])): op for op in draw_ops}
    adjustments: List[Dict] = []
    z_refinements = 0
    padding_refinements = 0
    anchor_refinements = 0
    floating_bounds: List[Tuple[int, int, int, int]] = []

    for item in coherence_analysis.get("floatingRegionCandidates", []):
        bounds = item.get("bounds", {})
        bx = int(bounds.get("x", 0))
        by = int(bounds.get("y", 0))
        bw = int(bounds.get("width", 0))
        bh = int(bounds.get("height", 0))
        if bw > 0 and bh > 0:
            floating_bounds.append((bx, by, bx + bw - 1, by + bh - 1))

    composition_by_cell: Dict[Tuple[int, int], Dict] = {}
    if isinstance(terrain_composition_analysis, dict):
        for group in terrain_composition_analysis.get("terrainCompositionGroups", []):
            continuity_score = float(group.get("continuityScore", 0.0))
            composition_type = str(group.get("compositionType", "unresolved"))
            for member in group.get("memberCells", []):
                cell = (int(member.get("x", 0)), int(member.get("y", 0)))
                composition_by_cell[cell] = {
                    "continuityScore": continuity_score,
                    "compositionType": composition_type,
                }

    for op in draw_ops:
        x = int(op["x"])
        y = int(op["y"])
        family = str(op.get("family", "unresolvedFallback"))
        profile = op.get("familyProfile", {})

        neighbors = [
            by_cell.get((x + 1, y)),
            by_cell.get((x - 1, y)),
            by_cell.get((x, y + 1)),
            by_cell.get((x, y - 1)),
        ]
        neighbors = [item for item in neighbors if item is not None]
        same_family_neighbors = sum(1 for item in neighbors if str(item.get("family", "")) == family)
        terrain_neighbors = sum(1 for item in neighbors if str(item.get("family", "")) == "terrainFloor")

        composition_entry = composition_by_cell.get((x, y), {})
        composition_bonus = float(composition_entry.get("continuityScore", 0.0)) * 0.2

        continuity_weight = min(1.0, max(0.0, (same_family_neighbors / 3.0) + (0.2 if terrain_neighbors > 0 else 0.0) + composition_bonus))
        support_weight = min(1.0, max(0.0, (terrain_neighbors / 2.0) + (0.25 if family in {"terrainFloor", "overlayFoundation", "edgeTransition"} else 0.0)))

        op["continuityWeight"] = float(round(continuity_weight, 4))
        op["supportWeight"] = float(round(support_weight, 4))
        op["floatingCandidate"] = any(bx <= x <= ex and by <= y <= ey for bx, by, ex, ey in floating_bounds)
        op["compositionContinuityScore"] = float(round(float(composition_entry.get("continuityScore", 0.0)), 4))
        op["compositionType"] = str(composition_entry.get("compositionType", "unresolved"))

        if family in {"raisedFloor", "indoorFloor"} and same_family_neighbors <= 1 and terrain_neighbors == 0:
            op["zSort"] = int(op.get("zSort", 0)) - 2
            z_refinements += 1
            adjustments.append(
                {
                    "x": x,
                    "y": y,
                    "f2": int(op.get("f2", -1)),
                    "type": "zBiasRefinement",
                    "delta": -2,
                    "reason": "unsupported_elevated_local_refinement",
                }
            )

        if family == "terrainFloor" and continuity_weight >= 0.65:
            op["refinedOverlapPaddingY"] = int(profile.get("overlapPaddingY", 0)) + 1
            padding_refinements += 1
            adjustments.append(
                {
                    "x": x,
                    "y": y,
                    "f2": int(op.get("f2", -1)),
                    "type": "overlapPaddingRefinement",
                    "delta": 1,
                    "reason": "terrain_continuity_boost",
                }
            )
        else:
            op["refinedOverlapPaddingY"] = int(profile.get("overlapPaddingY", 0))

        if family in {"overlayFoundation", "edgeTransition"} and terrain_neighbors >= 2:
            op["refinedAnchorBiasY"] = int(profile.get("anchorBiasY", 0)) - 1
            anchor_refinements += 1
            adjustments.append(
                {
                    "x": x,
                    "y": y,
                    "f2": int(op.get("f2", -1)),
                    "type": "anchorBiasRefinement",
                    "delta": -1,
                    "reason": "overlay_attachment_alignment",
                }
            )
        else:
            op["refinedAnchorBiasY"] = int(profile.get("anchorBiasY", 0))

    return {
        "continuityRefinementAdjustments": adjustments[:240],
        "stats": {
            "zBiasRefinements": int(z_refinements),
            "overlapPaddingRefinements": int(padding_refinements),
            "anchorBiasRefinements": int(anchor_refinements),
            "totalAdjustments": int(z_refinements + padding_refinements + anchor_refinements),
        },
    }


def build_debug_visualizations(
    draw_ops: List[Dict],
    transition_analysis: Dict,
    semantic_analysis: Dict,
    grouped_structures: List[Dict],
    facility_patterns: Dict,
    coherence_analysis: Dict,
    continuity_refinement: Dict,
    placement_semantics: Dict,
    terrain_composition_analysis: Dict,
    mapchip_analysis: Dict,
    canvas_width: int,
    canvas_height: int,
    base_x: int,
    base_y: int,
    tile_width: int,
    tile_height: int,
) -> Dict[str, Image.Image]:
    family_mask = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    elevation_mask = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    transition_overlay = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    z_order_overlay = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    foundation_overlay = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    grouping_mask = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    facility_overlay = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    overlay_interaction_map = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    terrain_mutation_map = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    terrain_coherence_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    support_relationship_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    disconnected_region_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    continuity_refinement_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    floating_region_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    buildability_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    indoor_outdoor_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    terrain_support_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    blocked_placement_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    reclaimed_land_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    structure_overlap_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    f2_mapchip_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    mapchip_continuity_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    mapchip_transition_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    mapchip_family_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    composition_vs_mapchip_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
    semantic_vs_mapchip_review = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))

    family_draw = ImageDraw.Draw(family_mask)
    elevation_draw = ImageDraw.Draw(elevation_mask)
    transition_draw = ImageDraw.Draw(transition_overlay)
    z_draw = ImageDraw.Draw(z_order_overlay)
    foundation_draw = ImageDraw.Draw(foundation_overlay)
    grouping_draw = ImageDraw.Draw(grouping_mask)
    facility_draw = ImageDraw.Draw(facility_overlay)
    overlay_draw = ImageDraw.Draw(overlay_interaction_map)
    mutation_draw = ImageDraw.Draw(terrain_mutation_map)
    coherence_draw = ImageDraw.Draw(terrain_coherence_review)
    support_draw = ImageDraw.Draw(support_relationship_review)
    disconnected_draw = ImageDraw.Draw(disconnected_region_review)
    refinement_draw = ImageDraw.Draw(continuity_refinement_review)
    floating_draw = ImageDraw.Draw(floating_region_review)
    buildability_draw = ImageDraw.Draw(buildability_review)
    indoor_outdoor_draw = ImageDraw.Draw(indoor_outdoor_review)
    terrain_support_draw = ImageDraw.Draw(terrain_support_review)
    blocked_draw = ImageDraw.Draw(blocked_placement_review)
    reclaimed_draw = ImageDraw.Draw(reclaimed_land_review)
    overlap_draw = ImageDraw.Draw(structure_overlap_review)
    f2_mapchip_draw = ImageDraw.Draw(f2_mapchip_review)
    mapchip_continuity_draw = ImageDraw.Draw(mapchip_continuity_review)
    mapchip_transition_draw = ImageDraw.Draw(mapchip_transition_review)
    mapchip_family_draw = ImageDraw.Draw(mapchip_family_review)
    composition_vs_mapchip_draw = ImageDraw.Draw(composition_vs_mapchip_review)
    semantic_vs_mapchip_draw = ImageDraw.Draw(semantic_vs_mapchip_review)

    placement_colors = {
        "buildableOutdoorTerrain": (92, 188, 110, 170),
        "indoorOnlyTerrain": (152, 126, 210, 170),
        "blockedOccupiedTerrain": (198, 86, 86, 180),
        "waterReclaimedTerrain": (88, 146, 176, 170),
        "roadConnectedTerrain": (186, 162, 96, 170),
        "foundationSupportedTerrain": (178, 148, 102, 170),
        "elevatedPlatformSupportedTerrain": (116, 164, 214, 170),
        "unresolved": (126, 126, 126, 150),
    }

    max_rank = max(1, len(draw_ops) - 1)
    mixed_coords = {
        (int(item["x"]), int(item["y"]))
        for item in transition_analysis.get("mixedCoords", [])
    }

    for rank, op in enumerate(draw_ops):
        dx = int(op["left"]) + base_x
        dy = int(op["top"]) + base_y
        family = str(op.get("family", "unresolvedFallback"))
        family_color = family_debug_color(family)
        half_w = tile_width // 2
        half_h = tile_height // 2
        cx = dx + half_w
        cy = dy
        points = [
            (cx, cy),
            (cx + half_w, cy + half_h),
            (cx, cy + tile_height),
            (cx - half_w, cy + half_h),
        ]

        family_draw.polygon(points, fill=family_color)

        elev = abs(int(op.get("elevationAppliedY", 0)))
        elev_alpha = min(255, 50 + (elev * 18))
        elevation_draw.polygon(points, fill=(elev_alpha, elev_alpha, elev_alpha, 180))

        ramp = int((rank / max_rank) * 255)
        z_draw.polygon(points, fill=(ramp, 255 - ramp, 180, 170))

        if (int(op["x"]), int(op["y"])) in mixed_coords:
            transition_draw.polygon(points, outline=(255, 140, 90, 220), fill=(255, 140, 90, 50))

        continuity_weight = float(op.get("continuityWeight", 0.0))
        support_weight = float(op.get("supportWeight", 0.0))
        coherence_alpha = min(220, 55 + int(continuity_weight * 140))
        support_alpha = min(220, 55 + int(support_weight * 140))
        coherence_draw.polygon(points, fill=(75, 208, 140, coherence_alpha))
        support_draw.polygon(points, fill=(84, 146, 255, support_alpha))

        if bool(op.get("floatingCandidate")):
            floating_draw.polygon(points, fill=(255, 82, 82, 92), outline=(255, 138, 138, 220))

        if int(op.get("zSort", 0)) != int(op.get("drawLayer", 0) * 8) + int(op.get("familyProfile", {}).get("zBias", 0)) + max(0, -int(op.get("elevationAppliedY", 0))):
            refinement_draw.polygon(points, fill=(255, 199, 86, 98), outline=(255, 228, 128, 220))

        placement_category = str(op.get("placementSemanticCategory", "unresolved"))
        placement_confidence = float(op.get("placementSemanticConfidence", 0.0))
        buildability_color = placement_colors.get(placement_category, placement_colors["unresolved"])
        buildability_alpha = min(220, max(55, int(35 + placement_confidence * 180)))
        buildability_draw.polygon(
            points,
            fill=(buildability_color[0], buildability_color[1], buildability_color[2], buildability_alpha),
            outline=(buildability_color[0], buildability_color[1], buildability_color[2], 220),
        )

        if placement_category == "indoorOnlyTerrain":
            indoor_outdoor_draw.polygon(points, fill=(156, 126, 225, 165), outline=(196, 176, 248, 220))
        elif placement_category == "buildableOutdoorTerrain":
            indoor_outdoor_draw.polygon(points, fill=(88, 185, 106, 155), outline=(132, 224, 148, 220))
        else:
            indoor_outdoor_draw.polygon(points, fill=(118, 128, 136, 88))

        if placement_category in {"foundationSupportedTerrain", "elevatedPlatformSupportedTerrain"}:
            terrain_support_draw.polygon(points, fill=(224, 178, 98, 155), outline=(246, 212, 132, 230))
        elif float(op.get("supportWeight", 0.0)) >= 0.5:
            terrain_support_draw.polygon(points, fill=(124, 174, 232, 122))

        if placement_category == "blockedOccupiedTerrain":
            blocked_draw.polygon(points, fill=(214, 90, 90, 165), outline=(248, 142, 142, 228))

        if placement_category == "waterReclaimedTerrain" or str(op.get("compositionType", "")) in {"swampWaterContinuity", "reclaimedLandContinuity"}:
            reclaimed_draw.polygon(points, fill=(96, 150, 168, 152), outline=(146, 202, 224, 228))

        mapchip_cluster = str(op.get("mapchipCluster", "unknownFamily"))
        mapchip_color = mapchip_visual_color(
            mapchip_cluster=mapchip_cluster,
            f2=int(op.get("f2", 0)),
            compatibility=float(op.get("mapchipNeighborCompatibility", 0.0)),
            continuity_score=float(op.get("compositionContinuityScore", 0.0)),
            confidence=float(op.get("mapchipClusterConfidence", 0.0)),
        )
        f2_mapchip_draw.polygon(points, fill=mapchip_color, outline=(max(20, mapchip_color[0] - 20), max(20, mapchip_color[1] - 20), max(20, mapchip_color[2] - 20), 240))

        compat = float(op.get("mapchipNeighborCompatibility", 0.0))
        mapchip_continuity_draw.polygon(points, fill=(82, 206, 170, min(220, 50 + int(compat * 150))))
        mapchip_family_draw.polygon(points, fill=(mapchip_cluster_base_color(mapchip_cluster)[0], mapchip_cluster_base_color(mapchip_cluster)[1], mapchip_cluster_base_color(mapchip_cluster)[2], 170))

        comp_type = str(op.get("compositionType", "unresolved"))
        composition_color = terrain_composition_color(comp_type, int(op.get("f2", 0)))
        composition_vs_mapchip_draw.polygon(points, fill=(composition_color[0], composition_color[1], composition_color[2], 150), outline=(mapchip_color[0], mapchip_color[1], mapchip_color[2], 220))
        semantic_vs_mapchip_draw.polygon(points, fill=(family_color[0], family_color[1], family_color[2], 120), outline=(mapchip_color[0], mapchip_color[1], mapchip_color[2], 220))

    foundation_candidates = {
        (int(item.get("x", -999)), int(item.get("y", -999))): float(item.get("confidence", 0.0))
        for item in semantic_analysis.get("semanticFoundationCandidates", [])
    }
    mutation_candidates = {
        (int(item.get("x", -999)), int(item.get("y", -999))): float(item.get("confidence", 0.0))
        for item in facility_patterns.get("terrainMutationCandidates", [])
    }
    overlay_cells = {
        (int(op["x"]), int(op["y"]))
        for op in draw_ops
        if str(op.get("family", "")) in {"overlayFoundation", "edgeTransition"}
    }

    group_cell_to_id: Dict[Tuple[int, int], int] = {}
    for idx, group in enumerate(grouped_structures):
        for member in group.get("memberCells", []):
            group_cell_to_id[(int(member.get("x", 0)), int(member.get("y", 0)))] = idx + 1

    for op in draw_ops:
        x = int(op["x"])
        y = int(op["y"])
        dx = int(op["left"]) + base_x
        dy = int(op["top"]) + base_y
        half_w = tile_width // 2
        half_h = tile_height // 2
        cx = dx + half_w
        cy = dy
        points = [
            (cx, cy),
            (cx + half_w, cy + half_h),
            (cx, cy + tile_height),
            (cx - half_w, cy + half_h),
        ]

        foundation_conf = foundation_candidates.get((x, y))
        if foundation_conf is not None:
            alpha = min(240, 70 + int(foundation_conf * 140))
            foundation_draw.polygon(points, fill=(215, 170, 80, alpha), outline=(255, 210, 110, 220))

        group_id = group_cell_to_id.get((x, y))
        if group_id is not None:
            digest = hashlib.sha256(f"group-{group_id}".encode("utf-8")).hexdigest()
            color = (
                int(digest[0:2], 16),
                int(digest[2:4], 16),
                int(digest[4:6], 16),
                160,
            )
            grouping_draw.polygon(points, fill=color)

        if (x, y) in overlay_cells:
            overlay_draw.polygon(points, fill=(85, 186, 210, 110), outline=(105, 226, 240, 210))

        mutation_conf = mutation_candidates.get((x, y))
        if mutation_conf is not None:
            alpha = min(230, 70 + int(mutation_conf * 130))
            mutation_draw.polygon(points, fill=(230, 95, 95, alpha), outline=(255, 132, 132, 225))

    for candidate in facility_patterns.get("facilityPatternCandidates", [])[:24]:
        bounds = candidate.get("bounds", {})
        bx = int(bounds.get("x", 0))
        by = int(bounds.get("y", 0))
        bw = int(bounds.get("width", 0))
        bh = int(bounds.get("height", 0))
        if bw <= 0 or bh <= 0:
            continue

        corners = [
            (bx, by),
            (bx + bw - 1, by),
            (bx + bw - 1, by + bh - 1),
            (bx, by + bh - 1),
        ]
        screen_points = [
            (
                (cx - cy) * (tile_width // 2) + base_x + (tile_width // 2),
                (cx + cy) * (tile_height // 2) + base_y + (tile_height // 2),
            )
            for cx, cy in corners
        ]
        facility_draw.polygon(screen_points, outline=(255, 240, 90, 220), fill=(255, 240, 90, 40))

    for candidate in transition_analysis.get("edgeConflictCandidates", [])[:80]:
        a = candidate.get("cellA", {})
        b = candidate.get("cellB", {})
        ax = int(a.get("x", 0))
        ay = int(a.get("y", 0))
        bx = int(b.get("x", 0))
        by = int(b.get("y", 0))
        center_a = ((ax - ay) * (tile_width // 2) + base_x + (tile_width // 2), (ax + ay) * (tile_height // 2) + base_y + (tile_height // 2))
        center_b = ((bx - by) * (tile_width // 2) + base_x + (tile_width // 2), (bx + by) * (tile_height // 2) + base_y + (tile_height // 2))
        transition_draw.line([center_a, center_b], fill=(255, 70, 70, 220), width=2)

    for candidate in coherence_analysis.get("disconnectedRegionCandidates", [])[:80]:
        bounds = candidate.get("bounds", {})
        bx = int(bounds.get("x", 0))
        by = int(bounds.get("y", 0))
        bw = int(bounds.get("width", 0))
        bh = int(bounds.get("height", 0))
        if bw <= 0 or bh <= 0:
            continue
        corners = [
            (bx, by),
            (bx + bw - 1, by),
            (bx + bw - 1, by + bh - 1),
            (bx, by + bh - 1),
        ]
        screen_points = [
            (
                (cx - cy) * (tile_width // 2) + base_x + (tile_width // 2),
                (cx + cy) * (tile_height // 2) + base_y + (tile_height // 2),
            )
            for cx, cy in corners
        ]
        disconnected_draw.polygon(screen_points, outline=(255, 110, 110, 225), fill=(255, 110, 110, 45))

    for candidate in coherence_analysis.get("floatingRegionCandidates", [])[:60]:
        bounds = candidate.get("bounds", {})
        bx = int(bounds.get("x", 0))
        by = int(bounds.get("y", 0))
        bw = int(bounds.get("width", 0))
        bh = int(bounds.get("height", 0))
        if bw <= 0 or bh <= 0:
            continue
        corners = [
            (bx, by),
            (bx + bw - 1, by),
            (bx + bw - 1, by + bh - 1),
            (bx, by + bh - 1),
        ]
        screen_points = [
            (
                (cx - cy) * (tile_width // 2) + base_x + (tile_width // 2),
                (cx + cy) * (tile_height // 2) + base_y + (tile_height // 2),
            )
            for cx, cy in corners
        ]
        floating_draw.polygon(screen_points, outline=(255, 190, 120, 230), fill=(255, 190, 120, 35))

    for adjustment in continuity_refinement.get("continuityRefinementAdjustments", [])[:180]:
        ax = int(adjustment.get("x", 0))
        ay = int(adjustment.get("y", 0))
        center = (
            (ax - ay) * (tile_width // 2) + base_x + (tile_width // 2),
            (ax + ay) * (tile_height // 2) + base_y + (tile_height // 2),
        )
        refinement_draw.ellipse(
            [
                (center[0] - 3, center[1] - 3),
                (center[0] + 3, center[1] + 3),
            ],
            fill=(255, 250, 160, 220),
            outline=(255, 255, 220, 255),
        )

    support_diag = placement_semantics.get("supportPlacementDiagnostics", {})
    for item in support_diag.get("unsupportedPlacements", [])[:120]:
        x = int(item.get("x", 0))
        y = int(item.get("y", 0))
        center = (
            (x - y) * (tile_width // 2) + base_x + (tile_width // 2),
            (x + y) * (tile_height // 2) + base_y + (tile_height // 2),
        )
        terrain_support_draw.ellipse([(center[0] - 4, center[1] - 4), (center[0] + 4, center[1] + 4)], fill=(255, 88, 88, 215), outline=(255, 140, 140, 255))

    for item in placement_semantics.get("placementConflictCandidates", [])[:120]:
        x = int(item.get("x", 0))
        y = int(item.get("y", 0))
        center = (
            (x - y) * (tile_width // 2) + base_x + (tile_width // 2),
            (x + y) * (tile_height // 2) + base_y + (tile_height // 2),
        )
        overlap_draw.ellipse([(center[0] - 4, center[1] - 4), (center[0] + 4, center[1] + 4)], fill=(255, 102, 102, 220), outline=(255, 166, 166, 255))

    for item in placement_semantics.get("reclaimedLandCandidates", [])[:140]:
        x = int(item.get("x", 0))
        y = int(item.get("y", 0))
        center = (
            (x - y) * (tile_width // 2) + base_x + (tile_width // 2),
            (x + y) * (tile_height // 2) + base_y + (tile_height // 2),
        )
        reclaimed_draw.ellipse([(center[0] - 3, center[1] - 3), (center[0] + 3, center[1] + 3)], fill=(222, 232, 132, 215), outline=(246, 252, 178, 255))

    for group in terrain_composition_analysis.get("terrainCompositionGroups", [])[:100]:
        bounds = group.get("bounds", {})
        bx = int(bounds.get("x", 0))
        by = int(bounds.get("y", 0))
        bw = int(bounds.get("width", 0))
        bh = int(bounds.get("height", 0))
        if bw <= 0 or bh <= 0:
            continue
        corners = [
            (bx, by),
            (bx + bw - 1, by),
            (bx + bw - 1, by + bh - 1),
            (bx, by + bh - 1),
        ]
        screen_points = [
            (
                (cx - cy) * (tile_width // 2) + base_x + (tile_width // 2),
                (cx + cy) * (tile_height // 2) + base_y + (tile_height // 2),
            )
            for cx, cy in corners
        ]
        buildability_draw.polygon(screen_points, outline=(255, 255, 255, 110), fill=(255, 255, 255, 10))

    for candidate in mapchip_analysis.get("incompatibleMapchipTransitions", [])[:180]:
        a = candidate.get("from", {})
        b = candidate.get("to", {})
        ax = int(a.get("x", 0))
        ay = int(a.get("y", 0))
        bx = int(b.get("x", 0))
        by = int(b.get("y", 0))
        center_a = ((ax - ay) * (tile_width // 2) + base_x + (tile_width // 2), (ax + ay) * (tile_height // 2) + base_y + (tile_height // 2))
        center_b = ((bx - by) * (tile_width // 2) + base_x + (tile_width // 2), (bx + by) * (tile_height // 2) + base_y + (tile_height // 2))
        mapchip_transition_draw.line([center_a, center_b], fill=(255, 98, 98, 225), width=2)

    for candidate in mapchip_analysis.get("isolatedMapchipCandidates", [])[:180]:
        x = int(candidate.get("x", 0))
        y = int(candidate.get("y", 0))
        center = (
            (x - y) * (tile_width // 2) + base_x + (tile_width // 2),
            (x + y) * (tile_height // 2) + base_y + (tile_height // 2),
        )
        mapchip_transition_draw.ellipse([(center[0] - 4, center[1] - 4), (center[0] + 4, center[1] + 4)], fill=(255, 214, 132, 230), outline=(255, 242, 182, 255))

    return {
        "familyLayerMask": family_mask,
        "elevationMask": elevation_mask,
        "transitionCandidatesOverlay": transition_overlay,
        "zOrderVisualization": z_order_overlay,
        "foundationCandidateOverlay": foundation_overlay,
        "structureGroupingMask": grouping_mask,
        "facilityFootprintCandidates": facility_overlay,
        "overlayInteractionMap": overlay_interaction_map,
        "terrainMutationCandidateMap": terrain_mutation_map,
        "terrainCoherenceReview": terrain_coherence_review,
        "supportRelationshipReview": support_relationship_review,
        "disconnectedRegionReview": disconnected_region_review,
        "continuityRefinementReview": continuity_refinement_review,
        "floatingRegionReview": floating_region_review,
        "buildabilityReview": buildability_review,
        "indoorOutdoorReview": indoor_outdoor_review,
        "terrainSupportReview": terrain_support_review,
        "blockedPlacementReview": blocked_placement_review,
        "reclaimedLandReview": reclaimed_land_review,
        "structureOverlapReview": structure_overlap_review,
        "f2MapchipReview": f2_mapchip_review,
        "mapchipContinuityReview": mapchip_continuity_review,
        "mapchipTransitionReview": mapchip_transition_review,
        "mapchipFamilyReview": mapchip_family_review,
        "compositionVsMapchipReview": composition_vs_mapchip_review,
        "semanticVsMapchipReview": semantic_vs_mapchip_review,
    }


def classify_render_family(
    *,
    map_chip_name: str,
    semantic_group: str,
    draw_layer: int,
    resolved: bool,
    sprite_size: Tuple[int, int] | None,
    floor_medians: Dict,
) -> Dict:
    if not resolved:
        return {
            "family": "unresolvedFallback",
            "confidence": 1.0,
            "ambiguous": False,
            "reasons": ["unresolved_or_missing_sprite"],
        }

    name = map_chip_name.lower()
    semantic = semantic_group.lower()
    reasons: List[str] = []

    if re.search(r"edge|side|boundary|cliff|slope|bank|shore", name):
        return {
            "family": "edgeTransition",
            "confidence": 0.92,
            "ambiguous": False,
            "reasons": ["name_edge_transition"],
        }

    if "special overlay" in semantic or re.search(r"switch|marker|foundation|base|overlay|construction", name):
        return {
            "family": "overlayFoundation",
            "confidence": 0.9,
            "ambiguous": False,
            "reasons": ["overlay_or_foundation_semantic"],
        }

    if re.search(r"platform|deck|stage|bridge|balcony|stair|step", name):
        return {
            "family": "raisedFloor",
            "confidence": 0.88,
            "ambiguous": False,
            "reasons": ["name_raised_floor"],
        }

    if re.search(r"floor|rouka|corridor|hall|room|indoor|carpet", name):
        return {
            "family": "indoorFloor",
            "confidence": 0.87,
            "ambiguous": False,
            "reasons": ["name_indoor_floor"],
        }

    if "terrain" in semantic or re.search(r"land|grass|desert|rock|snow|soil|ground", name):
        return {
            "family": "terrainFloor",
            "confidence": 0.86,
            "ambiguous": False,
            "reasons": ["terrain_semantic_or_name"],
        }

    med_w = int(floor_medians.get("w", 48))
    med_h = int(floor_medians.get("h", 25))
    if sprite_size is not None:
        w, h = sprite_size
        if w > int(med_w * 1.3) or h > int(med_h * 1.35) or draw_layer >= 2:
            reasons.append("size_or_layer_objectlike")

    if re.search(r"cave|tree|house|tower|gate|wall|pillar|statue|arch", name):
        reasons.append("name_objectlike")

    if reasons:
        return {
            "family": "objectLike",
            "confidence": 0.8,
            "ambiguous": False,
            "reasons": reasons,
        }

    if "road/path" in semantic:
        return {
            "family": "terrainFloor",
            "confidence": 0.6,
            "ambiguous": True,
            "reasons": ["road_path_fallback_to_terrain"],
        }

    return {
        "family": "objectLike",
        "confidence": 0.45,
        "ambiguous": True,
        "reasons": ["weak_signal_default"],
    }


def analyze_resolution_family_coverage(input_data: Dict, ka_website_root: Path, floor_medians: Dict) -> Dict:
    family_counts: Dict[str, int] = {
        "terrainFloor": 0,
        "raisedFloor": 0,
        "indoorFloor": 0,
        "overlayFoundation": 0,
        "edgeTransition": 0,
        "objectLike": 0,
        "unresolvedFallback": 0,
    }
    f2_ids_by_family: Dict[str, set[int]] = {family: set() for family in family_counts.keys()}
    ambiguous_f2_ids: set[int] = set()
    unresolved_f2_ids: set[int] = set()

    for resolution in input_data.get("visualResolutions", []):
        map_chip_id = int(resolution.get("mapChipId", -1))
        map_chip_name = str(resolution.get("mapChipName", ""))
        semantic_group = str(resolution.get("semanticGroup", "unknown"))
        draw_layer = int(resolution.get("drawLayer", 0))
        sprite_rel = resolution.get("spriteSourcePng")
        resolved = bool(resolution.get("resolved") and sprite_rel)

        sprite_size: Tuple[int, int] | None = None
        if resolved and isinstance(sprite_rel, str):
            sprite_abs = (ka_website_root / sprite_rel).resolve()
            if sprite_abs.exists():
                sprite_size = Image.open(sprite_abs).convert("RGBA").size

        classified = classify_render_family(
            map_chip_name=map_chip_name,
            semantic_group=semantic_group,
            draw_layer=draw_layer,
            resolved=resolved,
            sprite_size=sprite_size,
            floor_medians=floor_medians,
        )
        family = classified["family"]

        family_counts[family] = family_counts.get(family, 0) + 1
        if map_chip_id >= 0:
            f2_ids_by_family.setdefault(family, set()).add(map_chip_id)
            if bool(classified.get("ambiguous")):
                ambiguous_f2_ids.add(map_chip_id)
            if family == "unresolvedFallback":
                unresolved_f2_ids.add(map_chip_id)

    return {
        "familyCounts": {family: int(count) for family, count in family_counts.items()},
        "f2IdsByFamily": {
            family: sorted(values)
            for family, values in f2_ids_by_family.items()
        },
        "ambiguousF2Ids": sorted(ambiguous_f2_ids),
        "unresolvedF2Ids": sorted(unresolved_f2_ids),
    }


def render_region_mode(
    region: Dict,
    mode: str,
    ka_website_root: Path,
    ka_chip_dir: Path,
    parse_opt,
    tile_width: int,
    tile_height: int,
    tile_step_x: int,
    tile_step_y: int,
    padding: int,
    family_profiles: Dict[str, Dict],
    floor_medians: Dict,
) -> Tuple[Image.Image, Dict]:
    sprite_cache: Dict[str, Image.Image] = {}
    anchor_meta_cache: Dict[str, Dict] = {}

    draw_ops: List[Dict] = []
    min_x = 10**9
    min_y = 10**9
    max_x = -10**9
    max_y = -10**9

    sprite_count = 0
    fallback_tile_count = 0
    metadata_anchor_count = 0
    bottom_center_fallback_count = 0
    unresolved_anchor_reasons: Dict[str, int] = {}
    family_tile_counts: Dict[str, int] = {}
    family_f2_ids: Dict[str, set[int]] = {}
    ambiguous_f2_ids: set[int] = set()
    problem_candidates: Dict[int, Dict] = {}
    elevated_family_counts: Dict[str, int] = {}
    asset_identity_by_base: Dict[str, Dict] = {}

    for tile in region.get("tiles", []):
        x = int(tile["x"])
        y = int(tile["y"])
        draw_layer = int(tile.get("drawLayer", 0))
        f2 = int(tile.get("f2", 0))

        sprite_path = tile.get("spriteSourcePng") if tile.get("resolved") else None
        sprite_abs = (ka_website_root / sprite_path).resolve() if sprite_path else None
        sprite_exists = bool(sprite_abs and sprite_abs.exists())

        sprite_size: Tuple[int, int] | None = None
        if sprite_exists:
            key = str(sprite_abs)
            if key not in sprite_cache:
                sprite_cache[key] = Image.open(sprite_abs).convert("RGBA")
            sprite = sprite_cache[key]
            sprite_size = sprite.size
        else:
            key = ""

        family_classification = classify_render_family(
            map_chip_name=str(tile.get("mapChipName", "")),
            semantic_group=str(tile.get("semanticGroup", "unknown")),
            draw_layer=draw_layer,
            resolved=sprite_exists,
            sprite_size=sprite_size,
            floor_medians=floor_medians,
        )
        family = family_classification["family"]
        family_profile = family_profiles.get(family, family_profiles["unresolvedFallback"])
        render_pass = get_family_render_pass(family)
        semantic_pass = choose_semantic_pass_for_op(
            {
                "family": family,
                "mapChipName": tile.get("mapChipName", ""),
                "semanticGroup": tile.get("semanticGroup", "unknown"),
                "familyClassification": family_classification,
            }
        )
        active_render_pass = semantic_pass if (mode == "family-aware" and semantic_pass is not None) else render_pass
        elevation_applied_y = int(family_profile.get("elevationOffsetY", 0)) if mode == "family-aware" else 0

        if family in {"raisedFloor", "indoorFloor"}:
            elevated_family_counts[family] = elevated_family_counts.get(family, 0) + 1

        active_step_x = tile_step_x
        active_step_y = tile_step_y
        if mode == "family-aware":
            active_step_x = max(1, int(round(tile_step_x * float(family_profile.get("stepScaleX", 1.0)))))
            active_step_y = max(1, int(round(tile_step_y * float(family_profile.get("stepScaleY", 1.0)))))

        screen_x = (x - y) * active_step_x
        screen_y = (x + y) * active_step_y

        family_tile_counts[family] = family_tile_counts.get(family, 0) + 1
        family_f2_ids.setdefault(family, set()).add(f2)
        if bool(family_classification.get("ambiguous")):
            ambiguous_f2_ids.add(f2)

        if sprite_exists:
            sprite = sprite_cache[key]
            w, h = sprite.size

            old_left = screen_x - (w // 2)
            old_top = screen_y + tile_height - h

            anchor_mode = "bottom-center"
            anchor_metadata = {"status": "fallback", "reason": "bottom_center_mode"}
            left = old_left
            top = old_top

            if mode in {"metadata", "family-aware"}:
                if key not in anchor_meta_cache:
                    anchor_meta_cache[key] = build_anchor_metadata(sprite_path, ka_chip_dir, parse_opt)
                anchor_metadata = anchor_meta_cache[key]

                if anchor_metadata.get("status") == "metadata":
                    anchor_x = int(anchor_metadata["anchor"]["x"])
                    anchor_y = int(anchor_metadata["anchor"]["y"])
                    anchor_bias_x = int(family_profile.get("anchorBiasX", 0)) if mode == "family-aware" else 0
                    anchor_bias_y = int(family_profile.get("anchorBiasY", 0)) if mode == "family-aware" else 0
                    tile_anchor_x = screen_x + int(family_profile.get("anchorAdjustX", 0))
                    tile_anchor_y = (
                        screen_y
                        + tile_height
                        + int(family_profile.get("anchorAdjustY", 0))
                        + elevation_applied_y
                    )
                    left = tile_anchor_x - anchor_x + anchor_bias_x
                    top = tile_anchor_y - anchor_y + anchor_bias_y

                    if mode == "family-aware":
                        overlap_x = int(family_profile.get("overlapPaddingX", 0))
                        overlap_y = int(family_profile.get("overlapPaddingY", 0))
                        left -= overlap_x // 2
                        top -= overlap_y

                    anchor_mode = "metadata"
                    metadata_anchor_count += 1
                else:
                    anchor_mode = "bottom-center-fallback"
                    bottom_center_fallback_count += 1
                    reason = str(anchor_metadata.get("reason", "unknown"))
                    unresolved_anchor_reasons[reason] = unresolved_anchor_reasons.get(reason, 0) + 1

                    if mode == "family-aware":
                        top += elevation_applied_y
            else:
                bottom_center_fallback_count += 1

            sprite_count += 1
            op_type = "sprite"
            fallback_color = None

            parsed_sprite = parse_generated_sprite_name(str(sprite_path)) if isinstance(sprite_path, str) else None
            if parsed_sprite is not None:
                base_name, slot_u, slot_v = parsed_sprite
                bucket = asset_identity_by_base.setdefault(
                    base_name,
                    {
                        "spriteCount": 0,
                        "metadataAnchorCount": 0,
                        "bottomCenterFallbackCount": 0,
                        "drawLayerCounts": {},
                        "familyCounts": {},
                        "mapChipNames": {},
                        "slotVariants": {},
                        "_widths": [],
                        "_heights": [],
                        "_anchorX": [],
                        "_anchorY": [],
                    },
                )
                bucket["spriteCount"] += 1
                bucket["drawLayerCounts"][str(draw_layer)] = int(bucket["drawLayerCounts"].get(str(draw_layer), 0)) + 1
                bucket["familyCounts"][family] = int(bucket["familyCounts"].get(family, 0)) + 1
                map_chip_name = str(tile.get("mapChipName", ""))
                if map_chip_name:
                    bucket["mapChipNames"][map_chip_name] = int(bucket["mapChipNames"].get(map_chip_name, 0)) + 1
                bucket["slotVariants"][f"u{int(slot_u)}v{int(slot_v)}"] = int(bucket["slotVariants"].get(f"u{int(slot_u)}v{int(slot_v)}", 0)) + 1
                bucket["_widths"].append(int(w))
                bucket["_heights"].append(int(h))
                if anchor_mode == "metadata":
                    bucket["metadataAnchorCount"] += 1
                    anchor = anchor_metadata.get("anchor", {}) if isinstance(anchor_metadata, dict) else {}
                    if isinstance(anchor, dict):
                        ax = anchor.get("x")
                        ay = anchor.get("y")
                        if isinstance(ax, (int, float)):
                            bucket["_anchorX"].append(float(ax))
                        if isinstance(ay, (int, float)):
                            bucket["_anchorY"].append(float(ay))
                else:
                    bucket["bottomCenterFallbackCount"] += 1
        else:
            w = tile_width
            h = tile_height
            left = screen_x - (w // 2)
            top = screen_y + elevation_applied_y
            op_type = "fallback"
            fallback_color = fallback_color_hex(f2)
            anchor_mode = "fallback-tile"
            anchor_metadata = {"status": "fallback", "reason": "sprite_missing"}
            fallback_tile_count += 1

            if mode == "family-aware":
                overlap_x = int(family_profile.get("overlapPaddingX", 0))
                overlap_y = int(family_profile.get("overlapPaddingY", 0))
                left -= overlap_x // 2
                top -= overlap_y

        if mode == "family-aware" and family in {"raisedFloor", "indoorFloor", "objectLike"} and (
            op_type == "fallback" or anchor_mode in {"bottom-center-fallback", "fallback-tile"}
        ):
            current = problem_candidates.get(f2)
            new_reasons = {
                "fallback_tile" if op_type == "fallback" else "anchor_fallback",
                str(anchor_metadata.get("reason", "unknown")),
            }
            if current is None:
                problem_candidates[f2] = {
                    "f2": f2,
                    "mapChipName": str(tile.get("mapChipName", "")),
                    "family": family,
                    "count": 1,
                    "reasons": sorted(new_reasons),
                }
            else:
                current["count"] += 1
                current["reasons"] = sorted(set(current.get("reasons", [])) | new_reasons)

        min_x = min(min_x, left)
        min_y = min(min_y, top)
        max_x = max(max_x, left + w)
        max_y = max(max_y, top + h)

        draw_ops.append(
            {
                "x": x,
                "y": y,
                "f1": tile_field_int(tile, "f1"),
                "f2": f2,
                "f3": tile_field_int(tile, "f3"),
                "f4": tile_field_int(tile, "f4"),
                "f5": tile_field_int(tile, "f5"),
                "mapChipName": tile.get("mapChipName", ""),
                "semanticGroup": tile.get("semanticGroup", "unknown"),
                "drawLayer": draw_layer,
                "family": family,
                "familyClassification": family_classification,
                "familyProfile": family_profile,
                "renderPass": render_pass,
                "semanticPass": semantic_pass,
                "activeRenderPass": active_render_pass,
                "passOrder": get_render_pass_order(active_render_pass),
                "zSort": (
                    int(draw_layer * 8)
                    + int(family_profile.get("zBias", 0))
                    + max(0, -elevation_applied_y)
                ),
                "elevationAppliedY": elevation_applied_y,
                "screenX": screen_x,
                "screenY": screen_y,
                "left": left,
                "top": top,
                "width": w,
                "height": h,
                "opType": op_type,
                "spriteSourcePng": sprite_path if sprite_exists else None,
                "fallbackColor": fallback_color,
                "anchorMode": anchor_mode,
                "anchorMetadata": anchor_metadata,
            }
        )

    if mode == "family-aware":
        draw_ops.sort(
            key=lambda op: (
                int(op.get("passOrder", 0)),
                int(op.get("familyProfile", {}).get("drawPriority", 0)),
                op["screenY"],
                int(op.get("zSort", 0)),
                op["y"],
                op["x"],
                op["drawLayer"],
                op["f2"],
            )
        )
    else:
        draw_ops.sort(key=lambda op: (op["screenY"], op["y"], op["x"], op["drawLayer"], op["f2"]))

    canvas_width = max(1, (max_x - min_x) + (padding * 2))
    canvas_height = max(1, (max_y - min_y) + (padding * 2))
    base_x = padding - min_x
    base_y = padding - min_y

    canvas = Image.new("RGBA", (canvas_width, canvas_height), (15, 18, 30, 255))
    draw = ImageDraw.Draw(canvas)

    transition_analysis = {
        "mixedFamilyAdjacencyCounts": {},
        "transitionCandidates": [],
        "unresolvedOverlayCandidates": [],
        "edgeConflictCandidates": [],
        "cliffPlatformBoundaries": [],
        "mixedCoords": [],
    }
    semantic_analysis = {
        "semanticFoundationCandidates": [],
        "overlayInteractionStats": {},
        "structuredRectangularFormations": [],
    }
    grouping_analysis = {
        "groupedStructures": [],
        "groupSummary": {},
    }
    facility_analysis = {
        "facilityPatternCandidates": [],
        "terrainMutationCandidates": [],
        "suspiciousElevatedAssemblies": [],
        "repeatedFootprintDimensions": {},
    }
    coherence_analysis = {
        "coherenceScores": {},
        "supportRelationshipStats": {},
        "disconnectedRegionCandidates": [],
        "floatingRegionCandidates": [],
        "terrainContinuityDiagnostics": {},
    }
    continuity_refinement = {
        "continuityRefinementAdjustments": [],
        "stats": {},
    }
    placement_semantics = {
        "semanticByCell": {},
        "buildabilityStats": {},
        "indoorOutdoorStats": {},
        "placementConflictCandidates": [],
        "supportPlacementDiagnostics": {},
        "reclaimedLandCandidates": [],
        "semanticPlacementConfidence": {},
    }
    terrain_composition_analysis = {
        "terrainCompositionGroups": [],
        "compositionTypeCounts": {},
    }
    mapchip_analysis = {
        "mapchipByCell": {},
        "f2MapchipStats": {},
        "mapchipFamilyClusters": [],
        "mapchipContinuityDiagnostics": {},
        "incompatibleMapchipTransitions": [],
        "isolatedMapchipCandidates": [],
        "mapchipCompositionConfidence": {},
    }
    field_hypothesis_analysis = {
        "fieldCorrelationStats": {},
        "biomeHypothesisStats": {},
        "landWaterMaskDiagnostics": {},
        "f5BehaviorCandidates": [],
        "fieldOverlapMetrics": {},
        "fieldConfidenceSummaries": {},
    }

    if mode == "family-aware":
        transition_analysis = analyze_region_transitions(draw_ops)
        semantic_analysis = analyze_semantic_foundations(draw_ops, transition_analysis)
        grouping_analysis = build_grouped_structures(draw_ops, semantic_analysis.get("semanticFoundationCandidates", []))
        facility_analysis = analyze_facility_patterns(draw_ops, grouping_analysis.get("groupedStructures", []), semantic_analysis)
        placement_semantics = analyze_placement_semantics(draw_ops, semantic_analysis, grouping_analysis, facility_analysis, transition_analysis)
        terrain_composition_analysis = analyze_terrain_composition_groups(draw_ops, placement_semantics)
        coherence_analysis = analyze_terrain_coherence(draw_ops, transition_analysis, grouping_analysis, semantic_analysis)
        mapchip_analysis = analyze_f2_mapchip_identity(draw_ops, terrain_composition_analysis, placement_semantics, transition_analysis, coherence_analysis)
        continuity_refinement = apply_continuity_refinement_pass(draw_ops, coherence_analysis, terrain_composition_analysis)

        draw_ops.sort(
            key=lambda op: (
                int(op.get("passOrder", 0)),
                int(op.get("familyProfile", {}).get("drawPriority", 0)),
                op["screenY"],
                int(op.get("zSort", 0)),
                op["y"],
                op["x"],
                op["drawLayer"],
                op["f2"],
            )
        )

        foundation_confidence_by_cell = {
            (int(item["x"]), int(item["y"])): float(item.get("confidence", 0.0))
            for item in semantic_analysis.get("semanticFoundationCandidates", [])
        }

        mixed_lookup = {
            (int(item["x"]), int(item["y"]))
            for item in transition_analysis.get("mixedCoords", [])
        }
        for op in draw_ops:
            op["hasMixedNeighbor"] = (int(op["x"]), int(op["y"])) in mixed_lookup
            op["foundationConfidence"] = foundation_confidence_by_cell.get((int(op["x"]), int(op["y"])), 0.0)

        semantic_by_cell = placement_semantics.get("semanticByCell", {})
        composition_lookup: Dict[Tuple[int, int], Dict] = {}
        for group in terrain_composition_analysis.get("terrainCompositionGroups", []):
            group_type = str(group.get("compositionType", "unresolved"))
            group_id = str(group.get("groupId", "composition-0"))
            continuity_score = float(group.get("continuityScore", 0.0))
            for member in group.get("memberCells", []):
                composition_lookup[(int(member.get("x", 0)), int(member.get("y", 0)))] = {
                    "compositionType": group_type,
                    "groupId": group_id,
                    "continuityScore": continuity_score,
                }

        for op in draw_ops:
            x = int(op["x"])
            y = int(op["y"])
            semantic_entry = semantic_by_cell.get((x, y), {})
            composition_entry = composition_lookup.get((x, y), {})
            mapchip_entry = mapchip_analysis.get("mapchipByCell", {}).get((x, y), {})
            op["placementSemanticCategory"] = str(semantic_entry.get("category", "unresolved"))
            op["placementSemanticConfidence"] = float(semantic_entry.get("confidence", 0.0))
            op["compositionType"] = str(composition_entry.get("compositionType", op.get("compositionType", "unresolved")))
            op["compositionGroupId"] = str(composition_entry.get("groupId", ""))
            op["compositionContinuityScore"] = float(composition_entry.get("continuityScore", op.get("compositionContinuityScore", 0.0)))
            op["mapchipCluster"] = str(mapchip_entry.get("cluster", "unknownFamily"))
            op["mapchipClusterConfidence"] = float(mapchip_entry.get("confidence", 0.0))

        mapchip_lookup = mapchip_analysis.get("mapchipByCell", {})
        for op in draw_ops:
            x = int(op["x"])
            y = int(op["y"])
            this_cluster = str(op.get("mapchipCluster", "unknownFamily"))
            same_cluster = 0
            same_f2 = 0
            for nx, ny in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]:
                neighbor = mapchip_lookup.get((nx, ny))
                if neighbor is None:
                    continue
                if str(neighbor.get("cluster", "unknownFamily")) == this_cluster:
                    same_cluster += 1
                if int(neighbor.get("f2", -999)) == int(op.get("f2", -1)):
                    same_f2 += 1
            op["mapchipNeighborCompatibility"] = float(round(min(1.0, (same_cluster * 0.22) + (same_f2 * 0.18)), 4))

            field_hypothesis_analysis = analyze_field_hypotheses(draw_ops, placement_semantics, coherence_analysis)

    def draw_op(op: Dict) -> None:
        dx = int(op["left"]) + base_x
        dy = int(op["top"]) + base_y

        if op["opType"] == "sprite":
            sprite_path = op["spriteSourcePng"]
            sprite_abs = (ka_website_root / sprite_path).resolve()
            sprite = sprite_cache[str(sprite_abs)]
            canvas.paste(sprite, (dx, dy), sprite)
            return

        half_w = tile_width // 2
        half_h = tile_height // 2
        cx = dx + half_w
        cy = dy
        points = [
            (cx, cy),
            (cx + half_w, cy + half_h),
            (cx, cy + tile_height),
            (cx - half_w, cy + half_h),
        ]
        if mode == "family-aware":
            color = mapchip_visual_color(
                mapchip_cluster=str(op.get("mapchipCluster", "unknownFamily")),
                f2=int(op.get("f2", 0)),
                compatibility=float(op.get("mapchipNeighborCompatibility", 0.0)),
                continuity_score=float(op.get("compositionContinuityScore", 0.0)),
                confidence=float(op.get("mapchipClusterConfidence", 0.0)),
            )
            outline = (max(10, color[0] - 18), max(10, color[1] - 18), max(10, color[2] - 18), 245)
            semantic_tint = family_debug_color(str(op.get("family", "unresolvedFallback")))
        else:
            color = hex_to_rgba(op["fallbackColor"], 220)
            outline = hex_to_rgba(op["fallbackColor"], 255)
            semantic_tint = (0, 0, 0, 0)
        draw.polygon(points, fill=color, outline=outline)

        if mode == "family-aware":
            tint_alpha = min(80, 20 + int(float(op.get("placementSemanticConfidence", 0.0)) * 60))
            draw.polygon(points, fill=(semantic_tint[0], semantic_tint[1], semantic_tint[2], tint_alpha))

        profile = op.get("familyProfile", {})
        if mode == "family-aware" and bool(profile.get("allowNeighborBleed")) and bool(op.get("hasMixedNeighbor")):
            bleed_alpha = min(195, 75 + int(float(op.get("continuityWeight", 0.0)) * 65) + int(float(op.get("mapchipNeighborCompatibility", 0.0)) * 45))
            bleed = hex_to_rgba(op["fallbackColor"], bleed_alpha)
            draw.polygon(points, outline=bleed)

        if mode == "family-aware" and str(op.get("family", "")) == "terrainFloor" and float(op.get("continuityWeight", 0.0)) >= 0.65:
            fill_boost = hex_to_rgba(op["fallbackColor"], 105)
            draw.polygon(points, fill=fill_boost)

    if mode == "family-aware":
        for pass_name in [
            "terrain_base",
            "semantic_foundation",
            "overlay_foundation",
            "semantic_overlay",
            "elevated_platform",
            "object_like",
        ]:
            for op in draw_ops:
                if str(op.get("activeRenderPass")) != pass_name:
                    continue
                draw_op(op)
    else:
        for op in draw_ops:
            draw_op(op)

    signature_parts = [
        f"{op['x']},{op['y']}:{op['opType']}:{op['left']},{op['top']}:{op.get('anchorMode')}:{op.get('spriteSourcePng') or op.get('fallbackColor')}"
        for op in draw_ops
    ]
    signature = hashlib.sha256("|".join(signature_parts).encode("utf-8")).hexdigest()
    repeat_signature = hashlib.sha256("|".join(signature_parts).encode("utf-8")).hexdigest()

    debug_images: Dict[str, Image.Image] = {}
    if mode == "family-aware":
        debug_images = build_debug_visualizations(
            draw_ops=draw_ops,
            transition_analysis=transition_analysis,
            semantic_analysis=semantic_analysis,
            grouped_structures=grouping_analysis.get("groupedStructures", []),
            facility_patterns=facility_analysis,
            coherence_analysis=coherence_analysis,
            continuity_refinement=continuity_refinement,
            placement_semantics=placement_semantics,
            terrain_composition_analysis=terrain_composition_analysis,
            mapchip_analysis=mapchip_analysis,
            canvas_width=canvas_width,
            canvas_height=canvas_height,
            base_x=base_x,
            base_y=base_y,
            tile_width=tile_width,
            tile_height=tile_height,
        )

    stats = {
        "canvas": {"width": canvas_width, "height": canvas_height},
        "spriteCount": sprite_count,
        "fallbackTileCount": fallback_tile_count,
        "metadataAnchorCount": metadata_anchor_count,
        "bottomCenterFallbackCount": bottom_center_fallback_count,
        "unresolvedAnchorSources": [
            {"reason": reason, "count": count}
            for reason, count in sorted(unresolved_anchor_reasons.items(), key=lambda item: (-item[1], item[0]))
        ],
        "familyCoverage": {
            "tileCounts": {family: int(count) for family, count in sorted(family_tile_counts.items())},
            "f2IdsByFamily": {family: sorted(values) for family, values in sorted(family_f2_ids.items())},
            "ambiguousF2Ids": sorted(ambiguous_f2_ids),
        },
        "problemCandidates": sorted(problem_candidates.values(), key=lambda item: (-item["count"], item["f2"]))[:24],
        "elevatedFamilyCounts": {
            family: int(count)
            for family, count in sorted(elevated_family_counts.items(), key=lambda item: item[0])
        },
        "transitionDiagnostics": {
            "mixedFamilyAdjacencyCounts": transition_analysis.get("mixedFamilyAdjacencyCounts", {}),
            "transitionCandidates": transition_analysis.get("transitionCandidates", []),
            "unresolvedOverlayCandidates": transition_analysis.get("unresolvedOverlayCandidates", []),
            "edgeConflictCandidates": transition_analysis.get("edgeConflictCandidates", []),
            "cliffPlatformBoundaries": transition_analysis.get("cliffPlatformBoundaries", []),
        },
        "semanticFoundationCandidates": semantic_analysis.get("semanticFoundationCandidates", []),
        "overlayInteractionStats": semantic_analysis.get("overlayInteractionStats", {}),
        "groupedStructures": grouping_analysis.get("groupedStructures", []),
        "facilityPatternCandidates": facility_analysis.get("facilityPatternCandidates", []),
        "terrainMutationCandidates": facility_analysis.get("terrainMutationCandidates", []),
        "coherenceScores": coherence_analysis.get("coherenceScores", {}),
        "supportRelationshipStats": coherence_analysis.get("supportRelationshipStats", {}),
        "disconnectedRegionCandidates": coherence_analysis.get("disconnectedRegionCandidates", []),
        "floatingRegionCandidates": coherence_analysis.get("floatingRegionCandidates", []),
        "terrainContinuityDiagnostics": coherence_analysis.get("terrainContinuityDiagnostics", {}),
        "continuityRefinementAdjustments": continuity_refinement.get("continuityRefinementAdjustments", []),
        "continuityRefinementStats": continuity_refinement.get("stats", {}),
        "buildabilityStats": placement_semantics.get("buildabilityStats", {}),
        "indoorOutdoorStats": placement_semantics.get("indoorOutdoorStats", {}),
        "terrainCompositionGroups": terrain_composition_analysis.get("terrainCompositionGroups", []),
        "placementConflictCandidates": placement_semantics.get("placementConflictCandidates", []),
        "supportPlacementDiagnostics": placement_semantics.get("supportPlacementDiagnostics", {}),
        "reclaimedLandCandidates": placement_semantics.get("reclaimedLandCandidates", []),
        "semanticPlacementConfidence": placement_semantics.get("semanticPlacementConfidence", {}),
        "f2MapchipStats": mapchip_analysis.get("f2MapchipStats", {}),
        "mapchipFamilyClusters": mapchip_analysis.get("mapchipFamilyClusters", []),
        "mapchipContinuityDiagnostics": mapchip_analysis.get("mapchipContinuityDiagnostics", {}),
        "incompatibleMapchipTransitions": mapchip_analysis.get("incompatibleMapchipTransitions", []),
        "isolatedMapchipCandidates": mapchip_analysis.get("isolatedMapchipCandidates", []),
        "mapchipCompositionConfidence": mapchip_analysis.get("mapchipCompositionConfidence", {}),
        "fieldCorrelationStats": field_hypothesis_analysis.get("fieldCorrelationStats", {}),
        "biomeHypothesisStats": field_hypothesis_analysis.get("biomeHypothesisStats", {}),
        "landWaterMaskDiagnostics": field_hypothesis_analysis.get("landWaterMaskDiagnostics", {}),
        "f5BehaviorCandidates": field_hypothesis_analysis.get("f5BehaviorCandidates", []),
        "fieldOverlapMetrics": field_hypothesis_analysis.get("fieldOverlapMetrics", {}),
        "fieldConfidenceSummaries": field_hypothesis_analysis.get("fieldConfidenceSummaries", {}),
        "confidenceSummaries": {
            "semanticFoundation": {
                "candidateCount": len(semantic_analysis.get("semanticFoundationCandidates", [])),
                "averageConfidence": float(
                    sum(float(item.get("confidence", 0.0)) for item in semantic_analysis.get("semanticFoundationCandidates", []))
                    / max(1, len(semantic_analysis.get("semanticFoundationCandidates", [])))
                ),
            },
            "groupedStructures": {
                "candidateCount": len(grouping_analysis.get("groupedStructures", [])),
                "averageConfidence": float(
                    sum(float(item.get("confidence", 0.0)) for item in grouping_analysis.get("groupedStructures", []))
                    / max(1, len(grouping_analysis.get("groupedStructures", [])))
                ),
            },
            "facilityPatterns": {
                "candidateCount": len(facility_analysis.get("facilityPatternCandidates", [])),
                "averageConfidence": float(
                    sum(float(item.get("confidence", 0.0)) for item in facility_analysis.get("facilityPatternCandidates", []))
                    / max(1, len(facility_analysis.get("facilityPatternCandidates", [])))
                ),
            },
        },
        "passStats": {
            "terrainBaseTiles": sum(1 for op in draw_ops if str(op.get("activeRenderPass")) == "terrain_base"),
            "semanticFoundationPassTiles": sum(1 for op in draw_ops if str(op.get("activeRenderPass")) == "semantic_foundation"),
            "overlayFoundationTiles": sum(1 for op in draw_ops if str(op.get("activeRenderPass")) == "overlay_foundation"),
            "semanticOverlayPassTiles": sum(1 for op in draw_ops if str(op.get("activeRenderPass")) == "semantic_overlay"),
            "elevatedPlatformTiles": sum(1 for op in draw_ops if str(op.get("activeRenderPass")) == "elevated_platform"),
            "objectLikeTiles": sum(1 for op in draw_ops if str(op.get("activeRenderPass")) == "object_like"),
        },
        "assetIdentityStats": {
            "assetCount": int(len(asset_identity_by_base)),
            "assets": [
                {
                    "baseName": base_name,
                    "spriteCount": int(bucket.get("spriteCount", 0)),
                    "metadataAnchorCount": int(bucket.get("metadataAnchorCount", 0)),
                    "bottomCenterFallbackCount": int(bucket.get("bottomCenterFallbackCount", 0)),
                    "metadataAnchorRate": float(
                        round(
                            float(bucket.get("metadataAnchorCount", 0)) / max(1, int(bucket.get("spriteCount", 0))),
                            4,
                        )
                    ),
                    "drawLayerCounts": {
                        key: int(value)
                        for key, value in sorted(
                            bucket.get("drawLayerCounts", {}).items(),
                            key=lambda item: (int(item[0]), item[0]),
                        )
                    },
                    "familyCounts": {
                        key: int(value)
                        for key, value in sorted(
                            bucket.get("familyCounts", {}).items(),
                            key=lambda item: (-int(item[1]), item[0]),
                        )
                    },
                    "mapChipNames": {
                        key: int(value)
                        for key, value in sorted(
                            bucket.get("mapChipNames", {}).items(),
                            key=lambda item: (-int(item[1]), item[0]),
                        )
                    },
                    "slotVariants": {
                        key: int(value)
                        for key, value in sorted(
                            bucket.get("slotVariants", {}).items(),
                            key=lambda item: (-int(item[1]), item[0]),
                        )
                    },
                    "medianSpriteWidth": float(round(float(median(bucket.get("_widths", [0]))), 4)) if bucket.get("_widths") else 0.0,
                    "medianSpriteHeight": float(round(float(median(bucket.get("_heights", [0]))), 4)) if bucket.get("_heights") else 0.0,
                    "medianAnchorX": float(round(float(median(bucket.get("_anchorX", [0.0]))), 4)) if bucket.get("_anchorX") else 0.0,
                    "medianAnchorY": float(round(float(median(bucket.get("_anchorY", [0.0]))), 4)) if bucket.get("_anchorY") else 0.0,
                }
                for base_name, bucket in sorted(
                    asset_identity_by_base.items(),
                    key=lambda item: (-int(item[1].get("spriteCount", 0)), item[0]),
                )
            ],
        },
        "drawOrder": {
            "signature": signature,
            "repeatSignature": repeat_signature,
            "deterministic": signature == repeat_signature,
        },
        "seamMetrics": compute_seam_metrics(draw_ops),
        "preview": draw_ops[:80],
    }

    if debug_images:
        stats["_debugImages"] = debug_images

    return canvas, stats


def add_review_header(image: Image.Image, title: str, lines: List[str], header_height: int = 54) -> Image.Image:
    header_height = max(40, header_height)
    canvas = Image.new("RGBA", (image.width, image.height + header_height), (10, 13, 20, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((10, 6), title, fill=(236, 236, 236, 255))
    if lines:
        draw.text((10, 26), " | ".join(lines), fill=(186, 196, 214, 255))
    canvas.paste(image, (0, header_height), image)
    return canvas


def compose_compare_panel(
    left_image: Image.Image,
    right_image: Image.Image,
    *,
    left_title: str,
    right_title: str,
    summary_line: str,
    gutter: int = 20,
    header_height: int = 56,
) -> Image.Image:
    width = left_image.width + right_image.width + gutter
    height = max(left_image.height, right_image.height) + header_height
    canvas = Image.new("RGBA", (width, height), (11, 14, 22, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((10, 6), left_title, fill=(236, 236, 236, 255))
    draw.text((left_image.width + gutter + 10, 6), right_title, fill=(236, 236, 236, 255))
    draw.text((10, 28), summary_line, fill=(180, 196, 214, 255))
    canvas.paste(left_image, (0, header_height), left_image)
    canvas.paste(right_image, (left_image.width + gutter, header_height), right_image)
    return canvas


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


def render_field_top_view_data_map(region: Dict, field_name: str, *, mode: str = "raw", padding: int = 20, cell_size: int = 28) -> Tuple[Image.Image, Dict]:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), f"No tiles for {field_name}", fill=(220, 220, 220, 255))
        return empty, {
            "field": field_name,
            "mode": mode,
            "tileCount": 0,
            "fieldValueCount": 0,
            "missingFieldCount": 0,
            "valueCounts": {},
        }

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1

    canvas_w = (width_cells * cell_size) + (padding * 2)
    canvas_h = (height_cells * cell_size) + (padding * 2)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    value_counts: Dict[str, int] = {}
    missing_field_count = 0

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        value = tile_field_int(tile, field_name)

        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)

        if value is None:
            fill = (52, 58, 66, 220)
            missing_field_count += 1
        elif mode == "f1-biome":
            fill = f1_biome_palette(value)["color"]
            value_counts[str(value)] = value_counts.get(str(value), 0) + 1
        else:
            fill = deterministic_field_color(field_name, value)
            value_counts[str(value)] = value_counts.get(str(value), 0) + 1

        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=fill, outline=(28, 32, 42, 255), width=1)

        if value is None:
            draw.line([(tx + 3, ty + 3), (tx + cell_size - 4, ty + cell_size - 4)], fill=(20, 20, 22, 220), width=2)
            draw.line([(tx + cell_size - 4, ty + 3), (tx + 3, ty + cell_size - 4)], fill=(20, 20, 22, 220), width=2)

    return canvas, {
        "field": field_name,
        "mode": mode,
        "tileCount": len(tiles),
        "fieldValueCount": int(sum(value_counts.values())),
        "missingFieldCount": int(missing_field_count),
        "valueCounts": {key: int(value) for key, value in sorted(value_counts.items(), key=lambda item: int(item[0]))},
    }


def analyze_field_hypotheses(draw_ops: List[Dict], placement_semantics: Dict, coherence_analysis: Dict) -> Dict:
    by_cell: Dict[Tuple[int, int], Dict] = {}
    for op in draw_ops:
        key = (int(op.get("x", 0)), int(op.get("y", 0)))
        existing = by_cell.get(key)
        if existing is None or int(op.get("drawLayer", 0)) >= int(existing.get("drawLayer", 0)):
            by_cell[key] = op

    def pair_stats(field_a: str, field_b: str) -> Dict:
        pair_counts: Dict[str, int] = {}
        a_counts: Dict[str, int] = {}
        b_by_a: Dict[str, Dict[str, int]] = {}
        sample_count = 0
        for tile in by_cell.values():
            a_val = tile_field_int(tile, field_a)
            b_val = tile_field_int(tile, field_b)
            if a_val is None or b_val is None:
                continue
            sample_count += 1
            a_key = str(a_val)
            b_key = str(b_val)
            pair_key = f"{a_key}|{b_key}"
            pair_counts[pair_key] = pair_counts.get(pair_key, 0) + 1
            a_counts[a_key] = a_counts.get(a_key, 0) + 1
            b_by_a.setdefault(a_key, {})[b_key] = b_by_a.setdefault(a_key, {}).get(b_key, 0) + 1

        best_per_a = []
        for a_key, targets in b_by_a.items():
            total = max(1, a_counts.get(a_key, 0))
            best = max(targets.values()) if targets else 0
            best_per_a.append(float(best / total))

        dominant_pair_count = max(pair_counts.values()) if pair_counts else 0
        return {
            "fieldA": field_a,
            "fieldB": field_b,
            "sampleCount": int(sample_count),
            "uniqueA": len(a_counts),
            "uniquePairs": len(pair_counts),
            "dominantPairCoverage": float(round(dominant_pair_count / max(1, sample_count), 4)),
            "avgBestMappingConfidence": float(round(sum(best_per_a) / max(1, len(best_per_a)), 4)),
            "topPairs": [
                {"pair": key, "count": int(value)}
                for key, value in sorted(pair_counts.items(), key=lambda item: (-item[1], item[0]))[:16]
            ],
        }

    pairwise = [
        pair_stats("f1", "f2"),
        pair_stats("f2", "f3"),
        pair_stats("f2", "f4"),
        pair_stats("f3", "f4"),
        pair_stats("f5", "f2"),
    ]

    f1_biome_counts: Dict[str, int] = {}
    f1_value_counts: Dict[str, int] = {}
    for tile in by_cell.values():
        f1_val = tile_field_int(tile, "f1")
        if f1_val is None:
            continue
        f1_key = str(f1_val)
        f1_value_counts[f1_key] = f1_value_counts.get(f1_key, 0) + 1
        biome_label = str(f1_biome_palette(f1_val)["label"])
        f1_biome_counts[biome_label] = f1_biome_counts.get(biome_label, 0) + 1

    f3f4 = pair_stats("f3", "f4")
    overlap_count = 0
    non_equal_count = 0
    for tile in by_cell.values():
        f3_val = tile_field_int(tile, "f3")
        f4_val = tile_field_int(tile, "f4")
        if f3_val is None or f4_val is None:
            continue
        overlap_count += 1
        if int(f3_val) != int(f4_val):
            non_equal_count += 1

    reclaimed_cells = {
        (int(item.get("x", 0)), int(item.get("y", 0)))
        for item in placement_semantics.get("reclaimedLandCandidates", [])
    }
    reclaimed_overlap = 0
    reclaimed_divergent = 0
    for x, y in reclaimed_cells:
        tile = by_cell.get((x, y))
        if tile is None:
            continue
        f3_val = tile_field_int(tile, "f3")
        f4_val = tile_field_int(tile, "f4")
        if f3_val is None or f4_val is None:
            continue
        reclaimed_overlap += 1
        if int(f3_val) != int(f4_val):
            reclaimed_divergent += 1

    f5_buckets: Dict[str, Dict] = {}
    by_semantic = {
        (int(tile.get("x", 0)), int(tile.get("y", 0))): str(tile.get("semanticGroup", "unknown")).lower()
        for tile in by_cell.values()
    }
    for (x, y), tile in by_cell.items():
        f5_val = tile_field_int(tile, "f5")
        if f5_val is None:
            continue
        key = str(f5_val)
        bucket = f5_buckets.setdefault(
            key,
            {
                "f5": int(f5_val),
                "cellCount": 0,
                "isolatedCount": 0,
                "overlayAdjacentCount": 0,
                "elevatedCount": 0,
            },
        )
        bucket["cellCount"] += 1
        if int(tile.get("drawLayer", 0)) > 0:
            bucket["elevatedCount"] += 1

        same_neighbors = 0
        overlay_touch = False
        for nx, ny in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]:
            neighbor = by_cell.get((nx, ny))
            if neighbor is None:
                continue
            if tile_field_int(neighbor, "f5") == f5_val:
                same_neighbors += 1
            semantic = by_semantic.get((nx, ny), "unknown")
            if "overlay" in semantic or "special" in semantic:
                overlay_touch = True

        if same_neighbors == 0:
            bucket["isolatedCount"] += 1
        if overlay_touch:
            bucket["overlayAdjacentCount"] += 1

    f5_candidates: List[Dict] = []
    for bucket in f5_buckets.values():
        count = max(1, int(bucket.get("cellCount", 0)))
        isolated_ratio = float(bucket.get("isolatedCount", 0) / count)
        overlay_ratio = float(bucket.get("overlayAdjacentCount", 0) / count)
        elevated_ratio = float(bucket.get("elevatedCount", 0) / count)

        if overlay_ratio >= 0.35 and elevated_ratio >= 0.2:
            theory = "support_or_overlay_layer_candidate"
            confidence = min(0.92, 0.48 + (overlay_ratio * 0.26) + (elevated_ratio * 0.18))
        elif isolated_ratio >= 0.45:
            theory = "decorative_or_auxiliary_isolation_candidate"
            confidence = min(0.9, 0.42 + (isolated_ratio * 0.34) + ((1.0 - overlay_ratio) * 0.14))
        else:
            theory = "mixed_environmental_support_candidate"
            confidence = min(0.82, 0.36 + (isolated_ratio * 0.2) + (overlay_ratio * 0.2))

        f5_candidates.append(
            {
                "f5": int(bucket.get("f5", -1)),
                "cellCount": int(bucket.get("cellCount", 0)),
                "isolatedCount": int(bucket.get("isolatedCount", 0)),
                "overlayAdjacentCount": int(bucket.get("overlayAdjacentCount", 0)),
                "elevatedCount": int(bucket.get("elevatedCount", 0)),
                "theory": theory,
                "confidence": float(round(confidence, 4)),
            }
        )

    f5_candidates.sort(key=lambda item: (-float(item.get("confidence", 0.0)), -int(item.get("cellCount", 0)), int(item.get("f5", 0))))

    biome_evidence = pair_stats("f1", "f2")
    biome_score = 0.0
    if int(biome_evidence.get("sampleCount", 0)) > 0:
        biome_score = float(
            round(
                (float(biome_evidence.get("avgBestMappingConfidence", 0.0)) * 0.55)
                + ((1.0 - float(biome_evidence.get("dominantPairCoverage", 0.0))) * 0.25)
                + (min(1.0, len(f1_biome_counts) / 5.0) * 0.2),
                4,
            )
        )

    return {
        "fieldCorrelationStats": {
            "correlations": pairwise,
            "f1ToReclaimed": {
                "reclaimedCellCount": int(len(reclaimed_cells)),
                "reclaimedFieldOverlapCount": int(reclaimed_overlap),
                "reclaimedDivergentF3F4Count": int(reclaimed_divergent),
            },
            "f5ToOverlayAndElevation": {
                "candidateCount": int(len(f5_candidates)),
                "topCandidates": f5_candidates[:24],
            },
        },
        "biomeHypothesisStats": {
            "biomeValueCounts": {key: int(value) for key, value in sorted(f1_biome_counts.items(), key=lambda item: (-item[1], item[0]))},
            "f1ValueCounts": {key: int(value) for key, value in sorted(f1_value_counts.items(), key=lambda item: int(item[0]))},
            "f1BiomeEvidenceScore": float(biome_score),
        },
        "landWaterMaskDiagnostics": {
            "f3F4PairStats": f3f4,
            "f3f4OverlapCount": int(overlap_count),
            "f3f4ComplementaryCount": int(non_equal_count),
            "f3f4ComplementaryRatio": float(round(non_equal_count / max(1, overlap_count), 4)),
            "reclaimedCompatibilityRatio": float(round(reclaimed_divergent / max(1, reclaimed_overlap), 4)),
        },
        "f5BehaviorCandidates": f5_candidates[:80],
        "fieldOverlapMetrics": {
            "f1|f2": {
                "overlapCount": int(biome_evidence.get("sampleCount", 0)),
                "dominantPairCoverage": float(biome_evidence.get("dominantPairCoverage", 0.0)),
            },
            "f3|f4": {
                "overlapCount": int(overlap_count),
                "complementaryRatio": float(round(non_equal_count / max(1, overlap_count), 4)),
            },
        },
        "fieldConfidenceSummaries": {
            "f1BiomeConfidence": float(round(biome_score, 4)),
            "f3f4MaskComplementaryConfidence": float(round(non_equal_count / max(1, overlap_count), 4)),
            "f5TopTheoryConfidence": float(round(float(f5_candidates[0].get("confidence", 0.0)) if f5_candidates else 0.0, 4)),
        },
    }


def render_field_correlation_review(region: Dict, padding: int = 20, cell_size: int = 28) -> Image.Image:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1
    canvas = Image.new("RGBA", ((width_cells * cell_size) + (padding * 2), (height_cells * cell_size) + (padding * 2)), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)
        f2_val = tile_field_int(tile, "f2")
        base = deterministic_field_color("f2", int(f2_val) if f2_val is not None else -1)
        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=base, outline=(30, 34, 42, 255), width=1)

        quad = max(5, cell_size // 3)
        f1_val = tile_field_int(tile, "f1")
        f3_val = tile_field_int(tile, "f3")
        f4_val = tile_field_int(tile, "f4")
        f5_val = tile_field_int(tile, "f5")
        if f1_val is not None:
            draw.rectangle([(tx + 2, ty + 2), (tx + 1 + quad, ty + 1 + quad)], fill=f1_biome_palette(f1_val)["color"])
        if f3_val is not None:
            draw.rectangle([(tx + cell_size - quad - 2, ty + 2), (tx + cell_size - 3, ty + 1 + quad)], fill=deterministic_field_color("f3", f3_val, 230))
        if f4_val is not None:
            draw.rectangle([(tx + 2, ty + cell_size - quad - 2), (tx + 1 + quad, ty + cell_size - 3)], fill=deterministic_field_color("f4", f4_val, 230))
        if f5_val is not None:
            draw.rectangle([(tx + cell_size - quad - 2, ty + cell_size - quad - 2), (tx + cell_size - 3, ty + cell_size - 3)], fill=deterministic_field_color("f5", f5_val, 230))

    return canvas


def render_land_water_mask_review(region: Dict, padding: int = 20, cell_size: int = 28) -> Image.Image:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1
    canvas = Image.new("RGBA", ((width_cells * cell_size) + (padding * 2), (height_cells * cell_size) + (padding * 2)), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)
        f3_val = tile_field_int(tile, "f3")
        f4_val = tile_field_int(tile, "f4")
        if f3_val is None or f4_val is None:
            fill = (70, 74, 82, 200)
            outline = (46, 50, 60, 255)
        elif int(f3_val) != int(f4_val):
            fill = (86, 176, 170, 215)
            outline = (120, 224, 216, 255)
        else:
            fill = (186, 132, 108, 215)
            outline = (228, 182, 154, 255)
        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=fill, outline=outline, width=1)

    return canvas


def render_f5_behavior_review(region: Dict, f5_behavior_candidates: List[Dict], padding: int = 20, cell_size: int = 28) -> Image.Image:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1
    canvas = Image.new("RGBA", ((width_cells * cell_size) + (padding * 2), (height_cells * cell_size) + (padding * 2)), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    candidate_by_f5 = {int(item.get("f5", -1)): item for item in f5_behavior_candidates}
    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)
        f5_val = tile_field_int(tile, "f5")
        if f5_val is None:
            fill = (62, 66, 76, 200)
            outline = (44, 48, 56, 255)
        else:
            fill = deterministic_field_color("f5", f5_val, 225)
            theory = str(candidate_by_f5.get(int(f5_val), {}).get("theory", ""))
            if "overlay" in theory:
                outline = (98, 222, 236, 255)
            elif "decorative" in theory:
                outline = (236, 186, 98, 255)
            else:
                outline = (206, 206, 206, 255)
        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=fill, outline=outline, width=1)

    return canvas


def derive_region_field_flow_diagnostics(region: Dict) -> Dict:
    fields = ["f1", "f2", "f3", "f4", "f5"]
    tiles = list(region.get("tiles", []))
    tile_count = int(len(tiles))

    missing_field_counts = {field: 0 for field in fields}
    null_field_counts = {field: 0 for field in fields}
    present_counts = {field: 0 for field in fields}
    tiles_with_any_missing = 0
    tiles_with_all_fields = 0

    for tile in tiles:
        tile_missing = 0
        for field in fields:
            if field not in tile:
                missing_field_counts[field] += 1
                tile_missing += 1
                continue
            value = tile.get(field)
            if value is None:
                null_field_counts[field] += 1
                tile_missing += 1
                continue
            try:
                int(value)
                present_counts[field] += 1
            except (TypeError, ValueError):
                null_field_counts[field] += 1
                tile_missing += 1
        if tile_missing == 0:
            tiles_with_all_fields += 1
        else:
            tiles_with_any_missing += 1

    upstream_prop = dict(region.get("fieldPropagationStats", {}))
    upstream_cov = dict(region.get("extractionCoverageStats", {}))
    upstream_missing = dict(region.get("missingFieldDiagnostics", {}))
    upstream_rates = dict(region.get("fieldPreservationRates", {}))
    upstream_availability = dict(region.get("regionFieldAvailability", {}))

    propagation_mismatch_counts = upstream_prop.get("propagationMismatchCounts", {})
    if not isinstance(propagation_mismatch_counts, dict):
        propagation_mismatch_counts = {}

    by_field_rates = {}
    for field in fields:
        by_field_rates[field] = {
            "sourcePresentRate": float(
                upstream_rates.get("byField", {}).get(field, {}).get(
                    "sourcePresentRate",
                    round(float(present_counts[field]) / max(1, tile_count), 4),
                )
            ),
            "payloadPresentRate": float(
                upstream_rates.get("byField", {}).get(field, {}).get(
                    "payloadPresentRate",
                    round(float(present_counts[field]) / max(1, tile_count), 4),
                )
            ),
            "preservationRate": float(
                upstream_rates.get("byField", {}).get(field, {}).get(
                    "preservationRate",
                    round(1.0 - (float(propagation_mismatch_counts.get(field, 0)) / max(1, tile_count)), 4),
                )
            ),
        }

    return {
        "fieldPropagationStats": {
            "tileCount": int(upstream_prop.get("tileCount", tile_count)),
            "tilesWithAllFields": int(upstream_prop.get("tilesWithAllFields", tiles_with_all_fields)),
            "tilesWithAnyMissingField": int(upstream_prop.get("tilesWithAnyMissingField", tiles_with_any_missing)),
            "propagationMismatchCounts": {
                field: int(propagation_mismatch_counts.get(field, 0)) for field in fields
            },
        },
        "extractionCoverageStats": {
            "sourcePresentCounts": {
                field: int(upstream_cov.get("sourcePresentCounts", {}).get(field, present_counts[field]))
                for field in fields
            },
            "payloadPresentCounts": {
                field: int(upstream_cov.get("payloadPresentCounts", {}).get(field, present_counts[field]))
                for field in fields
            },
            "sourceNullCounts": {
                field: int(upstream_cov.get("sourceNullCounts", {}).get(field, null_field_counts[field]))
                for field in fields
            },
            "payloadNullCounts": {
                field: int(upstream_cov.get("payloadNullCounts", {}).get(field, null_field_counts[field]))
                for field in fields
            },
        },
        "missingFieldDiagnostics": {
            "missingFieldCounts": {
                field: int(upstream_missing.get("missingFieldCounts", {}).get(field, missing_field_counts[field]))
                for field in fields
            },
            "nullFieldCounts": {
                field: int(upstream_missing.get("nullFieldCounts", {}).get(field, null_field_counts[field]))
                for field in fields
            },
            "tilesWithAnyMissingField": int(upstream_missing.get("tilesWithAnyMissingField", tiles_with_any_missing)),
        },
        "fieldPreservationRates": {
            "byField": by_field_rates,
        },
        "regionFieldAvailability": {
            field: {
                "available": bool(upstream_availability.get(field, {}).get("available", present_counts[field] > 0)),
                "presentCount": int(upstream_availability.get(field, {}).get("presentCount", present_counts[field])),
                "tileCoverageRate": float(
                    upstream_availability.get(field, {}).get(
                        "tileCoverageRate",
                        round(float(present_counts[field]) / max(1, tile_count), 4),
                    )
                ),
            }
            for field in fields
        },
    }


def render_raw_field_presence_review(region: Dict, padding: int = 20, cell_size: int = 28) -> Image.Image:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1
    canvas = Image.new("RGBA", ((width_cells * cell_size) + (padding * 2), (height_cells * cell_size) + (padding * 2)), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)
        present_count = 0
        for field_name in ["f1", "f2", "f3", "f4", "f5"]:
            value = tile_field_int(tile, field_name)
            if value is not None:
                present_count += 1
        ratio = float(present_count) / 5.0
        fill = (
            int(48 + (ratio * 120)),
            int(52 + (ratio * 138)),
            int(70 + (ratio * 92)),
            220,
        )
        outline = (24, 26, 34, 255)
        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=fill, outline=outline, width=1)

    return canvas


def render_field_propagation_review(region: Dict, field_flow: Dict, padding: int = 20, cell_size: int = 28) -> Image.Image:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty

    mismatch_counts = field_flow.get("fieldPropagationStats", {}).get("propagationMismatchCounts", {})
    mismatch_total = int(sum(int(value) for value in mismatch_counts.values()))

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1
    canvas = Image.new("RGBA", ((width_cells * cell_size) + (padding * 2), (height_cells * cell_size) + (padding * 2)), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)

        present_count = 0
        for field_name in ["f1", "f2", "f3", "f4", "f5"]:
            if tile_field_int(tile, field_name) is not None:
                present_count += 1

        if present_count == 5 and mismatch_total == 0:
            fill = (86, 176, 132, 220)
            outline = (144, 228, 180, 255)
        elif present_count >= 3:
            fill = (188, 160, 90, 220)
            outline = (236, 210, 144, 255)
        else:
            fill = (168, 86, 86, 220)
            outline = (232, 146, 146, 255)

        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=fill, outline=outline, width=1)

    return canvas


def render_missing_field_review(region: Dict, padding: int = 20, cell_size: int = 28) -> Image.Image:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1
    canvas = Image.new("RGBA", ((width_cells * cell_size) + (padding * 2), (height_cells * cell_size) + (padding * 2)), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)

        missing_count = 0
        for field_name in ["f1", "f2", "f3", "f4", "f5"]:
            if tile_field_int(tile, field_name) is None:
                missing_count += 1

        fill = (
            int(56 + (missing_count * 34)),
            int(54 + (missing_count * 12)),
            int(58 + (missing_count * 12)),
            220,
        )
        outline = (34, 34, 40, 255)
        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=fill, outline=outline, width=1)

    return canvas


def render_extraction_coverage_review(region: Dict, field_flow: Dict, padding: int = 20, cell_size: int = 28) -> Image.Image:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty

    payload_present = field_flow.get("extractionCoverageStats", {}).get("payloadPresentCounts", {})
    tile_count = max(1, int(len(tiles)))
    avg_coverage = float(
        sum(float(payload_present.get(field, 0)) / tile_count for field in ["f1", "f2", "f3", "f4", "f5"]) / 5.0
    )

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1
    canvas = Image.new("RGBA", ((width_cells * cell_size) + (padding * 2), (height_cells * cell_size) + (padding * 2)), (14, 18, 28, 255))
    draw = ImageDraw.Draw(canvas)

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)

        present_count = 0
        for field_name in ["f1", "f2", "f3", "f4", "f5"]:
            if tile_field_int(tile, field_name) is not None:
                present_count += 1
        local_cov = float(present_count) / 5.0
        blend = (local_cov * 0.65) + (avg_coverage * 0.35)
        fill = (
            int(44 + (blend * 84)),
            int(66 + (blend * 116)),
            int(96 + (blend * 124)),
            220,
        )
        outline = (32, 38, 50, 255)
        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=fill, outline=outline, width=1)

    return canvas


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


def render_cross_region_metric_review(title: str, subtitle: str, rows: List[Dict], width: int = 1240) -> Image.Image:
    row_h = 36
    header_h = 84
    height = header_h + (max(1, len(rows)) * row_h) + 20
    canvas = Image.new("RGBA", (width, height), (12, 16, 26, 255))
    draw = ImageDraw.Draw(canvas)

    draw.text((14, 10), title, fill=(236, 236, 236, 255))
    draw.text((14, 34), subtitle, fill=(178, 194, 214, 255))

    bar_left = 360
    bar_right = width - 16
    bar_w = max(80, bar_right - bar_left)

    for idx, row in enumerate(rows):
        y = header_h + (idx * row_h)
        label = str(row.get("label", f"row-{idx + 1}"))
        value = max(0.0, min(1.0, float(row.get("value", 0.0))))
        meta = str(row.get("meta", ""))
        color = tuple(row.get("color", (90, 164, 214, 230)))

        draw.text((14, y + 8), label, fill=(220, 224, 236, 255))
        if meta:
            draw.text((170, y + 8), meta, fill=(158, 174, 194, 255))

        draw.rectangle([(bar_left, y + 10), (bar_right, y + 24)], fill=(28, 34, 48, 255), outline=(48, 58, 78, 255), width=1)
        fill_w = int(round(bar_w * value))
        if fill_w > 0:
            draw.rectangle([(bar_left + 1, y + 11), (bar_left + fill_w, y + 23)], fill=color)
        draw.text((bar_right - 70, y + 7), f"{value:.3f}", fill=(224, 234, 248, 255))

    return canvas


def analyze_cross_region_field_stability(summary_regions: List[Dict]) -> Dict:
    fields = ["f1", "f2", "f3f4", "f5"]
    region_patterns: List[Dict] = []
    values_by_field: Dict[str, List[float]] = {field: [] for field in fields}
    mapchip_occurrence: Dict[int, List[int]] = {}

    for region in summary_regions:
        region_id = int(region.get("regionId", 0))
        f1_score = float(region.get("biomeHypothesisStats", {}).get("f1BiomeEvidenceScore", 0.0))
        f2_score = float(region.get("mapchipCompositionConfidence", {}).get("averageClusterConfidence", 0.0))
        f3f4_score = float(region.get("landWaterMaskDiagnostics", {}).get("f3f4ComplementaryRatio", 0.0))
        f5_score = float(region.get("fieldConfidenceSummaries", {}).get("f5TopTheoryConfidence", 0.0))

        values_by_field["f1"].append(f1_score)
        values_by_field["f2"].append(f2_score)
        values_by_field["f3f4"].append(f3f4_score)
        values_by_field["f5"].append(f5_score)

        region_patterns.append(
            {
                "regionId": region_id,
                "bounds": dict(region.get("bounds", {})),
                "sampleTraits": dict(region.get("sampleTraits", {})),
                "fieldPattern": {
                    "f1BiomeConsistency": float(round(f1_score, 4)),
                    "f2ContinuityStability": float(round(f2_score, 4)),
                    "f3f4MaskStability": float(round(f3f4_score, 4)),
                    "f5OverlaySupportStability": float(round(f5_score, 4)),
                },
            }
        )

        for f2_id in region.get("f2Ids", []):
            key = int(f2_id)
            mapchip_occurrence.setdefault(key, []).append(region_id)

    stability_by_field = {
        "f1BiomeConsistency": compute_stability_metrics(values_by_field["f1"]),
        "f2ContinuityStability": compute_stability_metrics(values_by_field["f2"]),
        "f3f4MaskStability": compute_stability_metrics(values_by_field["f3f4"]),
        "f5OverlaySupportStability": compute_stability_metrics(values_by_field["f5"]),
    }

    confidence_drift_metrics = {}
    contradiction_candidates: List[Dict] = []
    anomaly_region_candidates: List[Dict] = []
    special_case_behaviors: List[Dict] = []

    means = {
        "f1": float(stability_by_field["f1BiomeConsistency"].get("mean", 0.0)),
        "f2": float(stability_by_field["f2ContinuityStability"].get("mean", 0.0)),
        "f3f4": float(stability_by_field["f3f4MaskStability"].get("mean", 0.0)),
        "f5": float(stability_by_field["f5OverlaySupportStability"].get("mean", 0.0)),
    }

    for field_key, values in values_by_field.items():
        drift = compute_stability_metrics(values)
        confidence_drift_metrics[field_key] = {
            "mean": float(drift.get("mean", 0.0)),
            "range": float(drift.get("range", 0.0)),
            "stdDev": float(drift.get("stdDev", 0.0)),
            "stabilityIndex": float(drift.get("stabilityIndex", 0.0)),
        }

    for pattern in region_patterns:
        region_id = int(pattern.get("regionId", 0))
        fp = pattern.get("fieldPattern", {})
        drift_score = (
            abs(float(fp.get("f1BiomeConsistency", 0.0)) - means["f1"])
            + abs(float(fp.get("f2ContinuityStability", 0.0)) - means["f2"])
            + abs(float(fp.get("f3f4MaskStability", 0.0)) - means["f3f4"])
            + abs(float(fp.get("f5OverlaySupportStability", 0.0)) - means["f5"])
        ) / 4.0

        contradictions = []
        if float(fp.get("f3f4MaskStability", 0.0)) < 0.6:
            contradictions.append("f3f4_mask_instability")
        if float(fp.get("f1BiomeConsistency", 0.0)) < 0.55:
            contradictions.append("f1_biome_drift")
        if float(fp.get("f5OverlaySupportStability", 0.0)) < 0.45:
            contradictions.append("f5_overlay_support_drift")

        if contradictions:
            contradiction_candidates.append(
                {
                    "regionId": region_id,
                    "contradictions": contradictions,
                    "driftScore": float(round(drift_score, 4)),
                }
            )

        anomaly_region_candidates.append(
            {
                "regionId": region_id,
                "driftScore": float(round(drift_score, 4)),
                "sampleTraits": pattern.get("sampleTraits", {}),
            }
        )

    anomaly_region_candidates.sort(key=lambda item: (-float(item.get("driftScore", 0.0)), int(item.get("regionId", 0))))
    contradiction_candidates.sort(key=lambda item: (-float(item.get("driftScore", 0.0)), int(item.get("regionId", 0))))

    for f2_id, region_ids in mapchip_occurrence.items():
        unique_regions = sorted(set(int(value) for value in region_ids))
        if len(unique_regions) == 1:
            special_case_behaviors.append(
                {
                    "type": "region_exclusive_mapchip",
                    "f2": int(f2_id),
                    "regionId": int(unique_regions[0]),
                    "count": int(len(region_ids)),
                }
            )

    special_case_behaviors.sort(key=lambda item: (-int(item.get("count", 0)), int(item.get("regionId", 0)), int(item.get("f2", 0))))

    return {
        "crossRegionFieldStability": {
            "regionCount": int(len(summary_regions)),
            "f1BiomeConsistency": stability_by_field["f1BiomeConsistency"],
            "f2ContinuityStability": stability_by_field["f2ContinuityStability"],
            "f3f4MaskStability": stability_by_field["f3f4MaskStability"],
            "f5OverlaySupportStability": stability_by_field["f5OverlaySupportStability"],
        },
        "hypothesisDriftDiagnostics": {
            "confidenceDriftMetrics": confidence_drift_metrics,
            "driftRanking": anomaly_region_candidates[:200],
        },
        "contradictionCandidates": contradiction_candidates[:200],
        "anomalyRegionCandidates": anomaly_region_candidates[:200],
        "specialCaseFieldBehaviors": special_case_behaviors[:300],
        "regionSpecificFieldPatterns": region_patterns,
    }


def analyze_asset_identity_grounded_semantics(summary_regions: List[Dict], ka_chip_dir: Path) -> Dict:
    target_assets = ["rouka14", "tuchi00", "tuchi01", "tuchi02", "tuchi03", "tuchi04"]
    target_set = set(target_assets)
    observed: Dict[str, Dict] = {}

    def clamp01(value: float) -> float:
        return max(0.0, min(1.0, float(value)))

    def numeric_sum(payload: Dict, key_hint: str | None = None) -> float:
        total = 0.0
        for key, value in payload.items():
            if not isinstance(value, (int, float)):
                continue
            if key_hint is None or key_hint in str(key).lower():
                total += float(value)
        return total

    region_count = max(1, int(len(summary_regions)))
    for region in summary_regions:
        region_id = int(region.get("regionId", 0))
        support_diag = region.get("supportPlacementDiagnostics", {})
        support_signal = clamp01(
            (len(support_diag.get("reclaimedLandEdgeConsistency", [])) / 24.0)
            + (len(region.get("transitionDiagnostics", {}).get("cliffPlatformBoundaries", [])) / 24.0)
        )

        coherence = float(region.get("coherenceScores", {}).get("overall", 0.0))
        mapchip_conf = float(region.get("mapchipCompositionConfidence", {}).get("averageClusterConfidence", 0.0))
        top_surface_signal = clamp01((mapchip_conf * 0.58) + (coherence * 0.42))

        indoor_stats = region.get("indoorOutdoorStats", {})
        indoor_total = numeric_sum(indoor_stats, "indoor")
        placement_total = max(1.0, numeric_sum(indoor_stats))
        grouped_structures = len(region.get("groupedStructures", []))
        containment_signal = clamp01(((indoor_total / placement_total) * 0.72) + (min(1.0, grouped_structures / 10.0) * 0.28))

        metadata_stats = region.get("modeStats", {}).get("metadata", {})
        screenshot_signal = clamp01(
            float(metadata_stats.get("metadataAnchorCount", 0)) / max(1.0, float(metadata_stats.get("spriteCount", 0)))
        )

        asset_stats = region.get("assetIdentityStats", {}).get("assets", [])
        for asset in asset_stats:
            base_name = str(asset.get("baseName", ""))
            if not base_name:
                continue
            bucket = observed.setdefault(
                base_name,
                {
                    "assetId": base_name,
                    "spriteCount": 0,
                    "metadataAnchorCount": 0,
                    "bottomCenterFallbackCount": 0,
                    "regions": set(),
                    "mapChipNames": {},
                    "familyCounts": {},
                    "drawLayerCounts": {},
                    "widthWeighted": 0.0,
                    "heightWeighted": 0.0,
                    "anchorXWeighted": 0.0,
                    "anchorYWeighted": 0.0,
                    "weightSum": 0.0,
                    "supportScoreSum": 0.0,
                    "topSurfaceScoreSum": 0.0,
                    "containmentScoreSum": 0.0,
                    "screenshotScoreSum": 0.0,
                },
            )

            count = int(asset.get("spriteCount", 0))
            if count <= 0:
                continue
            weight = float(count)

            bucket["spriteCount"] += count
            bucket["metadataAnchorCount"] += int(asset.get("metadataAnchorCount", 0))
            bucket["bottomCenterFallbackCount"] += int(asset.get("bottomCenterFallbackCount", 0))
            bucket["regions"].add(region_id)
            bucket["weightSum"] += weight

            bucket["widthWeighted"] += float(asset.get("medianSpriteWidth", 0.0)) * weight
            bucket["heightWeighted"] += float(asset.get("medianSpriteHeight", 0.0)) * weight
            bucket["anchorXWeighted"] += float(asset.get("medianAnchorX", 0.0)) * weight
            bucket["anchorYWeighted"] += float(asset.get("medianAnchorY", 0.0)) * weight

            bucket["supportScoreSum"] += support_signal * weight
            bucket["topSurfaceScoreSum"] += top_surface_signal * weight
            bucket["containmentScoreSum"] += containment_signal * weight
            bucket["screenshotScoreSum"] += screenshot_signal * weight

            for key, value in asset.get("mapChipNames", {}).items():
                bucket["mapChipNames"][str(key)] = int(bucket["mapChipNames"].get(str(key), 0)) + int(value)
            for key, value in asset.get("familyCounts", {}).items():
                bucket["familyCounts"][str(key)] = int(bucket["familyCounts"].get(str(key), 0)) + int(value)
            for key, value in asset.get("drawLayerCounts", {}).items():
                bucket["drawLayerCounts"][str(key)] = int(bucket["drawLayerCounts"].get(str(key), 0)) + int(value)

    file_geometry: Dict[str, Dict] = {}
    for asset_id in target_assets:
        png_path = ka_chip_dir / f"{asset_id}.png"
        opt_path = ka_chip_dir / f"{asset_id}.opt"
        optinfo_path = ka_chip_dir / f"{asset_id}.optinfo"
        width = 0
        height = 0
        if png_path.exists():
            width, height = Image.open(png_path).convert("RGBA").size
        file_geometry[asset_id] = {
            "assetId": asset_id,
            "pngPath": str(png_path).replace("\\", "/") if png_path.exists() else None,
            "optPath": str(opt_path).replace("\\", "/") if opt_path.exists() else None,
            "optinfoPath": str(optinfo_path).replace("\\", "/") if optinfo_path.exists() else None,
            "fileSpriteWidth": int(width),
            "fileSpriteHeight": int(height),
            "hasOpt": bool(opt_path.exists()),
            "hasOptinfo": bool(optinfo_path.exists()),
        }

    def summarized_asset(asset_id: str) -> Dict:
        bucket = observed.get(asset_id, {})
        weight_sum = max(1.0, float(bucket.get("weightSum", 0.0)))
        sprite_count = int(bucket.get("spriteCount", 0))
        metadata_count = int(bucket.get("metadataAnchorCount", 0))
        fallback_count = int(bucket.get("bottomCenterFallbackCount", 0))
        region_hits = len(bucket.get("regions", set()))

        mapchip_names = sorted(bucket.get("mapChipNames", {}).items(), key=lambda item: (-int(item[1]), item[0]))
        family_counts = sorted(bucket.get("familyCounts", {}).items(), key=lambda item: (-int(item[1]), item[0]))
        draw_layers = sorted(bucket.get("drawLayerCounts", {}).items(), key=lambda item: (int(item[0]), item[0]))

        top_mapchip_names = [name for name, _ in mapchip_names[:5]]
        dominant_family = family_counts[0][0] if family_counts else "unknown"

        coverage_score = clamp01((region_hits / float(region_count)) * 0.42)
        metadata_rate = clamp01(float(metadata_count) / max(1.0, float(sprite_count)))
        fallback_rate = clamp01(float(fallback_count) / max(1.0, float(sprite_count)))
        support_score = clamp01(float(bucket.get("supportScoreSum", 0.0)) / weight_sum)
        top_surface_score = clamp01(float(bucket.get("topSurfaceScoreSum", 0.0)) / weight_sum)
        containment_score = clamp01(float(bucket.get("containmentScoreSum", 0.0)) / weight_sum)
        screenshot_score = clamp01(float(bucket.get("screenshotScoreSum", 0.0)) / weight_sum)

        if asset_id.startswith("tuchi"):
            semantic_label = "soil_or_ground_surface_variant"
        elif asset_id.startswith("rouka"):
            semantic_label = "corridor_or_floor_surface_variant"
        elif any("floor" in name.lower() for name in top_mapchip_names):
            semantic_label = "floor_surface_variant"
        elif any("road" in name.lower() or "path" in name.lower() for name in top_mapchip_names):
            semantic_label = "path_or_connector_surface_variant"
        else:
            semantic_label = "unresolved_surface_variant"

        semantic_confidence = clamp01(
            0.16 + coverage_score + (metadata_rate * 0.2) + (top_surface_score * 0.22) + (screenshot_score * 0.2)
        )

        return {
            "assetId": asset_id,
            "spriteCount": sprite_count,
            "regionCount": int(region_hits),
            "regionIds": sorted(int(value) for value in bucket.get("regions", set())),
            "metadataAnchorCount": metadata_count,
            "bottomCenterFallbackCount": fallback_count,
            "metadataAnchorRate": float(round(metadata_rate, 4)),
            "fallbackRate": float(round(fallback_rate, 4)),
            "dominantMapChipNames": top_mapchip_names,
            "dominantFamily": dominant_family,
            "supportWallScore": float(round(support_score, 4)),
            "topSurfaceScore": float(round(top_surface_score, 4)),
            "containmentScore": float(round(containment_score, 4)),
            "screenshotBehaviorScore": float(round(screenshot_score, 4)),
            "semanticLabel": semantic_label,
            "semanticConfidence": float(round(semantic_confidence, 4)),
            "drawLayerCounts": {key: int(value) for key, value in draw_layers},
            "familyCounts": {key: int(value) for key, value in family_counts},
            "mapChipNames": {key: int(value) for key, value in mapchip_names},
            "observedMedianWidth": float(round(float(bucket.get("widthWeighted", 0.0)) / weight_sum, 4)),
            "observedMedianHeight": float(round(float(bucket.get("heightWeighted", 0.0)) / weight_sum, 4)),
            "observedMedianAnchorX": float(round(float(bucket.get("anchorXWeighted", 0.0)) / weight_sum, 4)),
            "observedMedianAnchorY": float(round(float(bucket.get("anchorYWeighted", 0.0)) / weight_sum, 4)),
        }

    target_asset_summaries = [summarized_asset(asset_id) for asset_id in target_assets]

    geometry_descriptors: List[Dict] = []
    for item in target_asset_summaries:
        asset_id = str(item.get("assetId", ""))
        file_info = file_geometry.get(asset_id, {})
        observed_w = float(item.get("observedMedianWidth", 0.0))
        observed_h = float(item.get("observedMedianHeight", 0.0))
        file_w = float(file_info.get("fileSpriteWidth", 0))
        file_h = float(file_info.get("fileSpriteHeight", 0))
        width = observed_w if observed_w > 0 else file_w
        height = observed_h if observed_h > 0 else file_h
        aspect = float(width / max(1.0, height))
        geometry_descriptors.append(
            {
                "assetId": asset_id,
                "observedMedianWidth": float(round(observed_w, 4)),
                "observedMedianHeight": float(round(observed_h, 4)),
                "fileSpriteWidth": int(file_info.get("fileSpriteWidth", 0)),
                "fileSpriteHeight": int(file_info.get("fileSpriteHeight", 0)),
                "effectiveAspectRatio": float(round(aspect, 4)),
                "observedMedianAnchorX": float(round(float(item.get("observedMedianAnchorX", 0.0)), 4)),
                "observedMedianAnchorY": float(round(float(item.get("observedMedianAnchorY", 0.0)), 4)),
                "geometryDescriptor": "wide_surface" if aspect >= 1.35 else ("compact_surface" if aspect <= 0.82 else "balanced_surface"),
                "assetPaths": {
                    "pngPath": file_info.get("pngPath"),
                    "optPath": file_info.get("optPath"),
                    "optinfoPath": file_info.get("optinfoPath"),
                },
            }
        )

    descriptor_by_asset = {str(item.get("assetId", "")): item for item in geometry_descriptors}
    summary_by_asset = {str(item.get("assetId", "")): item for item in target_asset_summaries}

    tuchi_family = [asset for asset in target_assets if asset.startswith("tuchi")]
    tuchi_relationships: List[Dict] = []
    for index in range(len(tuchi_family) - 1):
        left = tuchi_family[index]
        right = tuchi_family[index + 1]
        left_geo = descriptor_by_asset.get(left, {})
        right_geo = descriptor_by_asset.get(right, {})
        left_sum = summary_by_asset.get(left, {})
        right_sum = summary_by_asset.get(right, {})

        width_delta = abs(float(left_geo.get("effectiveAspectRatio", 0.0)) - float(right_geo.get("effectiveAspectRatio", 0.0)))
        metadata_delta = abs(float(left_sum.get("metadataAnchorRate", 0.0)) - float(right_sum.get("metadataAnchorRate", 0.0)))

        left_regions = set(int(value) for value in left_sum.get("regionIds", []))
        right_regions = set(int(value) for value in right_sum.get("regionIds", []))
        union_count = max(1, len(left_regions | right_regions))
        co_region_ratio = float(len(left_regions & right_regions)) / float(union_count)

        strength = clamp01((1.0 - min(1.0, width_delta)) * 0.5 + (1.0 - min(1.0, metadata_delta)) * 0.2 + (co_region_ratio * 0.3))
        tuchi_relationships.append(
            {
                "assetA": left,
                "assetB": right,
                "relationshipType": "adjacent_tuchi_variant",
                "geometrySimilarity": float(round(1.0 - min(1.0, width_delta), 4)),
                "metadataBehaviorSimilarity": float(round(1.0 - min(1.0, metadata_delta), 4)),
                "coRegionRatio": float(round(co_region_ratio, 4)),
                "relationshipStrength": float(round(strength, 4)),
            }
        )

    rouka_candidates = [name for name in observed.keys() if name.startswith("rouka")]
    if "rouka14" not in rouka_candidates:
        rouka_candidates.append("rouka14")
    rouka_candidates = sorted(set(rouka_candidates))
    rouka_relationships: List[Dict] = []
    ref_geo = descriptor_by_asset.get("rouka14", {})
    ref_summary = summary_by_asset.get("rouka14", {})
    for name in rouka_candidates:
        if name == "rouka14":
            continue
        candidate = summarized_asset(name)
        left_aspect = float(ref_geo.get("effectiveAspectRatio", 1.0))
        right_width = float(candidate.get("observedMedianWidth", 0.0))
        right_height = float(candidate.get("observedMedianHeight", 0.0))
        right_aspect = right_width / max(1.0, right_height)

        aspect_similarity = 1.0 - min(1.0, abs(left_aspect - right_aspect))
        metadata_similarity = 1.0 - min(
            1.0,
            abs(float(ref_summary.get("metadataAnchorRate", 0.0)) - float(candidate.get("metadataAnchorRate", 0.0))),
        )
        co_region_ratio = 0.0
        ref_regions = set(int(value) for value in ref_summary.get("regionIds", []))
        candidate_regions = set(int(value) for value in candidate.get("regionIds", []))
        if ref_regions or candidate_regions:
            co_region_ratio = float(len(ref_regions & candidate_regions)) / float(max(1, len(ref_regions | candidate_regions)))

        strength = clamp01((aspect_similarity * 0.46) + (metadata_similarity * 0.24) + (co_region_ratio * 0.3))
        rouka_relationships.append(
            {
                "assetA": "rouka14",
                "assetB": name,
                "relationshipType": "rouka_family_similarity",
                "aspectSimilarity": float(round(aspect_similarity, 4)),
                "metadataBehaviorSimilarity": float(round(metadata_similarity, 4)),
                "coRegionRatio": float(round(co_region_ratio, 4)),
                "relationshipStrength": float(round(strength, 4)),
            }
        )
    rouka_relationships.sort(key=lambda item: (-float(item.get("relationshipStrength", 0.0)), str(item.get("assetB", ""))))

    containment_candidates = sorted(
        [
            {
                "assetId": item.get("assetId"),
                "containmentScore": float(item.get("containmentScore", 0.0)),
                "geometryDescriptor": descriptor_by_asset.get(str(item.get("assetId", "")), {}).get("geometryDescriptor", "unresolved"),
                "evidence": {
                    "dominantMapChipNames": item.get("dominantMapChipNames", []),
                    "dominantFamily": item.get("dominantFamily", "unknown"),
                },
            }
            for item in target_asset_summaries
        ],
        key=lambda row: (-float(row.get("containmentScore", 0.0)), str(row.get("assetId", ""))),
    )

    support_wall_evidence = sorted(
        [
            {
                "assetId": item.get("assetId"),
                "supportWallScore": float(item.get("supportWallScore", 0.0)),
                "metadataAnchorRate": float(item.get("metadataAnchorRate", 0.0)),
                "regionCount": int(item.get("regionCount", 0)),
            }
            for item in target_asset_summaries
        ],
        key=lambda row: (-float(row.get("supportWallScore", 0.0)), -int(row.get("regionCount", 0)), str(row.get("assetId", ""))),
    )

    top_surface_evidence = sorted(
        [
            {
                "assetId": item.get("assetId"),
                "topSurfaceScore": float(item.get("topSurfaceScore", 0.0)),
                "semanticLabel": item.get("semanticLabel", "unresolved"),
                "dominantMapChipNames": item.get("dominantMapChipNames", []),
            }
            for item in target_asset_summaries
        ],
        key=lambda row: (-float(row.get("topSurfaceScore", 0.0)), str(row.get("assetId", ""))),
    )

    screenshot_correlations = sorted(
        [
            {
                "assetId": item.get("assetId"),
                "screenshotBehaviorScore": float(item.get("screenshotBehaviorScore", 0.0)),
                "metadataAnchorRate": float(item.get("metadataAnchorRate", 0.0)),
                "fallbackRate": float(item.get("fallbackRate", 0.0)),
                "regionCount": int(item.get("regionCount", 0)),
            }
            for item in target_asset_summaries
        ],
        key=lambda row: (-float(row.get("screenshotBehaviorScore", 0.0)), str(row.get("assetId", ""))),
    )

    avg_semantic_conf = float(sum(float(item.get("semanticConfidence", 0.0)) for item in target_asset_summaries) / max(1, len(target_asset_summaries)))
    avg_support = float(sum(float(item.get("supportWallScore", 0.0)) for item in target_asset_summaries) / max(1, len(target_asset_summaries)))
    avg_top_surface = float(sum(float(item.get("topSurfaceScore", 0.0)) for item in target_asset_summaries) / max(1, len(target_asset_summaries)))
    avg_containment = float(sum(float(item.get("containmentScore", 0.0)) for item in target_asset_summaries) / max(1, len(target_asset_summaries)))
    avg_behavior = float(sum(float(item.get("screenshotBehaviorScore", 0.0)) for item in target_asset_summaries) / max(1, len(target_asset_summaries)))

    grounded_confidence = {
        "assetIdentityCoverage": float(
            round(
                sum(1 for item in target_asset_summaries if int(item.get("regionCount", 0)) > 0) / max(1, len(target_asset_summaries)),
                4,
            )
        ),
        "geometryEvidenceStrength": float(round(sum(1 for item in geometry_descriptors if int(item.get("fileSpriteWidth", 0)) > 0) / max(1, len(geometry_descriptors)), 4)),
        "semanticConfidenceMean": float(round(avg_semantic_conf, 4)),
        "supportWallStrengthMean": float(round(avg_support, 4)),
        "topSurfaceStrengthMean": float(round(avg_top_surface, 4)),
        "containmentStrengthMean": float(round(avg_containment, 4)),
        "screenshotBehaviorStrengthMean": float(round(avg_behavior, 4)),
        "overall": float(
            round(
                clamp01(
                    (avg_semantic_conf * 0.28)
                    + (avg_support * 0.14)
                    + (avg_top_surface * 0.18)
                    + (avg_containment * 0.14)
                    + (avg_behavior * 0.16)
                    + (sum(1 for item in geometry_descriptors if int(item.get("fileSpriteWidth", 0)) > 0) / max(1, len(geometry_descriptors)) * 0.1)
                ),
                4,
            )
        ),
    }

    geometry_behavior_rows = []
    for item in target_asset_summaries:
        asset_id = str(item.get("assetId", ""))
        descriptor = descriptor_by_asset.get(asset_id, {})
        aspect = float(descriptor.get("effectiveAspectRatio", 1.0))
        behavior = float(item.get("screenshotBehaviorScore", 0.0))
        consistency = clamp01(1.0 - min(1.0, abs((aspect / max(1.0, aspect + 0.25)) - behavior)))
        geometry_behavior_rows.append(
            {
                "assetId": asset_id,
                "geometryBehaviorConsistency": float(round(consistency, 4)),
                "effectiveAspectRatio": float(round(aspect, 4)),
                "screenshotBehaviorScore": float(round(behavior, 4)),
            }
        )

    return {
        "assetIdentitySemanticCandidates": sorted(
            [
                {
                    "assetId": item.get("assetId"),
                    "semanticLabel": item.get("semanticLabel"),
                    "semanticConfidence": float(item.get("semanticConfidence", 0.0)),
                    "evidence": {
                        "dominantMapChipNames": item.get("dominantMapChipNames", []),
                        "dominantFamily": item.get("dominantFamily", "unknown"),
                        "metadataAnchorRate": float(item.get("metadataAnchorRate", 0.0)),
                        "regionCount": int(item.get("regionCount", 0)),
                    },
                }
                for item in target_asset_summaries
            ],
            key=lambda row: (-float(row.get("semanticConfidence", 0.0)), str(row.get("assetId", ""))),
        ),
        "assetGeometryDescriptors": geometry_descriptors,
        "tuchiFamilyRelationships": sorted(tuchi_relationships, key=lambda row: (-float(row.get("relationshipStrength", 0.0)), str(row.get("assetA", "")))),
        "roukaFamilyRelationships": rouka_relationships[:20],
        "containmentGeometryCandidates": containment_candidates,
        "supportWallEvidence": support_wall_evidence,
        "topSurfaceEvidence": top_surface_evidence,
        "screenshotBehaviorCorrelations": screenshot_correlations,
        "geometryVsBehaviorReview": sorted(geometry_behavior_rows, key=lambda row: (-float(row.get("geometryBehaviorConsistency", 0.0)), str(row.get("assetId", "")))),
        "groundedSemanticConfidence": grounded_confidence,
    }


def analyze_support_geometry_containment(summary_regions: List[Dict]) -> Dict:
    def clamp01(value: float) -> float:
        return max(0.0, min(1.0, float(value)))

    support_geometry_candidates: List[Dict] = []
    top_surface_vs_sidewall_candidates: List[Dict] = []
    containment_system_candidates: List[Dict] = []
    edge_depth_candidates: List[Dict] = []
    support_transition_candidates: List[Dict] = []
    elevated_platform_candidates: List[Dict] = []
    terrain_support_correlations: List[Dict] = []

    containment_scores: List[float] = []
    support_transition_scores: List[float] = []
    top_surface_separation_scores: List[float] = []

    for region in summary_regions:
        region_id = int(region.get("regionId", 0))
        support_stats = region.get("supportRelationshipStats", {})
        continuity = region.get("terrainContinuityDiagnostics", {})
        transitions = region.get("transitionDiagnostics", {})
        support_diag = region.get("supportPlacementDiagnostics", {})
        semantic_conf = region.get("semanticPlacementConfidence", {})
        indoor_outdoor = region.get("indoorOutdoorStats", {})
        mapchip_conf = region.get("mapchipCompositionConfidence", {})
        elevated_counts = region.get("elevationFamilyCounts", {})

        terrain_supported = int(support_stats.get("terrainSupportedElevatedTiles", 0))
        unsupported = int(support_stats.get("unsupportedElevatedTiles", 0))
        floating_groups = int(support_stats.get("floatingPlatformGroups", 0))
        foundation_supported = int(support_stats.get("foundationSupportedStructures", 0))
        overlay_hits = int(support_stats.get("overlayAttachmentHits", 0))

        unsupported_tiles = list(continuity.get("unsupportedElevatedTiles", []))
        abrupt_breaks = list(continuity.get("abruptFamilyDiscontinuities", []))
        cliff_boundaries = list(transitions.get("cliffPlatformBoundaries", []))
        edge_conflicts = list(transitions.get("edgeConflictCandidates", []))
        transition_candidates = list(transitions.get("transitionCandidates", []))
        reclaimed_edge = list(support_diag.get("reclaimedLandEdgeConsistency", []))
        road_disconnect = list(support_diag.get("roadDisconnectionCandidates", []))

        unresolved_edge_count = int(len(unsupported_tiles) + len(edge_conflicts) + len(abrupt_breaks))
        support_total = max(1, terrain_supported + unsupported)
        support_connectivity = float(terrain_supported / support_total)
        support_risk = float((unsupported + (floating_groups * 2)) / max(1, support_total + foundation_supported))
        support_geometry_score = clamp01((support_connectivity * 0.55) + (min(1.0, foundation_supported / 8.0) * 0.25) + (min(1.0, overlay_hits / 10.0) * 0.2))

        top_surface_signal = float(mapchip_conf.get("averageClusterConfidence", 0.0))
        sidewall_signal = clamp01((len(cliff_boundaries) + unresolved_edge_count) / 36.0)
        separation_confidence = clamp01((top_surface_signal * 0.52) + (sidewall_signal * 0.34) + (support_connectivity * 0.14))

        boundary_count = len(cliff_boundaries) + len(edge_conflicts)
        interior_signal = float(semantic_conf.get("averageConfidence", 0.0))
        containment_score = clamp01((interior_signal * 0.42) + (min(1.0, boundary_count / 28.0) * 0.33) + (support_connectivity * 0.25))

        edge_depth_score = clamp01((min(1.0, len(edge_conflicts) / 20.0) * 0.52) + (min(1.0, len(cliff_boundaries) / 20.0) * 0.3) + (min(1.0, len(abrupt_breaks) / 12.0) * 0.18))
        support_transition_score = clamp01((min(1.0, len(cliff_boundaries) / 24.0) * 0.36) + (min(1.0, len(reclaimed_edge) / 28.0) * 0.32) + (min(1.0, len(transition_candidates) / 64.0) * 0.2) + (support_connectivity * 0.12))

        elevated_total = int(sum(int(value) for value in elevated_counts.values()))
        elevated_platform_score = clamp01((min(1.0, elevated_total / 18.0) * 0.46) + (support_connectivity * 0.34) + (1.0 - min(1.0, support_risk)) * 0.2)

        terrain_support_corr = clamp01((support_connectivity * 0.5) + (support_transition_score * 0.3) + (containment_score * 0.2))

        support_geometry_candidates.append(
            {
                "regionId": region_id,
                "supportGeometryScore": float(round(support_geometry_score, 4)),
                "supportConnectivity": float(round(support_connectivity, 4)),
                "supportRisk": float(round(support_risk, 4)),
                "terrainSupportedElevatedTiles": int(terrain_supported),
                "unsupportedElevatedTiles": int(unsupported),
                "floatingPlatformGroups": int(floating_groups),
                "foundationSupportedStructures": int(foundation_supported),
                "overlayAttachmentHits": int(overlay_hits),
            }
        )

        top_surface_vs_sidewall_candidates.append(
            {
                "regionId": region_id,
                "topSurfaceVsSidewallScore": float(round(separation_confidence, 4)),
                "topSurfaceSignal": float(round(top_surface_signal, 4)),
                "sidewallSignal": float(round(sidewall_signal, 4)),
                "cliffBoundaryCount": int(len(cliff_boundaries)),
                "edgeConflictCount": int(len(edge_conflicts)),
                "abruptDiscontinuityCount": int(len(abrupt_breaks)),
            }
        )

        containment_system_candidates.append(
            {
                "regionId": region_id,
                "containmentSystemScore": float(round(containment_score, 4)),
                "boundaryCount": int(boundary_count),
                "interiorSignal": float(round(interior_signal, 4)),
                "reclaimedEdgeCandidates": int(len(reclaimed_edge)),
                "floatingRegionCandidates": int(len(region.get("floatingRegionCandidates", []))),
                "disconnectedRegionCandidates": int(len(region.get("disconnectedRegionCandidates", []))),
            }
        )

        edge_depth_candidates.append(
            {
                "regionId": region_id,
                "edgeDepthScore": float(round(edge_depth_score, 4)),
                "edgeConflictCount": int(len(edge_conflicts)),
                "cliffBoundaryCount": int(len(cliff_boundaries)),
                "abruptDiscontinuityCount": int(len(abrupt_breaks)),
                "unsupportedEdgeLikeCount": int(unresolved_edge_count),
            }
        )

        support_transition_candidates.append(
            {
                "regionId": region_id,
                "supportTransitionScore": float(round(support_transition_score, 4)),
                "elevatedFlatTransitionCount": int(len(cliff_boundaries)),
                "reclaimedEdgeContinuityCount": int(len(reclaimed_edge)),
                "transitionCandidateCount": int(len(transition_candidates)),
                "roadDisconnectionCount": int(len(road_disconnect)),
            }
        )

        elevated_platform_candidates.append(
            {
                "regionId": region_id,
                "elevatedPlatformScore": float(round(elevated_platform_score, 4)),
                "elevatedFamilyCounts": {key: int(value) for key, value in elevated_counts.items()},
                "elevatedTileCount": int(elevated_total),
                "platformSupportContinuousGroups": int(support_stats.get("platformSupportContinuousGroups", 0)),
                "floatingPlatformGroups": int(floating_groups),
            }
        )

        terrain_support_correlations.append(
            {
                "regionId": region_id,
                "terrainSupportCorrelation": float(round(terrain_support_corr, 4)),
                "supportConnectivity": float(round(support_connectivity, 4)),
                "supportTransitionScore": float(round(support_transition_score, 4)),
                "containmentSystemScore": float(round(containment_score, 4)),
                "topSurfaceVsSidewallScore": float(round(separation_confidence, 4)),
                "indoorOutdoorStats": {key: int(value) for key, value in indoor_outdoor.items()},
            }
        )

        containment_scores.append(float(containment_score))
        support_transition_scores.append(float(support_transition_score))
        top_surface_separation_scores.append(float(separation_confidence))

    support_geometry_candidates.sort(key=lambda item: (-float(item.get("supportGeometryScore", 0.0)), int(item.get("regionId", 0))))
    top_surface_vs_sidewall_candidates.sort(key=lambda item: (-float(item.get("topSurfaceVsSidewallScore", 0.0)), int(item.get("regionId", 0))))
    containment_system_candidates.sort(key=lambda item: (-float(item.get("containmentSystemScore", 0.0)), int(item.get("regionId", 0))))
    edge_depth_candidates.sort(key=lambda item: (-float(item.get("edgeDepthScore", 0.0)), int(item.get("regionId", 0))))
    support_transition_candidates.sort(key=lambda item: (-float(item.get("supportTransitionScore", 0.0)), int(item.get("regionId", 0))))
    elevated_platform_candidates.sort(key=lambda item: (-float(item.get("elevatedPlatformScore", 0.0)), int(item.get("regionId", 0))))
    terrain_support_correlations.sort(key=lambda item: (-float(item.get("terrainSupportCorrelation", 0.0)), int(item.get("regionId", 0))))

    containment_confidence = {
        "regionCount": int(len(summary_regions)),
        "meanContainmentScore": float(round(sum(containment_scores) / max(1, len(containment_scores)), 4)),
        "meanSupportTransitionScore": float(round(sum(support_transition_scores) / max(1, len(support_transition_scores)), 4)),
        "meanTopSurfaceVsSidewallScore": float(round(sum(top_surface_separation_scores) / max(1, len(top_surface_separation_scores)), 4)),
        "overall": float(
            round(
                clamp01(
                    (sum(containment_scores) / max(1, len(containment_scores)) * 0.45)
                    + (sum(support_transition_scores) / max(1, len(support_transition_scores)) * 0.3)
                    + (sum(top_surface_separation_scores) / max(1, len(top_surface_separation_scores)) * 0.25)
                ),
                4,
            )
        ),
    }

    return {
        "supportGeometryCandidates": support_geometry_candidates[:240],
        "topSurfaceVsSidewallCandidates": top_surface_vs_sidewall_candidates[:240],
        "containmentSystemCandidates": containment_system_candidates[:240],
        "edgeDepthCandidates": edge_depth_candidates[:240],
        "supportTransitionCandidates": support_transition_candidates[:240],
        "elevatedPlatformCandidates": elevated_platform_candidates[:240],
        "terrainSupportCorrelations": terrain_support_correlations[:240],
        "containmentConfidence": containment_confidence,
    }


def _safe_int(row: List[str], idx: int, default: int = -1) -> int:
    if idx < 0 or idx >= len(row):
        return default
    value = str(row[idx]).strip()
    if not value:
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def parse_tab_sheet_rows(path: Path) -> List[List[str]]:
    if not path.exists():
        return []
    rows: List[List[str]] = []
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip("\ufeff\n\r")
        if not line:
            continue
        rows.append(line.split("\t"))
    return rows


def load_mapchip_terrain_sheet_index(project_root: Path) -> Dict:
    xls_root = project_root / "tmp" / "KA_assets" / "xls"
    locale_used = ""
    mapchip_path: Path | None = None
    terrain_path: Path | None = None

    for locale in ["English.lproj", "Japanese.lproj"]:
        candidate_mapchip = xls_root / locale / "MapChip.txt"
        candidate_terrain = xls_root / locale / "Terrain.txt"
        if candidate_mapchip.exists() and candidate_terrain.exists():
            locale_used = locale
            mapchip_path = candidate_mapchip
            terrain_path = candidate_terrain
            break

    if mapchip_path is None or terrain_path is None:
        return {
            "available": False,
            "locale": None,
            "sourcePaths": {
                "mapchip": None,
                "terrain": None,
            },
            "mapchipById": {},
            "terrainById": {},
        }

    mapchip_rows = parse_tab_sheet_rows(mapchip_path)
    terrain_rows = parse_tab_sheet_rows(terrain_path)

    mapchip_by_id: Dict[int, Dict] = {}
    terrain_by_id: Dict[int, Dict] = {}

    for row in mapchip_rows:
        mapchip_id = _safe_int(row, 0)
        if mapchip_id < 0:
            continue
        mapchip_by_id[mapchip_id] = {
            "id": mapchip_id,
            "type": _safe_int(row, 1),
            "category": _safe_int(row, 2),
            "name": str(row[8]).strip() if len(row) > 8 else "",
            "res": _safe_int(row, 9),
            "img": _safe_int(row, 10),
            "seb": _safe_int(row, 11),
            "frame": _safe_int(row, 12),
            "relatedDataType": _safe_int(row, 15),
            "relatedDataId": _safe_int(row, 16),
            "layer": _safe_int(row, 20),
            "sizeWidth": _safe_int(row, 22),
            "sizeHeight": _safe_int(row, 23),
        }

    for row in terrain_rows:
        terrain_id = _safe_int(row, 0)
        if terrain_id < 0:
            continue
        terrain_by_id[terrain_id] = {
            "id": terrain_id,
            "type": _safe_int(row, 1),
            "category": _safe_int(row, 2),
            "res": _safe_int(row, 5),
            "img": _safe_int(row, 6),
            "seb": _safe_int(row, 7),
            "frame": _safe_int(row, 8),
        }

    return {
        "available": True,
        "locale": locale_used,
        "sourcePaths": {
            "mapchip": str(mapchip_path.relative_to(project_root)).replace("\\", "/"),
            "terrain": str(terrain_path.relative_to(project_root)).replace("\\", "/"),
        },
        "mapchipById": mapchip_by_id,
        "terrainById": terrain_by_id,
    }


def classify_mapchip_layer(sheet_mapchip: Dict, sheet_terrain: Dict | None) -> Dict:
    name = str(sheet_mapchip.get("name", ""))
    name_l = name.lower()
    related_type = int(sheet_mapchip.get("relatedDataType", -1))
    mapchip_type = int(sheet_mapchip.get("type", -1))
    mapchip_res = int(sheet_mapchip.get("res", -1))
    mapchip_layer = int(sheet_mapchip.get("layer", -1))

    evidence: List[str] = [
        f"relatedDataType={related_type}",
        f"type={mapchip_type}",
        f"res={mapchip_res}",
        f"layer={mapchip_layer}",
    ]
    contradictions: List[str] = []
    class_key = "uncertainSpecial"
    confidence = 0.52

    if re.search(r"not used|unused|switch|remove|thick fog|resource", name_l):
        class_key = "uncertainSpecial"
        confidence = 0.95
        evidence.append("name_signal=special_or_unused")
        return {
            "classKey": class_key,
            "confidence": float(round(confidence, 4)),
            "evidence": evidence,
            "contradictions": contradictions,
        }

    if related_type == 2:
        if sheet_terrain is not None:
            terrain_type = int(sheet_terrain.get("type", -1))
            terrain_category = int(sheet_terrain.get("category", -1))
            evidence.append(f"terrainType={terrain_type}")
            evidence.append(f"terrainCategory={terrain_category}")

            if re.search(r"road|path|bridge|canal", name_l):
                class_key = "baseWorldDefault"
                confidence = 0.9
                evidence.append("connector_signal=base_world")
            elif re.search(r"water|swamp|snow|volcano|cliff|rock|sand|grass|dirt|wasteland|burn|cave", name_l):
                class_key = "natureEnvironment"
                confidence = 0.88
                evidence.append("biome_signal=nature_environment")
            elif mapchip_layer in {0, 1} and mapchip_res in {9, 20}:
                class_key = "baseWorldDefault"
                confidence = 0.84
                evidence.append("sheet_layer_res_signal=base_world")
            else:
                class_key = "baseWorldDefault"
                confidence = 0.68
                evidence.append("terrain_link_fallback=base_world")
        else:
            class_key = "uncertainSpecial"
            confidence = 0.56
            evidence.append("missing_terrain_row_for_relatedDataType2")
            contradictions.append("terrain_reference_missing")
    elif related_type == 1:
        if re.search(r"wall|gate|fence|bridge|door|entrance|construction|site|boundary|floor|corridor|hall", name_l) or mapchip_type in {22, 25, 28, 30}:
            class_key = "structureAssembly"
            confidence = 0.9
            evidence.append("name_or_type_signal=structure_assembly")
        elif mapchip_type in {17, 18, 19, 27} or mapchip_res in {23, 10} or mapchip_layer >= 1:
            class_key = "buildOnlyFacility"
            confidence = 0.86
            evidence.append("type_or_res_signal=build_only_facility")
        else:
            class_key = "buildOnlyFacility"
            confidence = 0.72
            evidence.append("relatedDataType1_fallback=build_only_facility")

        if re.search(r"grass|sand|snow|swamp|volcano|rock|water|soil", name_l):
            contradictions.append("nature_name_with_facility_link")
    else:
        class_key = "uncertainSpecial"
        confidence = 0.58
        evidence.append("unsupported_related_data_type")

    return {
        "classKey": class_key,
        "confidence": float(round(confidence, 4)),
        "evidence": evidence,
        "contradictions": contradictions,
    }


def analyze_sheet_grounded_layer_classification(summary_regions: List[Dict], project_root: Path) -> Dict:
    sheet_index = load_mapchip_terrain_sheet_index(project_root)
    if not bool(sheet_index.get("available")):
        return {
            "available": False,
            "message": "MapChip/Terrain sheets unavailable in tmp/KA_assets/xls",
            "sourcePaths": sheet_index.get("sourcePaths", {}),
            "classificationTable": [],
            "entries": [],
            "contradictions": [],
            "missingEvidence": [],
            "confidence": {
                "overall": 0.0,
            },
        }

    observed_f2_ids: set[int] = set()
    for region in summary_regions:
        for f2 in region.get("f2Ids", []):
            try:
                observed_f2_ids.add(int(f2))
            except (TypeError, ValueError):
                continue
        for cluster in region.get("mapchipFamilyClusters", []):
            try:
                cid = int(cluster.get("f2", -1))
            except (TypeError, ValueError):
                cid = -1
            if cid >= 0:
                observed_f2_ids.add(cid)

    classes = [
        "baseWorldDefault",
        "natureEnvironment",
        "buildOnlyFacility",
        "structureAssembly",
        "uncertainSpecial",
    ]
    labels = {
        "baseWorldDefault": "base-world/default map chips",
        "natureEnvironment": "nature/environment chips",
        "buildOnlyFacility": "build-only/facility chips",
        "structureAssembly": "structure-assembly chips",
        "uncertainSpecial": "uncertain/special chips",
    }

    mapchip_by_id = dict(sheet_index.get("mapchipById", {}))
    terrain_by_id = dict(sheet_index.get("terrainById", {}))

    bucket_counts = {key: 0 for key in classes}
    bucket_confidences: Dict[str, List[float]] = {key: [] for key in classes}
    bucket_examples: Dict[str, List[str]] = {key: [] for key in classes}
    entries: List[Dict] = []
    contradictions: List[Dict] = []
    missing_evidence: List[Dict] = []

    for mapchip_id in sorted(observed_f2_ids):
        row = mapchip_by_id.get(mapchip_id)
        if row is None:
            bucket_counts["uncertainSpecial"] += 1
            bucket_confidences["uncertainSpecial"].append(0.35)
            entries.append(
                {
                    "mapChipId": int(mapchip_id),
                    "mapChipName": "",
                    "classKey": "uncertainSpecial",
                    "confidence": 0.35,
                    "evidence": ["mapchip_row_missing"],
                    "sheetFields": {},
                }
            )
            missing_evidence.append(
                {
                    "mapChipId": int(mapchip_id),
                    "reason": "mapchip_row_missing",
                }
            )
            continue

        terrain_row = None
        related_type = int(row.get("relatedDataType", -1))
        related_id = int(row.get("relatedDataId", -1))
        if related_type == 2 and related_id >= 0:
            terrain_row = terrain_by_id.get(related_id)
            if terrain_row is None:
                missing_evidence.append(
                    {
                        "mapChipId": int(mapchip_id),
                        "mapChipName": str(row.get("name", "")),
                        "reason": "terrain_row_missing_for_relatedDataType2",
                        "relatedDataId": int(related_id),
                    }
                )

        classified = classify_mapchip_layer(row, terrain_row)
        class_key = str(classified.get("classKey", "uncertainSpecial"))
        conf = float(classified.get("confidence", 0.0))
        if class_key not in bucket_counts:
            class_key = "uncertainSpecial"

        bucket_counts[class_key] += 1
        bucket_confidences[class_key].append(conf)

        mapchip_name = str(row.get("name", ""))
        if len(bucket_examples[class_key]) < 8:
            bucket_examples[class_key].append(f"{mapchip_id}:{mapchip_name}")

        entry = {
            "mapChipId": int(mapchip_id),
            "mapChipName": mapchip_name,
            "classKey": class_key,
            "classLabel": labels.get(class_key, class_key),
            "confidence": conf,
            "evidence": classified.get("evidence", []),
            "sheetFields": {
                "type": int(row.get("type", -1)),
                "category": int(row.get("category", -1)),
                "res": int(row.get("res", -1)),
                "layer": int(row.get("layer", -1)),
                "relatedDataType": int(row.get("relatedDataType", -1)),
                "relatedDataId": int(row.get("relatedDataId", -1)),
                "terrainType": int(terrain_row.get("type", -1)) if isinstance(terrain_row, dict) else None,
                "terrainCategory": int(terrain_row.get("category", -1)) if isinstance(terrain_row, dict) else None,
            },
        }
        entries.append(entry)

        for reason in classified.get("contradictions", []):
            contradictions.append(
                {
                    "mapChipId": int(mapchip_id),
                    "mapChipName": mapchip_name,
                    "classKey": class_key,
                    "reason": str(reason),
                    "confidence": conf,
                }
            )

    entries.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("mapChipId", 0))))
    contradictions.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("mapChipId", 0))))

    classification_table: List[Dict] = []
    total = max(1, len(entries))
    all_conf = [float(item.get("confidence", 0.0)) for item in entries]
    for class_key in classes:
        values = bucket_confidences[class_key]
        classification_table.append(
            {
                "classKey": class_key,
                "classLabel": labels[class_key],
                "count": int(bucket_counts[class_key]),
                "share": float(round(float(bucket_counts[class_key]) / float(total), 4)),
                "averageConfidence": float(round(sum(values) / max(1, len(values)), 4)),
                "examples": bucket_examples[class_key],
            }
        )

    confidence = {
        "overall": float(round(sum(all_conf) / max(1, len(all_conf)), 4)),
        "baseWorldLayerShare": float(
            round(
                (float(bucket_counts["baseWorldDefault"]) + float(bucket_counts["natureEnvironment"]))
                / float(max(1, total)),
                4,
            )
        ),
        "builtStructureLayerShare": float(
            round(
                (float(bucket_counts["buildOnlyFacility"]) + float(bucket_counts["structureAssembly"]))
                / float(max(1, total)),
                4,
            )
        ),
    }

    exclusion_ids = sorted(
        int(item.get("mapChipId", -1))
        for item in entries
        if str(item.get("classKey", "")) in {"buildOnlyFacility", "structureAssembly"} and int(item.get("mapChipId", -1)) >= 0
    )

    return {
        "available": True,
        "locale": sheet_index.get("locale"),
        "sourcePaths": sheet_index.get("sourcePaths", {}),
        "observedMapChipCount": int(len(entries)),
        "classificationTable": classification_table,
        "entries": entries[:320],
        "strongestCandidates": entries[:40],
        "contradictions": contradictions[:120],
        "missingEvidence": missing_evidence[:120],
        "defaultTerrainExclusions": exclusion_ids,
        "confidence": confidence,
    }


def render_flat_top_view_data_map(region: Dict, padding: int = 20, cell_size: int = 28) -> Tuple[Image.Image, Dict]:
    tiles = list(region.get("tiles", []))
    if not tiles:
        empty = Image.new("RGBA", (240, 120), (18, 22, 30, 255))
        draw = ImageDraw.Draw(empty)
        draw.text((12, 12), "No tiles", fill=(220, 220, 220, 255))
        return empty, {
            "tileCount": 0,
            "resolvedTileCount": 0,
            "unresolvedTileCount": 0,
            "resolvedRatio": 0.0,
            "drawLayerCounts": {},
            "semanticGroupCounts": {},
            "f2Diversity": 0,
            "fieldCoverage": {
                "fieldsPresent": [],
                "note": "no_tiles_in_region",
            },
        }

    min_x = min(int(tile.get("x", 0)) for tile in tiles)
    max_x = max(int(tile.get("x", 0)) for tile in tiles)
    min_y = min(int(tile.get("y", 0)) for tile in tiles)
    max_y = max(int(tile.get("y", 0)) for tile in tiles)
    width_cells = (max_x - min_x) + 1
    height_cells = (max_y - min_y) + 1

    canvas_w = (width_cells * cell_size) + (padding * 2)
    canvas_h = (height_cells * cell_size) + (padding * 2)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (16, 20, 28, 255))
    draw = ImageDraw.Draw(canvas)

    draw_layer_counts: Dict[str, int] = {}
    semantic_counts: Dict[str, int] = {}
    f2_ids: set[int] = set()
    resolved_count = 0
    known_fields: set[str] = set()

    for tile in tiles:
        x = int(tile.get("x", 0))
        y = int(tile.get("y", 0))
        f2 = int(tile.get("f2", 0))
        resolved = bool(tile.get("resolved"))
        draw_layer = int(tile.get("drawLayer", 0))
        semantic = str(tile.get("semanticGroup", "unknown"))

        tx = padding + ((x - min_x) * cell_size)
        ty = padding + ((y - min_y) * cell_size)

        for key in tile.keys():
            known_fields.add(str(key))

        base = hex_to_rgba(fallback_color_hex(f2), 210)
        draw.rectangle([(tx, ty), (tx + cell_size - 1, ty + cell_size - 1)], fill=base, outline=(30, 32, 40, 255), width=1)

        if resolved:
            resolved_count += 1
            draw.rectangle([(tx + 2, ty + 2), (tx + cell_size - 3, ty + cell_size - 3)], outline=(235, 235, 235, 210), width=1)
        else:
            draw.line([(tx + 3, ty + 3), (tx + cell_size - 4, ty + cell_size - 4)], fill=(20, 20, 24, 190), width=2)

        layer_color = (82, 202, 255, 200) if draw_layer > 0 else (90, 104, 130, 180)
        draw.rectangle([(tx, ty + cell_size - 4), (tx + cell_size - 1, ty + cell_size - 1)], fill=layer_color)

        draw_layer_key = str(draw_layer)
        draw_layer_counts[draw_layer_key] = draw_layer_counts.get(draw_layer_key, 0) + 1
        semantic_counts[semantic] = semantic_counts.get(semantic, 0) + 1
        f2_ids.add(f2)

    tile_count = len(tiles)
    unresolved = tile_count - resolved_count
    return canvas, {
        "tileCount": tile_count,
        "resolvedTileCount": resolved_count,
        "unresolvedTileCount": unresolved,
        "resolvedRatio": float(resolved_count / max(1, tile_count)),
        "drawLayerCounts": {key: int(val) for key, val in sorted(draw_layer_counts.items(), key=lambda item: int(item[0]))},
        "semanticGroupCounts": {key: int(val) for key, val in sorted(semantic_counts.items(), key=lambda item: (-item[1], item[0]))},
        "f2Diversity": len(f2_ids),
        "fieldCoverage": {
            "fieldsPresent": sorted(known_fields),
            "selectedField": "f2",
            "selectedLayer": "drawLayer",
        },
    }


def compute_dual_map_mismatch_diagnostics(region: Dict, flat_stats: Dict, projected_stats: Dict) -> Dict:
    mismatches: List[Dict] = []
    warnings: List[Dict] = []

    tile_count = int(flat_stats.get("tileCount", 0))
    fallback_ratio = float(projected_stats.get("fallbackTileCount", 0) / max(1, tile_count))
    resolved_ratio = float(flat_stats.get("resolvedRatio", 0.0))

    if resolved_ratio >= 0.35 and fallback_ratio >= 0.5:
        mismatches.append(
            {
                "type": "flat_consistent_but_projected_sparse",
                "severity": "high",
                "detail": "Flat map has moderate resolution but projected map still uses many fallback tiles.",
                "metrics": {
                    "resolvedRatio": resolved_ratio,
                    "projectedFallbackRatio": fallback_ratio,
                },
            }
        )

    elevated_count = sum(int(value) for value in projected_stats.get("elevatedFamilyCounts", {}).values())
    floating_score = int(projected_stats.get("bottomCenterFallbackCount", 0)) + int(len(projected_stats.get("problemCandidates", [])))
    if elevated_count > 0 and floating_score >= 3:
        mismatches.append(
            {
                "type": "suspicious_floating_or_elevated_tiles",
                "severity": "medium",
                "detail": "Elevated families coincide with anchor or fallback instability.",
                "metrics": {
                    "elevatedTileCount": elevated_count,
                    "floatingScore": floating_score,
                },
            }
        )

    facility_candidates = list(projected_stats.get("facilityPatternCandidates", []))
    disconnected_facility = [item for item in facility_candidates if int(item.get("foundationOverlapCount", 0)) == 0]
    if disconnected_facility:
        mismatches.append(
            {
                "type": "facility_without_foundation_alignment",
                "severity": "medium",
                "detail": "Facility pattern candidates do not overlap semantic foundation candidates.",
                "metrics": {
                    "candidateCount": len(facility_candidates),
                    "misalignedCount": len(disconnected_facility),
                },
                "examples": disconnected_facility[:6],
            }
        )

    overlay_stats = projected_stats.get("overlayInteractionStats", {})
    overlay_interactions = int(overlay_stats.get("overlayOnTerrain", 0)) + int(overlay_stats.get("overlayOnElevated", 0))
    overlay_pass_tiles = int(projected_stats.get("passStats", {}).get("overlayFoundationTiles", 0)) + int(
        projected_stats.get("passStats", {}).get("semanticOverlayPassTiles", 0)
    )
    if overlay_pass_tiles > 0 and overlay_interactions == 0:
        warnings.append(
            {
                "type": "overlay_or_foundation_visually_disconnected",
                "detail": "Overlay/foundation passes rendered without observable interaction transitions.",
                "metrics": {
                    "overlayPassTiles": overlay_pass_tiles,
                    "overlayInteractions": overlay_interactions,
                },
            }
        )

    semantic_candidates = len(projected_stats.get("semanticFoundationCandidates", []))
    semantic_pass_tiles = int(projected_stats.get("passStats", {}).get("semanticFoundationPassTiles", 0))
    if semantic_candidates > 0 and semantic_pass_tiles == 0:
        mismatches.append(
            {
                "type": "semantic_pass_assignment_mismatch",
                "severity": "medium",
                "detail": "Semantic foundation candidates exist but semantic foundation pass has no tiles.",
                "metrics": {
                    "semanticFoundationCandidates": semantic_candidates,
                    "semanticFoundationPassTiles": semantic_pass_tiles,
                },
            }
        )

    return {
        "mismatchCount": len(mismatches),
        "warningCount": len(warnings),
        "mismatches": mismatches,
        "warnings": warnings,
        "problemAreas": {
            "unresolvedAnchors": projected_stats.get("unresolvedAnchorSources", []),
            "problemCandidates": projected_stats.get("problemCandidates", []),
            "edgeConflictCandidates": projected_stats.get("transitionDiagnostics", {}).get("edgeConflictCandidates", []),
        },
    }


def main() -> None:
    _runtime_marker = "patched-2026-05-16-1015"
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    ka_website_root = project_root.parent.parent
    tmp_dir = project_root / "tmp"

    input_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else (tmp_dir / "mapchip-projected-mixed-regions-input.json")
    if not input_path.exists():
        raise FileNotFoundError(f"Missing mixed region input file: {input_path}")

    input_data = json.loads(input_path.read_text(encoding="utf-8"))
    output_dir_value = input_data.get("outputDir")
    print(f"[render:mapchip:projected-mixed-regions] inputPath={input_path}")
    print(f"[render:mapchip:projected-mixed-regions] outputDir(raw)={output_dir_value}")
    if isinstance(output_dir_value, str) and output_dir_value.strip():
        output_dir_path = Path(output_dir_value)
        tmp_dir = output_dir_path if output_dir_path.is_absolute() else (project_root / output_dir_path)
    tmp_dir = tmp_dir.resolve()
    tmp_dir.mkdir(parents=True, exist_ok=True)
    print(f"[render:mapchip:projected-mixed-regions] outputDir(resolved)={tmp_dir}")

    regions = list(input_data.get("regions", []))
    if len(regions) < 3:
        raise RuntimeError("Mixed region renderer needs at least 3 selected regions")

    tools_root = ka_website_root / "tools" / "asset_extractor"
    parsers_dir = tools_root / "parsers"
    sys.path.insert(0, str(tools_root))
    sys.path.insert(0, str(parsers_dir))
    from opt_parser import parse_opt  # type: ignore

    tile_width = int(input_data.get("tileWidth", 96))
    tile_height = int(input_data.get("tileHeight", 48))
    padding = int(input_data.get("padding", 40))
    debug_visualizations_enabled = bool(input_data.get("debugVisualizationsEnabled", True))
    gutter = 24
    title_h = 28

    spacing_calibration = infer_spacing_from_measurements(input_data, ka_website_root, tile_width, tile_height)
    legacy_projection = spacing_calibration["legacyProjection"]
    calibrated_projection = spacing_calibration["calibratedProjection"]
    family_profiles = build_family_render_profiles()
    floor_medians = {
        "w": int(spacing_calibration.get("globalMedians", {}).get("visibleBounds", {}).get("w", tile_width)),
        "h": int(spacing_calibration.get("globalMedians", {}).get("visibleBounds", {}).get("h", tile_height)),
    }
    global_family_coverage = analyze_resolution_family_coverage(input_data, ka_website_root, floor_medians)

    ka_chip_dir = project_root / "tmp" / "KA_assets" / "chip"

    summary_regions: List[Dict] = []

    for region in regions:
        region_id = int(region["regionId"])
        out_base = tmp_dir / f"mapchip-projected-mixed-region-{region_id}"
        out_png = out_base.with_suffix(".png")
        out_json = out_base.with_suffix(".json")
        out_md = out_base.with_suffix(".md")

        bottom_image, bottom_stats = render_region_mode(
            region,
            mode="bottom-center",
            ka_website_root=ka_website_root,
            ka_chip_dir=ka_chip_dir,
            parse_opt=parse_opt,
            tile_width=int(legacy_projection["tileWidth"]),
            tile_height=int(legacy_projection["tileHeight"]),
            tile_step_x=int(legacy_projection["tileStepX"]),
            tile_step_y=int(legacy_projection["tileStepY"]),
            padding=padding,
            family_profiles=family_profiles,
            floor_medians=floor_medians,
        )
        metadata_image, metadata_stats = render_region_mode(
            region,
            mode="metadata",
            ka_website_root=ka_website_root,
            ka_chip_dir=ka_chip_dir,
            parse_opt=parse_opt,
            tile_width=int(legacy_projection["tileWidth"]),
            tile_height=int(legacy_projection["tileHeight"]),
            tile_step_x=int(legacy_projection["tileStepX"]),
            tile_step_y=int(legacy_projection["tileStepY"]),
            padding=padding,
            family_profiles=family_profiles,
            floor_medians=floor_medians,
        )
        calibrated_image, calibrated_stats = render_region_mode(
            region,
            mode="metadata",
            ka_website_root=ka_website_root,
            ka_chip_dir=ka_chip_dir,
            parse_opt=parse_opt,
            tile_width=int(calibrated_projection["tileWidth"]),
            tile_height=int(calibrated_projection["tileHeight"]),
            tile_step_x=int(calibrated_projection["tileStepX"]),
            tile_step_y=int(calibrated_projection["tileStepY"]),
            padding=padding,
            family_profiles=family_profiles,
            floor_medians=floor_medians,
        )
        family_image, family_stats = render_region_mode(
            region,
            mode="family-aware",
            ka_website_root=ka_website_root,
            ka_chip_dir=ka_chip_dir,
            parse_opt=parse_opt,
            tile_width=int(calibrated_projection["tileWidth"]),
            tile_height=int(calibrated_projection["tileHeight"]),
            tile_step_x=int(calibrated_projection["tileStepX"]),
            tile_step_y=int(calibrated_projection["tileStepY"]),
            padding=padding,
            family_profiles=family_profiles,
            floor_medians=floor_medians,
        )

        family_debug_images = family_stats.pop("_debugImages", {}) if isinstance(family_stats, dict) else {}

        flat_image_raw, flat_stats = render_flat_top_view_data_map(region)
        confidence = family_stats.get("confidenceSummaries", {})
        confidence_line = (
            f"semantic={round(float(confidence.get('semanticFoundation', {}).get('averageConfidence', 0.0)), 3)} "
            f"grouped={round(float(confidence.get('groupedStructures', {}).get('averageConfidence', 0.0)), 3)} "
            f"facility={round(float(confidence.get('facilityPatterns', {}).get('averageConfidence', 0.0)), 3)}"
        )
        field_correlation_stats = family_stats.get("fieldCorrelationStats", {})
        biome_hypothesis_stats = family_stats.get("biomeHypothesisStats", {})
        land_water_mask_diagnostics = family_stats.get("landWaterMaskDiagnostics", {})
        f5_behavior_candidates = family_stats.get("f5BehaviorCandidates", [])
        field_overlap_metrics = family_stats.get("fieldOverlapMetrics", {})
        field_confidence_summaries = family_stats.get("fieldConfidenceSummaries", {})
        field_flow = derive_region_field_flow_diagnostics(region)
        field_propagation_stats = field_flow.get("fieldPropagationStats", {})
        extraction_coverage_stats = field_flow.get("extractionCoverageStats", {})
        missing_field_diagnostics = field_flow.get("missingFieldDiagnostics", {})
        field_preservation_rates = field_flow.get("fieldPreservationRates", {})
        region_field_availability = field_flow.get("regionFieldAvailability", {})

        f1_review_raw, f1_review_stats = render_field_top_view_data_map(region, "f1")
        f1_biome_review_raw, f1_biome_review_stats = render_field_top_view_data_map(region, "f1", mode="f1-biome")
        f2_review_raw, f2_review_stats = render_field_top_view_data_map(region, "f2")
        f3_review_raw, f3_review_stats = render_field_top_view_data_map(region, "f3")
        f4_review_raw, f4_review_stats = render_field_top_view_data_map(region, "f4")
        f5_review_raw, f5_review_stats = render_field_top_view_data_map(region, "f5")
        field_correlation_review_raw = render_field_correlation_review(region)
        land_water_mask_review_raw = render_land_water_mask_review(region)
        f5_behavior_review_raw = render_f5_behavior_review(region, f5_behavior_candidates)
        raw_field_presence_review_raw = render_raw_field_presence_review(region)
        field_propagation_review_raw = render_field_propagation_review(region, field_flow)
        missing_field_review_raw = render_missing_field_review(region)
        extraction_coverage_review_raw = render_extraction_coverage_review(region, field_flow)
        flat_image = add_review_header(
            flat_image_raw,
            title=f"Region {region_id} Flat Top-View Data Map",
            lines=[
                "mode=flat-data",
                "field=f2",
                "layer=drawLayer",
                f"resolved={flat_stats.get('resolvedTileCount', 0)}/{flat_stats.get('tileCount', 0)}",
            ],
        )
        f1_review_image = add_review_header(
            f1_review_raw,
            title=f"Region {region_id} F1 Review",
            lines=["mode=f1-review", f"values={f1_review_stats.get('fieldValueCount', 0)}", f"missing={f1_review_stats.get('missingFieldCount', 0)}"],
        )
        f1_biome_review_image = add_review_header(
            f1_biome_review_raw,
            title=f"Region {region_id} F1 Biome Hypothesis Review",
            lines=["mode=f1-biome-review", "hypothesis=biome-grouping-visual-test", f"score={round(float(biome_hypothesis_stats.get('f1BiomeEvidenceScore', 0.0)), 4)}"],
        )
        f2_review_image = add_review_header(
            f2_review_raw,
            title=f"Region {region_id} F2 Review",
            lines=["mode=f2-review", f"values={f2_review_stats.get('fieldValueCount', 0)}", f"missing={f2_review_stats.get('missingFieldCount', 0)}"],
        )
        f3_review_image = add_review_header(
            f3_review_raw,
            title=f"Region {region_id} F3 Review",
            lines=["mode=f3-review", f"values={f3_review_stats.get('fieldValueCount', 0)}", f"missing={f3_review_stats.get('missingFieldCount', 0)}"],
        )
        f4_review_image = add_review_header(
            f4_review_raw,
            title=f"Region {region_id} F4 Review",
            lines=["mode=f4-review", f"values={f4_review_stats.get('fieldValueCount', 0)}", f"missing={f4_review_stats.get('missingFieldCount', 0)}"],
        )
        f5_review_image = add_review_header(
            f5_review_raw,
            title=f"Region {region_id} F5 Review",
            lines=["mode=f5-review", f"values={f5_review_stats.get('fieldValueCount', 0)}", f"missing={f5_review_stats.get('missingFieldCount', 0)}"],
        )
        field_correlation_review_image = add_review_header(
            field_correlation_review_raw,
            title=f"Region {region_id} Field Correlation Review",
            lines=["mode=field-correlation-review", f"pairs={len(field_correlation_stats.get('correlations', []))}", f"overall={round(float(field_confidence_summaries.get('f1BiomeConfidence', 0.0)), 4)}"],
        )
        land_water_mask_review_image = add_review_header(
            land_water_mask_review_raw,
            title=f"Region {region_id} Land Water Mask Review",
            lines=["mode=land-water-mask-review", f"complementary={round(float(land_water_mask_diagnostics.get('f3f4ComplementaryRatio', 0.0)), 4)}"],
        )
        f5_behavior_review_image = add_review_header(
            f5_behavior_review_raw,
            title=f"Region {region_id} F5 Behavior Review",
            lines=["mode=f5-behavior-review", f"candidates={len(f5_behavior_candidates)}", f"top={round(float(field_confidence_summaries.get('f5TopTheoryConfidence', 0.0)), 4)}"],
        )
        raw_field_presence_review_image = add_review_header(
            raw_field_presence_review_raw,
            title=f"Region {region_id} Raw Field Presence Review",
            lines=[
                "mode=raw-field-presence-review",
                f"all_fields={field_propagation_stats.get('tilesWithAllFields', 0)}/{field_propagation_stats.get('tileCount', 0)}",
            ],
        )
        field_propagation_review_image = add_review_header(
            field_propagation_review_raw,
            title=f"Region {region_id} Field Propagation Review",
            lines=[
                "mode=field-propagation-review",
                f"missing_tiles={field_propagation_stats.get('tilesWithAnyMissingField', 0)}",
            ],
        )
        missing_field_review_image = add_review_header(
            missing_field_review_raw,
            title=f"Region {region_id} Missing Field Review",
            lines=[
                "mode=missing-field-review",
                f"missing_tiles={missing_field_diagnostics.get('tilesWithAnyMissingField', 0)}",
            ],
        )
        extraction_coverage_review_image = add_review_header(
            extraction_coverage_review_raw,
            title=f"Region {region_id} Extraction Coverage Review",
            lines=[
                "mode=extraction-coverage-review",
                f"f1_cov={region_field_availability.get('f1', {}).get('tileCoverageRate', 0.0)}",
                f"f5_cov={region_field_availability.get('f5', {}).get('tileCoverageRate', 0.0)}",
            ],
        )

        projected_image = add_review_header(
            family_image,
            title=f"Region {region_id} Projected Realistic Map",
            lines=[
                "mode=projected-realistic",
                "family-aware=true",
                "semantic-mode=enabled",
                confidence_line,
            ],
        )

        mismatch_diagnostics = compute_dual_map_mismatch_diagnostics(region, flat_stats, family_stats)

        side_width = bottom_image.width + metadata_image.width + gutter
        side_height = max(bottom_image.height, metadata_image.height) + title_h
        side = Image.new("RGBA", (side_width, side_height), (11, 14, 22, 255))
        side_draw = ImageDraw.Draw(side)
        side_draw.text((12, 6), "Left: bottom-center anchor", fill=(236, 236, 236, 255))
        side_draw.text((bottom_image.width + gutter + 12, 6), "Right: metadata anchor", fill=(236, 236, 236, 255))
        side.paste(bottom_image, (0, title_h), bottom_image)
        side.paste(metadata_image, (bottom_image.width + gutter, title_h), metadata_image)

        spacing_out_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-spacing-compare.png"
        spacing_side_width = metadata_image.width + calibrated_image.width + gutter
        spacing_side_height = max(metadata_image.height, calibrated_image.height) + title_h
        spacing_side = Image.new("RGBA", (spacing_side_width, spacing_side_height), (11, 14, 22, 255))
        spacing_draw = ImageDraw.Draw(spacing_side)
        spacing_draw.text((12, 6), "Left: legacy spacing", fill=(236, 236, 236, 255))
        spacing_draw.text((metadata_image.width + gutter + 12, 6), "Right: calibrated spacing", fill=(236, 236, 236, 255))
        spacing_side.paste(metadata_image, (0, title_h), metadata_image)
        spacing_side.paste(calibrated_image, (metadata_image.width + gutter, title_h), calibrated_image)

        family_out_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-family-compare.png"
        family_side_width = calibrated_image.width + family_image.width + gutter
        family_side_height = max(calibrated_image.height, family_image.height) + title_h
        family_side = Image.new("RGBA", (family_side_width, family_side_height), (11, 14, 22, 255))
        family_draw = ImageDraw.Draw(family_side)
        family_draw.text((12, 6), "Left: calibrated metadata", fill=(236, 236, 236, 255))
        family_draw.text((calibrated_image.width + gutter + 12, 6), "Right: family-aware", fill=(236, 236, 236, 255))
        family_side.paste(calibrated_image, (0, title_h), calibrated_image)
        family_side.paste(family_image, (calibrated_image.width + gutter, title_h), family_image)

        dual_compare_image = compose_compare_panel(
            flat_image,
            projected_image,
            left_title="Left: flat top-view data",
            right_title="Right: projected realistic",
            summary_line=(
                f"region={region_id} | mismatches={mismatch_diagnostics['mismatchCount']} | "
                f"warnings={mismatch_diagnostics['warningCount']}"
            ),
        )

        flat_out_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-flat-data-map.png"
        projected_out_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-projected-realistic-map.png"
        dual_compare_out_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-flat-vs-projected-compare.png"
        semantic_overlay_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-semantic-overlay-review.png"
        facility_candidate_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-facility-candidate-review.png"
        elevation_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-elevation-review.png"
        terrain_coherence_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-terrain-coherence-review.png"
        support_relationship_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-support-relationship-review.png"
        disconnected_region_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-disconnected-region-review.png"
        continuity_refinement_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-continuity-refinement-review.png"
        floating_region_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-floating-region-review.png"
        buildability_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-buildability-review.png"
        indoor_outdoor_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-indoor-outdoor-review.png"
        terrain_support_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-terrain-support-review.png"
        blocked_placement_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-blocked-placement-review.png"
        reclaimed_land_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-reclaimed-land-review.png"
        structure_overlap_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-structure-overlap-review.png"
        f2_mapchip_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f2-mapchip-review.png"
        mapchip_continuity_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-mapchip-continuity-review.png"
        mapchip_transition_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-mapchip-transition-review.png"
        mapchip_family_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-mapchip-family-review.png"
        composition_vs_mapchip_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-composition-vs-mapchip-review.png"
        semantic_vs_mapchip_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-semantic-vs-mapchip-review.png"
        f1_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f1-review.png"
        f1_biome_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f1-biome-review.png"
        f2_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f2-review.png"
        f3_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f3-review.png"
        f4_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f4-review.png"
        f5_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f5-review.png"
        field_correlation_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-field-correlation-review.png"
        land_water_mask_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-land-water-mask-review.png"
        f5_behavior_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-f5-behavior-review.png"
        raw_field_presence_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-raw-field-presence-review.png"
        field_propagation_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-field-propagation-review.png"
        missing_field_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-missing-field-review.png"
        extraction_coverage_review_png = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-extraction-coverage-review.png"

        debug_output_paths: Dict[str, str] = {}
        if debug_visualizations_enabled and family_debug_images:
            debug_name_map = {
                "familyLayerMask": f"mapchip-projected-mixed-region-{region_id}-family-mask.png",
                "elevationMask": f"mapchip-projected-mixed-region-{region_id}-elevation-mask.png",
                "transitionCandidatesOverlay": f"mapchip-projected-mixed-region-{region_id}-transition-overlay.png",
                "zOrderVisualization": f"mapchip-projected-mixed-region-{region_id}-z-order.png",
                "foundationCandidateOverlay": f"mapchip-projected-mixed-region-{region_id}-foundation-candidates.png",
                "structureGroupingMask": f"mapchip-projected-mixed-region-{region_id}-structure-groups.png",
                "facilityFootprintCandidates": f"mapchip-projected-mixed-region-{region_id}-facility-footprints.png",
                "overlayInteractionMap": f"mapchip-projected-mixed-region-{region_id}-overlay-interactions.png",
                "terrainMutationCandidateMap": f"mapchip-projected-mixed-region-{region_id}-terrain-mutations.png",
                "terrainCoherenceReview": f"mapchip-projected-mixed-region-{region_id}-terrain-coherence-debug.png",
                "supportRelationshipReview": f"mapchip-projected-mixed-region-{region_id}-support-relationship-debug.png",
                "disconnectedRegionReview": f"mapchip-projected-mixed-region-{region_id}-disconnected-region-debug.png",
                "continuityRefinementReview": f"mapchip-projected-mixed-region-{region_id}-continuity-refinement-debug.png",
                "floatingRegionReview": f"mapchip-projected-mixed-region-{region_id}-floating-region-debug.png",
                "buildabilityReview": f"mapchip-projected-mixed-region-{region_id}-buildability-debug.png",
                "indoorOutdoorReview": f"mapchip-projected-mixed-region-{region_id}-indoor-outdoor-debug.png",
                "terrainSupportReview": f"mapchip-projected-mixed-region-{region_id}-terrain-support-debug.png",
                "blockedPlacementReview": f"mapchip-projected-mixed-region-{region_id}-blocked-placement-debug.png",
                "reclaimedLandReview": f"mapchip-projected-mixed-region-{region_id}-reclaimed-land-debug.png",
                "structureOverlapReview": f"mapchip-projected-mixed-region-{region_id}-structure-overlap-debug.png",
                "f2MapchipReview": f"mapchip-projected-mixed-region-{region_id}-f2-mapchip-debug.png",
                "mapchipContinuityReview": f"mapchip-projected-mixed-region-{region_id}-mapchip-continuity-debug.png",
                "mapchipTransitionReview": f"mapchip-projected-mixed-region-{region_id}-mapchip-transition-debug.png",
                "mapchipFamilyReview": f"mapchip-projected-mixed-region-{region_id}-mapchip-family-debug.png",
                "compositionVsMapchipReview": f"mapchip-projected-mixed-region-{region_id}-composition-vs-mapchip-debug.png",
                "semanticVsMapchipReview": f"mapchip-projected-mixed-region-{region_id}-semantic-vs-mapchip-debug.png",
            }
            for key, image in family_debug_images.items():
                filename = debug_name_map.get(key)
                if not filename:
                    continue
                output_path = tmp_dir / filename
                image.save(output_path, format="PNG")
                debug_output_paths[key] = str(output_path.relative_to(project_root)).replace("\\", "/")

        semantic_overlay_image = family_debug_images.get("overlayInteractionMap") if family_debug_images else None
        if semantic_overlay_image is None:
            semantic_overlay_image = family_debug_images.get("transitionCandidatesOverlay") if family_debug_images else None
        if semantic_overlay_image is None:
            semantic_overlay_image = projected_image

        facility_review_image = family_debug_images.get("facilityFootprintCandidates") if family_debug_images else None
        if facility_review_image is None:
            facility_review_image = projected_image

        elevation_review_image = family_debug_images.get("elevationMask") if family_debug_images else None
        if elevation_review_image is None:
            elevation_review_image = projected_image

        terrain_coherence_review_image = family_debug_images.get("terrainCoherenceReview") if family_debug_images else None
        if terrain_coherence_review_image is None:
            terrain_coherence_review_image = projected_image

        support_relationship_review_image = family_debug_images.get("supportRelationshipReview") if family_debug_images else None
        if support_relationship_review_image is None:
            support_relationship_review_image = projected_image

        disconnected_region_review_image = family_debug_images.get("disconnectedRegionReview") if family_debug_images else None
        if disconnected_region_review_image is None:
            disconnected_region_review_image = projected_image

        continuity_refinement_review_image = family_debug_images.get("continuityRefinementReview") if family_debug_images else None
        if continuity_refinement_review_image is None:
            continuity_refinement_review_image = projected_image

        floating_region_review_image = family_debug_images.get("floatingRegionReview") if family_debug_images else None
        if floating_region_review_image is None:
            floating_region_review_image = projected_image

        buildability_review_image = family_debug_images.get("buildabilityReview") if family_debug_images else None
        if buildability_review_image is None:
            buildability_review_image = projected_image

        indoor_outdoor_review_image = family_debug_images.get("indoorOutdoorReview") if family_debug_images else None
        if indoor_outdoor_review_image is None:
            indoor_outdoor_review_image = projected_image

        terrain_support_review_image = family_debug_images.get("terrainSupportReview") if family_debug_images else None
        if terrain_support_review_image is None:
            terrain_support_review_image = projected_image

        blocked_placement_review_image = family_debug_images.get("blockedPlacementReview") if family_debug_images else None
        if blocked_placement_review_image is None:
            blocked_placement_review_image = projected_image

        reclaimed_land_review_image = family_debug_images.get("reclaimedLandReview") if family_debug_images else None
        if reclaimed_land_review_image is None:
            reclaimed_land_review_image = projected_image

        structure_overlap_review_image = family_debug_images.get("structureOverlapReview") if family_debug_images else None
        if structure_overlap_review_image is None:
            structure_overlap_review_image = projected_image

        f2_mapchip_review_image = family_debug_images.get("f2MapchipReview") if family_debug_images else None
        if f2_mapchip_review_image is None:
            f2_mapchip_review_image = projected_image

        mapchip_continuity_review_image = family_debug_images.get("mapchipContinuityReview") if family_debug_images else None
        if mapchip_continuity_review_image is None:
            mapchip_continuity_review_image = projected_image

        mapchip_transition_review_image = family_debug_images.get("mapchipTransitionReview") if family_debug_images else None
        if mapchip_transition_review_image is None:
            mapchip_transition_review_image = projected_image

        mapchip_family_review_image = family_debug_images.get("mapchipFamilyReview") if family_debug_images else None
        if mapchip_family_review_image is None:
            mapchip_family_review_image = projected_image

        composition_vs_mapchip_review_image = family_debug_images.get("compositionVsMapchipReview") if family_debug_images else None
        if composition_vs_mapchip_review_image is None:
            composition_vs_mapchip_review_image = projected_image

        semantic_vs_mapchip_review_image = family_debug_images.get("semanticVsMapchipReview") if family_debug_images else None
        if semantic_vs_mapchip_review_image is None:
            semantic_vs_mapchip_review_image = projected_image

        semantic_overlay_image = add_review_header(
            semantic_overlay_image,
            title=f"Region {region_id} Semantic Overlay Review",
            lines=["mode=semantic-overlay", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        facility_review_image = add_review_header(
            facility_review_image,
            title=f"Region {region_id} Facility Candidate Review",
            lines=["mode=facility-candidate", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        elevation_review_image = add_review_header(
            elevation_review_image,
            title=f"Region {region_id} Elevation Review",
            lines=["mode=elevation-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        terrain_coherence_review_image = add_review_header(
            terrain_coherence_review_image,
            title=f"Region {region_id} Terrain Coherence Review",
            lines=["mode=terrain-coherence-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        support_relationship_review_image = add_review_header(
            support_relationship_review_image,
            title=f"Region {region_id} Support Relationship Review",
            lines=["mode=support-relationship-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        disconnected_region_review_image = add_review_header(
            disconnected_region_review_image,
            title=f"Region {region_id} Disconnected Region Review",
            lines=["mode=disconnected-region-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        continuity_refinement_review_image = add_review_header(
            continuity_refinement_review_image,
            title=f"Region {region_id} Continuity Refinement Review",
            lines=["mode=continuity-refinement-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        floating_region_review_image = add_review_header(
            floating_region_review_image,
            title=f"Region {region_id} Floating Region Review",
            lines=["mode=floating-region-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        buildability_review_image = add_review_header(
            buildability_review_image,
            title=f"Region {region_id} Buildability Review",
            lines=["mode=buildability-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        indoor_outdoor_review_image = add_review_header(
            indoor_outdoor_review_image,
            title=f"Region {region_id} Indoor Outdoor Review",
            lines=["mode=indoor-outdoor-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        terrain_support_review_image = add_review_header(
            terrain_support_review_image,
            title=f"Region {region_id} Terrain Support Review",
            lines=["mode=terrain-support-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        blocked_placement_review_image = add_review_header(
            blocked_placement_review_image,
            title=f"Region {region_id} Blocked Placement Review",
            lines=["mode=blocked-placement-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        reclaimed_land_review_image = add_review_header(
            reclaimed_land_review_image,
            title=f"Region {region_id} Reclaimed Land Review",
            lines=["mode=reclaimed-land-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        structure_overlap_review_image = add_review_header(
            structure_overlap_review_image,
            title=f"Region {region_id} Structure Overlap Review",
            lines=["mode=structure-overlap-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        f2_mapchip_review_image = add_review_header(
            f2_mapchip_review_image,
            title=f"Region {region_id} F2 Mapchip Review",
            lines=["mode=f2-mapchip-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        mapchip_continuity_review_image = add_review_header(
            mapchip_continuity_review_image,
            title=f"Region {region_id} Mapchip Continuity Review",
            lines=["mode=mapchip-continuity-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        mapchip_transition_review_image = add_review_header(
            mapchip_transition_review_image,
            title=f"Region {region_id} Mapchip Transition Review",
            lines=["mode=mapchip-transition-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        mapchip_family_review_image = add_review_header(
            mapchip_family_review_image,
            title=f"Region {region_id} Mapchip Family Review",
            lines=["mode=mapchip-family-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        composition_vs_mapchip_review_image = add_review_header(
            composition_vs_mapchip_review_image,
            title=f"Region {region_id} Composition Vs Mapchip Review",
            lines=["mode=composition-vs-mapchip-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )
        semantic_vs_mapchip_review_image = add_review_header(
            semantic_vs_mapchip_review_image,
            title=f"Region {region_id} Semantic Vs Mapchip Review",
            lines=["mode=semantic-vs-mapchip-review", "family-aware=true", "semantic-mode=enabled", confidence_line],
        )

        out_png.parent.mkdir(parents=True, exist_ok=True)
        side.save(out_png, format="PNG")
        spacing_side.save(spacing_out_png, format="PNG")
        family_side.save(family_out_png, format="PNG")
        flat_image.save(flat_out_png, format="PNG")
        projected_image.save(projected_out_png, format="PNG")
        dual_compare_image.save(dual_compare_out_png, format="PNG")
        semantic_overlay_image.save(semantic_overlay_review_png, format="PNG")
        facility_review_image.save(facility_candidate_review_png, format="PNG")
        elevation_review_image.save(elevation_review_png, format="PNG")
        terrain_coherence_review_image.save(terrain_coherence_review_png, format="PNG")
        support_relationship_review_image.save(support_relationship_review_png, format="PNG")
        disconnected_region_review_image.save(disconnected_region_review_png, format="PNG")
        continuity_refinement_review_image.save(continuity_refinement_review_png, format="PNG")
        floating_region_review_image.save(floating_region_review_png, format="PNG")
        buildability_review_image.save(buildability_review_png, format="PNG")
        indoor_outdoor_review_image.save(indoor_outdoor_review_png, format="PNG")
        terrain_support_review_image.save(terrain_support_review_png, format="PNG")
        blocked_placement_review_image.save(blocked_placement_review_png, format="PNG")
        reclaimed_land_review_image.save(reclaimed_land_review_png, format="PNG")
        structure_overlap_review_image.save(structure_overlap_review_png, format="PNG")
        f2_mapchip_review_image.save(f2_mapchip_review_png, format="PNG")
        mapchip_continuity_review_image.save(mapchip_continuity_review_png, format="PNG")
        mapchip_transition_review_image.save(mapchip_transition_review_png, format="PNG")
        mapchip_family_review_image.save(mapchip_family_review_png, format="PNG")
        composition_vs_mapchip_review_image.save(composition_vs_mapchip_review_png, format="PNG")
        semantic_vs_mapchip_review_image.save(semantic_vs_mapchip_review_png, format="PNG")
        f1_review_image.save(f1_review_png, format="PNG")
        f1_biome_review_image.save(f1_biome_review_png, format="PNG")
        f2_review_image.save(f2_review_png, format="PNG")
        f3_review_image.save(f3_review_png, format="PNG")
        f4_review_image.save(f4_review_png, format="PNG")
        f5_review_image.save(f5_review_png, format="PNG")
        field_correlation_review_image.save(field_correlation_review_png, format="PNG")
        land_water_mask_review_image.save(land_water_mask_review_png, format="PNG")
        f5_behavior_review_image.save(f5_behavior_review_png, format="PNG")
        raw_field_presence_review_image.save(raw_field_presence_review_png, format="PNG")
        field_propagation_review_image.save(field_propagation_review_png, format="PNG")
        missing_field_review_image.save(missing_field_review_png, format="PNG")
        extraction_coverage_review_image.save(extraction_coverage_review_png, format="PNG")

        visual_review_json_path = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-visual-review.json"
        visual_review_md_path = tmp_dir / f"mapchip-projected-mixed-region-{region_id}-visual-review.md"

        visual_review = {
            "regionId": region_id,
            "flatData": {
                "imagePath": str(flat_out_png.relative_to(project_root)).replace("\\", "/"),
                "stats": flat_stats,
            },
            "projectedVisual": {
                "imagePath": str(projected_out_png.relative_to(project_root)).replace("\\", "/"),
                "familyAware": True,
                "semanticMode": True,
                "stats": {
                    "passStats": family_stats.get("passStats", {}),
                    "seamMetrics": family_stats.get("seamMetrics", {}),
                    "confidenceSummaries": family_stats.get("confidenceSummaries", {}),
                },
            },
            "compareImagePath": str(dual_compare_out_png.relative_to(project_root)).replace("\\", "/"),
            "semanticOverlayReviewImagePath": str(semantic_overlay_review_png.relative_to(project_root)).replace("\\", "/"),
            "facilityCandidateReviewImagePath": str(facility_candidate_review_png.relative_to(project_root)).replace("\\", "/"),
            "elevationReviewImagePath": str(elevation_review_png.relative_to(project_root)).replace("\\", "/"),
            "terrainCoherenceReviewImagePath": str(terrain_coherence_review_png.relative_to(project_root)).replace("\\", "/"),
            "supportRelationshipReviewImagePath": str(support_relationship_review_png.relative_to(project_root)).replace("\\", "/"),
            "disconnectedRegionReviewImagePath": str(disconnected_region_review_png.relative_to(project_root)).replace("\\", "/"),
            "continuityRefinementReviewImagePath": str(continuity_refinement_review_png.relative_to(project_root)).replace("\\", "/"),
            "floatingRegionReviewImagePath": str(floating_region_review_png.relative_to(project_root)).replace("\\", "/"),
            "buildabilityReviewImagePath": str(buildability_review_png.relative_to(project_root)).replace("\\", "/"),
            "indoorOutdoorReviewImagePath": str(indoor_outdoor_review_png.relative_to(project_root)).replace("\\", "/"),
            "terrainSupportReviewImagePath": str(terrain_support_review_png.relative_to(project_root)).replace("\\", "/"),
            "blockedPlacementReviewImagePath": str(blocked_placement_review_png.relative_to(project_root)).replace("\\", "/"),
            "reclaimedLandReviewImagePath": str(reclaimed_land_review_png.relative_to(project_root)).replace("\\", "/"),
            "structureOverlapReviewImagePath": str(structure_overlap_review_png.relative_to(project_root)).replace("\\", "/"),
            "f2MapchipReviewImagePath": str(f2_mapchip_review_png.relative_to(project_root)).replace("\\", "/"),
            "mapchipContinuityReviewImagePath": str(mapchip_continuity_review_png.relative_to(project_root)).replace("\\", "/"),
            "mapchipTransitionReviewImagePath": str(mapchip_transition_review_png.relative_to(project_root)).replace("\\", "/"),
            "mapchipFamilyReviewImagePath": str(mapchip_family_review_png.relative_to(project_root)).replace("\\", "/"),
            "compositionVsMapchipReviewImagePath": str(composition_vs_mapchip_review_png.relative_to(project_root)).replace("\\", "/"),
            "semanticVsMapchipReviewImagePath": str(semantic_vs_mapchip_review_png.relative_to(project_root)).replace("\\", "/"),
            "f1ReviewImagePath": str(f1_review_png.relative_to(project_root)).replace("\\", "/"),
            "f1BiomeReviewImagePath": str(f1_biome_review_png.relative_to(project_root)).replace("\\", "/"),
            "f2ReviewImagePath": str(f2_review_png.relative_to(project_root)).replace("\\", "/"),
            "f3ReviewImagePath": str(f3_review_png.relative_to(project_root)).replace("\\", "/"),
            "f4ReviewImagePath": str(f4_review_png.relative_to(project_root)).replace("\\", "/"),
            "f5ReviewImagePath": str(f5_review_png.relative_to(project_root)).replace("\\", "/"),
            "fieldCorrelationReviewImagePath": str(field_correlation_review_png.relative_to(project_root)).replace("\\", "/"),
            "landWaterMaskReviewImagePath": str(land_water_mask_review_png.relative_to(project_root)).replace("\\", "/"),
            "f5BehaviorReviewImagePath": str(f5_behavior_review_png.relative_to(project_root)).replace("\\", "/"),
            "rawFieldPresenceReviewImagePath": str(raw_field_presence_review_png.relative_to(project_root)).replace("\\", "/"),
            "fieldPropagationReviewImagePath": str(field_propagation_review_png.relative_to(project_root)).replace("\\", "/"),
            "missingFieldReviewImagePath": str(missing_field_review_png.relative_to(project_root)).replace("\\", "/"),
            "extractionCoverageReviewImagePath": str(extraction_coverage_review_png.relative_to(project_root)).replace("\\", "/"),
            "familyClassification": family_stats.get("familyCoverage", {}),
            "semanticFoundationCandidates": family_stats.get("semanticFoundationCandidates", []),
            "facilityPatternCandidates": family_stats.get("facilityPatternCandidates", []),
            "buildabilityStats": family_stats.get("buildabilityStats", {}),
            "indoorOutdoorStats": family_stats.get("indoorOutdoorStats", {}),
            "terrainCompositionGroups": family_stats.get("terrainCompositionGroups", []),
            "placementConflictCandidates": family_stats.get("placementConflictCandidates", []),
            "supportPlacementDiagnostics": family_stats.get("supportPlacementDiagnostics", {}),
            "reclaimedLandCandidates": family_stats.get("reclaimedLandCandidates", []),
            "semanticPlacementConfidence": family_stats.get("semanticPlacementConfidence", {}),
            "f2MapchipStats": family_stats.get("f2MapchipStats", {}),
            "mapchipFamilyClusters": family_stats.get("mapchipFamilyClusters", []),
            "mapchipContinuityDiagnostics": family_stats.get("mapchipContinuityDiagnostics", {}),
            "incompatibleMapchipTransitions": family_stats.get("incompatibleMapchipTransitions", []),
            "isolatedMapchipCandidates": family_stats.get("isolatedMapchipCandidates", []),
            "mapchipCompositionConfidence": family_stats.get("mapchipCompositionConfidence", {}),
            "fieldCorrelationStats": field_correlation_stats,
            "biomeHypothesisStats": biome_hypothesis_stats,
            "landWaterMaskDiagnostics": land_water_mask_diagnostics,
            "f5BehaviorCandidates": f5_behavior_candidates,
            "fieldOverlapMetrics": field_overlap_metrics,
            "fieldConfidenceSummaries": field_confidence_summaries,
            "fieldPropagationStats": field_propagation_stats,
            "extractionCoverageStats": extraction_coverage_stats,
            "missingFieldDiagnostics": missing_field_diagnostics,
            "fieldPreservationRates": field_preservation_rates,
            "regionFieldAvailability": region_field_availability,
            "uncertaintyAreas": {
                "unresolvedAnchorSources": family_stats.get("unresolvedAnchorSources", []),
                "problemCandidates": family_stats.get("problemCandidates", []),
                "ambiguousF2Ids": family_stats.get("familyCoverage", {}).get("ambiguousF2Ids", []),
            },
            "mismatchDiagnostics": mismatch_diagnostics,
            "labels": {
                "regionId": region_id,
                "selectedField": "f2",
                "selectedLayer": "drawLayer",
                "rendererMode": "dual-map-review",
                "familyAwareMode": True,
                "semanticMode": True,
                "confidenceSummary": confidence_line,
            },
        }
        visual_review_json_path.write_text(json.dumps(visual_review, indent=2), encoding="utf-8")

        visual_review_lines = [
            f"# Region {region_id} Dual Map Visual Review",
            "",
            f"- Flat data map: {visual_review['flatData']['imagePath']}",
            f"- Projected realistic map: {visual_review['projectedVisual']['imagePath']}",
            f"- Compare map: {visual_review['compareImagePath']}",
            f"- Semantic overlay review: {visual_review['semanticOverlayReviewImagePath']}",
            f"- Facility candidate review: {visual_review['facilityCandidateReviewImagePath']}",
            f"- Elevation review: {visual_review['elevationReviewImagePath']}",
            f"- Terrain coherence review: {visual_review['terrainCoherenceReviewImagePath']}",
            f"- Support relationship review: {visual_review['supportRelationshipReviewImagePath']}",
            f"- Disconnected region review: {visual_review['disconnectedRegionReviewImagePath']}",
            f"- Continuity refinement review: {visual_review['continuityRefinementReviewImagePath']}",
            f"- Floating region review: {visual_review['floatingRegionReviewImagePath']}",
            f"- Buildability review: {visual_review['buildabilityReviewImagePath']}",
            f"- Indoor outdoor review: {visual_review['indoorOutdoorReviewImagePath']}",
            f"- Terrain support review: {visual_review['terrainSupportReviewImagePath']}",
            f"- Blocked placement review: {visual_review['blockedPlacementReviewImagePath']}",
            f"- Reclaimed land review: {visual_review['reclaimedLandReviewImagePath']}",
            f"- Structure overlap review: {visual_review['structureOverlapReviewImagePath']}",
            f"- F2 mapchip review: {visual_review['f2MapchipReviewImagePath']}",
            f"- Mapchip continuity review: {visual_review['mapchipContinuityReviewImagePath']}",
            f"- Mapchip transition review: {visual_review['mapchipTransitionReviewImagePath']}",
            f"- Mapchip family review: {visual_review['mapchipFamilyReviewImagePath']}",
            f"- Composition vs mapchip review: {visual_review['compositionVsMapchipReviewImagePath']}",
            f"- Semantic vs mapchip review: {visual_review['semanticVsMapchipReviewImagePath']}",
            f"- F1 review: {visual_review['f1ReviewImagePath']}",
            f"- F1 biome review: {visual_review['f1BiomeReviewImagePath']}",
            f"- F2 review: {visual_review['f2ReviewImagePath']}",
            f"- F3 review: {visual_review['f3ReviewImagePath']}",
            f"- F4 review: {visual_review['f4ReviewImagePath']}",
            f"- F5 review: {visual_review['f5ReviewImagePath']}",
            f"- Field correlation review: {visual_review['fieldCorrelationReviewImagePath']}",
            f"- Land/water mask review: {visual_review['landWaterMaskReviewImagePath']}",
            f"- F5 behavior review: {visual_review['f5BehaviorReviewImagePath']}",
            f"- Raw field presence review: {visual_review['rawFieldPresenceReviewImagePath']}",
            f"- Field propagation review: {visual_review['fieldPropagationReviewImagePath']}",
            f"- Missing field review: {visual_review['missingFieldReviewImagePath']}",
            f"- Extraction coverage review: {visual_review['extractionCoverageReviewImagePath']}",
            "",
            "## Raw Field Data",
            f"- Tile count: {flat_stats.get('tileCount', 0)}",
            f"- Resolved ratio: {flat_stats.get('resolvedRatio', 0.0)}",
            f"- Draw layer counts: {json.dumps(flat_stats.get('drawLayerCounts', {}), sort_keys=True)}",
            f"- Semantic group counts: {json.dumps(flat_stats.get('semanticGroupCounts', {}), sort_keys=True)}",
            "",
            "## Semantic + Facility",
            f"- Semantic foundation candidates: {len(visual_review.get('semanticFoundationCandidates', []))}",
            f"- Facility footprint candidates: {len(visual_review.get('facilityPatternCandidates', []))}",
            f"- Confidence summary: {confidence_line}",
            f"- Buildability stats: {json.dumps(visual_review.get('buildabilityStats', {}), sort_keys=True)}",
            f"- Indoor/outdoor stats: {json.dumps(visual_review.get('indoorOutdoorStats', {}), sort_keys=True)}",
            f"- Placement conflicts: {len(visual_review.get('placementConflictCandidates', []))}",
            f"- Field pair correlations: {len(visual_review.get('fieldCorrelationStats', {}).get('correlations', []))}",
            f"- Biome hypothesis score: {visual_review.get('biomeHypothesisStats', {}).get('f1BiomeEvidenceScore', 0.0)}",
            f"- Land/water complementary ratio: {visual_review.get('landWaterMaskDiagnostics', {}).get('f3f4ComplementaryRatio', 0.0)}",
            f"- F5 behavior candidates: {len(visual_review.get('f5BehaviorCandidates', []))}",
            f"- Field propagation stats: {json.dumps(visual_review.get('fieldPropagationStats', {}), sort_keys=True)}",
            f"- Extraction coverage stats: {json.dumps(visual_review.get('extractionCoverageStats', {}), sort_keys=True)}",
            f"- Missing field diagnostics: {json.dumps(visual_review.get('missingFieldDiagnostics', {}), sort_keys=True)}",
            f"- Field preservation rates: {json.dumps(visual_review.get('fieldPreservationRates', {}), sort_keys=True)}",
            f"- Region field availability: {json.dumps(visual_review.get('regionFieldAvailability', {}), sort_keys=True)}",
            "",
            "## Mismatch Diagnostics",
            f"- Mismatch count: {mismatch_diagnostics.get('mismatchCount', 0)}",
            f"- Warning count: {mismatch_diagnostics.get('warningCount', 0)}",
        ]
        for item in mismatch_diagnostics.get("mismatches", []):
            visual_review_lines.append(f"- mismatch: {item.get('type')} severity={item.get('severity')} metrics={json.dumps(item.get('metrics', {}), sort_keys=True)}")
        for item in mismatch_diagnostics.get("warnings", []):
            visual_review_lines.append(f"- warning: {item.get('type')} metrics={json.dumps(item.get('metrics', {}), sort_keys=True)}")
        visual_review_lines.append("")
        visual_review_md_path.write_text("\n".join(visual_review_lines), encoding="utf-8")

        region_report = {
            "regionId": region_id,
            "imagePath": str(out_png.relative_to(project_root)).replace("\\", "/"),
            "imageGenerated": out_png.exists(),
            "sampleTraits": region.get("sampleTraits", {}),
            "bounds": {
                "x": int(region.get("x", 0)),
                "y": int(region.get("y", 0)),
                "width": int(region.get("width", 0)),
                "height": int(region.get("height", 0)),
            },
            "diversityScore": float(region.get("diversityScore", 0)),
            "f2Ids": region.get("f2Ids", []),
            "semanticGroups": region.get("semanticGroups", []),
            "modeStats": {
                "bottomCenter": {
                    "spriteCount": int(bottom_stats["spriteCount"]),
                    "fallbackTileCount": int(bottom_stats["fallbackTileCount"]),
                    "metadataAnchorCount": int(bottom_stats["metadataAnchorCount"]),
                    "bottomCenterFallbackCount": int(bottom_stats["bottomCenterFallbackCount"]),
                    "drawOrderDeterministic": bool(bottom_stats["drawOrder"]["deterministic"]),
                    "drawOrderSignature": bottom_stats["drawOrder"]["signature"],
                    "drawOrderRepeatSignature": bottom_stats["drawOrder"]["repeatSignature"],
                },
                "metadata": {
                    "spriteCount": int(metadata_stats["spriteCount"]),
                    "fallbackTileCount": int(metadata_stats["fallbackTileCount"]),
                    "metadataAnchorCount": int(metadata_stats["metadataAnchorCount"]),
                    "bottomCenterFallbackCount": int(metadata_stats["bottomCenterFallbackCount"]),
                    "drawOrderDeterministic": bool(metadata_stats["drawOrder"]["deterministic"]),
                    "drawOrderSignature": metadata_stats["drawOrder"]["signature"],
                    "drawOrderRepeatSignature": metadata_stats["drawOrder"]["repeatSignature"],
                },
                "familyAware": {
                    "spriteCount": int(family_stats["spriteCount"]),
                    "fallbackTileCount": int(family_stats["fallbackTileCount"]),
                    "metadataAnchorCount": int(family_stats["metadataAnchorCount"]),
                    "bottomCenterFallbackCount": int(family_stats["bottomCenterFallbackCount"]),
                    "drawOrderDeterministic": bool(family_stats["drawOrder"]["deterministic"]),
                    "drawOrderSignature": family_stats["drawOrder"]["signature"],
                    "drawOrderRepeatSignature": family_stats["drawOrder"]["repeatSignature"],
                },
            },
            "seamMetrics": {
                "bottomCenter": bottom_stats["seamMetrics"],
                "metadata": metadata_stats["seamMetrics"],
                "familyAware": family_stats["seamMetrics"],
            },
            "unresolvedAnchorSources": metadata_stats["unresolvedAnchorSources"],
            "familyCoverage": family_stats["familyCoverage"],
            "problemCandidates": family_stats["problemCandidates"],
            "elevationFamilyCounts": family_stats.get("elevatedFamilyCounts", {}),
            "passStats": family_stats.get("passStats", {}),
            "transitionDiagnostics": family_stats.get("transitionDiagnostics", {}),
            "semanticFoundationCandidates": family_stats.get("semanticFoundationCandidates", []),
            "groupedStructures": family_stats.get("groupedStructures", []),
            "overlayInteractionStats": family_stats.get("overlayInteractionStats", {}),
            "facilityPatternCandidates": family_stats.get("facilityPatternCandidates", []),
            "terrainMutationCandidates": family_stats.get("terrainMutationCandidates", []),
            "coherenceScores": family_stats.get("coherenceScores", {}),
            "supportRelationshipStats": family_stats.get("supportRelationshipStats", {}),
            "disconnectedRegionCandidates": family_stats.get("disconnectedRegionCandidates", []),
            "floatingRegionCandidates": family_stats.get("floatingRegionCandidates", []),
            "terrainContinuityDiagnostics": family_stats.get("terrainContinuityDiagnostics", {}),
            "continuityRefinementAdjustments": family_stats.get("continuityRefinementAdjustments", []),
            "continuityRefinementStats": family_stats.get("continuityRefinementStats", {}),
            "buildabilityStats": family_stats.get("buildabilityStats", {}),
            "indoorOutdoorStats": family_stats.get("indoorOutdoorStats", {}),
            "terrainCompositionGroups": family_stats.get("terrainCompositionGroups", []),
            "placementConflictCandidates": family_stats.get("placementConflictCandidates", []),
            "supportPlacementDiagnostics": family_stats.get("supportPlacementDiagnostics", {}),
            "reclaimedLandCandidates": family_stats.get("reclaimedLandCandidates", []),
            "semanticPlacementConfidence": family_stats.get("semanticPlacementConfidence", {}),
            "f2MapchipStats": family_stats.get("f2MapchipStats", {}),
            "mapchipFamilyClusters": family_stats.get("mapchipFamilyClusters", []),
            "mapchipContinuityDiagnostics": family_stats.get("mapchipContinuityDiagnostics", {}),
            "incompatibleMapchipTransitions": family_stats.get("incompatibleMapchipTransitions", []),
            "isolatedMapchipCandidates": family_stats.get("isolatedMapchipCandidates", []),
            "mapchipCompositionConfidence": family_stats.get("mapchipCompositionConfidence", {}),
            "fieldCorrelationStats": field_correlation_stats,
            "biomeHypothesisStats": biome_hypothesis_stats,
            "landWaterMaskDiagnostics": land_water_mask_diagnostics,
            "f5BehaviorCandidates": f5_behavior_candidates,
            "fieldOverlapMetrics": field_overlap_metrics,
            "fieldConfidenceSummaries": field_confidence_summaries,
            "fieldPropagationStats": field_propagation_stats,
            "extractionCoverageStats": extraction_coverage_stats,
            "missingFieldDiagnostics": missing_field_diagnostics,
            "fieldPreservationRates": field_preservation_rates,
            "regionFieldAvailability": region_field_availability,
            "assetIdentityStats": family_stats.get("assetIdentityStats", {}),
            "confidenceSummaries": family_stats.get("confidenceSummaries", {}),
            "preview": {
                "bottomCenter": bottom_stats["preview"],
                "metadata": metadata_stats["preview"],
                "familyAware": family_stats["preview"],
            },
            "spacingCalibration": {
                "comparisonImagePath": str(spacing_out_png.relative_to(project_root)).replace("\\", "/"),
                "legacy": {
                    "tileWidth": int(legacy_projection["tileWidth"]),
                    "tileHeight": int(legacy_projection["tileHeight"]),
                    "tileStepX": int(legacy_projection["tileStepX"]),
                    "tileStepY": int(legacy_projection["tileStepY"]),
                    "seamMetrics": metadata_stats["seamMetrics"],
                },
                "calibrated": {
                    "tileWidth": int(calibrated_projection["tileWidth"]),
                    "tileHeight": int(calibrated_projection["tileHeight"]),
                    "tileStepX": int(calibrated_projection["tileStepX"]),
                    "tileStepY": int(calibrated_projection["tileStepY"]),
                    "seamMetrics": calibrated_stats["seamMetrics"],
                },
                "seamReduction": {
                    "eastAvgPositiveGapDelta": float(metadata_stats["seamMetrics"]["east"]["avgPositiveGap"] - calibrated_stats["seamMetrics"]["east"]["avgPositiveGap"]),
                    "southAvgPositiveGapDelta": float(metadata_stats["seamMetrics"]["south"]["avgPositiveGap"] - calibrated_stats["seamMetrics"]["south"]["avgPositiveGap"]),
                },
            },
            "familyComparison": {
                "comparisonImagePath": str(family_out_png.relative_to(project_root)).replace("\\", "/"),
                "calibrated": {
                    "drawOrderSignature": calibrated_stats["drawOrder"]["signature"],
                    "seamMetrics": calibrated_stats["seamMetrics"],
                },
                "familyAware": {
                    "drawOrderSignature": family_stats["drawOrder"]["signature"],
                    "seamMetrics": family_stats["seamMetrics"],
                    "familyCoverage": family_stats["familyCoverage"],
                    "problemCandidates": family_stats["problemCandidates"],
                    "elevationFamilyCounts": family_stats.get("elevatedFamilyCounts", {}),
                    "transitionDiagnostics": family_stats.get("transitionDiagnostics", {}),
                    "semanticFoundationCandidates": family_stats.get("semanticFoundationCandidates", []),
                    "groupedStructures": family_stats.get("groupedStructures", []),
                    "overlayInteractionStats": family_stats.get("overlayInteractionStats", {}),
                    "facilityPatternCandidates": family_stats.get("facilityPatternCandidates", []),
                    "terrainMutationCandidates": family_stats.get("terrainMutationCandidates", []),
                    "coherenceScores": family_stats.get("coherenceScores", {}),
                    "supportRelationshipStats": family_stats.get("supportRelationshipStats", {}),
                    "disconnectedRegionCandidates": family_stats.get("disconnectedRegionCandidates", []),
                    "floatingRegionCandidates": family_stats.get("floatingRegionCandidates", []),
                    "terrainContinuityDiagnostics": family_stats.get("terrainContinuityDiagnostics", {}),
                    "continuityRefinementAdjustments": family_stats.get("continuityRefinementAdjustments", []),
                    "continuityRefinementStats": family_stats.get("continuityRefinementStats", {}),
                    "buildabilityStats": family_stats.get("buildabilityStats", {}),
                    "indoorOutdoorStats": family_stats.get("indoorOutdoorStats", {}),
                    "terrainCompositionGroups": family_stats.get("terrainCompositionGroups", []),
                    "placementConflictCandidates": family_stats.get("placementConflictCandidates", []),
                    "supportPlacementDiagnostics": family_stats.get("supportPlacementDiagnostics", {}),
                    "reclaimedLandCandidates": family_stats.get("reclaimedLandCandidates", []),
                    "semanticPlacementConfidence": family_stats.get("semanticPlacementConfidence", {}),
                    "f2MapchipStats": family_stats.get("f2MapchipStats", {}),
                    "mapchipFamilyClusters": family_stats.get("mapchipFamilyClusters", []),
                    "mapchipContinuityDiagnostics": family_stats.get("mapchipContinuityDiagnostics", {}),
                    "incompatibleMapchipTransitions": family_stats.get("incompatibleMapchipTransitions", []),
                    "isolatedMapchipCandidates": family_stats.get("isolatedMapchipCandidates", []),
                    "mapchipCompositionConfidence": family_stats.get("mapchipCompositionConfidence", {}),
                    "fieldCorrelationStats": field_correlation_stats,
                    "biomeHypothesisStats": biome_hypothesis_stats,
                    "landWaterMaskDiagnostics": land_water_mask_diagnostics,
                    "f5BehaviorCandidates": f5_behavior_candidates,
                    "fieldOverlapMetrics": field_overlap_metrics,
                    "fieldConfidenceSummaries": field_confidence_summaries,
                    "fieldPropagationStats": field_propagation_stats,
                    "extractionCoverageStats": extraction_coverage_stats,
                    "missingFieldDiagnostics": missing_field_diagnostics,
                    "fieldPreservationRates": field_preservation_rates,
                    "regionFieldAvailability": region_field_availability,
                    "assetIdentityStats": family_stats.get("assetIdentityStats", {}),
                },
            },
            "debugVisualizations": {
                "enabled": bool(debug_visualizations_enabled),
                "outputs": debug_output_paths,
            },
            "dualMapReview": {
                "flatDataMapPath": str(flat_out_png.relative_to(project_root)).replace("\\", "/"),
                "projectedRealisticMapPath": str(projected_out_png.relative_to(project_root)).replace("\\", "/"),
                "compareImagePath": str(dual_compare_out_png.relative_to(project_root)).replace("\\", "/"),
                "semanticOverlayReviewPath": str(semantic_overlay_review_png.relative_to(project_root)).replace("\\", "/"),
                "facilityCandidateReviewPath": str(facility_candidate_review_png.relative_to(project_root)).replace("\\", "/"),
                "elevationReviewPath": str(elevation_review_png.relative_to(project_root)).replace("\\", "/"),
                "terrainCoherenceReviewPath": str(terrain_coherence_review_png.relative_to(project_root)).replace("\\", "/"),
                "supportRelationshipReviewPath": str(support_relationship_review_png.relative_to(project_root)).replace("\\", "/"),
                "disconnectedRegionReviewPath": str(disconnected_region_review_png.relative_to(project_root)).replace("\\", "/"),
                "continuityRefinementReviewPath": str(continuity_refinement_review_png.relative_to(project_root)).replace("\\", "/"),
                "floatingRegionReviewPath": str(floating_region_review_png.relative_to(project_root)).replace("\\", "/"),
                "buildabilityReviewPath": str(buildability_review_png.relative_to(project_root)).replace("\\", "/"),
                "indoorOutdoorReviewPath": str(indoor_outdoor_review_png.relative_to(project_root)).replace("\\", "/"),
                "terrainSupportReviewPath": str(terrain_support_review_png.relative_to(project_root)).replace("\\", "/"),
                "blockedPlacementReviewPath": str(blocked_placement_review_png.relative_to(project_root)).replace("\\", "/"),
                "reclaimedLandReviewPath": str(reclaimed_land_review_png.relative_to(project_root)).replace("\\", "/"),
                "structureOverlapReviewPath": str(structure_overlap_review_png.relative_to(project_root)).replace("\\", "/"),
                "f2MapchipReviewPath": str(f2_mapchip_review_png.relative_to(project_root)).replace("\\", "/"),
                "mapchipContinuityReviewPath": str(mapchip_continuity_review_png.relative_to(project_root)).replace("\\", "/"),
                "mapchipTransitionReviewPath": str(mapchip_transition_review_png.relative_to(project_root)).replace("\\", "/"),
                "mapchipFamilyReviewPath": str(mapchip_family_review_png.relative_to(project_root)).replace("\\", "/"),
                "compositionVsMapchipReviewPath": str(composition_vs_mapchip_review_png.relative_to(project_root)).replace("\\", "/"),
                "semanticVsMapchipReviewPath": str(semantic_vs_mapchip_review_png.relative_to(project_root)).replace("\\", "/"),
                "f1ReviewPath": str(f1_review_png.relative_to(project_root)).replace("\\", "/"),
                "f1BiomeReviewPath": str(f1_biome_review_png.relative_to(project_root)).replace("\\", "/"),
                "f2ReviewPath": str(f2_review_png.relative_to(project_root)).replace("\\", "/"),
                "f3ReviewPath": str(f3_review_png.relative_to(project_root)).replace("\\", "/"),
                "f4ReviewPath": str(f4_review_png.relative_to(project_root)).replace("\\", "/"),
                "f5ReviewPath": str(f5_review_png.relative_to(project_root)).replace("\\", "/"),
                "fieldCorrelationReviewPath": str(field_correlation_review_png.relative_to(project_root)).replace("\\", "/"),
                "landWaterMaskReviewPath": str(land_water_mask_review_png.relative_to(project_root)).replace("\\", "/"),
                "f5BehaviorReviewPath": str(f5_behavior_review_png.relative_to(project_root)).replace("\\", "/"),
                "rawFieldPresenceReviewPath": str(raw_field_presence_review_png.relative_to(project_root)).replace("\\", "/"),
                "fieldPropagationReviewPath": str(field_propagation_review_png.relative_to(project_root)).replace("\\", "/"),
                "missingFieldReviewPath": str(missing_field_review_png.relative_to(project_root)).replace("\\", "/"),
                "extractionCoverageReviewPath": str(extraction_coverage_review_png.relative_to(project_root)).replace("\\", "/"),
                "flatStats": flat_stats,
                "fieldPropagationStats": field_propagation_stats,
                "extractionCoverageStats": extraction_coverage_stats,
                "missingFieldDiagnostics": missing_field_diagnostics,
                "fieldPreservationRates": field_preservation_rates,
                "regionFieldAvailability": region_field_availability,
                "visualReviewReportJsonPath": str(visual_review_json_path.relative_to(project_root)).replace("\\", "/"),
                "visualReviewReportMdPath": str(visual_review_md_path.relative_to(project_root)).replace("\\", "/"),
                "mismatchDiagnostics": mismatch_diagnostics,
            },
        }

        md_lines = [
            f"# MapChip Projected Mixed Region {region_id}",
            "",
            f"- Image: {region_report['imagePath']}",
            f"- Bounds: ({region_report['bounds']['x']}, {region_report['bounds']['y']}) size {region_report['bounds']['width']}x{region_report['bounds']['height']}",
            f"- Diversity score: {region_report['diversityScore']}",
            f"- f2 IDs: {', '.join(str(item) for item in region_report['f2Ids'])}",
            f"- Semantic groups: {', '.join(region_report['semanticGroups'])}",
            "",
            "## Coverage",
            f"- Bottom-center sprite count: {region_report['modeStats']['bottomCenter']['spriteCount']}",
            f"- Bottom-center fallback tile count: {region_report['modeStats']['bottomCenter']['fallbackTileCount']}",
            f"- Metadata sprite count: {region_report['modeStats']['metadata']['spriteCount']}",
            f"- Metadata fallback tile count: {region_report['modeStats']['metadata']['fallbackTileCount']}",
            f"- Metadata anchor count: {region_report['modeStats']['metadata']['metadataAnchorCount']}",
            f"- Metadata bottom-center fallback count: {region_report['modeStats']['metadata']['bottomCenterFallbackCount']}",
            f"- Family-aware sprite count: {region_report['modeStats']['familyAware']['spriteCount']}",
            f"- Family-aware fallback tile count: {region_report['modeStats']['familyAware']['fallbackTileCount']}",
            "",
            "## Seam/Gaps",
            f"- Bottom-center east avg positive gap: {region_report['seamMetrics']['bottomCenter']['east']['avgPositiveGap']}",
            f"- Metadata east avg positive gap: {region_report['seamMetrics']['metadata']['east']['avgPositiveGap']}",
            f"- Bottom-center south avg positive gap: {region_report['seamMetrics']['bottomCenter']['south']['avgPositiveGap']}",
            f"- Metadata south avg positive gap: {region_report['seamMetrics']['metadata']['south']['avgPositiveGap']}",
            f"- Family-aware east avg positive gap: {region_report['seamMetrics']['familyAware']['east']['avgPositiveGap']}",
            f"- Family-aware south avg positive gap: {region_report['seamMetrics']['familyAware']['south']['avgPositiveGap']}",
            "",
            "## Family Coverage",
            f"- Ambiguous f2 IDs: {', '.join(str(item) for item in region_report['familyCoverage']['ambiguousF2Ids']) if region_report['familyCoverage']['ambiguousF2Ids'] else 'none'}",
            "",
            "## Elevation and Passes",
            f"- Elevated family counts: {json.dumps(region_report['elevationFamilyCounts'], sort_keys=True)}",
            f"- Pass stats: {json.dumps(region_report['passStats'], sort_keys=True)}",
            "",
            "## Transition Diagnostics",
            f"- Mixed-family adjacency counts: {json.dumps(region_report['transitionDiagnostics'].get('mixedFamilyAdjacencyCounts', {}), sort_keys=True)}",
            f"- Transition candidates: {len(region_report['transitionDiagnostics'].get('transitionCandidates', []))}",
            f"- Unresolved overlay candidates: {len(region_report['transitionDiagnostics'].get('unresolvedOverlayCandidates', []))}",
            f"- Edge conflict candidates: {len(region_report['transitionDiagnostics'].get('edgeConflictCandidates', []))}",
            "",
            "## Semantic Reconstruction",
            f"- Semantic foundation candidates: {len(region_report.get('semanticFoundationCandidates', []))}",
            f"- Grouped structures: {len(region_report.get('groupedStructures', []))}",
            f"- Facility pattern candidates: {len(region_report.get('facilityPatternCandidates', []))}",
            f"- Terrain mutation candidates: {len(region_report.get('terrainMutationCandidates', []))}",
            f"- Overlay interaction stats: {json.dumps(region_report.get('overlayInteractionStats', {}), sort_keys=True)}",
            f"- Coherence scores: {json.dumps(region_report.get('coherenceScores', {}), sort_keys=True)}",
            f"- Support relationship stats: {json.dumps(region_report.get('supportRelationshipStats', {}), sort_keys=True)}",
            f"- Disconnected region candidates: {len(region_report.get('disconnectedRegionCandidates', []))}",
            f"- Floating region candidates: {len(region_report.get('floatingRegionCandidates', []))}",
            f"- Continuity refinement adjustments: {len(region_report.get('continuityRefinementAdjustments', []))}",
            f"- Buildability stats: {json.dumps(region_report.get('buildabilityStats', {}), sort_keys=True)}",
            f"- Indoor/outdoor stats: {json.dumps(region_report.get('indoorOutdoorStats', {}), sort_keys=True)}",
            f"- Terrain composition groups: {len(region_report.get('terrainCompositionGroups', []))}",
            f"- Placement conflict candidates: {len(region_report.get('placementConflictCandidates', []))}",
            f"- Reclaimed land candidates: {len(region_report.get('reclaimedLandCandidates', []))}",
            f"- Semantic placement confidence: {json.dumps(region_report.get('semanticPlacementConfidence', {}), sort_keys=True)}",
            f"- f2 mapchip stats: {json.dumps(region_report.get('f2MapchipStats', {}), sort_keys=True)}",
            f"- Mapchip family clusters: {len(region_report.get('mapchipFamilyClusters', []))}",
            f"- Incompatible mapchip transitions: {len(region_report.get('incompatibleMapchipTransitions', []))}",
            f"- Isolated mapchip candidates: {len(region_report.get('isolatedMapchipCandidates', []))}",
            f"- Mapchip composition confidence: {json.dumps(region_report.get('mapchipCompositionConfidence', {}), sort_keys=True)}",
            f"- Field correlation stats: {json.dumps(region_report.get('fieldCorrelationStats', {}), sort_keys=True)}",
            f"- Biome hypothesis stats: {json.dumps(region_report.get('biomeHypothesisStats', {}), sort_keys=True)}",
            f"- Land/water mask diagnostics: {json.dumps(region_report.get('landWaterMaskDiagnostics', {}), sort_keys=True)}",
            f"- F5 behavior candidates: {len(region_report.get('f5BehaviorCandidates', []))}",
            f"- Field overlap metrics: {json.dumps(region_report.get('fieldOverlapMetrics', {}), sort_keys=True)}",
            f"- Field confidence summaries: {json.dumps(region_report.get('fieldConfidenceSummaries', {}), sort_keys=True)}",
            f"- Field propagation stats: {json.dumps(region_report.get('fieldPropagationStats', {}), sort_keys=True)}",
            f"- Extraction coverage stats: {json.dumps(region_report.get('extractionCoverageStats', {}), sort_keys=True)}",
            f"- Missing field diagnostics: {json.dumps(region_report.get('missingFieldDiagnostics', {}), sort_keys=True)}",
            f"- Field preservation rates: {json.dumps(region_report.get('fieldPreservationRates', {}), sort_keys=True)}",
            f"- Region field availability: {json.dumps(region_report.get('regionFieldAvailability', {}), sort_keys=True)}",
            f"- Asset identity stats: {json.dumps(region_report.get('assetIdentityStats', {}), sort_keys=True)}",
            "",
            "## Unresolved Anchor Sources",
        ]

        for family_name, count in region_report["familyCoverage"]["tileCounts"].items():
            md_lines.append(f"- {family_name}: {count}")
        md_lines.append("")

        if region_report["unresolvedAnchorSources"]:
            for item in region_report["unresolvedAnchorSources"]:
                md_lines.append(f"- {item['reason']}: {item['count']}")
        else:
            md_lines.append("- none")
        md_lines.append("")

        out_json.write_text(json.dumps(region_report, indent=2), encoding="utf-8")
        out_md.write_text("\n".join(md_lines) + "\n", encoding="utf-8")
        summary_regions.append(region_report)

        print(f"[render:mapchip:projected-mixed-regions] Wrote {out_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {flat_out_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {projected_out_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {dual_compare_out_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {semantic_overlay_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {facility_candidate_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {elevation_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {terrain_coherence_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {support_relationship_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {disconnected_region_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {continuity_refinement_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {floating_region_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {buildability_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {indoor_outdoor_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {terrain_support_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {blocked_placement_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {reclaimed_land_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {structure_overlap_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f2_mapchip_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {mapchip_continuity_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {mapchip_transition_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {mapchip_family_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {composition_vs_mapchip_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {semantic_vs_mapchip_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f1_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f1_biome_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f2_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f3_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f4_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f5_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {field_correlation_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {land_water_mask_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {f5_behavior_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {raw_field_presence_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {field_propagation_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {missing_field_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {extraction_coverage_review_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {spacing_out_png.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {family_out_png.relative_to(project_root)}")
        for output_path in debug_output_paths.values():
            print(f"[render:mapchip:projected-mixed-regions] Wrote {output_path}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {out_json.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {out_md.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {visual_review_json_path.relative_to(project_root)}")
        print(f"[render:mapchip:projected-mixed-regions] Wrote {visual_review_md_path.relative_to(project_root)}")

    facility_candidates_ranked: List[Dict] = []
    terrain_mutation_ranked: List[Dict] = []
    overlay_interaction_totals = {
        "overlayOnTerrain": 0,
        "overlayOnElevated": 0,
        "overlayNearObjectLike": 0,
    }
    unresolved_semantic_areas: List[Dict] = []
    mismatch_ranked: List[Dict] = []
    warning_ranked: List[Dict] = []
    coherence_overall_scores: List[float] = []
    disconnected_region_total = 0
    floating_region_total = 0
    continuity_adjustment_total = 0
    placement_conflict_ranked: List[Dict] = []
    reclaimed_ranked: List[Dict] = []
    composition_group_total = 0
    buildability_category_totals: Dict[str, int] = {}
    indoor_outdoor_totals: Dict[str, int] = {}
    mapchip_cluster_totals: Dict[str, int] = {}
    mapchip_family_ranked: List[Dict] = []
    incompatible_mapchip_transitions_ranked: List[Dict] = []
    isolated_mapchip_ranked: List[Dict] = []
    mapchip_cluster_confidences: List[float] = []
    field_biome_scores: List[float] = []
    field_mask_scores: List[float] = []
    field_overall_scores: List[float] = []
    f5_theory_ranked: List[Dict] = []
    field_correlation_ranked: List[Dict] = []
    field_propagation_tile_count = 0
    field_propagation_all_fields_count = 0
    field_propagation_missing_tiles_count = 0
    field_mismatch_totals: Dict[str, int] = {"f1": 0, "f2": 0, "f3": 0, "f4": 0, "f5": 0}
    extraction_present_totals: Dict[str, int] = {"f1": 0, "f2": 0, "f3": 0, "f4": 0, "f5": 0}
    extraction_null_totals: Dict[str, int] = {"f1": 0, "f2": 0, "f3": 0, "f4": 0, "f5": 0}

    for item in summary_regions:
        region_id = int(item["regionId"])
        for candidate in item.get("facilityPatternCandidates", []):
            with_region = dict(candidate)
            with_region["regionId"] = region_id
            facility_candidates_ranked.append(with_region)

        for candidate in item.get("terrainMutationCandidates", []):
            with_region = dict(candidate)
            with_region["regionId"] = region_id
            terrain_mutation_ranked.append(with_region)

        interactions = item.get("overlayInteractionStats", {})
        for key in overlay_interaction_totals.keys():
            overlay_interaction_totals[key] += int(interactions.get(key, 0))

        transition_count = len(item.get("transitionDiagnostics", {}).get("transitionCandidates", []))
        foundation_count = len(item.get("semanticFoundationCandidates", []))
        grouped_count = len(item.get("groupedStructures", []))
        mismatch_info = item.get("dualMapReview", {}).get("mismatchDiagnostics", {})
        for mismatch in mismatch_info.get("mismatches", []):
            entry = dict(mismatch)
            entry["regionId"] = region_id
            mismatch_ranked.append(entry)
        for warning in mismatch_info.get("warnings", []):
            entry = dict(warning)
            entry["regionId"] = region_id
            warning_ranked.append(entry)

        coherence = item.get("coherenceScores", {})
        coherence_overall_scores.append(float(coherence.get("overall", 0.0)))
        disconnected_region_total += len(item.get("disconnectedRegionCandidates", []))
        floating_region_total += len(item.get("floatingRegionCandidates", []))
        continuity_adjustment_total += len(item.get("continuityRefinementAdjustments", []))
        composition_group_total += len(item.get("terrainCompositionGroups", []))

        for candidate in item.get("placementConflictCandidates", []):
            entry = dict(candidate)
            entry["regionId"] = region_id
            placement_conflict_ranked.append(entry)

        for candidate in item.get("reclaimedLandCandidates", []):
            entry = dict(candidate)
            entry["regionId"] = region_id
            reclaimed_ranked.append(entry)

        category_counts = item.get("buildabilityStats", {}).get("categoryCounts", {})
        for key, value in category_counts.items():
            buildability_category_totals[str(key)] = buildability_category_totals.get(str(key), 0) + int(value)

        indoor_stats = item.get("indoorOutdoorStats", {})
        for key, value in indoor_stats.items():
            indoor_outdoor_totals[str(key)] = indoor_outdoor_totals.get(str(key), 0) + int(value)

        mapchip_stats = item.get("f2MapchipStats", {})
        for key, value in mapchip_stats.get("clusterCounts", {}).items():
            mapchip_cluster_totals[str(key)] = mapchip_cluster_totals.get(str(key), 0) + int(value)

        for candidate in item.get("mapchipFamilyClusters", []):
            entry = dict(candidate)
            entry["regionId"] = region_id
            mapchip_family_ranked.append(entry)
            mapchip_cluster_confidences.append(float(candidate.get("confidence", 0.0)))

        for candidate in item.get("incompatibleMapchipTransitions", []):
            entry = dict(candidate)
            entry["regionId"] = region_id
            incompatible_mapchip_transitions_ranked.append(entry)

        for candidate in item.get("isolatedMapchipCandidates", []):
            entry = dict(candidate)
            entry["regionId"] = region_id
            isolated_mapchip_ranked.append(entry)

        field_conf = item.get("fieldConfidenceSummaries", {})
        field_biome_scores.append(float(field_conf.get("f1BiomeConfidence", 0.0)))
        field_mask_scores.append(float(field_conf.get("f3f4MaskComplementaryConfidence", 0.0)))
        field_overall_scores.append(
            float(
                (
                    float(field_conf.get("f1BiomeConfidence", 0.0))
                    + float(field_conf.get("f3f4MaskComplementaryConfidence", 0.0))
                    + float(field_conf.get("f5TopTheoryConfidence", 0.0))
                )
                / 3.0
            )
        )

        for candidate in item.get("f5BehaviorCandidates", []):
            entry = dict(candidate)
            entry["regionId"] = region_id
            f5_theory_ranked.append(entry)

        for candidate in item.get("fieldCorrelationStats", {}).get("correlations", []):
            entry = dict(candidate)
            entry["regionId"] = region_id
            field_correlation_ranked.append(entry)

        flow_stats = item.get("fieldPropagationStats", {})
        field_propagation_tile_count += int(flow_stats.get("tileCount", 0))
        field_propagation_all_fields_count += int(flow_stats.get("tilesWithAllFields", 0))
        field_propagation_missing_tiles_count += int(flow_stats.get("tilesWithAnyMissingField", 0))
        for field in ["f1", "f2", "f3", "f4", "f5"]:
            field_mismatch_totals[field] += int(flow_stats.get("propagationMismatchCounts", {}).get(field, 0))

        coverage_stats = item.get("extractionCoverageStats", {})
        for field in ["f1", "f2", "f3", "f4", "f5"]:
            extraction_present_totals[field] += int(coverage_stats.get("payloadPresentCounts", {}).get(field, 0))
            extraction_null_totals[field] += int(coverage_stats.get("payloadNullCounts", {}).get(field, 0))

        if transition_count >= 18 and (foundation_count == 0 or grouped_count == 0):
            unresolved_semantic_areas.append(
                {
                    "regionId": region_id,
                    "transitionCandidates": transition_count,
                    "semanticFoundationCandidates": foundation_count,
                    "groupedStructures": grouped_count,
                    "reason": "high_transition_noise_with_low_semantic_resolution",
                }
            )

    facility_candidates_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("regionId", 0))))
    terrain_mutation_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("regionId", 0))))
    mismatch_ranked.sort(key=lambda item: (str(item.get("severity", "z")), str(item.get("type", "")), int(item.get("regionId", 0))))
    warning_ranked.sort(key=lambda item: (str(item.get("type", "")), int(item.get("regionId", 0))))
    placement_conflict_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("regionId", 0))))
    reclaimed_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("regionId", 0))))
    mapchip_family_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), -int(item.get("memberCount", 0)), int(item.get("regionId", 0))))
    incompatible_mapchip_transitions_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("regionId", 0))))
    isolated_mapchip_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("regionId", 0))))
    f5_theory_ranked.sort(key=lambda item: (-float(item.get("confidence", 0.0)), -int(item.get("cellCount", 0)), int(item.get("regionId", 0))))
    field_correlation_ranked.sort(key=lambda item: (-float(item.get("avgBestMappingConfidence", 0.0)), -int(item.get("sampleCount", 0)), int(item.get("regionId", 0))))

    cross_region_analysis = analyze_cross_region_field_stability(summary_regions)
    grounded_asset_analysis = analyze_asset_identity_grounded_semantics(summary_regions, ka_chip_dir)
    sheet_layer_classification = analyze_sheet_grounded_layer_classification(summary_regions, project_root)

    cross_region_f1_review_png = tmp_dir / "mapchip-projected-mixed-cross-region-f1-review.png"
    cross_region_f2_review_png = tmp_dir / "mapchip-projected-mixed-cross-region-f2-review.png"
    cross_region_f3f4_review_png = tmp_dir / "mapchip-projected-mixed-cross-region-f3f4-review.png"
    cross_region_f5_review_png = tmp_dir / "mapchip-projected-mixed-cross-region-f5-review.png"
    field_stability_review_png = tmp_dir / "mapchip-projected-mixed-field-stability-review.png"
    hypothesis_drift_review_png = tmp_dir / "mapchip-projected-mixed-hypothesis-drift-review.png"
    asset_identity_review_png = tmp_dir / "mapchip-projected-mixed-asset-identity-review.png"
    tuchi_family_review_png = tmp_dir / "mapchip-projected-mixed-tuchi-family-review.png"
    rouka_family_review_png = tmp_dir / "mapchip-projected-mixed-rouka-family-review.png"
    containment_geometry_review_png = tmp_dir / "mapchip-projected-mixed-containment-geometry-review.png"
    support_wall_review_png = tmp_dir / "mapchip-projected-mixed-support-wall-review.png"
    top_surface_review_png = tmp_dir / "mapchip-projected-mixed-top-surface-review.png"
    screenshot_correlation_review_png = tmp_dir / "mapchip-projected-mixed-screenshot-correlation-review.png"
    geometry_vs_behavior_review_png = tmp_dir / "mapchip-projected-mixed-geometry-vs-behavior-review.png"

    f1_rows = []
    f2_rows = []
    f3f4_rows = []
    f5_rows = []
    for item in summary_regions:
        region_id = int(item.get("regionId", 0))
        bounds = item.get("bounds", {})
        label = f"R{region_id} ({int(bounds.get('x', 0))},{int(bounds.get('y', 0))})"
        biome = str(item.get("sampleTraits", {}).get("dominantBiome", "unknown"))

        f1_rows.append(
            {
                "label": label,
                "meta": f"biome={biome}",
                "value": float(item.get("biomeHypothesisStats", {}).get("f1BiomeEvidenceScore", 0.0)),
                "color": (110, 194, 126, 230),
            }
        )
        f2_rows.append(
            {
                "label": label,
                "meta": "f2 continuity",
                "value": float(item.get("mapchipCompositionConfidence", {}).get("averageClusterConfidence", 0.0)),
                "color": (106, 158, 222, 230),
            }
        )
        f3f4_rows.append(
            {
                "label": label,
                "meta": "mask complementary",
                "value": float(item.get("landWaterMaskDiagnostics", {}).get("f3f4ComplementaryRatio", 0.0)),
                "color": (94, 188, 176, 230),
            }
        )
        f5_rows.append(
            {
                "label": label,
                "meta": "overlay/support",
                "value": float(item.get("fieldConfidenceSummaries", {}).get("f5TopTheoryConfidence", 0.0)),
                "color": (208, 174, 94, 230),
            }
        )

    f1_cross_region_image = render_cross_region_metric_review(
        title="Cross-Region F1 Review",
        subtitle="Biome/macro-terrain consistency by region",
        rows=f1_rows,
    )
    f2_cross_region_image = render_cross_region_metric_review(
        title="Cross-Region F2 Review",
        subtitle="Mapchip identity continuity stability by region",
        rows=f2_rows,
    )
    f3f4_cross_region_image = render_cross_region_metric_review(
        title="Cross-Region F3/F4 Review",
        subtitle="Complementary mask behavior by region",
        rows=f3f4_rows,
    )
    f5_cross_region_image = render_cross_region_metric_review(
        title="Cross-Region F5 Review",
        subtitle="Overlay/support behavior confidence by region",
        rows=f5_rows,
    )

    stability_rows = [
        {
            "label": "f1BiomeConsistency",
            "meta": "stability-index",
            "value": float(cross_region_analysis.get("crossRegionFieldStability", {}).get("f1BiomeConsistency", {}).get("stabilityIndex", 0.0)),
            "color": (110, 194, 126, 230),
        },
        {
            "label": "f2ContinuityStability",
            "meta": "stability-index",
            "value": float(cross_region_analysis.get("crossRegionFieldStability", {}).get("f2ContinuityStability", {}).get("stabilityIndex", 0.0)),
            "color": (106, 158, 222, 230),
        },
        {
            "label": "f3f4MaskStability",
            "meta": "stability-index",
            "value": float(cross_region_analysis.get("crossRegionFieldStability", {}).get("f3f4MaskStability", {}).get("stabilityIndex", 0.0)),
            "color": (94, 188, 176, 230),
        },
        {
            "label": "f5OverlaySupportStability",
            "meta": "stability-index",
            "value": float(cross_region_analysis.get("crossRegionFieldStability", {}).get("f5OverlaySupportStability", {}).get("stabilityIndex", 0.0)),
            "color": (208, 174, 94, 230),
        },
    ]
    field_stability_image = render_cross_region_metric_review(
        title="Field Stability Review",
        subtitle="Cross-region stability indexes",
        rows=stability_rows,
    )

    drift_rows = []
    for item in cross_region_analysis.get("anomalyRegionCandidates", [])[:48]:
        rid = int(item.get("regionId", 0))
        drift_rows.append(
            {
                "label": f"R{rid}",
                "meta": "drift-score",
                "value": max(0.0, min(1.0, float(item.get("driftScore", 0.0)))),
                "color": (210, 114, 106, 230),
            }
        )
    hypothesis_drift_image = render_cross_region_metric_review(
        title="Hypothesis Drift Review",
        subtitle="Region drift ranking (higher = more unstable)",
        rows=drift_rows,
    )

    asset_identity_rows = [
        {
            "label": str(item.get("assetId", "unknown")),
            "meta": str(item.get("semanticLabel", "unresolved")),
            "value": float(item.get("semanticConfidence", 0.0)),
            "color": (130, 190, 126, 230),
        }
        for item in grounded_asset_analysis.get("assetIdentitySemanticCandidates", [])
    ]
    tuchi_family_rows = [
        {
            "label": f"{item.get('assetA', '?')}~{item.get('assetB', '?')}",
            "meta": str(item.get("relationshipType", "relationship")),
            "value": float(item.get("relationshipStrength", 0.0)),
            "color": (162, 136, 92, 230),
        }
        for item in grounded_asset_analysis.get("tuchiFamilyRelationships", [])
    ]
    rouka_family_rows = [
        {
            "label": f"{item.get('assetA', '?')}~{item.get('assetB', '?')}",
            "meta": str(item.get("relationshipType", "relationship")),
            "value": float(item.get("relationshipStrength", 0.0)),
            "color": (118, 156, 216, 230),
        }
        for item in grounded_asset_analysis.get("roukaFamilyRelationships", [])
    ]
    containment_rows = [
        {
            "label": str(item.get("assetId", "unknown")),
            "meta": str(item.get("geometryDescriptor", "geometry")),
            "value": float(item.get("containmentScore", 0.0)),
            "color": (96, 178, 176, 230),
        }
        for item in grounded_asset_analysis.get("containmentGeometryCandidates", [])
    ]
    support_rows = [
        {
            "label": str(item.get("assetId", "unknown")),
            "meta": "support-wall",
            "value": float(item.get("supportWallScore", 0.0)),
            "color": (192, 136, 104, 230),
        }
        for item in grounded_asset_analysis.get("supportWallEvidence", [])
    ]
    top_surface_rows = [
        {
            "label": str(item.get("assetId", "unknown")),
            "meta": str(item.get("semanticLabel", "surface")),
            "value": float(item.get("topSurfaceScore", 0.0)),
            "color": (116, 174, 126, 230),
        }
        for item in grounded_asset_analysis.get("topSurfaceEvidence", [])
    ]
    screenshot_rows = [
        {
            "label": str(item.get("assetId", "unknown")),
            "meta": "screenshot-correlation",
            "value": float(item.get("screenshotBehaviorScore", 0.0)),
            "color": (114, 162, 210, 230),
        }
        for item in grounded_asset_analysis.get("screenshotBehaviorCorrelations", [])
    ]
    geometry_behavior_rows = [
        {
            "label": str(item.get("assetId", "unknown")),
            "meta": "geometry-vs-behavior",
            "value": float(item.get("geometryBehaviorConsistency", 0.0)),
            "color": (172, 148, 216, 230),
        }
        for item in grounded_asset_analysis.get("geometryVsBehaviorReview", [])
    ]

    asset_identity_image = render_cross_region_metric_review(
        title="Asset Identity Review",
        subtitle="Identity-grounded semantic confidence by asset",
        rows=asset_identity_rows,
    )
    tuchi_family_image = render_cross_region_metric_review(
        title="Tuchi Family Review",
        subtitle="tuchi00..04 relationship strengths",
        rows=tuchi_family_rows,
    )
    rouka_family_image = render_cross_region_metric_review(
        title="Rouka Family Review",
        subtitle="rouka14 relationship strengths against observed rouka family",
        rows=rouka_family_rows,
    )
    containment_geometry_image = render_cross_region_metric_review(
        title="Containment Geometry Review",
        subtitle="Containment-oriented geometry evidence by asset",
        rows=containment_rows,
    )
    support_wall_image = render_cross_region_metric_review(
        title="Support Wall Review",
        subtitle="Support-wall evidence by grounded asset identity",
        rows=support_rows,
    )
    top_surface_image = render_cross_region_metric_review(
        title="Top Surface Review",
        subtitle="Top-surface evidence by grounded asset identity",
        rows=top_surface_rows,
    )
    screenshot_correlation_image = render_cross_region_metric_review(
        title="Screenshot Correlation Review",
        subtitle="Observed screenshot behavior correlation by asset",
        rows=screenshot_rows,
    )
    geometry_vs_behavior_image = render_cross_region_metric_review(
        title="Geometry vs Behavior Review",
        subtitle="Geometry-behavior consistency by asset",
        rows=geometry_behavior_rows,
    )

    f1_cross_region_image.save(cross_region_f1_review_png, format="PNG")
    f2_cross_region_image.save(cross_region_f2_review_png, format="PNG")
    f3f4_cross_region_image.save(cross_region_f3f4_review_png, format="PNG")
    f5_cross_region_image.save(cross_region_f5_review_png, format="PNG")
    field_stability_image.save(field_stability_review_png, format="PNG")
    hypothesis_drift_image.save(hypothesis_drift_review_png, format="PNG")
    asset_identity_image.save(asset_identity_review_png, format="PNG")
    tuchi_family_image.save(tuchi_family_review_png, format="PNG")
    rouka_family_image.save(rouka_family_review_png, format="PNG")
    containment_geometry_image.save(containment_geometry_review_png, format="PNG")
    support_wall_image.save(support_wall_review_png, format="PNG")
    top_surface_image.save(top_surface_review_png, format="PNG")
    screenshot_correlation_image.save(screenshot_correlation_review_png, format="PNG")
    geometry_vs_behavior_image.save(geometry_vs_behavior_review_png, format="PNG")

    summary = {
        "regions": summary_regions,
        "bestMixedRegions": [
            {
                "regionId": item["regionId"],
                "x": item["bounds"]["x"],
                "y": item["bounds"]["y"],
                "width": item["bounds"]["width"],
                "height": item["bounds"]["height"],
                "diversityScore": item["diversityScore"],
            }
            for item in summary_regions
        ],
        "spacingCalibration": {
            "legacyProjection": spacing_calibration["legacyProjection"],
            "calibratedProjection": spacing_calibration["calibratedProjection"],
        },
        "familyRenderProfiles": family_profiles,
        "resolutionFamilyCoverage": global_family_coverage,
        "debugVisualizationsEnabled": bool(debug_visualizations_enabled),
        "semanticAggregate": {
            "overlayInteractionTotals": overlay_interaction_totals,
            "facilityPatternCandidatesRanked": facility_candidates_ranked[:50],
            "terrainMutationCandidatesRanked": terrain_mutation_ranked[:80],
            "unresolvedSemanticAreas": unresolved_semantic_areas,
        },
        "dualMapReviewAggregate": {
            "mismatchCandidates": mismatch_ranked[:80],
            "warningCandidates": warning_ranked[:120],
            "regionCountWithMismatches": len({int(item.get("regionId", -1)) for item in mismatch_ranked}),
            "regionCountWithWarnings": len({int(item.get("regionId", -1)) for item in warning_ranked}),
        },
        "coherenceAggregate": {
            "averageOverallCoherence": float(sum(coherence_overall_scores) / max(1, len(coherence_overall_scores))),
            "disconnectedRegionCandidates": int(disconnected_region_total),
            "floatingRegionCandidates": int(floating_region_total),
            "continuityRefinementAdjustments": int(continuity_adjustment_total),
        },
        "placementAggregate": {
            "buildabilityCategoryTotals": buildability_category_totals,
            "indoorOutdoorTotals": indoor_outdoor_totals,
            "terrainCompositionGroupCount": int(composition_group_total),
            "placementConflictCandidates": placement_conflict_ranked[:160],
            "reclaimedLandCandidates": reclaimed_ranked[:160],
        },
        "mapchipAggregate": {
            "clusterTotals": mapchip_cluster_totals,
            "mapchipFamilyClusters": mapchip_family_ranked[:200],
            "incompatibleMapchipTransitions": incompatible_mapchip_transitions_ranked[:200],
            "isolatedMapchipCandidates": isolated_mapchip_ranked[:200],
            "averageClusterConfidence": float(round(sum(mapchip_cluster_confidences) / max(1, len(mapchip_cluster_confidences)), 4)),
        },
        "fieldAggregate": {
            "averageF1BiomeConfidence": float(round(sum(field_biome_scores) / max(1, len(field_biome_scores)), 4)),
            "averageF3F4MaskComplementaryConfidence": float(round(sum(field_mask_scores) / max(1, len(field_mask_scores)), 4)),
            "averageOverallFieldSignalConfidence": float(round(sum(field_overall_scores) / max(1, len(field_overall_scores)), 4)),
            "f5BehaviorCandidates": f5_theory_ranked[:200],
            "fieldCorrelations": field_correlation_ranked[:240],
        },
        "fieldFlowAggregate": {
            "fieldPropagationStats": {
                "tileCount": int(field_propagation_tile_count),
                "tilesWithAllFields": int(field_propagation_all_fields_count),
                "tilesWithAnyMissingField": int(field_propagation_missing_tiles_count),
                "propagationMismatchCounts": {field: int(value) for field, value in field_mismatch_totals.items()},
            },
            "extractionCoverageStats": {
                "payloadPresentCounts": {field: int(value) for field, value in extraction_present_totals.items()},
                "payloadNullCounts": {field: int(value) for field, value in extraction_null_totals.items()},
            },
            "fieldPreservationRates": {
                field: {
                    "payloadPresentRate": float(round(float(extraction_present_totals[field]) / max(1, field_propagation_tile_count), 4)),
                    "preservationRate": float(round(1.0 - (float(field_mismatch_totals[field]) / max(1, field_propagation_tile_count)), 4)),
                }
                for field in ["f1", "f2", "f3", "f4", "f5"]
            },
        },
        "crossRegionFieldStability": cross_region_analysis.get("crossRegionFieldStability", {}),
        "hypothesisDriftDiagnostics": cross_region_analysis.get("hypothesisDriftDiagnostics", {}),
        "contradictionCandidates": cross_region_analysis.get("contradictionCandidates", []),
        "anomalyRegionCandidates": cross_region_analysis.get("anomalyRegionCandidates", []),
        "specialCaseFieldBehaviors": cross_region_analysis.get("specialCaseFieldBehaviors", []),
        "regionSpecificFieldPatterns": cross_region_analysis.get("regionSpecificFieldPatterns", []),
        "assetIdentitySemanticCandidates": grounded_asset_analysis.get("assetIdentitySemanticCandidates", []),
        "assetGeometryDescriptors": grounded_asset_analysis.get("assetGeometryDescriptors", []),
        "tuchiFamilyRelationships": grounded_asset_analysis.get("tuchiFamilyRelationships", []),
        "roukaFamilyRelationships": grounded_asset_analysis.get("roukaFamilyRelationships", []),
        "containmentGeometryCandidates": grounded_asset_analysis.get("containmentGeometryCandidates", []),
        "supportWallEvidence": grounded_asset_analysis.get("supportWallEvidence", []),
        "topSurfaceEvidence": grounded_asset_analysis.get("topSurfaceEvidence", []),
        "screenshotBehaviorCorrelations": grounded_asset_analysis.get("screenshotBehaviorCorrelations", []),
        "groundedSemanticConfidence": grounded_asset_analysis.get("groundedSemanticConfidence", {}),
        "sheetGroundedLayerClassification": sheet_layer_classification,
        "crossRegionVisualReviewPaths": {
            "crossRegionF1ReviewPath": str(cross_region_f1_review_png.relative_to(project_root)).replace("\\", "/"),
            "crossRegionF2ReviewPath": str(cross_region_f2_review_png.relative_to(project_root)).replace("\\", "/"),
            "crossRegionF3F4ReviewPath": str(cross_region_f3f4_review_png.relative_to(project_root)).replace("\\", "/"),
            "crossRegionF5ReviewPath": str(cross_region_f5_review_png.relative_to(project_root)).replace("\\", "/"),
            "fieldStabilityReviewPath": str(field_stability_review_png.relative_to(project_root)).replace("\\", "/"),
            "hypothesisDriftReviewPath": str(hypothesis_drift_review_png.relative_to(project_root)).replace("\\", "/"),
            "assetIdentityReviewPath": str(asset_identity_review_png.relative_to(project_root)).replace("\\", "/"),
            "tuchiFamilyReviewPath": str(tuchi_family_review_png.relative_to(project_root)).replace("\\", "/"),
            "roukaFamilyReviewPath": str(rouka_family_review_png.relative_to(project_root)).replace("\\", "/"),
            "containmentGeometryReviewPath": str(containment_geometry_review_png.relative_to(project_root)).replace("\\", "/"),
            "supportWallReviewPath": str(support_wall_review_png.relative_to(project_root)).replace("\\", "/"),
            "topSurfaceReviewPath": str(top_surface_review_png.relative_to(project_root)).replace("\\", "/"),
            "screenshotCorrelationReviewPath": str(screenshot_correlation_review_png.relative_to(project_root)).replace("\\", "/"),
            "geometryVsBehaviorReviewPath": str(geometry_vs_behavior_review_png.relative_to(project_root)).replace("\\", "/"),
        },
    }

    summary_json_path = tmp_dir / "mapchip-projected-mixed-regions-summary.json"
    summary_md_path = tmp_dir / "mapchip-projected-mixed-regions-summary.md"

    summary_json_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    summary_lines = [
        "# MapChip Projected Mixed Regions Summary",
        "",
    ]
    for item in summary_regions:
        summary_lines.append(
            f"- Region {item['regionId']}: ({item['bounds']['x']}, {item['bounds']['y']}) score={item['diversityScore']} "
            f"sprites={item['modeStats']['metadata']['spriteCount']} "
            f"metadataAnchors={item['modeStats']['metadata']['metadataAnchorCount']} "
            f"fallbackAnchors={item['modeStats']['metadata']['bottomCenterFallbackCount']} "
            f"familyFallbackTiles={item['modeStats']['familyAware']['fallbackTileCount']} "
            f"transitionCandidates={len(item.get('transitionDiagnostics', {}).get('transitionCandidates', []))}"
        )
    summary_lines.extend(
        [
            "",
            "## Semantic Aggregate",
            f"- Overlay interactions: {json.dumps(overlay_interaction_totals, sort_keys=True)}",
            f"- Ranked facility candidates: {len(facility_candidates_ranked)}",
            f"- Ranked terrain mutation candidates: {len(terrain_mutation_ranked)}",
            f"- Unresolved semantic areas: {len(unresolved_semantic_areas)}",
            f"- Dual-map mismatch candidates: {len(mismatch_ranked)}",
            f"- Dual-map warning candidates: {len(warning_ranked)}",
            f"- Average overall coherence: {round(float(sum(coherence_overall_scores) / max(1, len(coherence_overall_scores))), 4)}",
            f"- Disconnected region candidates: {disconnected_region_total}",
            f"- Floating region candidates: {floating_region_total}",
            f"- Continuity refinement adjustments: {continuity_adjustment_total}",
            f"- Buildability category totals: {json.dumps(buildability_category_totals, sort_keys=True)}",
            f"- Indoor/outdoor totals: {json.dumps(indoor_outdoor_totals, sort_keys=True)}",
            f"- Terrain composition groups: {composition_group_total}",
            f"- Placement conflict candidates: {len(placement_conflict_ranked)}",
            f"- Reclaimed land candidates: {len(reclaimed_ranked)}",
            f"- Mapchip cluster totals: {json.dumps(mapchip_cluster_totals, sort_keys=True)}",
            f"- Mapchip family clusters: {len(mapchip_family_ranked)}",
            f"- Incompatible mapchip transitions: {len(incompatible_mapchip_transitions_ranked)}",
            f"- Isolated mapchip candidates: {len(isolated_mapchip_ranked)}",
            f"- Average mapchip cluster confidence: {round(float(sum(mapchip_cluster_confidences) / max(1, len(mapchip_cluster_confidences))), 4)}",
            f"- Average F1 biome confidence: {round(float(sum(field_biome_scores) / max(1, len(field_biome_scores))), 4)}",
            f"- Average F3/F4 mask complementary confidence: {round(float(sum(field_mask_scores) / max(1, len(field_mask_scores))), 4)}",
            f"- Average overall field signal confidence: {round(float(sum(field_overall_scores) / max(1, len(field_overall_scores))), 4)}",
            f"- Ranked F5 behavior candidates: {len(f5_theory_ranked)}",
            f"- Ranked field correlations: {len(field_correlation_ranked)}",
            f"- Field propagation tile count: {field_propagation_tile_count}",
            f"- Tiles with all fields present: {field_propagation_all_fields_count}",
            f"- Tiles with missing fields: {field_propagation_missing_tiles_count}",
            f"- Field propagation mismatches: {json.dumps(field_mismatch_totals, sort_keys=True)}",
            f"- Extraction payload present totals: {json.dumps(extraction_present_totals, sort_keys=True)}",
            f"- Extraction payload null totals: {json.dumps(extraction_null_totals, sort_keys=True)}",
            f"- Cross-region f1 stability: {json.dumps(summary.get('crossRegionFieldStability', {}).get('f1BiomeConsistency', {}), sort_keys=True)}",
            f"- Cross-region f2 stability: {json.dumps(summary.get('crossRegionFieldStability', {}).get('f2ContinuityStability', {}), sort_keys=True)}",
            f"- Cross-region f3/f4 stability: {json.dumps(summary.get('crossRegionFieldStability', {}).get('f3f4MaskStability', {}), sort_keys=True)}",
            f"- Cross-region f5 stability: {json.dumps(summary.get('crossRegionFieldStability', {}).get('f5OverlaySupportStability', {}), sort_keys=True)}",
            f"- Hypothesis drift metrics: {json.dumps(summary.get('hypothesisDriftDiagnostics', {}).get('confidenceDriftMetrics', {}), sort_keys=True)}",
            f"- Contradiction candidates: {len(summary.get('contradictionCandidates', []))}",
            f"- Anomaly region candidates: {len(summary.get('anomalyRegionCandidates', []))}",
            f"- Special-case field behaviors: {len(summary.get('specialCaseFieldBehaviors', []))}",
            f"- Asset identity semantic candidates: {len(summary.get('assetIdentitySemanticCandidates', []))}",
            f"- Asset geometry descriptors: {len(summary.get('assetGeometryDescriptors', []))}",
            f"- Tuchi family relationships: {len(summary.get('tuchiFamilyRelationships', []))}",
            f"- Rouka family relationships: {len(summary.get('roukaFamilyRelationships', []))}",
            f"- Containment geometry candidates: {len(summary.get('containmentGeometryCandidates', []))}",
            f"- Support-wall evidence entries: {len(summary.get('supportWallEvidence', []))}",
            f"- Top-surface evidence entries: {len(summary.get('topSurfaceEvidence', []))}",
            f"- Screenshot behavior correlations: {len(summary.get('screenshotBehaviorCorrelations', []))}",
            f"- Grounded semantic confidence: {json.dumps(summary.get('groundedSemanticConfidence', {}), sort_keys=True)}",
            f"- Sheet-grounded layer classification confidence: {json.dumps(summary.get('sheetGroundedLayerClassification', {}).get('confidence', {}), sort_keys=True)}",
            f"- Sheet-grounded contradictions: {len(summary.get('sheetGroundedLayerClassification', {}).get('contradictions', []))}",
            f"- Sheet-grounded missing evidence: {len(summary.get('sheetGroundedLayerClassification', {}).get('missingEvidence', []))}",
            f"- Cross-region review outputs: {json.dumps(summary.get('crossRegionVisualReviewPaths', {}), sort_keys=True)}",
        ]
    )

    summary_lines.extend(["", "## Sheet-Grounded Layer Separation"])
    for row in summary.get("sheetGroundedLayerClassification", {}).get("classificationTable", []):
        summary_lines.append(
            f"- {row.get('classLabel', row.get('classKey', 'unknown'))}: count={row.get('count', 0)} "
            f"share={row.get('share', 0.0)} avgConfidence={row.get('averageConfidence', 0.0)}"
        )
    summary_lines.append(
        f"- Default-terrain exclusions (facility/structure IDs): {json.dumps(summary.get('sheetGroundedLayerClassification', {}).get('defaultTerrainExclusions', []))}"
    )
    summary_lines.append("")

    summary_md_path.write_text("\n".join(summary_lines), encoding="utf-8")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {summary_json_path.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {summary_md_path.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {cross_region_f1_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {cross_region_f2_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {cross_region_f3f4_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {cross_region_f5_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {field_stability_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {hypothesis_drift_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {asset_identity_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {tuchi_family_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {rouka_family_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {containment_geometry_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {support_wall_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {top_surface_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {screenshot_correlation_review_png.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {geometry_vs_behavior_review_png.relative_to(project_root)}")

    semantic_consolidation_json_path = tmp_dir / "mapchip-projected-mixed-semantic-consolidation.json"
    semantic_consolidation_md_path = tmp_dir / "mapchip-projected-mixed-semantic-consolidation.md"

    semantic_consolidation = {
        "sheetGroundedLayerClassification": summary.get("sheetGroundedLayerClassification", {}),
        "compact": {
            "strongestCandidates": summary.get("sheetGroundedLayerClassification", {}).get("strongestCandidates", [])[:20],
            "contradictions": summary.get("sheetGroundedLayerClassification", {}).get("contradictions", [])[:20],
            "missingEvidence": summary.get("sheetGroundedLayerClassification", {}).get("missingEvidence", [])[:20],
            "confidence": summary.get("sheetGroundedLayerClassification", {}).get("confidence", {}),
        },
    }
    semantic_consolidation_json_path.write_text(json.dumps(semantic_consolidation, indent=2), encoding="utf-8")

    semantic_lines = [
        "# MapChip Mixed Semantic Consolidation",
        "",
        "## Sheet-Grounded Layer Separation",
    ]
    for row in semantic_consolidation.get("sheetGroundedLayerClassification", {}).get("classificationTable", []):
        semantic_lines.append(
            f"- {row.get('classLabel', row.get('classKey', 'unknown'))}: count={row.get('count', 0)} "
            f"share={row.get('share', 0.0)} avgConfidence={row.get('averageConfidence', 0.0)}"
        )

    semantic_lines.extend(
        [
            "",
            "## Strongest Candidates",
        ]
    )
    for item in semantic_consolidation.get("compact", {}).get("strongestCandidates", []):
        semantic_lines.append(
            f"- id={item.get('mapChipId', -1)} name={item.get('mapChipName', '')} "
            f"class={item.get('classLabel', item.get('classKey', 'unknown'))} conf={item.get('confidence', 0.0)}"
        )

    semantic_lines.extend(["", "## Contradictions"])
    contradictions = semantic_consolidation.get("compact", {}).get("contradictions", [])
    if contradictions:
        for item in contradictions:
            semantic_lines.append(
                f"- id={item.get('mapChipId', -1)} name={item.get('mapChipName', '')} "
                f"class={item.get('classKey', 'unknown')} reason={item.get('reason', 'unknown')}"
            )
    else:
        semantic_lines.append("- none")

    semantic_lines.extend(["", "## Missing Evidence"])
    missing_evidence = semantic_consolidation.get("compact", {}).get("missingEvidence", [])
    if missing_evidence:
        for item in missing_evidence:
            semantic_lines.append(
                f"- id={item.get('mapChipId', -1)} name={item.get('mapChipName', '')} reason={item.get('reason', 'unknown')}"
            )
    else:
        semantic_lines.append("- none")

    semantic_lines.extend(
        [
            "",
            f"## Confidence",
            f"- {json.dumps(semantic_consolidation.get('compact', {}).get('confidence', {}), sort_keys=True)}",
            "",
        ]
    )
    semantic_consolidation_md_path.write_text("\n".join(semantic_lines), encoding="utf-8")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {semantic_consolidation_json_path.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {semantic_consolidation_md_path.relative_to(project_root)}")

    calibration_json_path = tmp_dir / "mapchip-spacing-calibration.json"
    calibration_md_path = tmp_dir / "mapchip-spacing-calibration.md"

    seam_east_deltas = [
        float(item.get("spacingCalibration", {}).get("seamReduction", {}).get("eastAvgPositiveGapDelta", 0.0))
        for item in summary_regions
    ]
    seam_south_deltas = [
        float(item.get("spacingCalibration", {}).get("seamReduction", {}).get("southAvgPositiveGapDelta", 0.0))
        for item in summary_regions
    ]

    calibration_report = {
        "families": spacing_calibration["families"],
        "globalMedians": spacing_calibration["globalMedians"],
        "legacyProjection": spacing_calibration["legacyProjection"],
        "calibratedProjection": spacing_calibration["calibratedProjection"],
        "familyRenderProfiles": family_profiles,
        "resolutionFamilyCoverage": global_family_coverage,
        "comparisonImages": [
            item.get("spacingCalibration", {}).get("comparisonImagePath")
            for item in summary_regions
            if item.get("spacingCalibration", {}).get("comparisonImagePath")
        ],
        "familyComparisonImages": [
            item.get("familyComparison", {}).get("comparisonImagePath")
            for item in summary_regions
            if item.get("familyComparison", {}).get("comparisonImagePath")
        ],
        "seamReductionSummary": {
            "regionCount": len(summary_regions),
            "averageEastAvgPositiveGapDelta": float(sum(seam_east_deltas) / len(seam_east_deltas)) if seam_east_deltas else 0.0,
            "averageSouthAvgPositiveGapDelta": float(sum(seam_south_deltas) / len(seam_south_deltas)) if seam_south_deltas else 0.0,
            "perRegion": [
                {
                    "regionId": item["regionId"],
                    "eastAvgPositiveGapDelta": float(item.get("spacingCalibration", {}).get("seamReduction", {}).get("eastAvgPositiveGapDelta", 0.0)),
                    "southAvgPositiveGapDelta": float(item.get("spacingCalibration", {}).get("seamReduction", {}).get("southAvgPositiveGapDelta", 0.0)),
                }
                for item in summary_regions
            ],
        },
    }

    calibration_json_path.write_text(json.dumps(calibration_report, indent=2), encoding="utf-8")

    calibration_lines = [
        "# MapChip Spacing Calibration",
        "",
        "## Inferred Projection Values",
        f"- Legacy tile step: X={spacing_calibration['legacyProjection']['tileStepX']} Y={spacing_calibration['legacyProjection']['tileStepY']}",
        f"- Calibrated tile step: X={spacing_calibration['calibratedProjection']['tileStepX']} Y={spacing_calibration['calibratedProjection']['tileStepY']}",
        f"- Legacy tile size: {spacing_calibration['legacyProjection']['tileWidth']}x{spacing_calibration['legacyProjection']['tileHeight']}",
        f"- Calibrated tile size: {spacing_calibration['calibratedProjection']['tileWidth']}x{spacing_calibration['calibratedProjection']['tileHeight']}",
        "",
        "## Global Floor Sprite Medians",
        f"- Sprite size median: {spacing_calibration['globalMedians']['spriteSize']['w']}x{spacing_calibration['globalMedians']['spriteSize']['h']}",
        f"- Visible bounds median: {spacing_calibration['globalMedians']['visibleBounds']['w']}x{spacing_calibration['globalMedians']['visibleBounds']['h']}",
        "",
        "## Floor Family Measurements",
    ]

    calibration_lines.extend(
        [
            "",
            "## Family-Aware Profiles",
        ]
    )
    for family_name, profile in family_profiles.items():
        calibration_lines.append(
            f"- {family_name}: priority={profile.get('drawPriority', 0)} elevationY={profile.get('elevationOffsetY', 0)} "
            f"anchorAdjust=({profile.get('anchorAdjustX', 0)}, {profile.get('anchorAdjustY', 0)})"
        )

    for family_name in ["grass", "sand", "road_path", "rock", "snow"]:
        family = spacing_calibration["families"].get(family_name, {})
        calibration_lines.append(
            f"- {family_name}: samples={family.get('sampleCount', 0)} medianVisible={family.get('medianVisibleBounds', {}).get('w', 0)}x{family.get('medianVisibleBounds', {}).get('h', 0)}"
        )

    calibration_lines.extend(
        [
            "",
            "## Seam Reduction Summary (legacy metadata minus calibrated metadata)",
            f"- Average east avg positive gap delta: {calibration_report['seamReductionSummary']['averageEastAvgPositiveGapDelta']}",
            f"- Average south avg positive gap delta: {calibration_report['seamReductionSummary']['averageSouthAvgPositiveGapDelta']}",
            "",
            "## Comparison Images",
        ]
    )

    for path_value in calibration_report["comparisonImages"]:
        calibration_lines.append(f"- {path_value}")

    if calibration_report.get("familyComparisonImages"):
        calibration_lines.extend(["", "## Family Comparison Images"])
        for path_value in calibration_report["familyComparisonImages"]:
            calibration_lines.append(f"- {path_value}")

    calibration_lines.append("")

    calibration_md_path.write_text("\n".join(calibration_lines), encoding="utf-8")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {calibration_json_path.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {calibration_md_path.relative_to(project_root)}")

    family_profiles_json_path = tmp_dir / "mapchip-family-render-profiles.json"
    family_profiles_md_path = tmp_dir / "mapchip-family-render-profiles.md"

    family_profiles_report = {
        "profiles": family_profiles,
        "globalFloorMedians": floor_medians,
        "resolutionFamilyCoverage": global_family_coverage,
        "debugVisualizationsEnabled": bool(debug_visualizations_enabled),
        "regionCoverage": [
            {
                "regionId": item["regionId"],
                "tileCounts": item.get("familyCoverage", {}).get("tileCounts", {}),
                "ambiguousF2Ids": item.get("familyCoverage", {}).get("ambiguousF2Ids", []),
                "problemCandidates": item.get("problemCandidates", []),
                "elevationFamilyCounts": item.get("elevationFamilyCounts", {}),
                "mixedFamilyAdjacencyCounts": item.get("transitionDiagnostics", {}).get("mixedFamilyAdjacencyCounts", {}),
                "transitionCandidates": item.get("transitionDiagnostics", {}).get("transitionCandidates", []),
                "unresolvedOverlayCandidates": item.get("transitionDiagnostics", {}).get("unresolvedOverlayCandidates", []),
                "edgeConflictCandidates": item.get("transitionDiagnostics", {}).get("edgeConflictCandidates", []),
                "debugVisualizations": item.get("debugVisualizations", {}),
                "comparisonImagePath": item.get("familyComparison", {}).get("comparisonImagePath"),
                "dualMapReview": item.get("dualMapReview", {}),
            }
            for item in summary_regions
        ],
        "semanticAggregate": summary.get("semanticAggregate", {}),
        "dualMapReviewAggregate": summary.get("dualMapReviewAggregate", {}),
    }
    family_profiles_json_path.write_text(json.dumps(family_profiles_report, indent=2), encoding="utf-8")

    family_lines = [
        "# MapChip Family Render Profiles",
        "",
        f"- Global floor medians: {floor_medians.get('w', 0)}x{floor_medians.get('h', 0)}",
        "",
        "## Profiles",
    ]
    for family_name, profile in family_profiles.items():
        family_lines.append(
            f"- {family_name}: drawPriority={profile.get('drawPriority', 0)} elevationOffsetY={profile.get('elevationOffsetY', 0)} "
            f"anchorAdjust=({profile.get('anchorAdjustX', 0)}, {profile.get('anchorAdjustY', 0)})"
        )

    family_lines.extend(
        [
            "",
            "## Resolution Coverage",
        ]
    )
    for family_name, count in global_family_coverage.get("familyCounts", {}).items():
        family_lines.append(f"- {family_name}: {count}")

    family_lines.extend(["", "## Region Transition Diagnostics"])
    for item in summary_regions:
        diag = item.get("transitionDiagnostics", {})
        family_lines.append(
            f"- Region {item['regionId']}: mixedAdjacency={json.dumps(diag.get('mixedFamilyAdjacencyCounts', {}), sort_keys=True)} "
            f"transitions={len(diag.get('transitionCandidates', []))} unresolvedOverlay={len(diag.get('unresolvedOverlayCandidates', []))} "
            f"edgeConflicts={len(diag.get('edgeConflictCandidates', []))}"
        )

    family_lines.extend(
        [
            "",
            "## Region Family Compare Images",
        ]
    )
    for item in summary_regions:
        image_path = item.get("familyComparison", {}).get("comparisonImagePath")
        if image_path:
            family_lines.append(f"- Region {item['regionId']}: {image_path}")

    if debug_visualizations_enabled:
        family_lines.extend(["", "## Debug Visualization Outputs"])
        for item in summary_regions:
            outputs = item.get("debugVisualizations", {}).get("outputs", {})
            if not outputs:
                continue
            family_lines.append(f"- Region {item['regionId']}: {json.dumps(outputs, sort_keys=True)}")

    family_lines.append("")
    family_profiles_md_path.write_text("\n".join(family_lines), encoding="utf-8")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {family_profiles_json_path.relative_to(project_root)}")
    print(f"[render:mapchip:projected-mixed-regions] Wrote {family_profiles_md_path.relative_to(project_root)}")


if __name__ == "__main__":
    main()
