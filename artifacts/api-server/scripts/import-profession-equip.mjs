import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../data/ka_shared.json");

function parseCSV(text) {
  const rows = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const cells = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === "," && !inQuote) {
        cells.push(cur.trim()); cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  return rows;
}

function fetchWithCurl(url, outFile) {
  execSync(`curl -sL --max-time 20 "${url}" -o "${outFile}"`, { timeout: 25000 });
  return fs.readFileSync(outFile, "utf8");
}

const WEAPON_COLS = ["Shield", "Axe", "Book", "Bow", "Club", "Gun", "Hammer", "Spear", "Staff", "Sword"];

const JOB_NAME_MAP = {
  "Santa": "Santa Claus",
};

function normalizeCell(v) {
  const u = (v || "").trim().toLowerCase();
  if (u === "x") return "can";
  if (u === "w") return "weak";
  if (u === "-") return "cannot";
  return null;
}

async function main() {
  const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  // ── 1. Profession equipment data ────────────────────────────────────────────
  console.log("Fetching profession equipment sheet…");
  const profCsv = fetchWithCurl(
    "https://docs.google.com/spreadsheets/d/1pNx7SjpgjuKFI9Hgr21y3ammRlZjKNTTdvfLYQL7l7A/export?format=csv&gid=1818682878",
    "/tmp/prof_equip_fresh.csv"
  );
  const profRows = parseCSV(profCsv);

  // Row 0: all empty
  // Row 1: "W=weak, X=yes", Shield, Axe, ...
  // Row 2+: JobName, values
  let weaponUpdated = 0;
  for (let r = 2; r < profRows.length; r++) {
    const row = profRows[r];
    if (!row[0]) continue;
    const sheetJobName = row[0].trim();
    if (!sheetJobName) continue;

    const jobName = JOB_NAME_MAP[sheetJobName] || sheetJobName;
    if (!state.jobs[jobName]) {
      console.log(`  ⚠ Skip "${sheetJobName}" — no matching job`);
      continue;
    }

    const weaponEquip = {};
    let hasData = false;
    for (let c = 0; c < WEAPON_COLS.length; c++) {
      const val = normalizeCell(row[c + 1]);
      if (val) { weaponEquip[WEAPON_COLS[c]] = val; hasData = true; }
    }

    if (hasData) {
      state.jobs[jobName].weaponEquip = weaponEquip;
      weaponUpdated++;
      console.log(`  ✓ ${jobName}:`, JSON.stringify(weaponEquip));
    } else {
      console.log(`  — ${jobName}: no weapon data`);
    }
  }
  console.log(`\nWeaponEquip updated for ${weaponUpdated} jobs.\n`);

  // ── 2. Fix skills prices: W=sell col[22], X=buy col[23] ────────────────────
  console.log("Fetching skills sheet…");
  const skillsCsv = fetchWithCurl(
    "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/export?format=csv&gid=630684669",
    "/tmp/skills_fresh.csv"
  );
  const skillRows = parseCSV(skillsCsv);

  let skillsFixed = 0;
  for (let i = 2; i < skillRows.length; i++) {
    const row = skillRows[i];
    if (row.length < 30) continue;
    const nameBase = (row[29] || "").trim();
    const nameArg = (row[30] || "").trim();
    const fullName = nameBase.replace("<0>", nameArg).trim();
    if (!fullName || fullName === "Not used" || fullName === "未使用" || fullName === "Skill") continue;

    const sell = parseInt(row[22], 10);   // W column
    const buy = parseInt(row[23], 10);    // X column
    const studio = parseInt(row[25], 10); // craftTermStudioLevel
    const intel = parseInt(row[26], 10);  // craftTermIntelligence

    const notCraftable = isNaN(studio) || studio >= 999;
    const studioLevel = notCraftable ? null : studio;
    const craftingIntelligence = notCraftable ? null : intel;

    const existing = state.skills[fullName];
    const description = existing?.description ?? undefined;
    const weaponResistance = existing?.weaponResistance ?? undefined;

    state.skills[fullName] = {
      name: fullName,
      sellPrice: isNaN(sell) ? null : sell,
      buyPrice: isNaN(buy) ? null : buy,
      studioLevel,
      craftingIntelligence,
      ...(description !== undefined ? { description } : {}),
      ...(weaponResistance !== undefined ? { weaponResistance } : {}),
    };
    skillsFixed++;
  }
  console.log(`Fixed prices for ${skillsFixed} skills.\n`);

  // ── 3. Mark resistance skills ───────────────────────────────────────────────
  const RESISTANCE_MAP = {
    "Sword Resistance":  "Sword",
    "Staff Resistance":  "Staff",
    "Axe Resistance":    "Axe",
    "Spear Resistance":  "Spear",
    "Hammer Resistance": "Hammer",
    "Club Resistance":   "Club",
    "Gun Resistance":    "Gun",
    "Bow Resistance":    "Bow",
    "Book Resistance":   "Book",
    "Shield Resistance": "Shield",
  };
  for (const [skillName, weaponType] of Object.entries(RESISTANCE_MAP)) {
    if (state.skills[skillName]) {
      state.skills[skillName].weaponResistance = weaponType;
      state.skills[skillName].description =
        `Removes weakness penalty and allows wielding ${weaponType} equipment even without natural proficiency.`;
      console.log(`  ✓ Marked "${skillName}" → resistance for ${weaponType}`);
    }
  }
  console.log();

  // ── 4. Save ─────────────────────────────────────────────────────────────────
  fs.writeFileSync(DATA_FILE, JSON.stringify(state));
  console.log("✅ ka_shared.json saved successfully.");
}

main().catch((err) => { console.error(err); process.exit(1); });
