"""
job_res_reporter.py — groups Job.csv rows by res* sub-variant values
and outputs a human-readable JSON report without guessing.

Meaning of resHead, resBody, resHand, resFoot values is NOT decoded here.
Raw values are preserved verbatim for manual review.
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path
from collections import defaultdict

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

import config
from parsers.csv_parser import load_jobs


def run(write_output: bool = True) -> dict:
    """
    Groups jobs by each res* field value.
    Returns {
      "resHead":  {res_value -> {jobs: [{id, name}], sampleImgIds: [...], candidateDir: str|null}},
      "resBody":  {...},
      "resHand":  {...},
      "resFoot":  {...},
    }
    """
    config.DISCOVERY_DIR.mkdir(parents=True, exist_ok=True)

    try:
        jobs = load_jobs(config.CSV_JOB)
    except Exception as e:
        warnings.warn(f"job_res_reporter: cannot load Job.csv: {e}")
        jobs = []

    groups: dict[str, dict[int, dict]] = {
        "resHead": defaultdict(lambda: {"jobs": [], "sampleImgIds": []}),
        "resBody": defaultdict(lambda: {"jobs": [], "sampleImgIds": []}),
        "resHand": defaultdict(lambda: {"jobs": [], "sampleImgIds": []}),
        "resFoot": defaultdict(lambda: {"jobs": [], "sampleImgIds": []}),
    }

    img_field_map = {
        "resHead": "imgHeads",
        "resBody": "imgBodys",
        "resHand": "imgHands",
        "resFoot": "imgFoots",
    }

    for job in jobs:
        job_id = job["id"]
        job_name = job["name"]
        for res_field, img_field in img_field_map.items():
            res_val = job.get(res_field)
            if res_val is None:
                continue
            grp = groups[res_field][res_val]
            if len(grp["jobs"]) < 8:
                grp["jobs"].append({"id": job_id, "name": job_name})
            imgs = [i for i in (job.get(img_field) or []) if i is not None]
            for img in imgs:
                if img not in grp["sampleImgIds"] and len(grp["sampleImgIds"]) < 8:
                    grp["sampleImgIds"].append(img)

    # Convert defaultdicts to plain dicts; add candidateDir from config.RES_RESOLVED
    output: dict[str, list[dict]] = {}
    for res_field, by_res in groups.items():
        entries = []
        for res_val, grp in sorted(by_res.items()):
            candidate_dir = config.RES_RESOLVED.get(res_val) or config.RES_SEEDS.get(res_val)
            entries.append({
                "resValue":    res_val,
                "resField":    res_field,
                "jobCount":    len(grp["jobs"]),
                "jobs":        grp["jobs"],
                "sampleImgIds": grp["sampleImgIds"],
                "candidateDir": candidate_dir,
                "status":      "confirmed" if candidate_dir else "unresolved",
            })
        output[res_field] = entries

    if write_output:
        out_path = config.DISCOVERY_DIR / "job_res_groups.json"
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump(output, fh, indent=2)
        print(f"[job_res_reporter] wrote {out_path}")
        for field, entries in output.items():
            unresolved = [e for e in entries if e["status"] == "unresolved"]
            print(f"  {field}: {len(entries)} distinct values, {len(unresolved)} unresolved")

    return output
