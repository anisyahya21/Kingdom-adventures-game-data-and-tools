import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";

type RawEquipmentItem = {
  uid: string;
  name: string;
  sheetSlot: string;
  baseStats: Record<string, number>;
  incStats: Record<string, number>;
  crafterStudioLevel: number;
  crafterIntelligence: number;
};

type StatOverride = { base?: number; inc?: number };
type SharedJob = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
  ranks: Record<string, { stats: Record<string, { base: number; inc: number }> }>;
};

type SharedPair = {
  id: string;
  jobA: string;
  jobB: string;
  children: string[];
  affinity?: string;
};

type SharedData = {
  overrides?: Record<string, Record<string, StatOverride>>;
  slotAssignments?: Record<string, string>;
  weaponTypes?: Record<string, string>;
  jobs?: Record<string, SharedJob>;
  pairs?: SharedPair[];
};

type EquipmentRecord = {
  name: string;
  slot: string;
  baseStats: Record<string, number>;
  incStats: Record<string, number>;
  crafterStudioLevel: number;
  crafterIntelligence: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_URL = (p: string) => `${BASE}/ka-api/ka${p}`;

const SHEET_ID = "1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk";
const EQUIPMENT_GID = "123527243";
const RANKED_EQUIPMENT_NAME = /^[FSABCDE]\s*\/\s*/i;
const ITEM_RANK_ORDER = ["S", "A", "B", "C", "D", "E", "F"] as const;
const JOB_RANK_ORDER = ["S", "A", "B", "C", "D"] as const;
const VALID_SLOTS = ["Head", "Weapon", "Shield", "Armor", "Accessory"] as const;
type ValidSlot = typeof VALID_SLOTS[number];

const STAT_FULL: Record<string, string> = {
  hp: "HP",
  mp: "MP",
  vig: "Vigor",
  vigor: "Vigor",
  atk: "Attack",
  att: "Attack",
  attack: "Attack",
  def: "Defence",
  defence: "Defence",
  defense: "Defence",
  spd: "Speed",
  speed: "Speed",
  mov: "Move",
  move: "Move",
  movement: "Move",
  lck: "Luck",
  luck: "Luck",
  int: "Intelligence",
  intel: "Intelligence",
  intelligence: "Intelligence",
  dex: "Dexterity",
  dexterity: "Dexterity",
  gth: "Gather",
  gather: "Gather",
  hrt: "Heart",
  heart: "Heart",
};

const STAT_LABEL: Record<string, string> = {
  HP: "HP",
  MP: "MP",
  Vigor: "VIG",
  Attack: "ATK",
  Defence: "DEF",
  Speed: "SPD",
  Move: "MOV",
  Luck: "LCK",
  Intelligence: "INT",
  Dexterity: "DEX",
  Gather: "GTH",
  Heart: "HRT",
};

const SLOT_KEYWORDS: Array<{ slot: ValidSlot; words: string[] }> = [
  { slot: "Accessory", words: ["accessory", "accessories", "ring", "rings", "necklace", "necklaces", "pendant", "pendants", "amulet", "amulets", "charm", "charms", "bracelet", "bracelets", "earring", "earrings", "ornament", "ornaments", "bag", "bags", "boots", "sandals"] },
  { slot: "Weapon", words: ["weapon", "weapons", "staff", "staffs", "sword", "swords", "spear", "spears", "bow", "bows", "gun", "guns", "axe", "axes", "hammer", "hammers", "wand", "wands", "book", "books", "club", "clubs", "katana", "katanas", "knife", "knives"] },
  { slot: "Armor", words: ["armor", "armour", "robe", "robes", "cape", "capes", "mail", "coat", "coats", "clothes", "clothing", "body"] },
  { slot: "Shield", words: ["shield", "shields", "buckler", "bucklers"] },
  { slot: "Head", words: ["head", "headgear", "helmet", "helm", "hat", "hats", "cap", "caps", "hood", "hoods", "crown", "crowns", "ribbon", "ribbons", "band", "bands", "tiara"] },
];

const FURNITURE_ROWS = [
  { name: "Candle", shopLevel: 1, requiredInt: 7 },
  { name: "Kitchen Shelves", shopLevel: 1, requiredInt: 8 },
  { name: "Desk", shopLevel: 1, requiredInt: 8 },
  { name: "Red Carpet", shopLevel: 2, requiredInt: 16 },
  { name: "Decorative Plant", shopLevel: 2, requiredInt: 17 },
  { name: "Dining Table", shopLevel: 2, requiredInt: 18 },
  { name: "Study Desk", shopLevel: 3, requiredInt: 27 },
  { name: "Rainwater Barrel", shopLevel: 3, requiredInt: 28 },
  { name: "Chest of Drawers", shopLevel: 4, requiredInt: 40 },
  { name: "Flower Vase", shopLevel: 4, requiredInt: 43 },
  { name: "Shelf", shopLevel: 5, requiredInt: 57 },
  { name: "Bookshelf", shopLevel: 5, requiredInt: 60 },
  { name: "Training Room", shopLevel: 6, requiredInt: 78 },
  { name: "Rejuvenating Bath", shopLevel: 6, requiredInt: 81 },
  { name: "Flowers", shopLevel: 7, requiredInt: 101 },
  { name: "Tomato", shopLevel: 8, requiredInt: 126 },
  { name: "Dresser", shopLevel: 9, requiredInt: 152 },
  { name: "Couch", shopLevel: 9, requiredInt: 158 },
  { name: "Bathtub", shopLevel: 10, requiredInt: 188 },
  { name: "Stove", shopLevel: 10, requiredInt: 194 },
  { name: "Pansy", shopLevel: 11, requiredInt: 228 },
  { name: "Shooting Range", shopLevel: 12, requiredInt: 266 },
  { name: "Fluffy Carpet", shopLevel: 12, requiredInt: 273 },
  { name: "Cooking Counter", shopLevel: 13, requiredInt: 315 },
  { name: "Decorative Armor", shopLevel: 14, requiredInt: 360 },
  { name: "Vanity Mirror", shopLevel: 15, requiredInt: 409 },
  { name: "Window", shopLevel: 16, requiredInt: 461 },
  { name: "Magic Training Ground", shopLevel: 17, requiredInt: 516 },
  { name: "Glittering Stone", shopLevel: 18, requiredInt: 575 },
  { name: "Black Mat", shopLevel: 19, requiredInt: 637 },
  { name: "Fireplace", shopLevel: 20, requiredInt: 703 },
  { name: "Tree Nursery", shopLevel: 21, requiredInt: 772 },
  { name: "Ancestor Statue", shopLevel: 22, requiredInt: 845 },
  { name: "Animal Figurine", shopLevel: 23, requiredInt: 921 },
  { name: "Tool Workshop", shopLevel: 24, requiredInt: 1001 },
  { name: "Ore Workbench", shopLevel: 24, requiredInt: 1001 },
  { name: "Double Bed", shopLevel: 25, requiredInt: 500 },
];

const SUGGESTIONS = [
  "what accessory has the highest int at level 99",
  "what is the hp of S/ Divine Club at level 99",
  "who has the highest int at level 999",
  "highest int craftable single piece of equipment at level 99",
  "highest int craftable full loadout at level 99",
  "where can i unlock B/ Boots",
];

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getItemRank(name: string): number {
  const m = name.trim().match(/^([FSABCDE])\s*\//i);
  if (!m) return ITEM_RANK_ORDER.length;
  return ITEM_RANK_ORDER.indexOf(m[1].toUpperCase() as (typeof ITEM_RANK_ORDER)[number]);
}

function getJobRank(rankName: string): number {
  const idx = JOB_RANK_ORDER.indexOf(rankName.toUpperCase() as (typeof JOB_RANK_ORDER)[number]);
  return idx >= 0 ? idx : JOB_RANK_ORDER.length;
}

function statAtLevel(base: number, inc: number, level: number): number {
  return Math.round(base + (level - 1) * inc);
}

function isPlayerFacingEquipmentName(name: string): boolean {
  if (!RANKED_EQUIPMENT_NAME.test(name)) return false;
  const lower = name.trim().toLowerCase();
  return lower !== "bare-handed" && lower !== "no equipment";
}

function cleanupItemName(name: string): string {
  return name.replace(/^[FSABCDE]\s*\/\s*/i, "").trim();
}

function fullStat(raw: string): string {
  return STAT_FULL[raw.toLowerCase().trim()] ?? raw;
}

function isStatCol(col: string): boolean {
  return !!STAT_FULL[col.toLowerCase().trim()];
}

function isIncCol(col: string): string | null {
  const lower = col.toLowerCase().replace(/[_\s/\-+]/g, "");
  for (const key of Object.keys(STAT_FULL)) {
    if (
      lower.startsWith(key) &&
      (lower.includes("inc") ||
        lower.includes("lvl") ||
        lower.includes("level") ||
        lower.includes("per") ||
        lower.endsWith("lv"))
    ) {
      return fullStat(key);
    }
  }
  return null;
}

function parseLevel(text: string, maxLevel = 999): number {
  if (/(max level|level 99|lvl 99|lv 99)/i.test(text) && maxLevel >= 99) return 99;
  const match = text.match(/(?:level|lvl|lv)\s*(\d{1,4})/i);
  if (!match) return Math.min(maxLevel, 99);
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return Math.min(maxLevel, 99);
  return Math.max(1, Math.min(maxLevel, parsed));
}

function parseStat(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bint(?:elligence)?\b/.test(lower)) return "Intelligence";
  if (/\bdef(?:ence|ense)?\b/.test(lower)) return "Defence";
  if (/\batk\b|\batt\b|\battack\b/.test(lower)) return "Attack";
  if (/\bspd\b|\bspeed\b/.test(lower)) return "Speed";
  if (/\bmove(?:ment)?\b|\bmov\b/.test(lower)) return "Move";
  if (/\blck\b|\bluck\b/.test(lower)) return "Luck";
  if (/\bvig(?:or)?\b/.test(lower)) return "Vigor";
  if (/\bdex(?:terity)?\b/.test(lower)) return "Dexterity";
  if (/\bgth\b|\bgather\b/.test(lower)) return "Gather";
  if (/\bhrt\b|\bheart\b/.test(lower)) return "Heart";
  if (/\bhp\b/.test(lower)) return "HP";
  if (/\bmp\b/.test(lower)) return "MP";
  return null;
}

function parseSlot(text: string): ValidSlot | null {
  const lower = text.toLowerCase();
  for (const entry of SLOT_KEYWORDS) {
    if (entry.words.some((word) => lower.includes(word))) return entry.slot;
  }
  return null;
}

function statNamesToCheck(stat: string): string[] {
  if (stat === "Move") return ["Move", "Movement"];
  return [stat];
}

async function fetchEquipmentSheet(): Promise<RawEquipmentItem[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${EQUIPMENT_GID}`;
  const res = await fetch(url);
  const text = await res.text();
  const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  const data = JSON.parse(json);

  const rawCols: Array<{ id: string; label: string; type: string }> = data.table.cols;
  const cols = rawCols.map((c) => (c.label || c.id).trim());
  const colTypes = rawCols.map((c) => c.type);

  const nameColIdx = (() => {
    const ex = cols.findIndex((c) => /^(name|item.?name|equipment.?name|equip(ment)?)$/i.test(c));
    if (ex >= 0) return ex;
    return colTypes.findIndex((t) => t === "string");
  })();

  const slotColIdx = cols.findIndex((c, i) => i !== nameColIdx && /^(slot|type|equip.?type|category|kind)$/i.test(c));
  const craftLvlIdx = cols.findIndex((c) => /crafterstudio|studio.?level|crafter.?studio/i.test(c));
  const craftIntIdx = cols.findIndex((c) => /craftermintelligence|crafter.?intel|craft.*int/i.test(c));

  const items: RawEquipmentItem[] = [];
  let uid = 0;

  for (const row of data.table.rows ?? []) {
    if (!row?.c) continue;
    const cells = row.c as Array<{ v: string | number | null } | null>;
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i]?.v ?? null : null);

    const name = String(get(nameColIdx) ?? "").trim();
    if (!name || /^\d+$/.test(name) || !isPlayerFacingEquipmentName(name)) continue;

    const sheetSlot = slotColIdx >= 0 ? String(get(slotColIdx) ?? "").trim() : "";
    const baseStats: Record<string, number> = {};
    const incStats: Record<string, number> = {};

    for (let i = 0; i < cols.length; i++) {
      if (i === nameColIdx || i === slotColIdx || i === craftLvlIdx || i === craftIntIdx) continue;
      const col = cols[i];
      if (!col) continue;
      const incName = isIncCol(col);
      if (incName) incStats[incName] = Number(get(i)) || 0;
      else if (isStatCol(col)) baseStats[fullStat(col)] = Number(get(i)) || 0;
    }

    items.push({
      uid: String(uid++),
      name,
      sheetSlot,
      baseStats,
      incStats,
      crafterStudioLevel: Number(get(craftLvlIdx)) || 0,
      crafterIntelligence: Number(get(craftIntIdx)) || 0,
    });
  }

  return items;
}

async function fetchSharedData(): Promise<SharedData> {
  return fetchSharedWithFallback<SharedData>(API_URL("/shared"));
}

function buildEquipmentRecords(sheetItems: RawEquipmentItem[], shared: SharedData): EquipmentRecord[] {
  const sheetMap = new Map(sheetItems.map((item) => [item.name, item]));
  const allNames = new Set<string>([
    ...sheetItems.map((i) => i.name),
    ...Object.keys(shared.overrides ?? {}),
    ...Object.keys(shared.slotAssignments ?? {}),
  ]);

  const records: EquipmentRecord[] = [];

  for (const name of allNames) {
    const sheet = sheetMap.get(name);
    const overrides = shared.overrides?.[name] ?? {};
    const baseStats: Record<string, number> = {};
    const incStats: Record<string, number> = {};

    const statSet = new Set<string>([
      ...Object.keys(sheet?.baseStats ?? {}),
      ...Object.keys(sheet?.incStats ?? {}),
      ...Object.keys(overrides),
    ]);

    for (const stat of statSet) {
      const names = statNamesToCheck(stat);
      let base = 0;
      let inc = 0;
      for (const statName of names) {
        const ov = overrides[statName];
        if (ov?.base !== undefined) base += ov.base;
        else base += sheet?.baseStats?.[statName] ?? 0;

        if (ov?.inc !== undefined) inc += ov.inc;
        else inc += sheet?.incStats?.[statName] ?? 0;
      }
      baseStats[stat] = base;
      incStats[stat] = inc;
    }

    const slot = shared.slotAssignments?.[name] || sheet?.sheetSlot || "";
    records.push({
      name,
      slot,
      baseStats,
      incStats,
      crafterStudioLevel: sheet?.crafterStudioLevel ?? 0,
      crafterIntelligence: sheet?.crafterIntelligence ?? 0,
    });
  }

  return records.sort((a, b) => {
    const byRank = getItemRank(a.name) - getItemRank(b.name);
    if (byRank !== 0) return byRank;
    return a.name.localeCompare(b.name);
  });
}

function isExactEquipmentQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  return (
    /\bwhat is\b/.test(lower) ||
    /\bhow much\b/.test(lower) ||
    /\bshow\b/.test(lower) ||
    /\bwhere can i unlock\b/.test(lower) ||
    /\bwhere do i unlock\b/.test(lower) ||
    /\bwhere can i craft\b/.test(lower) ||
    /\bwhere do i craft\b/.test(lower) ||
    /\bwhere can i get\b/.test(lower) ||
    /\bwhere do i get\b/.test(lower) ||
    /\bwhat level unlocks\b/.test(lower) ||
    RANKED_EQUIPMENT_NAME.test(question)
  );
}

function findExactEquipment(question: string, items: EquipmentRecord[]): EquipmentRecord | null {
  if (!isExactEquipmentQuestion(question)) return null;

  const q = normalize(question);

  const exactFull = items.find((item) => {
    const pattern = new RegExp(`\\b${escapeRegExp(normalize(item.name))}\\b`);
    return pattern.test(q);
  });
  if (exactFull) return exactFull;

  const phraseMatches = items.filter((item) => {
    const cleaned = normalize(cleanupItemName(item.name));
    if (cleaned.length < 4) return false;
    const pattern = new RegExp(`\\b${escapeRegExp(cleaned)}\\b`);
    return pattern.test(q);
  });

  if (phraseMatches.length === 1) return phraseMatches[0];
  if (phraseMatches.length > 1) {
    return [...phraseMatches].sort((a, b) => getItemRank(a.name) - getItemRank(b.name))[0];
  }

  return null;
}

function mapSlotToShop(slot: string): string {
  if (slot === "Weapon") return "Weapon Shop";
  if (slot === "Accessory") return "Accessory Shop";
  if (slot === "Head" || slot === "Armor" || slot === "Shield") return "Armor Shop";
  return "Shop";
}

function questionLooksLikeJobQuestion(question: string): boolean {
  const lower = question.toLowerCase();
  return (
    lower.startsWith("who ") ||
    /\bwhat job\b/.test(lower) ||
    /\bwhich job\b/.test(lower) ||
    /\bjob\b/.test(lower) ||
    /\bclass\b/.test(lower) ||
    /\bunit\b/.test(lower) ||
    /\bcombat unit\b/.test(lower) ||
    /\bnon combat unit\b/.test(lower) ||
    /\bnon-combat unit\b/.test(lower) ||
    /\bmage\b/.test(lower) ||
    /\bdoctor\b/.test(lower) ||
    /\bchampion\b/.test(lower)
  );
}

function questionLooksLikeEquipmentRanking(question: string): boolean {
  return /\b(best|highest|strongest|top)\b/i.test(question);
}

function questionLooksLikeLoadout(question: string): boolean {
  const lower = question.toLowerCase();
  return (
    /\bloadout\b/.test(lower) ||
    /\bfull loadout\b/.test(lower) ||
    /\bfull gear\b/.test(lower) ||
    /\bgear set\b/.test(lower) ||
    /\bone per slot\b/.test(lower) ||
    /\btotal\b/.test(lower)
  );
}

function questionLooksLikeSinglePiece(question: string): boolean {
  const lower = question.toLowerCase();
  return /\bsingle piece\b/.test(lower) || /\bsingle item\b/.test(lower) || /\bone item\b/.test(lower);
}

function wantsCraftableOnly(question: string): boolean {
  return /\bcraftable\b/.test(question.toLowerCase());
}

function wantsGrowth(question: string): boolean {
  return /\bgrowth\b/.test(question.toLowerCase()) || /\bper level\b/.test(question.toLowerCase()) || /\bincrement\b/.test(question.toLowerCase());
}

function answerFurnitureUnlock(question: string): string | null {
  const lower = question.toLowerCase();
  const asksUnlock = /\b(unlock|where can i|get|craft|make)\b/.test(lower);
  if (!asksUnlock) return null;

  const row = FURNITURE_ROWS.find((entry) => lower.includes(entry.name.toLowerCase()));
  if (!row) return null;

  return `${row.name} unlocks at Furniture Shop level ${row.shopLevel} and needs ${row.requiredInt} INT.`;
}

function answerEquipmentExactStat(question: string, items: EquipmentRecord[]): string | null {
  const item = findExactEquipment(question, items);
  const stat = parseStat(question);
  if (!item || !stat) return null;

  const level = Math.min(parseLevel(question, 99), 99);
  const base = item.baseStats[stat] ?? 0;
  const inc = item.incStats[stat] ?? 0;
  const value = statAtLevel(base, inc, level);

  return `${item.name} has ${value} ${STAT_LABEL[stat] ?? stat} at level ${level}. Base ${STAT_LABEL[stat] ?? stat}: ${base}. Growth: +${inc} per level.`;
}

function answerEquipmentUnlock(question: string, items: EquipmentRecord[]): string | null {
  const lower = question.toLowerCase();
  if (!/\b(unlock|where can i|get|craft|make)\b/.test(lower)) return null;

  const item = findExactEquipment(question, items);
  if (!item) return null;

  if (item.crafterStudioLevel <= 0) {
    return `${item.name} is marked as not craftable on the current site data.`;
  }

  const shop = mapSlotToShop(item.slot);
  return `${item.name} unlocks at ${shop} level ${item.crafterStudioLevel} and needs ${item.crafterIntelligence} INT.`;
}

function scoreEquipment(item: EquipmentRecord, stat: string, level: number, useGrowthOnly: boolean): { value: number; base: number; inc: number } {
  const base = item.baseStats[stat] ?? 0;
  const inc = item.incStats[stat] ?? 0;
  const value = useGrowthOnly ? inc : statAtLevel(base, inc, level);
  return { value, base, inc };
}

function filterCraftable(items: EquipmentRecord[], craftableOnly: boolean): EquipmentRecord[] {
  if (!craftableOnly) return items;
  return items.filter((item) => item.crafterStudioLevel > 0);
}

function answerBestEquipment(question: string, items: EquipmentRecord[]): string | null {
  if (!questionLooksLikeEquipmentRanking(question)) return null;
  if (questionLooksLikeJobQuestion(question)) return null;
  if (questionLooksLikeLoadout(question)) return null;

  const stat = parseStat(question);
  if (!stat) return null;

  const slot = parseSlot(question);
  const craftableOnly = wantsCraftableOnly(question);
  const level = Math.min(parseLevel(question, 99), 99);
  const useGrowthOnly = wantsGrowth(question);

  let pool = filterCraftable(items, craftableOnly);
  if (slot) pool = pool.filter((item) => item.slot === slot);

  if (questionLooksLikeSinglePiece(question) && !slot) {
    // stays across all items
  } else if (!slot && !questionLooksLikeSinglePiece(question)) {
    return null;
  }

  const ranked = pool
    .map((item) => {
      const scored = scoreEquipment(item, stat, level, useGrowthOnly);
      return { item, ...scored };
    })
    .filter((entry) => entry.value > 0)
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      if (b.inc !== a.inc) return b.inc - a.inc;
      if (b.base !== a.base) return b.base - a.base;
      return getItemRank(a.item.name) - getItemRank(b.item.name);
    });

  const best = ranked[0];
  if (!best) {
    const qualifier = slot ? `${slot.toLowerCase()} ` : "";
    const craftText = craftableOnly ? "craftable " : "";
    return `I could not find any ${craftText}${qualifier}item with non-zero ${STAT_LABEL[stat] ?? stat} in the current site data.`;
  }

  const subject = slot ? `${slot.toLowerCase()} items` : "single equipment pieces";
  const craftText = craftableOnly ? " craftable" : "";
  if (useGrowthOnly) {
    return `${best.item.name} has the highest ${STAT_LABEL[stat] ?? stat} growth among${craftText} ${subject}. It gains +${best.inc} per level, with base ${best.base}.`;
  }
  return `${best.item.name} has the highest ${STAT_LABEL[stat] ?? stat} among${craftText} ${subject} at level ${level}. It reaches ${best.value}, with base ${best.base} and +${best.inc} per level.`;
}

function answerBestLoadout(question: string, items: EquipmentRecord[]): string | null {
  if (!questionLooksLikeLoadout(question)) return null;
  const stat = parseStat(question);
  if (!stat) return null;

  const craftableOnly = wantsCraftableOnly(question);
  const level = Math.min(parseLevel(question, 99), 99);
  const useGrowthOnly = wantsGrowth(question);

  const pool = filterCraftable(items, craftableOnly);

  const winners: Array<{ slot: ValidSlot; item: EquipmentRecord; value: number; base: number; inc: number }> = [];
  for (const slot of VALID_SLOTS) {
    const best = pool
      .filter((item) => item.slot === slot)
      .map((item) => ({ item, ...scoreEquipment(item, stat, level, useGrowthOnly) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        if (b.inc !== a.inc) return b.inc - a.inc;
        if (b.base !== a.base) return b.base - a.base;
        return getItemRank(a.item.name) - getItemRank(b.item.name);
      })[0];

    if (best) winners.push({ slot, ...best });
  }

  if (winners.length === 0) {
    const craftText = craftableOnly ? " craftable" : "";
    return `I could not build a${craftText} loadout with non-zero ${STAT_LABEL[stat] ?? stat}.`;
  }

  const total = winners.reduce((sum, row) => sum + row.value, 0);
  const label = STAT_LABEL[stat] ?? stat;
  const lines = winners.map((row) => `${row.slot}: ${row.item.name} (${useGrowthOnly ? `+${row.inc}` : row.value} ${label})`);
  const craftText = craftableOnly ? " craftable" : "";
  const lead = useGrowthOnly
    ? `Highest total ${label} growth${craftText} full loadout:`
    : `Highest total ${label}${craftText} full loadout at level ${level}:`;

  return `${lead}\n${lines.join("\n")}\nTotal ${label}: ${total}`;
}

function answerComparison(question: string, items: EquipmentRecord[]): string | null {
  const lower = question.toLowerCase();
  if (!/\bbetter\b|\bstronger\b|\bcompare\b/.test(lower)) return null;

  const normalized = normalize(question);
  const found = items.filter((item) => {
    const full = new RegExp(`\\b${escapeRegExp(normalize(item.name))}\\b`);
    const clean = new RegExp(`\\b${escapeRegExp(normalize(cleanupItemName(item.name)))}\\b`);
    return full.test(normalized) || clean.test(normalized);
  });

  const unique = Array.from(new Map(found.map((item) => [item.name, item])).values()).slice(0, 5);
  if (unique.length < 2) return null;

  const a = unique[0];
  const b = unique[1];
  const stat = parseStat(question);
  const level = Math.min(parseLevel(question, 99), 99);

  if (stat) {
    const av = statAtLevel(a.baseStats[stat] ?? 0, a.incStats[stat] ?? 0, level);
    const bv = statAtLevel(b.baseStats[stat] ?? 0, b.incStats[stat] ?? 0, level);
    if (av === bv) return `${a.name} and ${b.name} are tied for ${STAT_LABEL[stat] ?? stat} at level ${level}, at ${av}.`;
    const winner = av > bv ? a : b;
    const loser = av > bv ? b : a;
    const winVal = Math.max(av, bv);
    const loseVal = Math.min(av, bv);
    return `${winner.name} is better for ${STAT_LABEL[stat] ?? stat} at level ${level}. It has ${winVal}, while ${loser.name} has ${loseVal}.`;
  }

  const totalA = Object.keys(STAT_LABEL).reduce((sum, key) => sum + statAtLevel(a.baseStats[key] ?? 0, a.incStats[key] ?? 0, level), 0);
  const totalB = Object.keys(STAT_LABEL).reduce((sum, key) => sum + statAtLevel(b.baseStats[key] ?? 0, b.incStats[key] ?? 0, level), 0);
  if (totalA === totalB) return `${a.name} and ${b.name} are tied on total displayed stats at level ${level}, at ${totalA}.`;
  const winner = totalA > totalB ? a : b;
  const loser = totalA > totalB ? b : a;
  const winVal = Math.max(totalA, totalB);
  const loseVal = Math.min(totalA, totalB);
  return `${winner.name} has the higher total displayed stats at level ${level}. It totals ${winVal}, while ${loser.name} totals ${loseVal}.`;
}

function answerBestJob(question: string, shared: SharedData): string | null {
  if (!questionLooksLikeJobQuestion(question)) return null;
  const stat = parseStat(question);
  if (!stat) return null;

  const lower = question.toLowerCase();
  const level = parseLevel(question, 999);
  const combatOnly = /\bcombat\b/.test(lower) && !/\bnon combat\b|\bnon-combat\b/.test(lower);
  const nonCombatOnly = /\bnon combat\b|\bnon-combat\b/.test(lower);

  const jobs = Object.entries(shared.jobs ?? {});
  if (jobs.length === 0) return "I could not read any jobs from the site data.";

  const ranked = jobs
    .filter(([, job]) => {
      if (combatOnly) return job.type === "combat";
      if (nonCombatOnly) return job.type === "non-combat";
      return true;
    })
    .flatMap(([name, job]) =>
      Object.entries(job.ranks ?? {}).map(([rankName, rank]) => {
        const entry = rank.stats?.[stat];
        if (!entry) return null;
        const value = statAtLevel(entry.base, entry.inc, level);
        return { name, rankName, type: job.type ?? "unknown", value, base: entry.base, inc: entry.inc };
      })
    )
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      if (b.inc !== a.inc) return b.inc - a.inc;
      if (b.base !== a.base) return b.base - a.base;
      return getJobRank(a.rankName) - getJobRank(b.rankName);
    });

  const best = ranked[0];
  if (!best) return `I could not find any matching job with ${STAT_LABEL[stat] ?? stat} data.`;

  const typeText = combatOnly ? " combat" : nonCombatOnly ? " non-combat" : "";
  return `${best.name} has the highest${typeText} ${STAT_LABEL[stat] ?? stat} at level ${level} on the current site data, using rank ${best.rankName}. It reaches ${best.value}, with base ${best.base} and +${best.inc} per level.`;
}

function answerShop(question: string): string | null {
  const lower = question.toLowerCase();

  if (/\bcape\b|\bcapes\b/.test(lower)) return "Capes are in the Armor Shop.";
  if (/\b(accessory|ring|pendant|amulet|necklace)\b/.test(lower) && /\b(shop|where|buy|craft|make)\b/.test(lower)) {
    return "Accessories are in the Accessory Shop.";
  }
  if (/\b(weapon|sword|staff|spear|bow|gun|axe|hammer|book|club)\b/.test(lower) && /\b(shop|where|buy|craft|make)\b/.test(lower)) {
    return "Weapons are in the Weapon Shop.";
  }
  if (/\b(armor|armour|shield|headgear|hat|helmet)\b/.test(lower) && /\b(shop|where|buy|craft|make)\b/.test(lower)) {
    return "Armor, shields, and headgear are in the Armor Shop.";
  }

  return null;
}

function answerPairs(question: string, shared: SharedData): string | null {
  const lower = question.toLowerCase();
  const asksRoyal = /\broyal\b/.test(lower);
  const asksParentOrBreed = /\bparent\b|\bmarry\b|\bbreed\b|\bchild\b/.test(lower);
  if (!asksRoyal && !asksParentOrBreed) return null;

  const pairs = shared.pairs ?? [];
  if (pairs.length === 0) return "I could not read any pair data from the site.";

  const royalPairs = pairs.filter((pair) => pair.children.some((child) => normalize(child) === "royal"));
  if (royalPairs.length === 0) return "I could not find any Royal child pairs in the current site data.";

  if (/\bmonarch\b/.test(lower)) {
    const monarchPairs = royalPairs.filter((pair) => normalize(pair.jobA) === "monarch" || normalize(pair.jobB) === "monarch");
    if (monarchPairs.length === 0) return "I could not find a Monarch pair that makes Royal in the current site data.";
    const examples = monarchPairs.slice(0, 8).map((pair) => `${pair.jobA} + ${pair.jobB}${pair.affinity ? ` (${pair.affinity})` : ""}`);
    return `Monarch can make Royal with these known pairs: ${examples.join("; ")}.`;
  }

  const examples = royalPairs.slice(0, 10).map((pair) => `${pair.jobA} + ${pair.jobB}${pair.affinity ? ` (${pair.affinity})` : ""}`);
  return `Known Royal child pairs in the current site data include: ${examples.join("; ")}.`;
}

function answerWeeklyConquest(question: string): string | null {
  const lower = question.toLowerCase();
  if (!/\bweekly conquest\b|\bthis week\b/.test(lower)) return null;
  return "I have not wired weekly conquest answers into the helper yet, even though the site has a weekly conquest page.";
}

function answerOwnedInventory(question: string): string | null {
  const lower = question.toLowerCase();
  if (!/\bi own\b|\bowned\b|\bmy gear\b|\bmy equipment\b/.test(lower)) return null;
  return "I do not know your owned gear yet. I can answer database-wide, craftable, and full-loadout questions, but personal inventory is not wired in yet.";
}

function answerQuestion(question: string, items: EquipmentRecord[], shared: SharedData): string {
  return (
    answerOwnedInventory(question) ??
    answerFurnitureUnlock(question) ??
    answerEquipmentUnlock(question, items) ??
    answerEquipmentExactStat(question, items) ??
    answerComparison(question, items) ??
    answerPairs(question, shared) ??
    answerWeeklyConquest(question) ??
    answerBestJob(question, shared) ??
    answerBestLoadout(question, items) ??
    answerBestEquipment(question, items) ??
    answerShop(question) ??
    "I do not know that one yet. I am best at exact equipment stats, best items, craftable single pieces, craftable full loadouts, jobs, furniture unlocks, and shops."
  );
}

export default function AskDatabaseWidget() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: "assistant",
      text: "Ask me about equipment, jobs, furniture unlocks, shops, craftable single pieces, or craftable full loadouts. I keep full names like C/ Magic Pendant in the reply.",
    },
  ]);

  const { data: sheetItems = [], isLoading: sheetLoading } = useQuery({
    queryKey: ["askdb-equipment-sheet"],
    queryFn: fetchEquipmentSheet,
    staleTime: 5 * 60 * 1000,
  });

  const { data: shared = {}, isLoading: sharedLoading } = useQuery({
    queryKey: ["askdb-shared"],
    queryFn: fetchSharedData,
    staleTime: 30 * 1000,
  });

  const equipmentRecords = useMemo(() => buildEquipmentRecords(sheetItems, shared), [sheetItems, shared]);

  const canSend = query.trim().length > 0;

  const submitQuestion = (raw?: string) => {
    const text = (raw ?? query).trim();
    if (!text) return;

    const userMsg: ChatMessage = { id: makeId(), role: "user", text };
    const answerText =
      sheetLoading || sharedLoading
        ? "Loading site data..."
        : answerQuestion(text, equipmentRecords, shared);

    const assistantMsg: ChatMessage = { id: makeId(), role: "assistant", text: answerText };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setQuery("");
    setOpen(true);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
          aria-label="Open Ask the Database"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(26rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)]">
          <Card className="shadow-2xl border-primary/20 overflow-hidden">
            <CardHeader className="pb-3 border-b border-border bg-background">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    Ask the Database
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Floating helper, not AI. This version supports stricter routing, craftable filters, and full-loadout questions.
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0 bg-background">
              <div className="max-h-[28rem] overflow-y-auto px-4 py-4 space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[90%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {message.text}
                  </div>
                ))}
              </div>

              <div className="border-t border-border px-4 py-3 space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Try: exact item, best slot item, craftable single piece, full loadout, job ranking, unlock, or shop.</div>
                  <div>Examples: “highest int craftable single piece”, “highest total attack craftable full loadout”, “who has the highest int at level 999”.</div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => submitQuestion(suggestion)}
                      className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-muted transition-colors text-left"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitQuestion();
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask about equipment, jobs, full loadouts, shops..."
                    className="h-12"
                  />
                  <Button type="submit" size="icon" className="h-12 w-12 shrink-0" disabled={!canSend}>
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
