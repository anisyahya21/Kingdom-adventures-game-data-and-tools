#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Builds the website icon preview HTML from manifest data."""

import html
import json
from pathlib import Path


ATTR_NAMES = {
    1: "Ground",
    2: "Grass",
    3: "Sand",
    4: "Rock",
    5: "Volcano",
    6: "Snow",
    7: "Swamp",
}


def _safe(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def _slug(value) -> str:
    return _safe(value).lower()


def _src(category: str, entry: dict) -> str:
    if entry.get("path"):
        return _safe(entry["path"])

    filename = entry.get("filename", "")
    if "/" in filename:
        return _safe(filename)

    return f"{category}/{_safe(filename)}"


def _card(category: str, entry: dict, meta: str, extra_classes: str = "") -> str:
    card_classes = f"icon-card {extra_classes}".strip()
    variants_html = ""

    variants = entry.get("variants")
    if category == "furniture" and isinstance(variants, list) and len(variants) > 1:
        thumbs: list[str] = []
        for variant in variants[1:]:
            if not isinstance(variant, dict):
                continue
            filename = variant.get("filename")
            if not filename:
                continue
            thumbs.append(
                "<img class=\"variant-thumb\" "
                f"src=\"{_safe(category)}/{_safe(filename)}\" "
                f"alt=\"{_safe(entry.get('name', ''))} variant\" "
                f"title=\"variant {variant.get('index', '?')}\">"
            )
        if thumbs:
            variants_html = "\n        <div class=\"variants\">" + "".join(thumbs) + "</div>"

    return (
        f"    <div class=\"{card_classes}\" data-name=\"{_slug(entry.get('name', ''))}\" "
        f"data-id=\"{_safe(entry.get('id', ''))}\" data-category=\"{_safe(category)}\">\n"
        f"        <img src=\"{_src(category, entry)}\" alt=\"{_safe(entry.get('name', ''))}\">\n"
        f"{variants_html}"
        f"        <div class=\"name\">{_safe(entry.get('name', ''))}</div>\n"
        f"        <div class=\"id\">ID {_safe(entry.get('id', ''))}</div>\n"
        f"        <div class=\"meta\">{_safe(meta)}</div>\n"
        "    </div>\n"
    )


def _section(title: str, items: list[dict], category: str, meta_builder, extra_classes: str = "") -> str:
    parts = [f"<h2>{title} ({len(items)})</h2>", '<div class="icon-grid">']
    for entry in items:
        parts.append(_card(category, entry, meta_builder(entry), extra_classes).rstrip())
    parts.append("</div>")
    return "\n".join(parts) + "\n"


def _facilities_summary(facilities: list[dict]) -> tuple[int, int]:
    facility_count = sum(1 for entry in facilities if entry.get("type") == "facility")
    mapchip_count = sum(1 for entry in facilities if entry.get("type") == "mapchip")
    return facility_count, mapchip_count


def _load_extra_folder_icons(folder: Path, category: str) -> list[dict]:
    if not folder.exists():
        return []

    entries: list[dict] = []
    for file_path in sorted(folder.glob("*.png"), key=lambda p: p.name.lower()):
        stem = file_path.stem
        entries.append(
            {
                "id": stem,
                "name": stem.replace("_", " "),
                "filename": file_path.name,
                "path": f"{category}/{file_path.name}",
            }
        )
    return entries


def generate_html_preview(manifest_path: Path, linked_facilities_manifest_path: Path) -> str:
    with open(manifest_path, "r", encoding="utf-8") as file_obj:
        manifest = json.load(file_obj)

    with open(linked_facilities_manifest_path, "r", encoding="utf-8") as file_obj:
        linked_manifest = json.load(file_obj)

    facilities = manifest.get("facilities", [])
    facility_count, mapchip_count = _facilities_summary(facilities)
    linked_facilities = linked_manifest.get("icons", [])
    skill_manifest_path = manifest_path.parent / "skills" / "manifest.json"
    skill_icons: list[dict] = []
    if skill_manifest_path.exists():
        with open(skill_manifest_path, "r", encoding="utf-8") as file_obj:
            skill_icons = json.load(file_obj).get("icons", [])
    icons_root = manifest_path.parent
    valuable_icons = _load_extra_folder_icons(icons_root / "valuable", "valuable")
    menu_icons = _load_extra_folder_icons(icons_root / "menu", "menu")
    rank_icons = _load_extra_folder_icons(icons_root / "ranks", "ranks")

    summary = manifest.get("summary", {})
    summary_total = (
        int(summary.get("items", 0))
        + int(summary.get("equipment", 0))
        + int(summary.get("eggs", 0))
        + int(summary.get("attributes", 0))
        + int(summary.get("gender", 0))
        + int(summary.get("furniture", 0))
        + int(summary.get("requested", 0))
        + len(valuable_icons)
        + len(menu_icons)
        + len(rank_icons)
        + len(skill_icons)
        + facility_count
        + mapchip_count
        + len(linked_facilities)
    )

    html_parts = [
        "<!DOCTYPE html>",
        "<html>",
        "<head>",
        "    <meta charset=\"utf-8\">",
        "    <title>Kingdom Adventures Icons - Preview</title>",
        "    <style>",
        "        body {",
        "            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;",
        "            max-width: 1400px;",
        "            margin: 0 auto;",
        "            padding: 20px;",
        "            background: #f5f5f5;",
        "        }",
        "        h1 {",
        "            color: #333;",
        "            border-bottom: 3px solid #4CAF50;",
        "            padding-bottom: 10px;",
        "        }",
        "        h2 {",
        "            color: #666;",
        "            margin-top: 40px;",
        "            border-bottom: 2px solid #ddd;",
        "            padding-bottom: 5px;",
        "        }",
        "        .summary {",
        "            background: #fff;",
        "            padding: 15px;",
        "            border-radius: 8px;",
        "            margin-bottom: 20px;",
        "            box-shadow: 0 2px 4px rgba(0,0,0,0.1);",
        "        }",
        "        .summary h3 {",
        "            margin-top: 0;",
        "        }",
        "        .icon-grid {",
        "            display: grid;",
        "            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));",
        "            gap: 12px;",
        "            margin-top: 15px;",
        "        }",
        "        .icon-card {",
        "            background: white;",
        "            border: 1px solid #ddd;",
        "            border-radius: 6px;",
        "            padding: 12px;",
        "            text-align: center;",
        "            transition: transform 0.2s, box-shadow 0.2s;",
        "            cursor: pointer;",
        "        }",
        "        .icon-card:hover {",
        "            transform: translateY(-2px);",
        "            box-shadow: 0 4px 8px rgba(0,0,0,0.15);",
        "        }",
        "        .icon-card img {",
        "            image-rendering: pixelated;",
        "            image-rendering: crisp-edges;",
        "            width: 48px;",
        "            height: 48px;",
        "            object-fit: contain;",
        "            margin-bottom: 8px;",
        "        }",
        "        .icon-card .name {",
        "            font-size: 11px;",
        "            color: #333;",
        "            font-weight: 500;",
        "            margin-bottom: 4px;",
        "            min-height: 28px;",
        "            display: flex;",
        "            align-items: center;",
        "            justify-content: center;",
        "        }",
        "        .icon-card .id {",
        "            font-size: 10px;",
        "            color: #999;",
        "        }",
        "        .icon-card .meta {",
        "            font-size: 9px;",
        "            color: #666;",
        "            margin-top: 4px;",
        "            word-break: break-word;",
        "        }",
        "        .search-box {",
        "            background: white;",
        "            padding: 15px;",
        "            border-radius: 8px;",
        "            margin-bottom: 20px;",
        "            box-shadow: 0 2px 4px rgba(0,0,0,0.1);",
        "        }",
        "        .search-box input {",
        "            width: 100%;",
        "            padding: 10px;",
        "            font-size: 14px;",
        "            border: 1px solid #ddd;",
        "            border-radius: 4px;",
        "            box-sizing: border-box;",
        "        }",
        "        .hidden {",
        "            display: none !important;",
        "        }",
        "        .egg-icon img {",
        "            height: 55px !important;",
        "            width: auto;",
        "        }",
        "        .attribute-icon img {",
        "            height: 56px !important;",
        "            width: auto;",
        "        }",
        "        .facility-icon img, .linked-facility-icon img {",
        "            width: 80px;",
        "            height: 80px;",
        "        }",
        "        .furniture-icon img {",
        "            width: 80px;",
        "            height: 80px;",
        "        }",
        "        .variants {",
        "            display: flex;",
        "            justify-content: center;",
        "            gap: 4px;",
        "            margin: 4px 0 6px;",
        "            flex-wrap: wrap;",
        "        }",
            "        .variant-thumb {",
            "            width: 56px !important;",
            "            height: 56px !important;",
        "            border: 1px solid #ddd;",
        "            border-radius: 3px;",
        "            background: #fff;",
        "            padding: 1px;",
        "            object-fit: contain;",
        "        }",
        "    </style>",
        "</head>",
        "<body>",
        "    <h1>Kingdom Adventures - Exported Icons</h1>",
        "",
        "    <div class=\"summary\">",
        "        <h3>Export Summary</h3>",
        f"        <p><strong>Total Icons:</strong> {summary_total}</p>",
        "        <p>",
        f"            <strong>Items:</strong> {len(manifest.get('items', []))} |",
        f"            <strong>Equipment:</strong> {len(manifest.get('equipment', []))} |",
        f"            <strong>Eggs:</strong> {len(manifest.get('eggs', []))} |",
        f"            <strong>Attributes:</strong> {len(manifest.get('attributes', []))} |",
        f"            <strong>Gender:</strong> {len(manifest.get('gender', []))} |",
        f"            <strong>Furniture:</strong> {len(manifest.get('furniture', []))}",
        "        </p>",
        "        <p>",
        f"            <strong>Requested:</strong> {len(manifest.get('requested', []))}",
        "        </p>",
        "        <p>",
        f"            <strong>Valuable:</strong> {len(valuable_icons)} |",
        f"            <strong>Menu:</strong> {len(menu_icons)} |",
        f"            <strong>Ranks:</strong> {len(rank_icons)} |",
        f"            <strong>Skills:</strong> {len(skill_icons)}",
        "        </p>",
        "        <p>",
        f"            <strong>Facilities:</strong> {facility_count} |",
        f"            <strong>Mapchips:</strong> {mapchip_count} |",
        f"            <strong>Linked Facilities:</strong> {len(linked_facilities)}",
        "        </p>",
        f"        <p><strong>Scale:</strong> {_safe(manifest.get('scale', '?'))}x</p>",
        "    </div>",
        "",
        "    <div class=\"search-box\">",
        "        <input type=\"text\" id=\"searchInput\" placeholder=\"Search icons by name, ID, category, or metadata\" onkeyup=\"filterIcons()\">",
        "    </div>",
    ]

    html_parts.append(
        _section(
            "Items",
            manifest.get("items", []),
            "items",
            lambda item: item.get("method", ""),
        )
    )

    html_parts.append(
        _section(
            "Equipment",
            manifest.get("equipment", []),
            "equipment",
            lambda equip: (
                f"Type {equip.get('type', '?')}"
                + (
                    f" | {ATTR_NAMES.get(equip.get('attribute'), equip.get('attribute'))}"
                    if equip.get("attribute") not in (None, -1)
                    else ""
                )
            ),
        )
    )

    html_parts.append(
        _section(
            "Eggs",
            manifest.get("eggs", []),
            "eggs",
            lambda egg: egg.get("dimensions", ""),
            "egg-icon",
        )
    )

    html_parts.append(
        _section(
            "Field Attributes",
            manifest.get("attributes", []),
            "attributes",
            lambda attr: attr.get("dimensions", ""),
            "attribute-icon",
        )
    )

    html_parts.append(
        _section(
            "Gender",
            manifest.get("gender", []),
            "gender",
            lambda entry: f"iconU={entry.get('iconU', '?')} iconV={entry.get('iconV', '?')}",
        )
    )

    html_parts.append(
        _section(
            "Furniture",
            manifest.get("furniture", []),
            "furniture",
            lambda entry: f"variants={entry.get('variantCount', 1)} | source={entry.get('pngName', '?')}",
            "furniture-icon",
        )
    )

    html_parts.append(
        _section(
            "Requested",
            manifest.get("requested", []),
            "requested",
            lambda entry: f"source={entry.get('source', '?')}",
        )
    )

    html_parts.append(
        _section(
            "Rank Icons",
            rank_icons,
            "ranks",
            lambda entry: "rank_2x sheet",
        )
    )

    html_parts.append(
        _section(
            "Skill Icons",
            skill_icons,
            "skills",
            lambda entry: (
                f"index={entry.get('iconIndex', '?')} "
                f"| src=({entry.get('srcX', '?')},{entry.get('srcY', '?')}) "
                f"| size={entry.get('w', '?')}x{entry.get('h', '?')}"
            ),
        )
    )

    html_parts.append(
        _section(
            "Valuable",
            valuable_icons,
            "valuable",
            lambda entry: "website_icons/valuable",
        )
    )

    html_parts.append(
        _section(
            "Menu",
            menu_icons,
            "menu",
            lambda entry: "website_icons/menu",
        )
    )

    facility_only = [entry for entry in facilities if entry.get("type") == "facility"]
    mapchips_only = [entry for entry in facilities if entry.get("type") == "mapchip"]

    html_parts.append(
        _section(
            "Facilities (Confirmed)",
            facility_only,
            "facilities_confirmed",
            lambda entry: entry.get("type", "facility"),
            "facility-icon",
        )
    )

    html_parts.append(
        _section(
            "Mapchips",
            mapchips_only,
            "facilities_confirmed",
            lambda entry: entry.get("type", "mapchip"),
            "facility-icon",
        )
    )

    html_parts.append(
        _section(
            "Linked Facilities",
            linked_facilities,
            "facilities_confirmed",
            lambda entry: (
                f"{entry.get('type', 'facility')} | source={entry.get('sourceFile', '?')} "
                f"| chip={entry.get('chipId', '?')} | size={entry.get('mapSize', '?')}"
            ),
            "linked-facility-icon",
        )
    )

    html_parts.extend(
        [
            "    <script>",
            "    function filterIcons() {",
            "        const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();",
            "        const cards = document.querySelectorAll('.icon-card');",
            "",
            "        cards.forEach((card) => {",
            "            const name = (card.getAttribute('data-name') || '').toLowerCase();",
            "            const id = (card.getAttribute('data-id') || '').toLowerCase();",
            "            const category = (card.getAttribute('data-category') || '').toLowerCase();",
            "            const meta = (card.querySelector('.meta')?.textContent || '').toLowerCase();",
            "",
            "            if (",
            "                searchTerm === '' ||",
            "                name.includes(searchTerm) ||",
            "                id.includes(searchTerm) ||",
            "                category.includes(searchTerm) ||",
            "                meta.includes(searchTerm)",
            "            ) {",
            "                card.classList.remove('hidden');",
            "            } else {",
            "                card.classList.add('hidden');",
            "            }",
            "        });",
            "    }",
            "    </script>",
            "</body>",
            "</html>",
        ]
    )

    return "\n".join(html_parts) + "\n"


def write_previews(content: str, output_paths: list[Path]):
    for output_path in output_paths:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as file_obj:
            file_obj.write(content)
        print(f"HTML preview generated: {output_path}")


def main():
    workspace_root = Path(__file__).resolve().parents[2]
    manifest_path = workspace_root / "website_icons" / "manifest.json"
    linked_manifest_path = workspace_root / "website_icons" / "facilities_confirmed" / "manifest.json"

    if not manifest_path.exists():
        print(f"Error: {manifest_path} not found")
        print("Run: python export_website_icons.py first")
        return

    if not linked_manifest_path.exists():
        print(f"Error: {linked_manifest_path} not found")
        print("Run: python tools/asset_linker/export_facilities.py first")
        return

    html_content = generate_html_preview(manifest_path, linked_manifest_path)
    write_previews(
        html_content,
        [
            workspace_root / "website_icons" / "preview.html",
            workspace_root / "artifacts" / "kingdom-adventures" / "public" / "website_icons" / "preview.html",
        ],
    )

    print("Preview generation complete (both website_icons and public/website_icons).")


if __name__ == "__main__":
    main()
