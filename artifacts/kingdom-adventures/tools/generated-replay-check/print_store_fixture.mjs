/**
 * Prints the one-line browser injection for a stored regression fixture, so the /battle-replay page can
 * be pointed at a fixture with no server, no build step and no new dependency.
 *
 *   node tools/generated-replay-check/print_store_fixture.mjs faithful|renderer-probe|revive
 *
 * The fixtures are stored in the exact shape `writeGeneratedBattle` writes (`storeVersion` / `replay` /
 * `visualSetup` siblings under the `ka-generated-battle-1` key), so the page's own reader accepts them
 * with no translation. Paste the printed line into the devtools console on
 * `/battle-replay?mode=generated`, reload, and the stage plays that fixture.
 *
 * The primary browser check is still the natural one: run the fight on `/battle` with the saved team,
 * which writes the same kind of record through the page itself.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..");
const WORKSPACE = path.resolve(APP, "..", "..", "..");
const FIXTURES = path.join(WORKSPACE, "RE-evidence", "20260920-battle-regression-pass", "fixtures");
const KEY = "ka-generated-battle-1";

const which = process.argv[2] ?? "faithful";
const files = {
  faithful: { file: "generated-battle-regression.json", record: (parsed) => parsed.record },
  "renderer-probe": { file: "generated-battle-renderer-probe.json", record: (parsed) => parsed.record },
  revive: { file: "generated-battle-renderer-probe.json", record: (parsed) => ({ storeVersion: 1, replay: parsed.revive.payload, warnings: [], summary: undefined }) },
};
const spec = files[which];
if (!spec) {
  console.error(`unknown fixture '${which}'; use one of ${Object.keys(files).join(", ")}`);
  process.exit(1);
}
const parsed = JSON.parse(readFileSync(path.join(FIXTURES, spec.file), "utf8"));
const record = spec.record(parsed);
if (record.summary === undefined) delete record.summary;
const text = JSON.stringify(record);
console.log(`/* ${which}: ${spec.file} (${(text.length / 1024).toFixed(0)} KB) -> sessionStorage '${KEY}' */`);
console.log(`sessionStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(text)}); location.reload();`);
