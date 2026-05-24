import hashlib
import json
import re
import sys
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


def load_inf_indexes(ka_chip_dir: Path) -> Tuple[Dict[int, str], Dict[int, str]]:
    img_index: Dict[int, str] = {}
    seb_index: Dict[int, str] = {}

    img_inf_path = ka_chip_dir / "img.inf"
    if img_inf_path.exists():
        for raw in img_inf_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            try:
                key = int(parts[0])
            except ValueError:
                continue
            filename = parts[1].split(",")[0].strip()
            img_index[key] = filename

    seb_inf_path = ka_chip_dir / "seb.inf"
    if seb_inf_path.exists():
        for raw in seb_inf_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            try:
                key = int(parts[0])
            except ValueError:
                continue
            seb_index[key] = parts[1].strip()

    return img_index, seb_index


def resolve_opt_slot(sprites: List[Dict], u: int, v: int) -> Dict | None:
    for sprite in sprites:
        if int(sprite.get("u", -1)) == u and int(sprite.get("v", -1)) == v:
            return sprite
    return None


def build_anchor_metadata(
    sprite_source_png: str,
    ka_chip_dir: Path,
    resolver_by_chip_id: Dict[int, Dict],
    chip_id: int,
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
    except Exception as exc:  # pragma: no cover - defensive for malformed files
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

    chip_row = resolver_by_chip_id.get(chip_id, {})
    draw_origin = {
        "x": cell_w // 2,
        "y": cell_h,
    }

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
        "chip": {
            "id": chip_id,
            "img": chip_row.get("img"),
            "seb": chip_row.get("seb"),
            "mapChipName": chip_row.get("mapChipName"),
        },
    }


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    ka_website_root = project_root.parent.parent
    tmp_dir = project_root / "tmp"

    sample_path = tmp_dir / "mapchip-visual-resolver-sample-region.json"
    resolver_report_path = tmp_dir / "mapchip-visual-resolver-report.json"

    out_png_path = tmp_dir / "mapchip-projected-sample-region.png"
    out_json_path = tmp_dir / "mapchip-projected-sample-region.json"
    out_md_path = tmp_dir / "mapchip-projected-sample-region.md"

    if not sample_path.exists():
        raise FileNotFoundError(f"Missing sample region file: {sample_path}")
    if not resolver_report_path.exists():
        raise FileNotFoundError(f"Missing resolver report file: {resolver_report_path}")

    sample = json.loads(sample_path.read_text(encoding="utf-8"))
    resolver_report = json.loads(resolver_report_path.read_text(encoding="utf-8"))

    tools_root = ka_website_root / "tools" / "asset_extractor"
    parsers_dir = tools_root / "parsers"
    sys.path.insert(0, str(tools_root))
    sys.path.insert(0, str(parsers_dir))
    from opt_parser import parse_opt  # type: ignore

    ka_chip_dir = project_root / "tmp" / "KA_assets" / "chip"
    img_index, seb_index = load_inf_indexes(ka_chip_dir)
    resolver_by_chip_id: Dict[int, Dict] = {
        int(entry.get("mapChipId", -1)): entry
        for entry in resolver_report.get("resolutions", [])
        if isinstance(entry, dict) and int(entry.get("mapChipId", -1)) >= 0
    }

    tile_width = 96
    tile_height = 48
    padding = 40
    sprite_anchor_x = 0
    sprite_anchor_y = 0

    unresolved_ids: List[int] = list(resolver_report.get("unresolvedMapChipIds", []))
    unresolved_for_legend = unresolved_ids[:16]

    tiles: List[Dict] = list(sample.get("tiles", []))
    sprite_cache: Dict[str, Image.Image] = {}

    draw_ops: List[Dict] = []
    anchor_metadata_by_sprite_key: Dict[str, Dict] = {}
    fallback_anchor_reasons: Dict[str, int] = {}
    min_x = 10**9
    min_y = 10**9
    max_x = -10**9
    max_y = -10**9

    metadata_anchored_sprite_count = 0
    fallback_anchored_sprite_count = 0

    before_after_shift: List[Tuple[int, int]] = []

    for tile in tiles:
        x = int(tile["x"])
        y = int(tile["y"])
        screen_x = (x - y) * (tile_width // 2)
        screen_y = (x + y) * (tile_height // 2)
        draw_layer = int(tile.get("drawLayer", 0))

        sprite_path = tile.get("spriteSourcePng") if tile.get("resolved") else None
        sprite_abs = (ka_website_root / sprite_path).resolve() if sprite_path else None
        sprite_exists = bool(sprite_abs and sprite_abs.exists())

        if sprite_exists:
            key = str(sprite_abs)
            if key not in sprite_cache:
                sprite_cache[key] = Image.open(sprite_abs).convert("RGBA")
            sprite = sprite_cache[key]
            w, h = sprite.size

            old_left = screen_x - (w // 2) + sprite_anchor_x
            old_top = screen_y + tile_height - h + sprite_anchor_y

            if key not in anchor_metadata_by_sprite_key:
                anchor_metadata_by_sprite_key[key] = build_anchor_metadata(
                    sprite_path,
                    ka_chip_dir,
                    resolver_by_chip_id,
                    int(tile.get("f2", 0)),
                    parse_opt,
                )

            anchor_meta = anchor_metadata_by_sprite_key[key]
            if anchor_meta.get("status") == "metadata":
                ax = int(anchor_meta["anchor"]["x"])
                ay = int(anchor_meta["anchor"]["y"])
                tile_anchor_x = screen_x
                tile_anchor_y = screen_y + tile_height
                left = tile_anchor_x - ax
                top = tile_anchor_y - ay
                anchor_mode = "metadata"
                metadata_anchored_sprite_count += 1
            else:
                left = old_left
                top = old_top
                anchor_mode = "fallback"
                fallback_anchored_sprite_count += 1
                reason = str(anchor_meta.get("reason", "unknown"))
                fallback_anchor_reasons[reason] = fallback_anchor_reasons.get(reason, 0) + 1

            before_after_shift.append((left - old_left, top - old_top))
            op_type = "sprite"
            fallback_color = None
        else:
            w = tile_width
            h = tile_height
            left = screen_x - (w // 2)
            top = screen_y
            op_type = "fallback"
            fallback_color = fallback_color_hex(int(tile.get("f2", 0)))
            anchor_mode = "fallback"
            anchor_meta = {
                "status": "fallback",
                "reason": "sprite_missing",
            }

        min_x = min(min_x, left)
        min_y = min(min_y, top)
        max_x = max(max_x, left + w)
        max_y = max(max_y, top + h)

        draw_ops.append(
            {
                "x": x,
                "y": y,
                "f2": int(tile.get("f2", 0)),
                "mapChipName": tile.get("mapChipName", ""),
                "drawLayer": draw_layer,
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
                "anchorMetadata": anchor_meta,
            }
        )

    draw_ops.sort(key=lambda op: (op["screenY"], op["y"], op["x"], op["drawLayer"], op["f2"]))

    legend_width = 240 if unresolved_for_legend else 0
    canvas_width = max(1, (max_x - min_x) + (padding * 2) + legend_width)
    canvas_height = max(1, (max_y - min_y) + (padding * 2))

    base_x = padding - min_x
    base_y = padding - min_y

    canvas = Image.new("RGBA", (canvas_width, canvas_height), (15, 18, 30, 255))
    draw = ImageDraw.Draw(canvas)

    sprite_draw_count = 0
    fallback_tile_count = 0

    for op in draw_ops:
        dx = op["left"] + base_x
        dy = op["top"] + base_y

        if op["opType"] == "sprite":
            sprite_path = op["spriteSourcePng"]
            sprite_abs = (ka_website_root / sprite_path).resolve()
            sprite = sprite_cache[str(sprite_abs)]
            canvas.paste(sprite, (dx, dy), sprite)
            sprite_draw_count += 1
            continue

        fallback_tile_count += 1
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
        color = hex_to_rgba(op["fallbackColor"], 220)
        outline = hex_to_rgba(op["fallbackColor"], 255)
        draw.polygon(points, fill=color, outline=outline)

    fallback_legend_count = 0
    if unresolved_for_legend:
        legend_x = canvas_width - legend_width + 16
        legend_y = 16
        swatch_size = 18
        row_h = 24
        for index, chip_id in enumerate(unresolved_for_legend):
            y = legend_y + index * row_h
            color_hex = fallback_color_hex(int(chip_id))
            draw.rectangle(
                [legend_x, y, legend_x + swatch_size, y + swatch_size],
                fill=hex_to_rgba(color_hex, 255),
                outline=(255, 255, 255, 220),
            )
            draw.text((legend_x + swatch_size + 8, y + 2), f"unresolved f2 {chip_id}", fill=(240, 240, 240, 255))
            fallback_legend_count += 1

    out_png_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_png_path, format="PNG")

    signature_parts = [
        f"{op['x']},{op['y']}:{op['opType']}:{op['screenX']},{op['screenY']}:{op.get('spriteSourcePng') or op.get('fallbackColor')}"
        for op in draw_ops
    ]
    signature = hashlib.sha256("|".join(signature_parts).encode("utf-8")).hexdigest()
    repeat_signature = hashlib.sha256("|".join(signature_parts).encode("utf-8")).hexdigest()

    report = {
        "imagePath": str(out_png_path.relative_to(project_root)).replace("\\", "/"),
        "imageGenerated": out_png_path.exists(),
        "canvas": {"width": canvas_width, "height": canvas_height},
        "sampleRegion": {
            "x": int(sample.get("x", 0)),
            "y": int(sample.get("y", 0)),
            "width": int(sample.get("width", 0)),
            "height": int(sample.get("height", 0)),
            "tileCount": int(sample.get("tileCount", 0)),
        },
        "projectionAssumptions": {
            "projectionType": "isometric-diamond",
            "tileWidth": tile_width,
            "tileHeight": tile_height,
            "originPolicy": "auto-fit-with-padding",
            "drawOrder": "screenY_then_y_then_x_then_layer_then_f2",
            "spriteAnchorPolicy": "per-chip-opt-anchor-when-available_else_bottom-center",
            "spriteAnchorOffset": {"x": sprite_anchor_x, "y": sprite_anchor_y},
        },
        "spriteDrawCount": sprite_draw_count,
        "fallbackTileCount": fallback_tile_count,
        "fallbackLegendCount": fallback_legend_count,
        "anchorCoverage": {
            "metadataAnchoredSpriteCount": metadata_anchored_sprite_count,
            "fallbackAnchoredSpriteCount": fallback_anchored_sprite_count,
            "totalSpriteCount": sprite_draw_count,
        },
        "spacingAnalysis": {
            "meanShiftX": (sum(item[0] for item in before_after_shift) / len(before_after_shift)) if before_after_shift else 0,
            "meanShiftY": (sum(item[1] for item in before_after_shift) / len(before_after_shift)) if before_after_shift else 0,
            "maxAbsShiftX": max((abs(item[0]) for item in before_after_shift), default=0),
            "maxAbsShiftY": max((abs(item[1]) for item in before_after_shift), default=0),
            "beforeAfterSpacingNotes": [
                "Compared to uniform bottom-center anchor, per-chip OPT anchor moved sprite placement by meanShift and maxAbsShift values.",
                "Road/floor seams are expected to tighten where non-zero dest_x/dest_y metadata exists.",
            ],
        },
        "unresolvedAnchorSources": [
            {
                "reason": reason,
                "count": count,
            }
            for reason, count in sorted(fallback_anchor_reasons.items(), key=lambda item: (-item[1], item[0]))
        ],
        "chipMetadataCoverage": {
            str(chip_id): {
                "imgFile": img_index.get(chip_row.get("img")) if isinstance(chip_row.get("img"), int) else None,
                "sebFile": seb_index.get(chip_row.get("seb")) if isinstance(chip_row.get("seb"), int) else None,
                "imgId": chip_row.get("img"),
                "sebId": chip_row.get("seb"),
                "mapChipName": chip_row.get("mapChipName"),
            }
            for chip_id, chip_row in resolver_by_chip_id.items()
            if chip_id in {int(tile.get("f2", -1)) for tile in tiles}
        },
        "drawOrder": {
            "signature": signature,
            "repeatSignature": repeat_signature,
            "deterministic": signature == repeat_signature,
            "preview": draw_ops[:80],
        },
        "unresolvedIds": unresolved_for_legend,
    }

    lines = [
        "# MapChip Projected Sample Region",
        "",
        f"- Image: {report['imagePath']}",
        f"- Canvas: {canvas_width}x{canvas_height}",
        f"- Sample region: ({report['sampleRegion']['x']}, {report['sampleRegion']['y']}) size {report['sampleRegion']['width']}x{report['sampleRegion']['height']}",
        f"- Sprite draws: {sprite_draw_count}",
        f"- Fallback tile draws: {fallback_tile_count}",
        f"- Fallback unresolved legend blocks: {fallback_legend_count}",
        f"- Metadata-anchored sprites: {metadata_anchored_sprite_count}",
        f"- Fallback-anchored sprites: {fallback_anchored_sprite_count}",
        f"- Deterministic draw order: {report['drawOrder']['deterministic']}",
        "",
        "## Projection Assumptions",
        f"- Projection type: {report['projectionAssumptions']['projectionType']}",
        f"- Tile size: {tile_width}x{tile_height}",
        f"- Draw order: {report['projectionAssumptions']['drawOrder']}",
        f"- Sprite anchor: {report['projectionAssumptions']['spriteAnchorPolicy']}",
        "",
        "## Spacing Notes",
        f"- Mean anchor shift: dx={report['spacingAnalysis']['meanShiftX']:.2f}, dy={report['spacingAnalysis']['meanShiftY']:.2f}",
        f"- Max abs shift: dx={report['spacingAnalysis']['maxAbsShiftX']}, dy={report['spacingAnalysis']['maxAbsShiftY']}",
        "- Per-chip opt destination offsets are now applied when available; fallback remains bottom-center.",
        "",
        "## Unresolved Anchor Sources",
    ]

    unresolved_anchor_sources = report["unresolvedAnchorSources"]
    if unresolved_anchor_sources:
        for item in unresolved_anchor_sources[:16]:
            lines.append(f"- {item['reason']}: {item['count']}")
    else:
        lines.append("- none")
    lines.append("")

    out_json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    out_md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(
        f"[render:mapchip:projected-sample-region] sprites={sprite_draw_count} fallback_tiles={fallback_tile_count} fallback_legend={fallback_legend_count}"
    )
    print(f"[render:mapchip:projected-sample-region] Wrote {out_png_path.relative_to(project_root)}")
    print(f"[render:mapchip:projected-sample-region] Wrote {out_json_path.relative_to(project_root)}")
    print(f"[render:mapchip:projected-sample-region] Wrote {out_md_path.relative_to(project_root)}")


if __name__ == "__main__":
    main()
