import assert from "node:assert/strict";
import { compareFarmingDpsRank } from "../../src/lib/farming-dps-ranking.ts";

const rows = [
  { id: "far-target-score-99", measuredMean: null, deviation: 0.2 },
  { id: "measured-actual-20", measuredMean: 20, deviation: 0.01 },
  { id: "closest-unmeasured", measuredMean: null, deviation: 0.01 },
  { id: "measured-actual-35", measuredMean: 35, deviation: 0.2 },
  { id: "next-unmeasured", measuredMean: null, deviation: 0.05 },
];
assert.deepEqual(rows.sort(compareFarmingDpsRank).map((row) => row.id), [
  "measured-actual-35",
  "measured-actual-20",
  "closest-unmeasured",
  "next-unmeasured",
  "far-target-score-99",
]);
console.log("PASS: actual measurements rank first by observed mean; unmeasured builds rank by stat distance.");

const failed = { id: "failed-exact", measuredMean: 99, deviation: 0, failedExactSetupPilot: true };
const unknown = { id: "unmeasured-alternative", measuredMean: null, deviation: 0.1 };
assert.deepEqual([failed, unknown].sort(compareFarmingDpsRank).map(row => row.id), [unknown.id, failed.id], "a matching failed pilot must not lead on research mean or closeness");
assert.ok(compareFarmingDpsRank(failed, unknown) > 0);
assert.ok(compareFarmingDpsRank(unknown, failed) < 0);
assert.equal(compareFarmingDpsRank(failed, failed), 0);
assert.ok(compareFarmingDpsRank({ ...failed, failedExactSetupPilot: false }, unknown) < 0, "other setups retain ordinary ranking");
console.log("PASS: conditional failed-pilot demotion preserves alternatives and ordinary ranking outside that setup.");

const observedFailure = { id: "observed-6-of-20", measuredMean: 999, deviation: 0, observedDpsDeaths: true };
assert.ok(compareFarmingDpsRank(observedFailure, unknown) > 0, "recorded deaths remain available after untested exploration options");
assert.ok(compareFarmingDpsRank(failed, observedFailure) > 0, "distinct failed pre-boss pilot remains last");
const mixed = [...rows, observedFailure, failed, { ...unknown, id: "another-unknown", deviation: 0.02 }];
for (const a of mixed) for (const b of mixed) for (const c of mixed) {
  if (compareFarmingDpsRank(a,b) <= 0 && compareFarmingDpsRank(b,c) <= 0) assert.ok(compareFarmingDpsRank(a,c) <= 0, "mixed evidence ordering must be transitive");
}
console.log("PASS: observed failures are retained, unknowns have no invented survival score, mixed ordering is transitive.");
