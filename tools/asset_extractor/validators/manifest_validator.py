"""
manifest_validator.py — checks manifests for unresolved refs, missing sources,
and duplicate assetIds. Links unresolved entries to candidates from discovery.
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
from schema import AssetRef, REVIEW_AUTO


def validate(refs: list[AssetRef], write_output: bool = True) -> dict:
    """Returns a report dict with counts and details per issue type."""

    # Load candidate data if available
    candidates_by_res: dict[int, dict] = {}
    cand_path = config.DISCOVERY_DIR / "res_directory_candidates.json"
    if cand_path.exists():
        try:
            raw = json.loads(cand_path.read_text(encoding="utf-8"))
            for entry in raw:
                candidates_by_res[entry["res"]] = entry
        except Exception as e:
            warnings.warn(f"manifest_validator: cannot read res candidates: {e}")

    # Check for duplicate assetIds
    seen_ids: dict[str, list[str]] = {}
    for ref in refs:
        seen_ids.setdefault(ref.assetId, []).append(ref.category)
    duplicates = [
        {"assetId": aid, "categories": cats}
        for aid, cats in seen_ids.items()
        if len(cats) > 1
    ]

    # Categorise by reviewStatus
    unresolved_res: list[dict] = []
    missing_source: list[dict] = []
    res_variant_unknown: list[dict] = []

    for ref in refs:
        if ref.reviewStatus == "unresolved_res":
            cand = candidates_by_res.get(ref.rawRes or -1, {})
            unresolved_res.append({
                "assetId": ref.assetId,
                "rawRes":  ref.rawRes,
                "candidateDir": (cand.get("candidates") or [{}])[0].get("dir"),
                "candidateScore": (cand.get("candidates") or [{}])[0].get("matchScore"),
            })
        elif ref.reviewStatus == "missing_source":
            missing_source.append({
                "assetId":  ref.assetId,
                "category": ref.category,
            })
        elif ref.reviewStatus == "res_variant_unknown":
            res_variant_unknown.append({
                "assetId":  ref.assetId,
                "category": ref.category,
                "rawRes":   ref.rawRes,
            })

    report = {
        "total": len(refs),
        "auto": sum(1 for r in refs if r.reviewStatus == REVIEW_AUTO),
        "missingSource":      len(missing_source),
        "unresolvedRes":      len(unresolved_res),
        "resVariantUnknown":  len(res_variant_unknown),
        "duplicateAssetIds":  len(duplicates),
        "details": {
            "unresolved_res":      unresolved_res[:50],
            "missing_source":      missing_source[:50],
            "res_variant_unknown": res_variant_unknown[:50],
            "duplicate_asset_ids": duplicates[:20],
        },
    }

    if write_output:
        config.DISCOVERY_DIR.mkdir(parents=True, exist_ok=True)
        out_path = config.DISCOVERY_DIR / "manifest_validation_report.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)
        print(f"[manifest_validator] total={report['total']}  auto={report['auto']}  "
              f"missing={report['missingSource']}  unresolved_res={report['unresolvedRes']}  "
              f"duplicates={report['duplicateAssetIds']}")

    return report
