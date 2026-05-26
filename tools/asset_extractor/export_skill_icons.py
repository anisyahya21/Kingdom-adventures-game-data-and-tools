#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Export skill icons from icon_skill atlas and build skill-to-icon mapping."""

from __future__ import annotations

import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

from PIL import Image

from analyze_renderer_reference_files import parse_seb
from parsers.opt_parser import parse_opt


CATEGORY_TO_ICON_INDEX = {
    0: 1,  # Ice magic
    1: 2,  # Lightning magic
    2: 3,  # Fire magic
    3: 4,  # Heal / revive
    4: 5,  # Combat skills
    5: 6,  # Utility / town skills
    6: 8,
    7: 9,
    8: 10,
    9: 10,  # Battle behavior skills
}


def normalize_skill_name(value: str) -> str:
    text = (value or "").strip().lower()
    text = (
        text.replace("â… ", " i")
        .replace("â…¡", " ii")
        .replace("â…¢", " iii")
        .replace("â…£", " iv")
        .replace("â…¤", " v")
        .replace("Ⅰ", " i")
        .replace("Ⅱ", " ii")
        .replace("Ⅲ", " iii")
        .replace("Ⅳ", " iv")
        .replace("Ⅴ", " v")
    )
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def parse_skill_rows(skill_txt_path: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for line in skill_txt_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        cols = line.split("\t")
        if len(cols) < 34:
            continue

        try:
            skill_id = int(cols[0])
        except ValueError:
            continue

        category_raw = cols[18].strip()
        if not category_raw.isdigit():
            continue
        category = int(category_raw)

        base_name = cols[29].strip()
        arg_name = cols[30].strip()
        resolved_name = base_name.replace("<0>", arg_name).strip()
        if not resolved_name or resolved_name.lower() in {"skill", "not used", "unused"}:
            continue

        rows.append(
            {
                "id": skill_id,
                "name": resolved_name,
                "nameNormalized": normalize_skill_name(resolved_name),
                "category": category,
                "iconIndex": CATEGORY_TO_ICON_INDEX.get(category),
            }
        )
    return rows


def export_skill_icons(
    source_png: Path,
    source_opt: Path,
    source_optinfo: Path,
    source_seb: Path | None,
    output_dir: Path,
    scale: int = 4,
) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)

    opt_data = parse_opt(source_opt)
    image = Image.open(source_png).convert("RGBA")

    cell_w = int(opt_data["cell_width"])
    cell_h = int(opt_data["cell_height"])
    sprites = sorted(opt_data["sprites"], key=lambda sprite: (int(sprite["v"]), int(sprite["u"])))

    icons: list[dict[str, object]] = []
    for sprite in sprites:
        u = int(sprite["u"])
        v = int(sprite["v"])
        icon_index = u + 1

        canvas = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
        src_x = int(sprite["src_x"])
        src_y = int(sprite["src_y"])
        width = int(sprite["w"])
        height = int(sprite["h"])
        dest_x = int(sprite["dest_x"])
        dest_y = int(sprite["dest_y"])

        if width > 0 and height > 0:
            cropped = image.crop((src_x, src_y, src_x + width, src_y + height))
            canvas.paste(cropped, (dest_x, dest_y), cropped)

        if scale > 1:
            canvas = canvas.resize((canvas.width * scale, canvas.height * scale), Image.Resampling.NEAREST)

        filename = f"skill_icon_{icon_index:02d}.png"
        canvas.save(output_dir / filename, "PNG")

        icons.append(
            {
                "iconIndex": icon_index,
                "name": f"Skill Icon {icon_index}",
                "filename": filename,
                "u": u,
                "v": v,
                "destX": dest_x,
                "destY": dest_y,
                "srcX": src_x,
                "srcY": src_y,
                "w": width,
                "h": height,
                "status": sprite.get("status", "filled"),
                "sheet": source_png.name,
            }
        )

    optinfo_lines = [line.strip() for line in source_optinfo.read_text(encoding="utf-8", errors="replace").splitlines() if line.strip()]
    seb_info = parse_seb(source_seb) if source_seb and source_seb.exists() else {"blockCount": 0, "headerValue": 0, "trailingBytes": 0, "blocks": []}

    manifest: dict[str, object] = {
        "sheet": source_png.name,
        "opt": source_opt.name,
        "optinfo": source_optinfo.name,
        "sebFile": source_seb.name if source_seb else None,
        "scale": scale,
        "cellWidth": cell_w,
        "cellHeight": cell_h,
        "optGrid": {
            "cols": int(opt_data["cols"]),
            "rows": int(opt_data["rows"]),
            "spriteCount": len(sprites),
        },
        "optinfoLines": optinfo_lines,
        "seb": {
            "blockCount": seb_info.get("blockCount", 0),
            "headerValue": seb_info.get("headerValue", 0),
            "trailingBytes": seb_info.get("trailingBytes", 0),
            "frameCounts": [block.get("frameCount", 0) for block in seb_info.get("blocks", [])],
            "periods": [block.get("period", 0) for block in seb_info.get("blocks", [])],
        },
        "icons": icons,
    }

    with (output_dir / "manifest.json").open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return manifest


def build_skill_icon_map(skill_rows: list[dict[str, object]]) -> dict[str, object]:
    by_exact_name: dict[str, dict[str, object]] = {}
    by_name: dict[str, dict[str, object]] = {}
    category_counts: dict[int, int] = defaultdict(int)

    for row in skill_rows:
        normalized = str(row["nameNormalized"])
        if not normalized:
            continue
        icon_index = row.get("iconIndex")
        if icon_index is None:
            continue

        name = str(row["name"]).strip()
        if name:
            by_exact_name[name] = {
                "name": row["name"],
                "id": row["id"],
                "category": row["category"],
                "iconIndex": icon_index,
            }

        by_name[normalized] = {
            "name": row["name"],
            "id": row["id"],
            "category": row["category"],
            "iconIndex": icon_index,
        }
        category_counts[int(row["category"])] += 1

    return {
        "categoryToIconIndex": CATEGORY_TO_ICON_INDEX,
        "categoryCounts": {str(k): category_counts[k] for k in sorted(category_counts)},
        "skillsByName": by_exact_name,
        "skillsByNormalizedName": by_name,
    }


def write_skill_relationship_report(skill_rows: list[dict[str, object]], report_path: Path):
    grouped: dict[int, list[str]] = defaultdict(list)
    for row in skill_rows:
        icon_index = row.get("iconIndex")
        if icon_index is None:
            continue
        grouped[int(row["category"])].append(str(row["name"]))

    lines: list[str] = []
    lines.append("# Skill Group Relationship")
    lines.append("")
    lines.append("Derived from KA_assets/xls/English.lproj/Skill.txt category column (index 18).")
    lines.append("")
    lines.append("## Category To Icon")
    for category in sorted(grouped):
        icon_index = CATEGORY_TO_ICON_INDEX.get(category, "unknown")
        names = grouped[category]
        sample = ", ".join(sorted(names)[:8])
        lines.append(f"- category {category} -> icon {icon_index} ({len(names)} skills)")
        lines.append(f"  sample: {sample}")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def copy_to_public(source_dir: Path, public_dir: Path):
    public_dir.mkdir(parents=True, exist_ok=True)
    for item in source_dir.iterdir():
        if item.is_file():
            shutil.copy2(item, public_dir / item.name)


def main():
    repo_root = Path(__file__).resolve().parents[2]
    workspace_root = repo_root.parent

    legacy_com = workspace_root / "KA-Legacy-Archive" / "kingdom-adventures-tmp" / "KA_assets" / "com"
    skill_txt = workspace_root / "KA-Legacy-Archive" / "kingdom-adventures-tmp" / "KA_assets" / "xls" / "English.lproj" / "Skill.txt"

    source_png = legacy_com / "icon_skill.png"
    source_opt = legacy_com / "icon_skill.opt"
    source_optinfo = legacy_com / "icon_skill.optinfo"
    source_seb = legacy_com / "icon_skill.seb"
    if not source_seb.exists():
        fallback_seb = legacy_com / "icon.seb"
        source_seb = fallback_seb if fallback_seb.exists() else None

    output_dir = repo_root / "website_icons" / "skills"
    public_dir = repo_root / "artifacts" / "kingdom-adventures" / "public" / "website_icons" / "skills"

    if not source_png.exists() or not source_opt.exists() or not source_optinfo.exists():
        raise FileNotFoundError("Missing one or more icon_skill source files in KA-Legacy-Archive KA_assets/com")
    if not skill_txt.exists():
        raise FileNotFoundError("Missing Skill.txt in KA-Legacy-Archive KA_assets/xls/English.lproj")

    export_skill_icons(source_png, source_opt, source_optinfo, source_seb, output_dir, scale=4)

    skill_rows = parse_skill_rows(skill_txt)
    skill_map = build_skill_icon_map(skill_rows)

    with (output_dir / "skill_icon_map.json").open("w", encoding="utf-8") as f:
        json.dump(skill_map, f, ensure_ascii=False, indent=2)

    write_skill_relationship_report(skill_rows, output_dir / "skill_group_relationship.md")

    copy_to_public(output_dir, public_dir)

    print(f"Exported skill icons: {output_dir}")
    print(f"Public skill icons:   {public_dir}")
    print(f"Mapped skills: {len(skill_map['skillsByNormalizedName'])}")


if __name__ == "__main__":
    main()
