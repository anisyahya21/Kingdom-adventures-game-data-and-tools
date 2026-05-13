"""
candidate_report.py — V4 visual validation.

For every missing_source and unresolved_res AssetRef, renders an HTML report row:
  - Raw CSV data
  - All candidate sprite thumbnails (base64)
  - Confidence badge: HIGH / MEDIUM / LOW / UNKNOWN

Output: generated/previews/candidate_mapping_report.html
Purpose: manual decision aid for filling in RES_OVERRIDES / ITEM_SHEET_OVERRIDES
"""

from __future__ import annotations
import base64
import io
import json
import warnings
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef, REVIEW_MISSING_SOURCE, REVIEW_UNRESOLVED_RES

_BADGE_CSS = {
    "HIGH":    "background:#2a5a2a; color:#6f6; border:1px solid #4a8; padding:2px 8px; border-radius:4px;",
    "MEDIUM":  "background:#5a5a1a; color:#ff6; border:1px solid #aa4; padding:2px 8px; border-radius:4px;",
    "LOW":     "background:#5a2a1a; color:#fa6; border:1px solid #a64; padding:2px 8px; border-radius:4px;",
    "UNKNOWN": "background:#333; color:#aaa; border:1px solid #555; padding:2px 8px; border-radius:4px;",
}

_HTML_STYLE = """
<style>
  body { font-family: monospace; background:#1a1a2e; color:#ccc; margin:20px; }
  h2   { color:#adf; }
  h3   { color:#ffa; margin-top:30px; }
  table { border-collapse:collapse; width:100%; margin-bottom:30px; }
  td,th { padding:8px 12px; border:1px solid #333; vertical-align:top; }
  th    { background:#2a2a4e; color:#8af; }
  .asset-id   { color:#8af; font-size:0.9em; }
  .raw-res    { color:#f88; }
  .candidate  { display:inline-block; margin:4px; text-align:center; }
  .candidate img { display:block; image-rendering:pixelated; }
  .candidate small { display:block; color:#888; font-size:0.75em; }
  .override   { background:#1a2030; color:#6cf; font-size:0.85em; padding:4px 8px; border-radius:4px; }
  pre { margin:0; }
</style>
"""


def _thumb(png_path: Path, size: int = 48) -> str | None:
    try:
        from PIL import Image
        with Image.open(png_path) as img:
            img.thumbnail((size, size), Image.NEAREST)
            buf = io.BytesIO()
            img.save(buf, "PNG")
            return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


def _score_label(score: float) -> str:
    if score >= 0.7:
        return "HIGH"
    if score >= 0.4:
        return "MEDIUM"
    if score > 0:
        return "LOW"
    return "UNKNOWN"


def render_candidate_report(refs: list[AssetRef]) -> Path:
    config.PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

    # Load discovery data
    res_candidates: dict[int, list[dict]] = {}
    cand_path = config.DISCOVERY_DIR / "res_directory_candidates.json"
    if cand_path.exists():
        try:
            for entry in json.loads(cand_path.read_text(encoding="utf-8")):
                res_candidates[entry["res"]] = entry.get("candidates", [])
        except Exception:
            pass

    icon_path = config.DISCOVERY_DIR / "unknown_item_icon_sources.json"
    icon_candidates: list[dict] = []
    if icon_path.exists():
        try:
            data = json.loads(icon_path.read_text(encoding="utf-8"))
            icon_candidates = data.get("candidates", [])
        except Exception:
            pass

    unresolved_refs = [
        r for r in refs
        if r.reviewStatus in (REVIEW_MISSING_SOURCE, REVIEW_UNRESOLVED_RES)
    ]

    rows_html: list[str] = []

    for ref in unresolved_refs[:200]:  # cap to avoid huge file
        # Determine candidates
        thumbnails_html = ""
        override_hint = ""

        if ref.reviewStatus == REVIEW_UNRESOLVED_RES:
            raw_res = ref.rawRes
            cands = res_candidates.get(raw_res or -1, [])
            for cand in cands[:4]:
                dir_name = cand.get("dir", "")
                score = cand.get("matchScore", 0.0)
                label = _score_label(score)
                badge = f'<span style="{_BADGE_CSS[label]}">{label} {score:.2f}</span>'
                # Sample PNG from this dir
                d = config.KA_ASSETS_DIR / dir_name
                sample_png = next(d.glob("*.png"), None) if d.is_dir() else None
                b64 = _thumb(sample_png) if sample_png else None
                img_tag = f'<img src="{b64}" width="48" height="48">' if b64 else "🖼"
                thumbnails_html += (
                    f'<div class="candidate">{img_tag}'
                    f'<small>{dir_name}</small>{badge}</div>'
                )
            if cands:
                best = cands[0]["dir"]
                override_hint = f'<div class="override">RES_OVERRIDES[{raw_res}] = "{best}"</div>'
            else:
                override_hint = f'<div class="override" style="color:#f88;">No candidates — add manually</div>'

        elif ref.reviewStatus == REVIEW_MISSING_SOURCE:
            for cand in icon_candidates[:3]:
                path_str = cand.get("path", "")
                score = cand.get("score", 0.0)
                label = _score_label(score)
                badge = f'<span style="{_BADGE_CSS[label]}">{label} {score:.2f}</span>'
                png_path = config.KA_ASSETS_DIR / path_str
                b64 = _thumb(png_path) if png_path.exists() else None
                img_tag = f'<img src="{b64}" width="48" height="48">' if b64 else "🖼"
                thumbnails_html += (
                    f'<div class="candidate">{img_tag}'
                    f'<small>{path_str}</small>{badge}</div>'
                )

        rows_html.append(
            f'<tr>'
            f'<td class="asset-id">{ref.assetId}<br>'
            f'<small style="color:#f88">{ref.reviewStatus}</small></td>'
            f'<td class="raw-res">res={ref.rawRes}<br>cat={ref.category}</td>'
            f'<td>{thumbnails_html or "<span style=\'color:#888\'>none</span>"}</td>'
            f'<td>{override_hint}</td>'
            f'</tr>'
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Candidate Mapping Report</title>{_HTML_STYLE}</head>
<body>
<h2>Candidate Mapping Report</h2>
<p style="color:#aaa">{len(unresolved_refs)} unresolved/missing entries (showing first 200)</p>
<table>
<thead><tr><th>AssetId</th><th>Raw Res / Category</th><th>Candidates</th><th>Override Snippet</th></tr></thead>
<tbody>
{"".join(rows_html)}
</tbody>
</table>
</body></html>"""

    out_path = config.PREVIEWS_DIR / "candidate_mapping_report.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"[candidate_report] {len(unresolved_refs)} entries → {out_path}")
    return out_path
