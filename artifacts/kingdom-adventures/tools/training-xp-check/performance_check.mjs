import { performance } from "node:perf_hooks";
const importStart = performance.now();
const [{ FACILITY_TRAINING_DATA }, xp] = await Promise.all([
  import("../../src/game-data/training-facilities.ts"),
  import("../../src/lib/training-xp.ts"),
]);
const importMs = performance.now() - importStart;
const rec = id => FACILITY_TRAINING_DATA.find(f => f.id === id);
const cases = [
  ["GoddessStatue83", rec(83), "town-land"],
  ["MagicGround134", rec(134), "15-XL"],
  ["Orchard223", rec(223), "18-S:1"],
  ["Ancestor182", rec(182), "1-XL:2"],
];
const results = [];
for (const [name, target, room] of cases) {
  const layout = xp.createTrainingLayout(target, room);
  xp.eligibleEmitters(target, layout); // warmup, excluded from timing
  const samples = [];
  for (let i = 0; i < 5; i += 1) {
    const start = performance.now();
    xp.eligibleEmitters(target, layout);
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a,b) => a-b);
  results.push({ name, queries: samples.length, meanMs: +(samples.reduce((a,b) => a+b,0)/samples.length).toFixed(3), medianMs: +sorted[2].toFixed(3) });
}
process.stdout.write(JSON.stringify({ importStartupMs: +importMs.toFixed(3), samplesPerCase: 5, results }, null, 2) + "\n");
