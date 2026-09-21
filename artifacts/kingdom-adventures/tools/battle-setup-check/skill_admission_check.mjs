/**
 * Deterministic check for native cross-job skill admission (`CanSetSkill 0x14cfe40`).
 *
 * Validates the new `skill-job-admission.json` against the canonical master sheets it was built
 * from, re-parses the `+0x1c` flags with the same rule as `BaseData.Check 0x161c200`, and runs
 * the admission cases through the real helper module.
 *
 *   node --import ./tools/battle-setup-check/register.mjs tools/battle-setup-check/skill_admission_check.mjs
 *
 * Optional: --out <file> for the JSON summary (defaults to the input-fidelity evidence folder).
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let ROOT = path.resolve(here, "..", "..", "..");
while (!existsSync(path.join(ROOT, "KA-Website"))) {
  const next = path.dirname(ROOT);
  if (next === ROOT) throw new Error("workspace root not found");
  ROOT = next;
}
const APP = path.join(ROOT, "KA-Website", "artifacts", "kingdom-adventures");
const RAW = path.join(ROOT, "KA-Website", "data", "sheet-research", "raw-copies");
const JOB_CSV = path.join(RAW, "KA GameData - Job.csv");
const JOBGROUP_CSV = path.join(RAW, "KA GameData - JobGroup.csv");
const SKILL_CSV = path.join(RAW, "KA GameData - Skill.csv");
const CATALOG = path.join(APP, "src", "game-data", "battle-skill-catalog.json");
const DATA = path.join(APP, "src", "game-data", "skill-job-admission.json");

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const OUT = outIndex >= 0
  ? path.resolve(args[outIndex + 1])
  : path.join(ROOT, "RE-evidence", "20260920-user-wairo-reference", "skill-admission-check.json");

/** Minimal CSV reader (RFC-4180 quoting), enough for the KA GameData sheets. */
function parseCsv(text) {
  const rows = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { rows[rows.length - 1].push(cell); cell = ""; }
    else if (ch === "\n") { rows[rows.length - 1].push(cell.replace(/\r$/, "")); cell = ""; rows.push([]); }
    else cell += ch;
  }
  rows[rows.length - 1].push(cell.replace(/\r$/, ""));
  return rows.filter((row) => row.some((value) => value !== ""));
}

const readCsv = (file) => parseCsv(readFileSync(file, "utf8"));
const isInt = (value) => /^-?\d+$/.test(value.trim());

const {
  canSetSkill,
  jobGroupMaskForJob,
  jobGroupGateFailure,
  CAN_SET_SKILL_DUPLICATE,
  CAN_SET_SKILL_SAME_TYPE,
  CAN_SET_SKILL_JOB_GROUP_MISMATCH,
  SKILL_FLAG_ATTACK,
  SKILL_FLAG_ATTACK_MAGIC,
  SKILL_FLAG_RECOVERY_MAGIC,
} = await import("@/game-data/skill-job-admission");

const checks = [];
const record = (name, fn) => {
  try { fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: String(error && error.message || error) }); }
};

/* 1. Re-derive the job-group mask map from Job.csv `group` -> JobGroup.csv flag. */
const jobRows = readCsv(JOB_CSV);
const jobHeader = jobRows.find((row) => row.includes("name") && row.includes("group"));
const nameCol = jobHeader.indexOf("name");
const groupCol = jobHeader.indexOf("group");
const groupRows = readCsv(JOBGROUP_CSV);
const groupHeaderIndex = groupRows.findIndex((row) => row.includes("name"));
const groupMaskByIndex = new Map();
for (const row of groupRows.slice(groupHeaderIndex + 1)) {
  if (isInt(row[0])) groupMaskByIndex.set(Number(row[0]), Number(row[row.length - 2]));
}
const recomputed = {};
for (const row of jobRows.slice(jobRows.indexOf(jobHeader) + 1)) {
  if (!isInt(row[0] ?? "")) continue;
  const name = row[nameCol];
  const group = row[groupCol];
  if (!name.trim() || !isInt(group)) continue;
  const base = name.replace(/^[^ ]+ (Rank|Grade) /, "");
  if (base in recomputed) continue;
  recomputed[base] = groupMaskByIndex.get(Number(group));
}
// Jobs whose `group` index has no JobGroup row (Enemy 2/3/4, Tourist) carry no mask, so they are
// absent from the map rather than present as null.
for (const [job, mask] of Object.entries(recomputed)) if (mask === undefined) delete recomputed[job];
const dataFile = JSON.parse(readFileSync(DATA, "utf8"));
record("skill-job-admission.json jobGroupMaskByJob matches Job.csv group -> JobGroup.csv flag", () => {
  assert.deepEqual(dataFile.jobGroupMaskByJob, recomputed);
});
record("job-group masks spot values (Ninja 14, Doctor 2, Knight 12, Mage 11)", () => {
  assert.equal(jobGroupMaskForJob("Ninja"), 14);
  assert.equal(jobGroupMaskForJob("Doctor"), 2);
  assert.equal(jobGroupMaskForJob("Knight"), 12);
  assert.equal(jobGroupMaskForJob("Mage"), 11);
});

/* 2. Skill `+0x1c` flag: catalog `flags` must equal the Skill.csv numeric flag column. */
const skillRows = readCsv(SKILL_CSV);
const skillHeaderIndex = skillRows.findIndex((row) => row.includes("nameText"));
const skillIdCol = 0;
const skillFlagCol = skillRows[skillHeaderIndex].length - 2;
const csvFlags = new Map();
for (const row of skillRows.slice(skillHeaderIndex + 1)) {
  if (isInt(row[skillIdCol] ?? "") && isInt(row[skillFlagCol] ?? "")) {
    csvFlags.set(Number(row[skillIdCol]), Number(row[skillFlagCol]));
  }
}
const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const catalogById = new Map(catalog.skills.map((entry) => [entry.id, entry]));
record("battle-skill-catalog.json flags equal Skill.csv flag column (+0x1c) for the sampled ids", () => {
  for (const id of [2, 3, 4, 5, 7, 22, 23, 26, 29, 37, 44, 107]) {
    assert.equal(catalogById.get(id).flags, csvFlags.get(id), `skill ${id}`);
  }
});
record("known skill flag bits (Counter attack, Fire Magic attack magic, Heal Maddy recovery)", () => {
  assert.equal(catalogById.get(26).flags & SKILL_FLAG_ATTACK, SKILL_FLAG_ATTACK);
  assert.equal(catalogById.get(7).flags & SKILL_FLAG_ATTACK_MAGIC, SKILL_FLAG_ATTACK_MAGIC);
  assert.equal(catalogById.get(37).flags & SKILL_FLAG_RECOVERY_MAGIC, SKILL_FLAG_RECOVERY_MAGIC);
});

/* 3. Gate pairs, straight from the CanSetSkill disassembly. */
record("jobGroupGateFailure pairs 0x200<->4, 0x400<->1, 0x800<->2", () => {
  assert.equal(jobGroupGateFailure(SKILL_FLAG_ATTACK, 4), 0);
  assert.equal(jobGroupGateFailure(SKILL_FLAG_ATTACK, 2), CAN_SET_SKILL_JOB_GROUP_MISMATCH);
  assert.equal(jobGroupGateFailure(SKILL_FLAG_ATTACK_MAGIC, 1), 0);
  assert.equal(jobGroupGateFailure(SKILL_FLAG_ATTACK_MAGIC, 4), CAN_SET_SKILL_JOB_GROUP_MISMATCH);
  assert.equal(jobGroupGateFailure(SKILL_FLAG_RECOVERY_MAGIC, 2), 0);
  assert.equal(jobGroupGateFailure(0, 0), 0);
});

/* 4. The requested admission cases. */
const verdict = (jobName, skillId, existingSkillIds) => canSetSkill({ jobName, skillId, existingSkillIds });
const cases = [];
const expectAdmitted = (jobName, skillId, existingSkillIds) => {
  const result = verdict(jobName, skillId, existingSkillIds);
  cases.push({ job: jobName, skillId, existing: existingSkillIds ?? [], expected: "admitted", actual: result.status, failure: result.failure });
  assert.equal(result.status, "admitted", `${jobName} + ${skillId}: ${result.reason}`);
};
const expectRejected = (jobName, skillId, failure, existingSkillIds) => {
  const result = verdict(jobName, skillId, existingSkillIds);
  cases.push({ job: jobName, skillId, existing: existingSkillIds ?? [], expected: `rejected ${failure}`, actual: result.status, failure: result.failure });
  assert.equal(result.status, "rejected", `${jobName} + ${skillId}: ${result.reason}`);
  assert.equal(result.failure, failure, `${jobName} + ${skillId}: ${result.reason}`);
};

record("Ninja (mask 14) admits Counter + skills 4/3/2", () => {
  expectAdmitted("Ninja", 26);
  expectAdmitted("Ninja", 4);
  expectAdmitted("Ninja", 3);
  expectAdmitted("Ninja", 2);
});
record("Ninja rejects attack magic 5/7 with the native 0x400000000", () => {
  expectRejected("Ninja", 5, CAN_SET_SKILL_JOB_GROUP_MISMATCH);
  expectRejected("Ninja", 7, CAN_SET_SKILL_JOB_GROUP_MISMATCH);
});
record("Doctor (mask 2) admits Heal Maddy and Backup", () => {
  expectAdmitted("Doctor", 37);
  expectAdmitted("Doctor", 107);
});
record("actual incompatible case rejected: Doctor + Counter", () => {
  expectRejected("Doctor", 26, CAN_SET_SKILL_JOB_GROUP_MISMATCH);
});
record("multi-hit skills are not blanket-rejected (Ninja 2-Hit + 3-Hit Attack)", () => {
  expectAdmitted("Ninja", 22);
  expectAdmitted("Ninja", 23);
  expectAdmitted("Ninja", 23, [22]);
});
record("duplicate and same-type subcases keep their own native bits", () => {
  expectRejected("Ninja", 26, CAN_SET_SKILL_DUPLICATE, [26]);
  expectRejected("Ninja", 3, CAN_SET_SKILL_SAME_TYPE, [2]);
});

const failed = checks.filter((check) => !check.passed);
const document = {
  $comment: "Skill-job admission (CanSetSkill 0x14cfe40): master-data job-group masks + skill +0x1c flags, no rank gate.",
  passed: checks.length - failed.length,
  total: checks.length,
  failed: failed.map((check) => check.name),
  checks,
  cases,
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(document, null, 1) + "\n", "utf8");
console.log(JSON.stringify({ passed: document.passed, total: document.total, failed: document.failed, out: OUT }));
if (failed.length > 0) process.exit(1);
