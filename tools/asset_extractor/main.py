"""
main.py — CLI entry point for the KA asset extraction pipeline.

Usage:
  python main.py discover
  python main.py extract [--category CATEGORY [CATEGORY ...] | --all]
  python main.py validate
  python main.py preview --type overlay|sheet|lookup|candidates|mapchip|charstack|all
  python main.py info <file>
  python main.py stats
  python main.py inspector [--port PORT]
"""

from __future__ import annotations
import argparse
import json
import sys
import warnings
from pathlib import Path

# Force UTF-8 output on Windows consoles so → and — don't crash.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Ensure repo root is on the path so sub-modules can import config / schema
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import config
from schema import AssetRef


# ---------------------------------------------------------------------------
# Sub-command handlers
# ---------------------------------------------------------------------------

def cmd_discover(args) -> None:
    """Run all 3 discovery passes."""
    print("=== Running discovery passes ===")
    from extractors.discovery.res_mapper import run as run_res_mapper
    run_res_mapper()

    from extractors.discovery.icon_sheet_finder import run as run_icon_finder
    run_icon_finder()

    from extractors.discovery.job_res_reporter import run as run_job_reporter
    run_job_reporter()

    print("\n[discover] done — review generated/discovery/ for results")


def cmd_extract(args) -> None:
    """Build asset registry and domain manifests. Crop sprites if --sprites."""
    # Run discovery first to populate RES_RESOLVED
    from extractors.discovery.res_mapper import run as run_res_mapper
    run_res_mapper(write_output=False)

    categories = None
    if hasattr(args, "category") and args.category:
        categories = args.category

    print(f"=== Extracting {'all categories' if not categories else categories} ===")

    from extractors.asset_registry import build_registry, save_registry
    refs = build_registry(categories=categories)

    config.MAPPINGS_DIR.mkdir(parents=True, exist_ok=True)
    reg_path = save_registry(refs)
    print(f"[extract] asset_registry.json → {reg_path}  ({len(refs)} refs)")

    from extractors.manifest_generator import generate_all
    generate_all(refs)

    if getattr(args, "sprites", False):
        from extractors.sprite_extractor import extract_all
        counts = extract_all(refs)
        print(f"[extract] sprites: ok={counts['ok']}  skipped={counts['skipped']}  error={counts['error']}")

    if getattr(args, "atlas", False):
        from extractors.atlas_extractor import extract_all_atlases
        extract_all_atlases()

    print("\n[extract] done")


def cmd_validate(args) -> None:
    """Run bounds + manifest validation."""
    refs = _load_registry()
    if refs is None:
        return

    from validators.bounds_validator import validate as validate_bounds
    errors = validate_bounds(refs)

    from validators.manifest_validator import validate as validate_manifest
    report = validate_manifest(refs)

    if errors:
        print(f"[validate] {len(errors)} bounds errors — see generated/discovery/bounds_errors.json")
    else:
        print("[validate] bounds: OK")

    print(f"[validate] manifest: {report['auto']} auto, "
          f"{report['unresolvedRes']} unresolved_res, "
          f"{report['missingSource']} missing_source, "
          f"{report['duplicateAssetIds']} duplicate ids")


def cmd_preview(args) -> None:
    """Generate visual preview outputs."""
    ptype = getattr(args, "type", "all")
    refs = _load_registry()
    if refs is None:
        return

    types_to_run = {ptype} if ptype != "all" else {
        "overlay", "sheet", "lookup", "candidates", "mapchip", "charstack"
    }

    if "overlay" in types_to_run:
        from preview.overlay_renderer import render_overlays
        cats = getattr(args, "category", None)
        render_overlays(refs, categories=cats)

    if "sheet" in types_to_run:
        from preview.contact_sheet import render_contact_sheets
        cats = getattr(args, "category", None)
        render_contact_sheets(refs, categories=cats)

    if "lookup" in types_to_run:
        from preview.lookup_test_renderer import render_lookup_tests
        render_lookup_tests(refs)

    if "candidates" in types_to_run:
        from preview.candidate_report import render_candidate_report
        render_candidate_report(refs)

    if "mapchip" in types_to_run:
        from preview.mapchip_grid import render_mapchip_grid
        render_mapchip_grid(refs)

    if "charstack" in types_to_run:
        from preview.char_stack_test import render_char_stacks
        render_char_stacks(refs)

    print("\n[preview] done — see generated/previews/")


def cmd_info(args) -> None:
    """Debug a single .opt, .inf, or ImageAtlas*.txt file."""
    file_path = Path(args.file)
    if not file_path.is_absolute():
        file_path = config.KA_ASSETS_DIR / args.file

    suffix = file_path.suffix.lower()
    name = file_path.name.lower()

    if suffix == ".opt":
        from parsers.opt_parser import parse_opt
        data = parse_opt(file_path, debug_hex=True)
        print(f"\ncols={data['cols']}  rows={data['rows']}  sprites={len(data['sprites'])}")
        for s in data["sprites"][:10]:
            print(f"  u={s['u']:2d} v={s['v']:2d}  x={s['x']:4d} y={s['y']:4d}  {s['w']}×{s['h']}")
        if len(data["sprites"]) > 10:
            print(f"  ... ({len(data['sprites'])} total)")

    elif suffix == ".inf" and "optimize" in name:
        from parsers.inf_parser import parse_optimize_inf
        data = parse_optimize_inf(file_path)
        for k, v in data.items():
            print(f"  {k} = {v}")

    elif suffix == ".inf":
        from parsers.inf_parser import parse_img_inf
        data = parse_img_inf(file_path)
        print(f"  {len(data)} entries")
        for entry_id, fname in sorted(data.items())[:30]:
            print(f"  [{entry_id:4d}] {fname}")
        if len(data) > 30:
            print(f"  ... ({len(data)} total)")

    elif "imageatlas" in name and suffix == ".txt":
        from parsers.atlas_parser import parse_atlas_txt
        sprites = parse_atlas_txt(file_path)
        print(f"  {len(sprites)} sprites")
        for s in sprites[:15]:
            print(f"  {s.filename}  x={s.x} y={s.y} w={s.w} h={s.h}")
        if len(sprites) > 15:
            print(f"  ... ({len(sprites)} total)")

    elif suffix == ".map":
        from parsers.map_parser import MapFile
        mf = MapFile(file_path)
        mf.load()
        info = mf.parse_header()
        for k, v in info.items():
            print(f"  {k}: {v}")

    else:
        print(f"[info] unrecognised file type: {suffix} — try .opt, .inf, ImageAtlas*.txt, .map")


def cmd_stats(args) -> None:
    """Print counts per category + reviewStatus totals."""
    refs = _load_registry()
    if refs is None:
        return

    from collections import Counter
    by_cat: Counter = Counter(r.category for r in refs)
    by_status: Counter = Counter(r.reviewStatus for r in refs)

    print(f"\nTotal AssetRefs: {len(refs)}")
    print("\nBy reviewStatus:")
    for status, count in sorted(by_status.items()):
        bar = "█" * min(40, count // max(1, len(refs) // 40))
        print(f"  {status:<25} {count:5d}  {bar}")

    print("\nBy category (top 30):")
    for cat, count in by_cat.most_common(30):
        bar = "█" * min(40, count // max(1, len(refs) // 40))
        print(f"  {cat:<25} {count:5d}  {bar}")


def cmd_inspector(args) -> None:
    """Launch the localhost visual inspector web app."""
    port = getattr(args, "port", 8765)
    from inspector.server import serve
    serve(port=port)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_registry() -> list[AssetRef] | None:
    reg_path = config.MAPPINGS_DIR / "asset_registry.json"
    if not reg_path.exists():
        print(f"[error] asset_registry.json not found — run `python main.py extract` first")
        return None
    try:
        raw = json.loads(reg_path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[error] cannot read asset_registry.json: {e}")
        return None

    refs = []
    for d in raw:
        from schema import Rect, AtlasCoords
        ref = AssetRef(
            assetId=d.get("assetId", ""),
            category=d.get("category", ""),
            subCategory=d.get("subCategory", ""),
            sourcePng=d.get("sourcePng"),
            spriteName=d.get("spriteName", ""),
            atlasCoords=AtlasCoords(**d["atlasCoords"]) if d.get("atlasCoords") else None,
            rect=Rect(**d["rect"]) if d.get("rect") else None,
            layer=d.get("layer", ""),
            tags=d.get("tags", []),
            gameDataLinks=d.get("gameDataLinks", {}),
            reviewStatus=d.get("reviewStatus", "auto"),
            rawRes=d.get("rawRes"),
        )
        refs.append(ref)
    return refs


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python main.py",
        description="KA Asset Extraction Pipeline",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # discover
    sub.add_parser("discover", help="Run all 3 discovery passes (res mapper, icon finder, job res groups)")

    # extract
    p_ext = sub.add_parser("extract", help="Build asset registry and domain manifests")
    p_ext.add_argument("--category", nargs="+", metavar="CAT",
                       help="Only process these categories (default: all)")
    p_ext.add_argument("--sprites", action="store_true", help="Also crop and save sprite PNGs")
    p_ext.add_argument("--atlas", action="store_true", help="Also extract ImageAtlas sprites")

    # validate
    sub.add_parser("validate", help="Run bounds + manifest validation")

    # preview
    p_pre = sub.add_parser("preview", help="Generate visual preview outputs")
    p_pre.add_argument(
        "--type", default="all",
        choices=["overlay", "sheet", "lookup", "candidates", "mapchip", "charstack", "all"],
        help="Which preview type to generate (default: all)",
    )
    p_pre.add_argument("--category", nargs="+", metavar="CAT",
                       help="Limit to these categories (for overlay/sheet)")

    # info
    p_info = sub.add_parser("info", help="Debug a single asset file")
    p_info.add_argument("file", help="Path to .opt / .inf / ImageAtlas*.txt / .map file")

    # stats
    sub.add_parser("stats", help="Print counts per category and reviewStatus")

    # inspector
    p_ins = sub.add_parser("inspector", help="Launch the localhost visual inspector")
    p_ins.add_argument("--port", type=int, default=8765, help="Port to listen on (default: 8765)")

    return parser


if __name__ == "__main__":
    parser = build_parser()
    args = parser.parse_args()

    dispatch = {
        "discover":  cmd_discover,
        "extract":   cmd_extract,
        "validate":  cmd_validate,
        "preview":   cmd_preview,
        "info":      cmd_info,
        "stats":     cmd_stats,
        "inspector": cmd_inspector,
    }

    handler = dispatch.get(args.command)
    if handler:
        handler(args)
    else:
        parser.print_help()
