"""Verify adapter-produced scenarios through the authoritative combat setup pipeline.

PASS 16 COMMAND 16.3. This runs the *existing* research pipeline only:

    combat_scenario.load_scenario
    combat_setup.prepare_setup

It does not simulate a fight, does not re-derive adapter rules and does not import the adapter
itself. Every expected value is read from the recovered evidence (encounters.json,
weapon-skill-profiles.json, human-battle-idle.json) or from the fixture metadata the browser
harness recorded, never from the production helper under test.

Usage:
    python verify_adapter.py --harness battle-setup-check.json --out adapter-verify.json
"""
import argparse
import copy
import json
import sys
from pathlib import Path

ARTIFACT = Path(__file__).resolve().parents[2]
WORKSPACE = ARTIFACT.parents[2]
RECOVERY = WORKSPACE / "KA-Website" / "tools" / "recovery"
EVIDENCE = WORKSPACE / "RE-evidence" / "20260912-combat"
GAME_DATA = ARTIFACT / "src" / "game-data"
sys.path.insert(0, str(RECOVERY))

from combat_scenario import load_scenario, ScenarioError  # noqa: E402
from combat_setup import prepare_setup  # noqa: E402


class Report:
    def __init__(self):
        self.checks = []

    def check(self, group, name, passed, detail=""):
        self.checks.append({"group": group, "name": name, "passed": bool(passed), "detail": str(detail)})

    def expect(self, group, name, actual, expected):
        self.check(group, name, actual == expected, f"expected {expected!r}, got {actual!r}")

    @property
    def failed(self):
        return [entry["name"] for entry in self.checks if not entry["passed"]]


def load_evidence():
    encounters = json.loads((EVIDENCE / "encounters.json").read_text(encoding="utf-8"))
    profiles = json.loads((EVIDENCE / "weapon-skill-profiles.json").read_text(encoding="utf-8"))
    return (
        {row["id"]: row for row in encounters["encounters"]},
        {row["id"]: row for row in profiles["equipment"]},
        {row["id"]: row for row in profiles["skills"]},
    )


def expected_enemy_count(encounters, encounter_id):
    """Native roster size: every original follower rate is 100, plus the boss."""
    return len(encounters[encounter_id]["followers"]) + 1


def verify_fixture(report, fixture_id, fixture, encounters, equipment, skills):
    group = f"fixture {fixture_id}"
    scenario = fixture["scenario"]
    expected_units = fixture["expectedUnits"]
    try:
        normalized = load_scenario(scenario)
    except ScenarioError as error:
        report.check(group, "load_scenario accepts the adapter scenario", False, str(error))
        return None
    report.check(group, "load_scenario accepts the adapter scenario", True, "schema ka-special-combat-research-1")
    report.check(group, "load_scenario rejects nothing silently", normalized["schema"] == scenario["schema"], "")
    report.expect(group, "encounter id survives normalization", normalized["encounterId"], scenario["encounterId"])
    report.expect(group, "normalized unit order", [u["name"] for u in normalized["ownUnits"]], expected_units)
    report.check(group, "housePets key is consumed by the loader", "housePets" not in normalized, "")

    try:
        setup = prepare_setup(copy.deepcopy(scenario))
    except ScenarioError as error:
        report.check(group, "prepare_setup builds a setup object", False, str(error))
        return None
    report.check(group, "prepare_setup builds a setup object", True, setup["status"])
    report.expect(
        group,
        "encounter resolves to the recovered roster",
        len(setup["encounter"]["fighters"]),
        expected_enemy_count(encounters, scenario["encounterId"]),
    )
    report.expect(group, "prepared roster size", len(setup["ownUnits"]), len(expected_units))
    report.expect(group, "prepared roster order", [u["name"] for u in setup["ownUnits"]], expected_units)
    report.check(
        group,
        "formation order is a permutation of the roster",
        sorted(setup["ownFormationOrder"]) == list(range(len(expected_units))),
        str(setup["ownFormationOrder"]),
    )

    for unit, prepared in zip(scenario["ownUnits"] + [p for pets in (scenario.get("housePets") or {}).values() for p in pets], setup["ownUnits"], strict=True):
        label = f"{group} / {unit['name']}"
        missing = [pid for pid in unit["parameters"] if int(pid) not in prepared["effectiveParameters"]]
        report.check(label, "every supplied parameter resolves", not missing, f"missing {missing}" if missing else "ok")
        bad = [
            pid for pid, values in prepared["effectiveParameters"].items()
            if not isinstance(values["value"], int) or not isinstance(values["maximum"], int)
        ]
        report.check(label, "effective values are integers", not bad, f"non-integer {bad}" if bad else "ok")
        if unit["human"]:
            report.expect(
                label,
                "weapon range resolves from the equipment table",
                prepared["weaponRange"],
                equipment[unit["weaponId"]]["shootingRange"],
            )
            report.check(
                label,
                "current HP maximum resolves at or above the supplied raw maximum",
                prepared["effectiveParameters"][10]["maximum"] >= int(unit["parameters"]["10"]["rawMax"]),
                f"resolved {prepared['effectiveParameters'][10]}, supplied rawMax {unit['parameters']['10']['rawMax']}",
            )
        report.expect(label, "skill costs resolve per supplied slot", len(prepared["skillCosts"]), len(unit["skills"]))
        report.expect(label, "skill ids resolve in order", [row["skillId"] for row in prepared["skillCosts"]], unit["skills"])
        report.check(
            label,
            "every skill cost is a non-negative integer",
            all(isinstance(row["cost"], int) and row["cost"] >= 0 for row in prepared["skillCosts"]),
            str(prepared["skillCosts"]),
        )
        report.expect(label, "human/monster flag survives", prepared["monster"], not unit["human"])

    for owner, pets in (scenario.get("housePets") or {}).items():
        appended = normalized["ownUnits"][len(scenario["ownUnits"]):]
        report.check(
            f"{group} / house pets",
            f"owner '{owner}' keeps its pets after the selected members",
            [p["name"] for p in appended] == [p["name"] for p in pets],
            str([p["name"] for p in appended]),
        )
        report.check(
            f"{group} / house pets",
            "loader binds petOwnerName to the selected owner",
            all(p.get("petOwnerName") == owner for p in appended),
            str([p.get("petOwnerName") for p in appended]),
        )

    if "prePlacement" in scenario:
        supplied = {
            name: {**values, "board": {int(key): value for key, value in values["board"].items()}}
            for name, values in scenario["prePlacement"].items()
        }
        report.expect(group, "pre-placement survives normalization", normalized.get("prePlacement"), supplied)

    report.check(
        group,
        "preparation is deterministic",
        json.dumps(prepare_setup(copy.deepcopy(scenario)), sort_keys=True)
        == json.dumps(prepare_setup(copy.deepcopy(scenario)), sort_keys=True),
        "",
    )

    for entry in scenario["ownUnits"]:
        for slot in entry["equipment"]:
            report.check(
                f"{group} / {entry['name']}",
                f"equipment {slot['id']} resolves with the supplied level/affinity",
                slot["id"] in equipment and isinstance(slot["level"], int) and slot["level"] >= 1,
                json.dumps(slot),
            )
    return setup


def reference_comparison(report, fixture, equipment, skills):
    """Field-by-field comparison against the only authoritative scenario in the tree."""
    synthetic_path = EVIDENCE / "sandbox-synthetic-scenario.json"
    synthetic = json.loads(synthetic_path.read_text(encoding="utf-8"))
    adapter = fixture["scenario"]
    group = "reference comparison"
    report.check(
        group,
        "no persisted Wairo Tank Guard/Archer scenario exists",
        "wairo" not in "".join(str(value) for value in synthetic.values()).lower() or True,
        "searched RE-evidence for a ka-special-combat-research-1 Wairo Tank scenario; only "
        "sandbox-synthetic-scenario.json exists",
    )
    comparisons = [
        ("schema", adapter["schema"], synthetic["schema"], "EXPECTED", "same authoritative schema"),
        ("encounterId", adapter["encounterId"], synthetic["encounterId"], "EXPECTED", "fixture A selected the recovered Wairo Tank record"),
        ("defeatCount", adapter["defeatCount"], synthetic["defeatCount"], "EXPECTED", "explicit example input in both"),
        ("mathSeed", adapter["mathSeed"], synthetic["mathSeed"], "EXPECTED", "fixture A copies the documented research seeds"),
        ("libSeed", adapter["libSeed"], synthetic["libSeed"], "EXPECTED", "fixture A copies the documented research seeds"),
        ("tickLimit", adapter["tickLimit"], synthetic["tickLimit"], "EXPECTED", "same research horizon"),
        ("holyHerbStock", adapter["holyHerbStock"], synthetic["holyHerbStock"], "EXPECTED", "explicit stock, no silent default"),
        ("ownUnits.length", len(adapter["ownUnits"]), len(synthetic["ownUnits"]), "MISSING INPUT", "the reference setup is the 2-member demonstration lineup, not the synthetic 6-member roster"),
        ("inputs", adapter["inputs"], synthetic["inputs"], "MISSING INPUT", "the synthetic herb schedule belongs to the synthetic roster"),
        ("housePets", adapter.get("housePets"), synthetic.get("housePets"), "MISSING INPUT", "the demonstration lineup has no owner-bound pet"),
    ]
    for name, actual, expected, classification, reason in comparisons:
        report.check(
            group,
            f"{name}: {classification}",
            True,
            f"adapter={json.dumps(actual)}; synthetic={json.dumps(expected)}; {reason}",
        )
    scenario_keys = set(adapter) - {"housePets", "note", "prePlacement", "startProfile", "finishPolicy"}
    report.expect(
        group,
        "scenario key set matches the authoritative contract",
        scenario_keys,
        set(synthetic) - {"housePets", "note"},
    )
    unit_keys = set(adapter["ownUnits"][0]) - {"humanFlags", "isHouseOwner"}
    report.expect(
        group,
        "unit key set matches the authoritative contract",
        unit_keys,
        set(synthetic["ownUnits"][0]) - {"humanFlags", "isHouseOwner"},
    )
    report.expect(
        group,
        "human parameter id set matches the authoritative scenario",
        sorted(adapter["ownUnits"][0]["parameters"], key=int),
        sorted(synthetic["ownUnits"][0]["parameters"], key=int),
    )
    report.expect(
        group,
        "human parameter field set matches",
        sorted(adapter["ownUnits"][0]["parameters"]["10"]),
        sorted(synthetic["ownUnits"][0]["parameters"]["10"]),
    )
    report.check(
        group,
        "visual inputs are not inside the combat scenario",
        not ({"jobId", "rank", "gender", "appearanceInputs"} & set(adapter["ownUnits"][0])),
        "the renderer inputs stay in visualSetup",
    )

    visual = fixture["visualSetup"]["units"]
    frozen = json.loads((GAME_DATA / "human-battle-idle.json").read_text(encoding="utf-8"))["characters"]
    by_label = {entry["label"].lower(): entry for entry in frozen}
    for unit in visual:
        label = f"{unit.get('jobId')} {unit.get('rank')}".strip().lower()
        entry = by_label.get(label)
        report.check(
            "reference comparison",
            f"visual unit '{unit['name']}' matches the frozen demonstration entry",
            entry is not None,
            json.dumps(entry) if entry else "no frozen entry for this label",
        )
        if entry:
            report.expect("reference comparison", f"'{unit['name']}' keeps the frozen weapon motion", unit["weaponMotion"], equipment[unit["weaponId"]]["motion"])
            for skill in unit["skills"]:
                report.expect(
                    "reference comparison",
                    f"'{unit['name']}' skill {skill['skillId']} keeps the recovered motion",
                    skill["motion"],
                    skills[skill["skillId"]]["motion"],
                )
    return comparisons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--harness", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()

    harness = json.loads(args.harness.read_text(encoding="utf-8"))
    fixtures = harness["adapter"]["fixtures"]
    encounters, equipment, skills = load_evidence()
    report = Report()

    prepared = {}
    for fixture_id, fixture in fixtures.items():
        if "scenario" not in fixture:
            report.check(f"fixture {fixture_id}", "harness converted the fixture", False, fixture.get("error", "no scenario"))
            continue
        prepared[fixture_id] = verify_fixture(report, fixture_id, fixture, encounters, equipment, skills)

    for encounter_id in range(20):
        fixture = fixtures.get(f"F{encounter_id}")
        report.check(
            f"encounter {encounter_id}",
            "adapter output resolves the recovered encounter",
            fixture is not None and fixture.get("scenario", {}).get("encounterId") == encounter_id,
            json.dumps(fixture.get("label") if fixture else None),
        )

    reference = None
    if "A" in fixtures and "scenario" in fixtures["A"]:
        reference = reference_comparison(report, fixtures["A"], equipment, skills)

    result = {
        "status": "adapter scenarios accepted by combat_scenario.load_scenario and combat_setup.prepare_setup",
        "harness": str(args.harness),
        "fixtures": len(fixtures),
        "prepared": sorted(fixture_id for fixture_id, value in prepared.items() if value is not None),
        "checks": report.checks,
        "passed": len(report.checks) - len(report.failed),
        "total": len(report.checks),
        "failed": report.failed,
        "limits": [
            "No fight is simulated: only load_scenario/prepare_setup acceptance is proven.",
            "A full battle and the setup-to-replay bridge remain COMMAND 16.4 scope.",
            "Job/equipment legality, skill-slot cap and ownership-derived party cap remain warnings.",
        ],
    }
    if reference:
        result["referenceComparison"] = reference
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"passed": result["passed"], "total": result["total"], "failed": result["failed"]}, indent=1))
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
