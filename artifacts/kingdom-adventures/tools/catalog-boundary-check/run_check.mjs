import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measuredPanelsFor, measuredPointFor } from "../../src/lib/chest-strategy-boundary-access.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "../..");
const repositoryRoot = path.resolve(appRoot, "../../../../");
const researchRoot = path.join(repositoryRoot, "runtime/catalog-boundaries-20261013/coverage-validation-1");
const targetsPath = path.join(appRoot, "src/game-data/chest-strategy-targets.json");
const boundariesPath = path.join(appRoot, "src/game-data/chest-strategy-boundaries.json");
const exportedValidationPath = path.join(researchRoot, "website-validation-variants.json");
const selectionPath = path.join(researchRoot, "selection-review.json");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const [targets, currentEvidence, selection, exportedValidation] = await Promise.all([
  readJson(targetsPath), readJson(boundariesPath), readJson(selectionPath),
  readJson(exportedValidationPath).catch(() => null),
]);
const targetOptions = targets.options;
assert.equal(targetOptions.length, 71, "current website catalog must contain all 71 options");
assert.equal(new Set(targetOptions.map((x) => x.id)).size, 71, "catalog target IDs must be unique");
assert.equal(selection.perCatalogOption.length, 71, "validation selection must cover all 71 targets");
assert.equal(selection.selectedPriorProbeRelations, 142, "frozen selection must preserve 142 target/probe role references");
assert.deepEqual(
  [...selection.perCatalogOption.map((x) => x.targetId)].sort(),
  [...targetOptions.map((x) => x.id)].sort(),
  "validation target IDs must map one-to-one to the live catalog options",
);

const validationPanels = selection.perCatalogOption.map((option) => {
  const probes = new Map();
  for (const probe of option.selectedPriorProbes) {
    const key = probe.stats.join(",");
    const existing = probes.get(key) ?? { stats: probe.stats, role: probe.role, roles: [], seedRange: [2386, 2505] };
    if (!existing.roles.includes(probe.role)) existing.roles.push(probe.role);
    probes.set(key, existing);
  }
  return {
    id: option.targetId,
    encounter: option.encounter,
    stats: option.catalogStats,
    seedRange: [2386, 2505],
    variants: [...probes.values()],
  };
});
assert.equal(validationPanels.reduce((n, panel) => n + panel.variants.length, 0), 135);
assert.equal(validationPanels.reduce((n, panel) => n + panel.variants.reduce((m, point) => m + point.roles.length, 0), 0), 142);

const freshLivePanels = currentEvidence.panels.filter(
  (panel) => panel.seedRange?.[0] === 2386 && panel.seedRange?.[1] === 2505,
);
const websiteEvidencePresent = freshLivePanels.length > 0;
const exporterEvidencePresent = !websiteEvidencePresent && exportedValidation?.seedRange?.[0] === 2386 && exportedValidation?.seedRange?.[1] === 2505;
const measuredEvidencePresent = websiteEvidencePresent || exporterEvidencePresent;
const exportedPanels = exporterEvidencePresent ? exportedValidation.panels : [];
const testedPanels = websiteEvidencePresent ? freshLivePanels : exporterEvidencePresent ? exportedPanels : validationPanels;
const evidence = { panels: [...currentEvidence.panels, ...(websiteEvidencePresent ? [] : testedPanels)] };

if (websiteEvidencePresent) {
  assert.equal(freshLivePanels.length, 71, "merged website evidence must contain exactly 71 fresh validation panels");
}
if (measuredEvidencePresent) {
  assert.equal(testedPanels.length, 71, "fresh validation data must contain exactly 71 target panels");
  assert.equal(testedPanels.reduce((n, panel) => n + panel.variants.length, 0), 135,
    "fresh validation data must contain all 135 unique probe comparisons");
  assert.equal(testedPanels.reduce((n, panel) => n + panel.variants.reduce((m, point) => m + (point.roles?.length ?? 1), 0), 0), 142,
    "fresh validation data must preserve all 142 role references");
}

const selectedById = new Map(selection.perCatalogOption.map((option) => [option.targetId, option]));
for (const panel of testedPanels) {
  const selected = selectedById.get(panel.id);
  assert.ok(selected, `unexpected fresh target panel: ${panel.id}`);
  assert.equal(panel.encounter, selected.encounter);
  assert.deepEqual(panel.stats, selected.catalogStats, `${panel.id} baseline must match the frozen four-stat tuple`);
  assert.equal(panel.stats.length, 4);
  assert.equal(panel.stats[3], 18, `${panel.id} baseline must be DEX 18`);
  assert.deepEqual(panel.seedRange, [2386, 2505], `${panel.id} must identify the fresh validation cohort`);
  const selectedTuples = [...new Set(selected.selectedPriorProbes.map((probe) => probe.stats.join(",")))].sort();
  const panelTuples = panel.variants.map((probe) => probe.stats.join(",")).sort();
  assert.deepEqual(panelTuples, selectedTuples, `${panel.id} must have exactly its unique frozen probe tuples`);
  const expectedRoles = selected.selectedPriorProbes.reduce((roles, probe) => {
    const key = probe.stats.join(",");
    roles.set(key, [...new Set([...(roles.get(key) ?? []), probe.role])]);
    return roles;
  }, new Map());
  for (const point of panel.variants) {
    assert.deepEqual(point.roles ?? [point.role], expectedRoles.get(point.stats.join(",")),
      `${panel.id} must retain every selection role for the exact tuple`);
  }
  for (const point of panel.variants) {
    assert.equal(point.stats.length, 4, `${panel.id} probe must contain ATT/SPD/LCK/DEX`);
    const exact = measuredPointFor(evidence, panel.encounter, point.stats);
    assert.ok(exact, `${panel.id} exact four-stat probe should resolve`);
    assert.deepEqual(exact.stats, point.stats);
    assert.deepEqual(exact.seedRange, [2386, 2505], "exact variant lookup must retain its source cohort");
    if (measuredEvidencePresent) {
      for (const key of ["mean", "median", "n", "low", "defeats", "highest"]) {
        assert.equal(typeof point[key], "number", `${panel.id} exporter field ${key} must be numeric`);
      }
      assert.ok(Array.isArray(point.ci) && point.ci.length === 2, `${panel.id} should export the mean CI`);
      assert.ok(Array.isArray(point.lowCI95Wilson) && point.lowCI95Wilson.length === 2,
        `${panel.id} should export the low-tail Wilson interval`);
      assert.ok(Array.isArray(point.defeatCI95Wilson) && point.defeatCI95Wilson.length === 2,
        `${panel.id} should export the defeat Wilson interval`);
      assert.ok(Array.isArray(point.retention90MarginCI95Pointwise) && point.retention90MarginCI95Pointwise.length === 2,
        `${panel.id} should export the 90% retention margin interval`);
      assert.ok(Array.isArray(point.retention80MarginCI95Pointwise) && point.retention80MarginCI95Pointwise.length === 2,
        `${panel.id} should export the 80% retention margin interval`);
    }
  }
  assert.equal(measuredPanelsFor(evidence, panel.id).length >= 1, true,
    `${panel.id} must be available in the per-target boundary panel lookup`);
}

// A nearby tuple absent from every exact panel remains unknown to the lookup.
const anchor = testedPanels[0];
const used = new Set(evidence.panels.filter((panel) => panel.encounter === anchor.encounter)
  .flatMap((panel) => [panel.stats, ...panel.variants.map((x) => x.stats)])
  .map((stats) => stats.join(",")));
const nearby = [...anchor.stats];
do { nearby[0] += 1; } while (used.has(nearby.join(",")));
assert.equal(measuredPointFor(evidence, anchor.encounter, nearby), null,
  "unmeasured nearby tuple must not inherit an exact-point result");

console.log(JSON.stringify({
  valid: true,
  evidenceMode: websiteEvidencePresent ? "merged website validation data" : exporterEvidencePresent ? "completed standalone validation export" : "no-metric frozen-selection schema fixture",
  currentCatalogOptions: targetOptions.length,
  freshValidationPanels: testedPanels.length,
  freshProbeRelations: testedPanels.reduce((n, panel) => n + panel.variants.length, 0),
  freshProbeRoleReferences: testedPanels.reduce((n, panel) => n + panel.variants.reduce((m, point) => m + (point.roles?.length ?? 1), 0), 0),
  freshSeedRange: [2386, 2505],
  exactDex18Baselines: testedPanels.every((panel) => panel.stats[3] === 18),
  unknownNearbyTuple: true,
  simulatedMeans: false,
}, null, 2));
