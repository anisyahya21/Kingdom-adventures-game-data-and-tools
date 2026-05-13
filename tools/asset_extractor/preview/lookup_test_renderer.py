"""
lookup_test_renderer.py — V3 visual validation.

Samples 20 rows from Item.csv and 20 from MapChip.csv.
For each, resolves the sprite and renders a standalone HTML table:
  Left col:  CSV data (id, name, iconU/iconV or img)
  Right col: sprite image (base64 embedded) or red "NOT FOUND" placeholder
Output:
  generated/previews/icon_lookup_test.html
  generated/previews/chip_lookup_test.html
"""

from __future__ import annotations
import base64
import io
import warnings
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef
from parsers.csv_parser import load_items, load_mapchips

_HTML_STYLE = """
<style>
  body { font-family: monospace; background:#1a1a2e; color:#ccc; margin:20px; }
  h2   { color:#adf; }
  table { border-collapse:collapse; margin-bottom:40px; }
  td,th { padding:6px 10px; border:1px solid #333; vertical-align:middle; }
  th { background:#2a2a4e; color:#8af; }
  .found   { background:#1a2e1a; }
  .missing { background:#2e1a1a; color:#f88; font-weight:bold; text-align:center; }
  .id      { color:#8af; }
  .name    { color:#ffa; }
  .coords  { color:#aaa; font-size:0.85em; }
  img      { image-rendering:pixelated; display:block; }
</style>
"""


def _sprite_to_base64(src_path: Path, rect) -> str | None:
    try:
        from PIL import Image
        with Image.open(src_path) as img:
            r = rect
            box = (r.x, r.y, r.x + r.w, r.y + r.h)
            cropped = img.crop(box).convert("RGBA")
            # Scale up to at least 60px for visibility
            scale = max(1, 60 // max(r.w, 1))
            if scale > 1:
                cropped = cropped.resize(
                    (cropped.width * scale, cropped.height * scale),
                    Image.NEAREST,
                )
            buf = io.BytesIO()
            cropped.save(buf, "PNG")
            return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception as e:
        warnings.warn(f"lookup_test_renderer: cannot crop sprite: {e}")
        return None


def _find_ref_for_uv(
    refs_by_uv: dict[tuple[int, int], list[AssetRef]],
    u: int | None,
    v: int | None,
) -> AssetRef | None:
    if u is None or v is None:
        return None
    return (refs_by_uv.get((u, v)) or [None])[0]


def _find_ref_for_img(
    refs_by_img: dict[int, list[AssetRef]],
    img: int | None,
) -> AssetRef | None:
    if img is None:
        return None
    return (refs_by_img.get(img) or [None])[0]


def _render_html(title: str, rows_html: list[str]) -> str:
    joined = "\n".join(rows_html)
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{title}</title>{_HTML_STYLE}</head>
<body>
<h2>{title}</h2>
<table>
<thead><tr><th>ID</th><th>Name</th><th>Coords</th><th>Sprite</th><th>AssetId</th></tr></thead>
<tbody>
{joined}
</tbody>
</table>
</body></html>"""


def render_lookup_tests(refs: list[AssetRef]) -> list[Path]:
    config.PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    # Build lookup indices
    refs_by_uv: dict[tuple[int, int], list[AssetRef]] = {}
    refs_by_chip_img: dict[int, list[AssetRef]] = {}

    for ref in refs:
        if ref.atlasCoords:
            key = (ref.atlasCoords.u, ref.atlasCoords.v)
            refs_by_uv.setdefault(key, []).append(ref)
        chip_ids = ref.gameDataLinks.get("mapchipIds", [])
        for cid in chip_ids:
            refs_by_chip_img.setdefault(cid, []).append(ref)

    # --- Item lookup test ---
    try:
        items = load_items(config.CSV_ITEM)
    except Exception:
        items = []

    sample_items = items[:20]
    item_rows: list[str] = []
    for item in sample_items:
        u, v = item.get("iconU"), item.get("iconV")
        ref = _find_ref_for_uv(refs_by_uv, u, v)
        if ref and ref.sourcePng and ref.rect:
            src = config.KA_ASSETS_DIR / ref.sourcePng
            b64 = _sprite_to_base64(src, ref.rect) if src.exists() else None
        else:
            b64 = None

        if b64:
            img_td = f'<td class="found"><img src="{b64}" width="60" height="60"></td>'
            aid_td = f'<td class="id">{ref.assetId}</td>'
        else:
            img_td = '<td class="missing">NOT FOUND</td>'
            aid_td = '<td class="missing">—</td>'

        item_rows.append(
            f'<tr>'
            f'<td class="id">{item["id"]}</td>'
            f'<td class="name">{item["name"]}</td>'
            f'<td class="coords">u={u} v={v}<br>cat={item.get("category")}</td>'
            f'{img_td}{aid_td}'
            f'</tr>'
        )

    icon_html = _render_html("Item Icon Lookup Test (first 20 items)", item_rows)
    icon_path = config.PREVIEWS_DIR / "icon_lookup_test.html"
    icon_path.write_text(icon_html, encoding="utf-8")
    written.append(icon_path)

    # --- MapChip lookup test ---
    try:
        chips = load_mapchips(config.CSV_MAPCHIP)
    except Exception:
        chips = []

    sample_chips = chips[:20]
    chip_rows: list[str] = []
    for chip in sample_chips:
        chip_id = chip["id"]
        chip_refs = refs_by_chip_img.get(chip_id, [])
        ref = chip_refs[0] if chip_refs else None
        if ref and ref.sourcePng and ref.rect:
            src = config.KA_ASSETS_DIR / ref.sourcePng
            b64 = _sprite_to_base64(src, ref.rect) if src.exists() else None
        else:
            b64 = None

        if b64:
            img_td = f'<td class="found"><img src="{b64}" width="60" height="60"></td>'
            aid_td = f'<td class="id">{ref.assetId}</td>'
        else:
            img_td = '<td class="missing">NOT FOUND</td>'
            aid_td = '<td class="missing">—</td>'

        chip_rows.append(
            f'<tr>'
            f'<td class="id">{chip_id}</td>'
            f'<td class="name">{chip.get("name","")}</td>'
            f'<td class="coords">img={chip.get("img")}<br>layer={chip.get("layer")}</td>'
            f'{img_td}{aid_td}'
            f'</tr>'
        )

    chip_html = _render_html("MapChip Lookup Test (first 20 chips)", chip_rows)
    chip_path = config.PREVIEWS_DIR / "chip_lookup_test.html"
    chip_path.write_text(chip_html, encoding="utf-8")
    written.append(chip_path)

    print(f"[lookup_test_renderer] wrote {len(written)} HTML files → {config.PREVIEWS_DIR}")
    return written
