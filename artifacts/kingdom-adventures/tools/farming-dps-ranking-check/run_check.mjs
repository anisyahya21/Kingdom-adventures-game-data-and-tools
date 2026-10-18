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
