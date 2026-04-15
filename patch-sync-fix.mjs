import { readFileSync, writeFileSync } from 'fs';

// ─── Marriage Matcher fix ───
{
  const file = 'artifacts/kingdom-adventures/src/pages/marriage-matcher.tsx';
  let src = readFileSync(file, 'utf8');
  const CRLF = src.includes('\r\n');
  const NL = CRLF ? '\r\n' : '\n';

  const oldHydration = [
    `  // Hydration: on first API data load, pull rankSlots from server (or push local if server is empty)`,
    `  useEffect(() => {`,
    `    if (rankSlotsHydratedRef.current) return;`,
    `    if (!sharedData) return; // still loading`,
    `    rankSlotsHydratedRef.current = true;`,
    `    const apiSlots = sharedData.marriageMatcher?.rankSlots ?? [];`,
    `    if (apiSlots.length > 0) {`,
    `      skipNextRankSlotsEchoRef.current = true;`,
    `      setRankSlots(apiSlots as RankSlot[]);`,
    `    } else if (rankSlotsRef.current.length > 0) {`,
    `      // Server has no roster yet — push local state so other devices can get it`,
    `      fetch(API("/marriage-matcher/rank-slots"), {`,
    `        method: "PUT",`,
    `        headers: { "Content-Type": "application/json" },`,
    `        body: JSON.stringify({ data: rankSlotsRef.current }),`,
    `      }).catch(() => {});`,
    `    }`,
    `  }, [sharedData]); // eslint-disable-line react-hooks/exhaustive-deps`,
  ].join(NL);

  const newHydration = [
    `  // Hydration: on first API data load, pull rankSlots from server.`,
    `  // Rule: if marriageMatcher is non-null the server has been explicitly written to`,
    `  // and is authoritative — even if rankSlots is empty (means user deleted everything).`,
    `  // Only push local state when the server has NEVER been initialized (marriageMatcher === null).`,
    `  useEffect(() => {`,
    `    if (rankSlotsHydratedRef.current) return;`,
    `    if (!sharedData) return; // still loading`,
    `    rankSlotsHydratedRef.current = true;`,
    `    const mm = sharedData.marriageMatcher;`,
    `    if (mm !== null && mm !== undefined) {`,
    `      // Server has been written before — always take its state, even if empty`,
    `      skipNextRankSlotsEchoRef.current = true;`,
    `      setRankSlots((mm.rankSlots ?? []) as RankSlot[]);`,
    `    } else if (rankSlotsRef.current.length > 0) {`,
    `      // Server has never been synced — push local state as the initial seed`,
    `      fetch(API("/marriage-matcher/rank-slots"), {`,
    `        method: "PUT",`,
    `        headers: { "Content-Type": "application/json" },`,
    `        body: JSON.stringify({ data: rankSlotsRef.current }),`,
    `      }).catch(() => {});`,
    `    }`,
    `  }, [sharedData]); // eslint-disable-line react-hooks/exhaustive-deps`,
  ].join(NL);

  if (!src.includes(oldHydration)) {
    console.error('FAIL marriage-matcher: hydration block not found');
    console.log('Looking for:', oldHydration.slice(0, 200));
    process.exit(1);
  }
  src = src.replace(oldHydration, newHydration);
  writeFileSync(file, src, 'utf8');
  console.log('OK: marriage-matcher.tsx hydration fixed');
}

// ─── Loadout.tsx fix ───
{
  const file = 'artifacts/kingdom-adventures/src/pages/loadout.tsx';
  let src = readFileSync(file, 'utf8');
  const CRLF = src.includes('\r\n');
  const NL = CRLF ? '\r\n' : '\n';

  // 1) Add loadoutsUpdatedAt to SharedData type
  const oldSharedData = `  weaponTypes?: Record<string, string>;
  loadouts?: Loadout[];
};`;
  const newSharedData = `  weaponTypes?: Record<string, string>;
  loadouts?: Loadout[];
  loadoutsUpdatedAt?: number | null;
};`;

  if (!src.includes(oldSharedData)) {
    console.error('FAIL loadout: SharedData type not found');
    process.exit(1);
  }
  src = src.replace(oldSharedData, newSharedData);
  console.log('OK: loadout.tsx SharedData type extended');

  // 2) Fix the hydration effect
  const oldHydration = [
    `  // Hydration: on first API data load, pull loadouts from server (or push local if server is empty)`,
    `  useEffect(() => {`,
    `    if (loadoutsHydratedRef.current) return;`,
    `    if (!sharedData) return; // still loading`,
    `    loadoutsHydratedRef.current = true;`,
    `    const apiLoadouts = sharedData.loadouts ?? [];`,
    `    if (apiLoadouts.length > 0) {`,
    `      skipNextLoadoutsEchoRef.current = true;`,
    `      setLoadouts(apiLoadouts);`,
    `    } else if (loadoutsRef.current.length > 0) {`,
    `      // Server has no loadouts yet — push local state so other devices can get it`,
    `      fetch(API("/loadouts"), {`,
    `        method: "PUT",`,
    `        headers: { "Content-Type": "application/json" },`,
    `        body: JSON.stringify({ data: loadoutsRef.current }),`,
    `      }).catch(() => {});`,
    `    }`,
    `  }, [sharedData, setLoadouts]); // eslint-disable-line react-hooks/exhaustive-deps`,
  ].join(NL);

  const newHydration = [
    `  // Hydration: on first API data load, pull loadouts from server.`,
    `  // Rule: if loadoutsUpdatedAt is non-null the server has been explicitly saved to`,
    `  // and is authoritative — even if loadouts is empty (means user deleted everything).`,
    `  // Only push local state when the server has NEVER been initialized (loadoutsUpdatedAt === null).`,
    `  useEffect(() => {`,
    `    if (loadoutsHydratedRef.current) return;`,
    `    if (!sharedData) return; // still loading`,
    `    loadoutsHydratedRef.current = true;`,
    `    if (sharedData.loadoutsUpdatedAt != null) {`,
    `      // Server has been written before — always take its state, even if empty`,
    `      skipNextLoadoutsEchoRef.current = true;`,
    `      setLoadouts(sharedData.loadouts ?? []);`,
    `    } else if (loadoutsRef.current.length > 0) {`,
    `      // Server has never been synced — push local state as the initial seed`,
    `      fetch(API("/loadouts"), {`,
    `        method: "PUT",`,
    `        headers: { "Content-Type": "application/json" },`,
    `        body: JSON.stringify({ data: loadoutsRef.current }),`,
    `      }).catch(() => {});`,
    `    }`,
    `  }, [sharedData, setLoadouts]); // eslint-disable-line react-hooks/exhaustive-deps`,
  ].join(NL);

  if (!src.includes(oldHydration)) {
    console.error('FAIL loadout: hydration block not found');
    console.log('Lines 200-230:');
    const lines = src.split('\n');
    lines.slice(195, 235).forEach((l, i) => console.log(i+196, JSON.stringify(l)));
    process.exit(1);
  }
  src = src.replace(oldHydration, newHydration);
  writeFileSync(file, src, 'utf8');
  console.log('OK: loadout.tsx hydration fixed');
}

console.log('All patches applied.');
