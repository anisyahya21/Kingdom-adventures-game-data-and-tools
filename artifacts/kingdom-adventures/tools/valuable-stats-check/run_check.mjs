/**
 * Owner check for the shared valuable-effect data (`@/game-data/resident-stat-items` +
 * `@/game-data/resident-valuable-effects`).
 *
 * It re-reads the shipped Valuable master data
 * (`KA-Website/data/sheet-research/raw-copies/KA GameData - Valuable.csv`) and asserts:
 *   * the resident rows are `bonusCategory 1`, `bonusType 7..11`, `bonusMinValue == bonusMaxValue == 10`;
 *   * the resolved dispatch (bonusType -> native param id + native mutation) matches the recovered
 *     `ecs.ValuableSystem.ApplyEffectDifferenceToTargets 0x160a244` jump table and the cited RVAs;
 *   * the helper's per-parameter deltas follow the native op split (bounded HP/MP/Vigor raise the
 *     maximum only, Attack/Defence raise the value);
 *   * the pre-existing `residentStatItemBonuses` totals are unchanged.
 *
 * The check does not execute native code: the native facts are pinned as constants and every
 * constant is asserted against the master data it must agree with, so a master-data edit or an
 * accidental dispatch change fails here instead of drifting silently.
 *
 * Usage:
 *   node --import ./tools/battle-setup-check/register.mjs tools/valuable-stats-check/run_check.mjs [--out <file>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(here, "..", "..", "..", "..", "..");
const VALUABLE_CSV = path.join(
  WORKSPACE,
  "KA-Website",
  "data",
  "sheet-research",
  "raw-copies",
  "KA GameData - Valuable.csv",
);

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null;

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({
    name,
    passed,
    detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  });
};
const checkTruthy = (name, actual, detail = "expected truthy") => {
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail });
};

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, no embedded bare newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  const body = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  const [header, ...data] = rows;
  return {
    header,
    rows: data
      .filter((entry) => entry.some((cell) => cell !== ""))
      .map((entry) => Object.fromEntries(header.map((name, index) => [name, entry[index] ?? ""]))),
  };
}

const { RESIDENT_STAT_ITEMS, RESIDENT_STAT_ITEM_AMOUNT, residentStatItemBonuses } = await import(
  "@/game-data/resident-stat-items"
);
const {
  RESIDENT_VALUABLE_EFFECTS,
  FACILITY_MAX_DURABILITY_BONUS_TYPE,
  residentValuableEffectForStat,
  residentValuableParameterDeltas,
  residentValuablesDeclared,
} = await import("@/game-data/resident-valuable-effects");
const { STAT_PARAMETER_IDS } = await import("@/game-data/stat-parameter-ids");

// ---- master data -------------------------------------------------------------------------------
const table = parseCsv(readFileSync(VALUABLE_CSV, "utf8"));
const required = ["explain", "bonusCategory", "bonusType", "bonusMinValue", "bonusMaxValue", "flag"];
for (const column of required) {
  checkTruthy(`masterData.header.${column}`, table.header.includes(column), "column missing");
}
checkTruthy("masterData.rowCount", table.rows.length > 100, `only ${table.rows.length} rows`);

const residentRows = table.rows.filter(
  (row) => row.bonusCategory === "1" && ["7", "8", "9", "10", "11"].includes(row.bonusType),
);
checkTruthy("masterData.residentRowsPresent", residentRows.length > 0, "no resident rows found");
check(
  "masterData.residentRows.minEqualsMaxEqualsTen",
  [...new Set(residentRows.map((row) => `${row.bonusMinValue}/${row.bonusMaxValue}`))],
  ["10/10"],
);
check(
  "masterData.residentRows.explain",
  [...new Set(residentRows.map((row) => /all residents/.test(row.explain)))],
  [true],
);
check(
  "masterData.residentBonusTypes",
  [...new Set(residentRows.map((row) => row.bonusType))].sort((a, b) => Number(a) - Number(b)),
  ["7", "8", "9", "10", "11"],
);

// The facility row must exist and must not be folded into the resident dispatch.
const facilityRows = table.rows.filter(
  (row) => row.bonusCategory === "1" && row.bonusType === String(FACILITY_MAX_DURABILITY_BONUS_TYPE),
);
checkTruthy("masterData.facilityDurabilityRow", facilityRows.length > 0, "bonusType 12 row missing");
check(
  "masterData.facilityDurabilityExplain",
  [...new Set(facilityRows.map((row) => /Max Durability/.test(row.explain)))],
  [true],
);
check(
  "dispatch.facilityTypeNotResident",
  RESIDENT_VALUABLE_EFFECTS.some((effect) => effect.bonusType === FACILITY_MAX_DURABILITY_BONUS_TYPE),
  false,
);

// ---- recovered dispatch (ecs.ValuableSystem.ApplyEffectDifferenceToTargets 0x160a244) -----------
check(
  "dispatch.bonusTypeToParamAndOp",
  RESIDENT_VALUABLE_EFFECTS.map((effect) => [effect.bonusType, effect.paramId, [...effect.ops]]),
  [
    [7, 10, ["addMaxValue"]],
    [8, 11, ["addMaxValue"]],
    [9, 12, ["addMaxValue"]],
    [10, 13, ["addValue"]],
    [11, 14, ["addValue"]],
  ],
);
check(
  "dispatch.paramIdsMatchStatKeys",
  RESIDENT_VALUABLE_EFFECTS.map((effect) => [effect.stat, effect.paramId]),
  [
    ["hp", STAT_PARAMETER_IDS.hp],
    ["mp", STAT_PARAMETER_IDS.mp],
    ["vig", STAT_PARAMETER_IDS.vig],
    ["atk", STAT_PARAMETER_IDS.atk],
    ["def", STAT_PARAMETER_IDS.def],
  ],
);
check(
  "dispatch.everyItemResolved",
  RESIDENT_STAT_ITEMS.every((item) => residentValuableEffectForStat(item.stat) !== undefined),
  true,
);
check(
  "dispatch.statsWithoutValuables",
  ["spd", "lck", "int", "dex", "gth", "mov", "hrt"].map((stat) => residentValuableEffectForStat(stat)),
  [undefined, undefined, undefined, undefined, undefined, undefined, undefined],
);

// The module must keep citing the addresses the constants came from.
const moduleSource = readFileSync(
  path.join(WORKSPACE, "KA-Website", "artifacts", "kingdom-adventures", "src", "game-data", "resident-valuable-effects.ts"),
  "utf8",
);
for (const rva of [
  "0x160a244",
  "0x160a784",
  "0x1609f24",
  "0x1609c04",
  "0x1609aec",
  "0x1599c78",
  "0x16827e0",
  "0x16828a4",
  "0x16825cc",
  "0x77213f",
]) {
  checkTruthy(`provenance.cites.${rva}`, moduleSource.includes(rva), "RVA not cited");
}

// ---- helper behaviour --------------------------------------------------------------------------
const counts = { life: 2, wisdom: 1, vitality: 3, might: 4, resilience: 0 };
check("deltas.nativeOps", residentValuableParameterDeltas(counts), {
  10: { valueDelta: 0, maxDelta: 20 },
  11: { valueDelta: 0, maxDelta: 10 },
  12: { valueDelta: 0, maxDelta: 30 },
  13: { valueDelta: 40, maxDelta: 0 },
});
check("deltas.emptyInput", residentValuableParameterDeltas({}), {});
check("deltas.nullInput", residentValuableParameterDeltas(null), {});
check("deltas.negativeAndFractionalIgnored", residentValuableParameterDeltas({ life: -5, might: 2.9 }), {
  13: { valueDelta: 20, maxDelta: 0 },
});
check("declared.none", residentValuablesDeclared({}), false);
check("declared.some", residentValuablesDeclared({ life: 1 }), true);

// Existing exported totals must not move.
check("totals.regression", residentStatItemBonuses(counts), { hp: 20, mp: 10, vig: 30, atk: 40 });
check("totals.itemAmount", RESIDENT_STAT_ITEM_AMOUNT, 10);
check(
  "totals.matchesMasterData",
  residentRows.reduce((max, row) => Math.max(max, Number(row.bonusMinValue)), 0),
  RESIDENT_STAT_ITEM_AMOUNT,
);

const failures = checks.filter((entry) => !entry.passed);
const report = {
  schema: "ka-valuable-stats-check-1",
  masterData: { file: path.relative(WORKSPACE, VALUABLE_CSV).replace(/\\/g, "/"), residentRows: residentRows.length },
  checks: checks.length,
  failures,
};
if (OUT) writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ checks: checks.length, failed: failures.length, failures: failures.slice(0, 5) }));
process.exitCode = failures.length === 0 ? 0 : 1;
