import re
from pathlib import Path
from typing import Dict, List


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


def _parse_tab_sheet_rows(path: Path) -> List[List[str]]:
    if not path.exists():
        return []
    rows: List[List[str]] = []
    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip("\ufeff\n\r")
        if line:
            rows.append(line.split("\t"))
    return rows


def _load_sheet_index(project_root: Path) -> Dict:
    xls_root = project_root / "tmp" / "KA_assets" / "xls"
    locale_used = ""
    mapchip_path = None
    terrain_path = None

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
            "sourcePaths": {"mapchip": None, "terrain": None},
            "mapchipById": {},
            "terrainById": {},
        }

    mapchip_by_id: Dict[int, Dict] = {}
    terrain_by_id: Dict[int, Dict] = {}

    for row in _parse_tab_sheet_rows(mapchip_path):
        mapchip_id = _safe_int(row, 0)
        if mapchip_id < 0:
            continue
        mapchip_by_id[mapchip_id] = {
            "id": mapchip_id,
            "type": _safe_int(row, 1),
            "category": _safe_int(row, 2),
            "name": str(row[8]).strip() if len(row) > 8 else "",
            "res": _safe_int(row, 9),
            "relatedDataType": _safe_int(row, 15),
            "relatedDataId": _safe_int(row, 16),
            "layer": _safe_int(row, 20),
        }

    for row in _parse_tab_sheet_rows(terrain_path):
        terrain_id = _safe_int(row, 0)
        if terrain_id < 0:
            continue
        terrain_by_id[terrain_id] = {
            "id": terrain_id,
            "type": _safe_int(row, 1),
            "category": _safe_int(row, 2),
            "res": _safe_int(row, 5),
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


def _classify(sheet_mapchip: Dict, sheet_terrain: Dict | None) -> Dict:
    name = str(sheet_mapchip.get("name", "")).lower()
    related_type = int(sheet_mapchip.get("relatedDataType", -1))
    mapchip_type = int(sheet_mapchip.get("type", -1))
    mapchip_res = int(sheet_mapchip.get("res", -1))
    mapchip_layer = int(sheet_mapchip.get("layer", -1))

    evidence = [
        f"relatedDataType={related_type}",
        f"type={mapchip_type}",
        f"res={mapchip_res}",
        f"layer={mapchip_layer}",
    ]
    contradictions: List[str] = []
    class_key = "uncertainSpecial"
    confidence = 0.52

    if re.search(r"not used|unused|switch|remove|thick fog|resource", name):
        return {"classKey": "uncertainSpecial", "confidence": 0.95, "evidence": evidence + ["name_signal=special_or_unused"], "contradictions": contradictions}

    if related_type == 2:
        if sheet_terrain is None:
            return {"classKey": "uncertainSpecial", "confidence": 0.56, "evidence": evidence + ["missing_terrain_row_for_relatedDataType2"], "contradictions": ["terrain_reference_missing"]}
        terrain_type = int(sheet_terrain.get("type", -1))
        terrain_category = int(sheet_terrain.get("category", -1))
        evidence.extend([f"terrainType={terrain_type}", f"terrainCategory={terrain_category}"])
        if re.search(r"road|path|bridge|canal", name):
            return {"classKey": "baseWorldDefault", "confidence": 0.9, "evidence": evidence + ["connector_signal=base_world"], "contradictions": contradictions}
        if re.search(r"water|swamp|snow|volcano|cliff|rock|sand|grass|dirt|wasteland|burn|cave", name):
            return {"classKey": "natureEnvironment", "confidence": 0.88, "evidence": evidence + ["biome_signal=nature_environment"], "contradictions": contradictions}
        if mapchip_layer in {0, 1} and mapchip_res in {9, 20}:
            return {"classKey": "baseWorldDefault", "confidence": 0.84, "evidence": evidence + ["sheet_layer_res_signal=base_world"], "contradictions": contradictions}
        return {"classKey": "baseWorldDefault", "confidence": 0.68, "evidence": evidence + ["terrain_link_fallback=base_world"], "contradictions": contradictions}

    if related_type == 1:
        if re.search(r"wall|gate|fence|bridge|door|entrance|construction|site|boundary|floor|corridor|hall", name) or mapchip_type in {22, 25, 28, 30}:
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
        if re.search(r"grass|sand|snow|swamp|volcano|rock|water|soil", name):
            contradictions.append("nature_name_with_facility_link")
        return {"classKey": class_key, "confidence": confidence, "evidence": evidence, "contradictions": contradictions}

    return {"classKey": "uncertainSpecial", "confidence": 0.58, "evidence": evidence + ["unsupported_related_data_type"], "contradictions": contradictions}


def analyze_sheet_grounded_layer_classification(summary_regions: List[Dict], project_root: Path) -> Dict:
    sheet_index = _load_sheet_index(project_root)
    if not bool(sheet_index.get("available")):
        return {
            "available": False,
            "message": "MapChip/Terrain sheets unavailable in tmp/KA_assets/xls",
            "sourcePaths": sheet_index.get("sourcePaths", {}),
            "classificationTable": [],
            "entries": [],
            "contradictions": [],
            "missingEvidence": [],
            "counts": {},
            "confidence": {"overall": 0.0},
        }

    observed_f2_ids = set()
    for region in summary_regions:
        for f2 in region.get("f2Ids", []):
            try:
                observed_f2_ids.add(int(f2))
            except (TypeError, ValueError):
                pass

    classes = ["baseWorldDefault", "natureEnvironment", "buildOnlyFacility", "structureAssembly", "uncertainSpecial"]
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
    bucket_confidences = {key: [] for key in classes}
    entries: List[Dict] = []
    contradictions: List[Dict] = []
    missing_evidence: List[Dict] = []

    for mapchip_id in sorted(observed_f2_ids):
        row = mapchip_by_id.get(mapchip_id)
        if row is None:
            bucket_counts["uncertainSpecial"] += 1
            bucket_confidences["uncertainSpecial"].append(0.35)
            missing_evidence.append({"mapChipId": int(mapchip_id), "reason": "mapchip_row_missing"})
            entries.append({"mapChipId": int(mapchip_id), "mapChipName": "", "classKey": "uncertainSpecial", "classLabel": labels["uncertainSpecial"], "confidence": 0.35, "evidence": ["mapchip_row_missing"], "sheetFields": {}})
            continue

        terrain_row = None
        related_type = int(row.get("relatedDataType", -1))
        related_id = int(row.get("relatedDataId", -1))
        if related_type == 2 and related_id >= 0:
            terrain_row = terrain_by_id.get(related_id)
            if terrain_row is None:
                missing_evidence.append({"mapChipId": int(mapchip_id), "mapChipName": str(row.get("name", "")), "reason": "terrain_row_missing_for_relatedDataType2", "relatedDataId": int(related_id)})

        classified = _classify(row, terrain_row)
        class_key = str(classified.get("classKey", "uncertainSpecial"))
        confidence = float(classified.get("confidence", 0.0))
        if class_key not in bucket_counts:
            class_key = "uncertainSpecial"

        bucket_counts[class_key] += 1
        bucket_confidences[class_key].append(confidence)

        item = {
            "mapChipId": int(mapchip_id),
            "mapChipName": str(row.get("name", "")),
            "classKey": class_key,
            "classLabel": labels.get(class_key, class_key),
            "confidence": confidence,
            "evidence": classified.get("evidence", []),
            "sheetFields": {
                "type": int(row.get("type", -1)),
                "category": int(row.get("category", -1)),
                "res": int(row.get("res", -1)),
                "relatedDataType": int(row.get("relatedDataType", -1)),
                "relatedDataId": int(row.get("relatedDataId", -1)),
                "layer": int(row.get("layer", -1)),
            },
        }
        entries.append(item)
        for reason in classified.get("contradictions", []):
            contradictions.append({"mapChipId": int(mapchip_id), "mapChipName": str(row.get("name", "")), "classKey": class_key, "reason": str(reason)})

    total = max(1, sum(bucket_counts.values()))
    classification_table = []
    for class_key in classes:
        confidence_values = bucket_confidences[class_key]
        classification_table.append(
            {
                "classKey": class_key,
                "classLabel": labels[class_key],
                "count": int(bucket_counts[class_key]),
                "share": float(round(float(bucket_counts[class_key]) / float(total), 4)),
                "averageConfidence": float(round(sum(confidence_values) / max(1, len(confidence_values)), 4)),
            }
        )

    strongest = sorted(entries, key=lambda item: (-float(item.get("confidence", 0.0)), int(item.get("mapChipId", -1))))[:120]
    overall_confidence = sum(sum(vals) for vals in bucket_confidences.values()) / max(1, sum(len(vals) for vals in bucket_confidences.values()))

    return {
        "available": True,
        "locale": sheet_index.get("locale"),
        "sourcePaths": sheet_index.get("sourcePaths", {}),
        "classificationTable": classification_table,
        "counts": bucket_counts,
        "entries": entries,
        "strongestCandidates": strongest,
        "contradictions": contradictions,
        "missingEvidence": missing_evidence,
        "confidence": {"overall": float(round(overall_confidence, 4))},
    }
