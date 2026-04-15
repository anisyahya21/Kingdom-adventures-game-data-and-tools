import { readFileSync, writeFileSync } from 'fs';

const file = 'artifacts/kingdom-adventures/src/pages/loadout.tsx';
let src = readFileSync(file, 'utf8');
const CRLF = src.includes('\r\n');
const NL = CRLF ? '\r\n' : '\n';
console.log('Line endings:', CRLF ? 'CRLF' : 'LF');

// 1) Add loadoutsUpdatedAt to SharedData type
const oldSharedData = `  weaponTypes?: Record<string, string>;\n  loadouts?: Loadout[];\n};`;
const newSharedData = `  weaponTypes?: Record<string, string>;\n  loadouts?: Loadout[];\n  loadoutsUpdatedAt?: number | null;\n};`;

if (!src.includes(oldSharedData)) {
  console.error('FAIL: SharedData block not found');
  const i = src.indexOf('weaponTypes?:');
  console.log('weaponTypes context:', JSON.stringify(src.slice(i, i+120)));
  process.exit(1);
}
src = src.replace(oldSharedData, newSharedData);
console.log('OK: SharedData extended with loadoutsUpdatedAt');

// 2) Fix the hydration effect
const oldHydration = `  // Hydration: on first API data load, pull loadouts from server (or push local if server is empty)\n  useEffect(() => {\n    if (loadoutsHydratedRef.current) return;\n    if (!sharedData) return; // still loading\n    loadoutsHydratedRef.current = true;\n    const apiLoadouts = sharedData.loadouts ?? [];\n    if (apiLoadouts.length > 0) {\n      skipNextLoadoutsEchoRef.current = true;\n      setLoadouts(apiLoadouts);\n    } else if (loadoutsRef.current.length > 0) {\n      // Server has no loadouts yet \u2014 push local state so other devices can get it\n      fetch(API("/loadouts"), {\n        method: "PUT",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ data: loadoutsRef.current }),\n      }).catch(() => {});\n    }\n  }, [sharedData, setLoadouts]); // eslint-disable-line react-hooks/exhaustive-deps`;

const newHydration = `  // Hydration: on first API data load, pull loadouts from server.\n  // Rule: if loadoutsUpdatedAt is non-null the server has been explicitly saved to\n  // and is authoritative \u2014 even if loadouts is empty (means user deleted everything).\n  // Only push local state when the server has NEVER been initialized (loadoutsUpdatedAt === null).\n  useEffect(() => {\n    if (loadoutsHydratedRef.current) return;\n    if (!sharedData) return; // still loading\n    loadoutsHydratedRef.current = true;\n    if (sharedData.loadoutsUpdatedAt != null) {\n      // Server has been written before \u2014 always take its state, even if empty\n      skipNextLoadoutsEchoRef.current = true;\n      setLoadouts(sharedData.loadouts ?? []);\n    } else if (loadoutsRef.current.length > 0) {\n      // Server has never been synced \u2014 push local state as the initial seed\n      fetch(API("/loadouts"), {\n        method: "PUT",\n        headers: { "Content-Type": "application/json" },\n        body: JSON.stringify({ data: loadoutsRef.current }),\n      }).catch(() => {});\n    }\n  }, [sharedData, setLoadouts]); // eslint-disable-line react-hooks/exhaustive-deps`;

if (!src.includes(oldHydration)) {
  console.error('FAIL: hydration block not found');
  const i = src.indexOf('Hydration: on first API');
  if (i !== -1) {
    console.log('Found block:', JSON.stringify(src.slice(i, i+600)));
  }
  process.exit(1);
}
src = src.replace(oldHydration, newHydration);
console.log('OK: loadout.tsx hydration fixed');

writeFileSync(file, src, 'utf8');
console.log('Done.');
