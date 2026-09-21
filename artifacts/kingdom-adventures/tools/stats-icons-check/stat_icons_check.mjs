/**
 * Focused regression for the shared stat-icon resolver (`@/lib/stat-icons`).
 *
 * The stats columns regressed because they looked the shared `statIcons` table up by the loadout
 * builder's short keys (`hp`, `vig`, ...) while the shipped table
 * (`api-server/data/ka_shared.json`) is keyed by the canonical spellings (`HP`, `Vigor`, ...), so
 * every <img> in a stat column disappeared.
 *
 * This loads the ACTUAL shipped shared data and asserts all twelve stats resolve an icon through
 * the one shared resolver, for short keys, full spellings and label aliases.
 *
 * Usage:
 *   node --import ./tools/battle-setup-check/register.mjs tools/stats-icons-check/stat_icons_check.mjs
 */
import { localSharedData } from "@/lib/local-shared-data";
import { STAT_KEYS } from "@/game-data/stat-parameter-ids";
import { getStatIcon, STAT_ICON_KEY, statIconKey } from "@/lib/stat-icons";

const checks = [];
const check = (name, actual, expected) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, passed, detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` });
};

const statIcons = (localSharedData.statIcons ?? {});
const canonicalKeys = STAT_KEYS.map((key) => STAT_ICON_KEY[key]);

// 1. The shipped table carries exactly the twelve canonical icon keys.
check("shipped statIcons keys are the 12 canonical spellings", Object.keys(statIcons).sort(), [...canonicalKeys].sort());

// 2. Every canonical key has a usable image source.
check(
  "every canonical stat icon is a data:image source",
  canonicalKeys.filter((key) => typeof statIcons[key] !== "string" || !statIcons[key].startsWith("data:image")),
  [],
);

// 3. THE REGRESSION: all twelve short keys resolve an icon through the shared resolver.
check("all 12 short keys resolve an icon", STAT_KEYS.filter((key) => !getStatIcon(statIcons, key)), []);

// 4. Full spellings resolve to the same source as the short keys.
check(
  "full-name spellings resolve to the same icon as short keys",
  STAT_KEYS.filter((key) => getStatIcon(statIcons, STAT_ICON_KEY[key]) !== getStatIcon(statIcons, key)),
  [],
);

// 5. Every spelling alias normalises to its canonical icon key.
const aliasExpectations = {
  HP: "HP",
  mp: "MP",
  Vig: "Vigor",
  vigor: "Vigor",
  Atk: "Attack",
  Defence: "Defence",
  speed: "Speed",
  Int: "Intelligence",
  dexterity: "Dexterity",
  gather: "Gather",
  move: "Move",
  Heart: "Heart",
};
check(
  "spelling aliases normalise to their canonical icon key",
  Object.fromEntries(Object.keys(aliasExpectations).map((alias) => [alias, statIconKey(alias)])),
  aliasExpectations,
);

// 6. Guard against the exact bug returning: a naive short-key lookup misses all twelve.
check("naive short-key lookup is the failure mode (0 of 12 resolve directly)", STAT_KEYS.filter((key) => statIcons[key]), []);

// 7. Twelve distinct icons.
check("the twelve resolved icons are distinct", new Set(STAT_KEYS.map((key) => getStatIcon(statIcons, key))).size, 12);

const failed = checks.filter((entry) => !entry.passed);
console.log(`${checks.length - failed.length}/${checks.length} stat icon checks passed`);
if (failed.length > 0) {
  for (const entry of failed) console.log(`FAIL ${entry.name}: ${entry.detail}`);
  process.exitCode = 1;
}
