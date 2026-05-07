import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { googleSheetUrl } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import {
  CheckCircle2,
  ChevronDown,
  Hammer,
  Package,
  Leaf,
  Search,
  Shield,
  Sofa,
  Store,
  UtensilsCrossed,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ka/category-badge";
import { CostPills } from "@/components/ka/cost-pills";
import { DataCard } from "@/components/ka/data-card";
import { PageHeader } from "@/components/ka/page-header";
import { StatTable, StatTableHeaderCell } from "@/components/ka/stat-table";
import { EntityLink } from "@/components/ka/entity-link";
import { localSharedData } from "@/lib/local-shared-data";
import { parseCsv } from "@/lib/monster-truth";
import { SHOP_RECORDS, type ShopRecord, type ShopSlug, type ShopBuilding, type ShopFacility } from "@/lib/shop-utils";
import { PLOT_SIZES, PLOT_TILES } from "@/game-data/buildings";
import { FACILITIES } from "@/game-data/facilities";
import { FacilityCard } from "./houses";
import facilityLookupCsv from "../../../../data/Sheet csv/KA GameData - Facility_lookup.csv?raw";
import expCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Exp.csv?raw";
import itemCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Item.csv?raw";
import jobCsv from "../../../../data/Sheet csv/KA GameData - Job.csv?raw";

type EquipmentSlot = "Head" | "Weapon" | "Shield" | "Armor" | "Accessory" | "-";
type EquipmentRow = {
  sourceId: number | null;
  name: string;
  rank: string;
  slot: EquipmentSlot;
  weaponType: string;
  craftable: boolean;
  studioLevel: number;
  craftingIntelligence: number;
  attack: number;
  defence: number;
  speed: number;
  intelligence: number;
  luck: number;
  hp: number;
  mp: number;
};

type SkillRow = {
  name: string;
  studioLevel: number;
  craftingIntelligence: number;
  buyPrice: number;
  sellPrice: number;
  description?: string;
  weaponResistance?: string;
};

type ItemRow = {
  name: string;
  category: number;
  type: number;
  craftGroup: number;
  studioLevel: number;
  craftingIntelligence: number;
  craftTimeSeconds: number;
  bonusCategory: number;
  bonusType: number;
  bonusMinValue: number;
  bonusMaxValue: number;
  eggBonusType: number;
  eggBonusValue: number;
  eggBonusExp: number;
  eggBonusTime: number;
  shopFlag: number;
};

type FurnitureRow = {
  name: string;
  studioLevel: number;
  craftingIntelligence: number;
};

type ItemFacilityRow = {
  item: ItemRow;
  sources: string[];
  facilities: string[];
};

type FeedCandidateRow = {
  item: ItemRow;
  sources: string[];
  facilities: string[];
};

const JOB_PARAMETER_ORDER = ["HP", "MP", "Vigor", "ATK", "DEF", "SPEED", "LUCK", "Owned?", "INT", "DEX", "CONS", "MOVE", "Heart"] as const;
type JobParameterKey = (typeof JOB_PARAMETER_ORDER)[number];

type JobNeedExpProfile = {
  name: string;
  needExpByParameter: Record<JobParameterKey, number>;
};

const ITEM_SOURCE_ORDER = ["Item Shop", "Facility only", "Other sources"] as const;
const NO_FACILITY_SOURCE_FILTER = "__none__";

type SharedDataShape = {
  slotAssignments?: Record<string, string>;
  weaponTypes?: Record<string, string>;
  skills?: Record<string, SkillRow>;
  statIcons?: Record<string, string>;
};

const EQUIP_SHEET_URL = googleSheetUrl("equipment");
const ITEM_SHEET_URL = googleSheetUrl("shops-items");
const CRAFTABLE_ITEM_FLAG = 128;
const COOKED_ITEM_FLAG = 1024;
const ORCHARD_FRUIT_TREE_CRAFT_GROUP = 70;
const KNOWN_ITEM_SHOP_FLAGS: Array<{ mask: number; label: string }> = [
  { mask: CRAFTABLE_ITEM_FLAG, label: "CRAFTABLE_ITEM_FLAG (128)" },
  { mask: COOKED_ITEM_FLAG, label: "COOKED_ITEM_FLAG (1024)" },
];
const FALLBACK_ITEM_CRAFT_FACILITIES = ["Item Workbench"];
const FALLBACK_COOKED_CRAFT_FACILITIES = ["Cooking Station"];
const VALID_SLOTS: EquipmentSlot[] = ["Head", "Weapon", "Shield", "Armor", "Accessory", "-"];
const EQUIPMENT_VARIANT_NAME_BY_ID: Record<number, string> = {
  192: "B/ Legendary Shield (B)",
  198: "B/ Legendary Shield (R)",
  235: "E/ Hat (B)",
  237: "E/ Hat (R)",
};
const RANKS = ["All", "B", "C", "D", "E", "F"] as const;
const EXCLUDED_SKILLS = new Set(["normal attack", "gun attack", "critical hit"]);
const FURNITURE_ROWS: FurnitureRow[] = [
  { name: "Candle", studioLevel: 1, craftingIntelligence: 7 },
  { name: "Kitchen Shelves", studioLevel: 1, craftingIntelligence: 8 },
  { name: "Desk", studioLevel: 1, craftingIntelligence: 8 },
  { name: "Red Carpet", studioLevel: 2, craftingIntelligence: 13 },
  { name: "Decorative Plant", studioLevel: 2, craftingIntelligence: 17 },
  { name: "Dining Table", studioLevel: 2, craftingIntelligence: 17 },
  { name: "Study Desk", studioLevel: 2, craftingIntelligence: 21 },
  { name: "Rainwater Barrel", studioLevel: 2, craftingIntelligence: 25 },
  { name: "Chest of Drawers", studioLevel: 2, craftingIntelligence: 29 },
  { name: "Flower Vase", studioLevel: 3, craftingIntelligence: 23 },
  { name: "Shelf", studioLevel: 3, craftingIntelligence: 32 },
  { name: "Bookshelf", studioLevel: 4, craftingIntelligence: 53 },
  { name: "Training Room", studioLevel: 4, craftingIntelligence: 85 },
  { name: "Rejuvenating Bath", studioLevel: 4, craftingIntelligence: 85 },
  { name: "Flowers", studioLevel: 5, craftingIntelligence: 55 },
  { name: "Tomato", studioLevel: 5, craftingIntelligence: 80 },
  { name: "Dresser", studioLevel: 5, craftingIntelligence: 80 },
  { name: "Couch", studioLevel: 5, craftingIntelligence: 155 },
  { name: "Bathtub", studioLevel: 5, craftingIntelligence: 155 },
  { name: "Stove", studioLevel: 5, craftingIntelligence: 155 },
  { name: "Pansy", studioLevel: 6, craftingIntelligence: 77 },
  { name: "Shooting Range", studioLevel: 7, craftingIntelligence: 293 },
  { name: "Fluffy Carpet", studioLevel: 7, craftingIntelligence: 152 },
  { name: "Cooking Counter", studioLevel: 7, craftingIntelligence: 201 },
  { name: "Decorative Armor", studioLevel: 8, craftingIntelligence: 261 },
  { name: "Vanity Mirror", studioLevel: 8, craftingIntelligence: 261 },
  { name: "Window", studioLevel: 9, craftingIntelligence: 329 },
  { name: "Magic Training Ground", studioLevel: 9, craftingIntelligence: 500 },
  { name: "Glittering Stone", studioLevel: 10, craftingIntelligence: 405 },
  { name: "Black Mat", studioLevel: 11, craftingIntelligence: 489 },
  { name: "Fireplace", studioLevel: 11, craftingIntelligence: 489 },
  { name: "Tree Nursery", studioLevel: 12, craftingIntelligence: 293 },
  { name: "Ancestor Statue", studioLevel: 12, craftingIntelligence: 500 },
  { name: "Animal Figurine", studioLevel: 13, craftingIntelligence: 500 },
  { name: "Tool Workshop", studioLevel: 16, craftingIntelligence: 500 },
  { name: "Ore Workbench", studioLevel: 23, craftingIntelligence: 500 },
  { name: "Double Bed", studioLevel: 25, craftingIntelligence: 500 },
];

const SHOP_ICONS: Record<ShopSlug, ReactNode> = {
  "items-reference": <Package className="w-5 h-5 text-indigo-500" />,
  "weapon-shop": <Hammer className="w-5 h-5 text-amber-500" />,
  "armor-shop": <Shield className="w-5 h-5 text-sky-500" />,
  "accessory-shop": <Store className="w-5 h-5 text-violet-500" />,
  "item-shop": <Package className="w-5 h-5 text-emerald-500" />,
  "furniture-shop": <Sofa className="w-5 h-5 text-orange-500" />,
  restaurant: <UtensilsCrossed className="w-5 h-5 text-rose-500" />,
  "skill-shop": <WandSparkles className="w-5 h-5 text-cyan-500" />,
  orchard: <Leaf className="w-5 h-5 text-lime-600" />,
};

const ITEMS_REFERENCE_SHOPS = SHOP_RECORDS.filter((shop) => shop.slug === "items-reference");
const PRIMARY_SHOPS = SHOP_RECORDS.filter((shop) => shop.category === "shop" && shop.slug !== "items-reference");
const SECONDARY_FACILITIES = SHOP_RECORDS.filter((shop) => shop.category === "facility");

function getRank(name: string): string {
  const match = name.trim().match(/^([FSABCDE])\s*\//i);
  return match ? match[1].toUpperCase() : "";
}

function isPlayerFacingEquipmentName(name: string): boolean {
  return /^[FSABCDE]\s*\/\s*/i.test(name);
}

function getNumeric(cells: Array<{ v: string | number | null } | null>, index: number): number {
  const value = index >= 0 && index < cells.length ? cells[index]?.v : null;
  return Number(value) || 0;
}

function getText(cells: Array<{ v: string | number | null } | null>, index: number): string {
  const value = index >= 0 && index < cells.length ? cells[index]?.v : null;
  return String(value ?? "").trim();
}

function findColumnIndex(cols: string[], patterns: RegExp[]): number {
  return cols.findIndex((col) => patterns.some((pattern) => pattern.test(col)));
}

function fallbackIndex(index: number, fallback: number): number {
  return index >= 0 ? index : fallback;
}

function parseFacilityCraftGroupMap(rawCsv: string): Map<number, string[]> {
  const rows = parseCsv(rawCsv);
  if (rows.length === 0) return new Map();
  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => cell.trim());
    return normalized.includes("name") && normalized.includes("craftGroup");
  });
  if (headerRowIndex < 0) return new Map();

  const header = rows[headerRowIndex].map((cell) => cell.trim());
  const craftGroupIndex = header.findIndex((cell) => /^craftGroup$/i.test(cell));
  const nameIndex = header.findIndex((cell) => /^name$/i.test(cell));
  if (craftGroupIndex < 0 || nameIndex < 0) return new Map();

  const map = new Map<number, Set<string>>();
  for (const row of rows.slice(headerRowIndex + 1)) {
    const name = String(row[nameIndex] ?? "").trim();
    const craftGroup = Number(row[craftGroupIndex] ?? "");
    if (!name || name === "#N/A" || !Number.isFinite(craftGroup) || craftGroup < 0) continue;
    const bucket = map.get(craftGroup) ?? new Set<string>();
    bucket.add(name);
    map.set(craftGroup, bucket);
  }

  const output = new Map<number, string[]>();
  for (const [group, names] of map.entries()) {
    output.set(group, Array.from(names).sort((a, b) => a.localeCompare(b)));
  }
  return output;
}

function parseExpByLevel(rawCsv: string): Map<number, number> {
  const rows = parseCsv(rawCsv);
  if (rows.length === 0) return new Map();
  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => cell.trim());
    return normalized.includes("id") && normalized.includes("exp");
  });
  if (headerRowIndex < 0) return new Map();

  const header = rows[headerRowIndex].map((cell) => cell.trim());
  const levelIndex = header.findIndex((cell) => /^id$/i.test(cell));
  const expIndex = header.findIndex((cell) => /^exp$/i.test(cell));
  if (levelIndex < 0 || expIndex < 0) return new Map();

  const map = new Map<number, number>();
  for (const row of rows.slice(headerRowIndex + 1)) {
    const level = Number(row[levelIndex] ?? "");
    const exp = Number(row[expIndex] ?? "");
    if (!Number.isFinite(level) || level < 1 || !Number.isFinite(exp) || exp < 0) continue;
    map.set(level, exp);
  }
  return map;
}

function parseJobNeedExpProfiles(rawCsv: string): JobNeedExpProfile[] {
  const rows = parseCsv(rawCsv);
  if (rows.length === 0) return [];

  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => cell.trim());
    return normalized.includes("id") && normalized.includes("name") && normalized.includes("maxLevel");
  });
  if (headerRowIndex < 0) return [];

  const header = rows[headerRowIndex].map((cell) => cell.trim());
  const nameIndex = header.findIndex((cell) => /^name$/i.test(cell));
  const statStartIndex = header.findIndex((cell) => /^maxLevel$/i.test(cell));
  if (nameIndex < 0 || statStartIndex < 0) return [];

  const profiles: JobNeedExpProfile[] = [];
  for (const row of rows.slice(headerRowIndex + 1)) {
    const name = String(row[nameIndex] ?? "").trim();
    if (!name) continue;

    const needExpByParameter = {} as Record<JobParameterKey, number>;
    JOB_PARAMETER_ORDER.forEach((parameter, index) => {
      const needExpIndex = statStartIndex + (index * 5) + 1;
      const value = Number(row[needExpIndex] ?? "");
      needExpByParameter[parameter] = Number.isFinite(value) && value > 0 ? value : 100;
    });

    profiles.push({ name, needExpByParameter });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

function isLvLimitBonus(item: ItemRow): boolean {
  return item.bonusCategory === 2 && item.bonusType > 0;
}

const BONUS_TYPE_PARAMETER_LABELS: Record<number, string[]> = {
  10: ["HP"],
  11: ["MP"],
  12: ["ENG"],
  13: ["ATK"],
  14: ["DEF"],
  15: ["SPD"],
  16: ["LUK"],
  18: ["INT"],
  19: ["DEX"],
  20: ["GAT"],
  21: ["MOV"],
  22: ["HRT"],
  31: ["HP", "MP", "ENG"],
  32: ["ATK", "DEF", "SPD", "LUK"],
  33: ["INT", "DEX", "GAT", "MOV", "HRT"],
  34: ["HP", "MP", "ENG", "ATK", "DEF", "SPD", "LUK", "INT", "DEX", "GAT", "MOV", "HRT"],
};

const BONUS_TYPE_PARAMETER_KEYS: Record<number, JobParameterKey[]> = {
  10: ["HP"],
  11: ["MP"],
  12: ["Vigor"],
  13: ["ATK"],
  14: ["DEF"],
  15: ["SPEED"],
  16: ["LUCK"],
  18: ["INT"],
  19: ["DEX"],
  20: ["CONS"],
  21: ["MOVE"],
  22: ["Heart"],
  31: ["HP", "MP", "Vigor"],
  32: ["ATK", "DEF", "SPEED", "LUCK"],
  33: ["INT", "DEX", "CONS", "MOVE", "Heart"],
  34: ["HP", "MP", "Vigor", "ATK", "DEF", "SPEED", "LUCK", "INT", "DEX", "CONS", "MOVE", "Heart"],
};

function formatAllyBonusType(item: ItemRow): string {
  if (item.bonusType <= 0) return "-";
  if (isLvLimitBonus(item)) {
    return `BONUS_TYPE_LV_LIMIT (${item.bonusType})`;
  }
  return `BONUS_TYPE_${item.bonusType}`;
}

function formatAllyBonusRange(minValue: number, maxValue: number): string {
  const min = Number.isFinite(minValue) && minValue > 0 ? minValue : 0;
  const max = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0;
  if (min <= 0 && max <= 0) return "-";
  if (min > 0 && max > 0) {
    if (min === max) return `+${min}`;
    return `+${min} to +${max}`;
  }
  const only = max > 0 ? max : min;
  return `+${only}`;
}

function renderAllyBonusEffect(item: ItemRow, statIcons: Record<string, string>, multiplier = 1): ReactNode {
  const labels = BONUS_TYPE_PARAMETER_LABELS[item.bonusType] ?? [];
  const base = Number.isFinite(item.bonusMinValue) && item.bonusMinValue > 0 ? item.bonusMinValue : 0;
  if (base <= 0) return "-";

  const value = base * multiplier;
  if (labels.length === 0) {
    return `Bonus +${value.toLocaleString()}`;
  }

  const iconKeyByLabel: Record<string, string> = {
    HP: "HP",
    MP: "MP",
    ENG: "Vigor",
    VIG: "Vigor",
    ATK: "Attack",
    DEF: "Defence",
    SPD: "Speed",
    LUK: "Luck",
    INT: "Intelligence",
    DEX: "Dexterity",
    GAT: "Gather",
    MOV: "Move",
    HRT: "Heart",
  };

  return (
    <span className="flex flex-wrap items-center gap-1">
      {labels.map((label, index) => {
        const iconSrc = statIcons[iconKeyByLabel[label] ?? ""];
        return (
          <span key={`${label}-${index}`} className="inline-flex items-center gap-1">
            {iconSrc ? <img src={iconSrc} alt={label} className="h-3.5 w-3.5 object-contain" /> : null}
            <span>{label} +{value.toLocaleString()}</span>
            {index < labels.length - 1 ? <span className="text-muted-foreground">/</span> : null}
          </span>
        );
      })}
    </span>
  );
}

function getTotalExpNeeded(expByLevel: Map<number, number>, currentLevel: number, targetLevel: number, needExpPercent = 100): number {
  if (targetLevel <= currentLevel) return 0;
  let total = 0;
  for (let level = currentLevel; level < targetLevel; level += 1) {
    const baseExp = expByLevel.get(level) ?? 0;
    total += Math.floor((baseExp * needExpPercent) / 100);
  }
  return total;
}

async function fetchEquipmentRows(): Promise<EquipmentRow[]> {
  const response = await fetch(EQUIP_SHEET_URL);
  const text = await response.text();
  const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  const data = JSON.parse(json);
  const cols: string[] = data.table.cols.map((col: { label?: string; id?: string }) => (col.label || col.id || "").trim());
  const rows = data.table.rows as Array<{ c: Array<{ v: string | number | null } | null> }>;

  const nameIndex = cols.findIndex((col) => /^(name|item.?name|equipment.?name)$/i.test(col));
  const slotIndex = cols.findIndex((col) => /^(slot|type|equip.?type|category|kind)$/i.test(col));
  const studioIndex = cols.findIndex((col) => /crafterstudio|studio.?level|crafter.?studio/i.test(col));
  const intIndex = cols.findIndex((col) => /craftermintelligence|crafter.?intel|craft.*int/i.test(col));

  const shared = localSharedData as SharedDataShape;
  const slotAssignments = shared.slotAssignments ?? {};
  const weaponTypes = shared.weaponTypes ?? {};

  return rows
    .map((row) => {
      const cells = row.c ?? [];
      const name = String(cells[nameIndex]?.v ?? "").trim();
      if (!name || !isPlayerFacingEquipmentName(name)) return null;
      const rawSourceId = Number(cells[0]?.v ?? Number.NaN);
      const sourceId = Number.isFinite(rawSourceId) ? rawSourceId : null;
      const displayName = sourceId === null ? name : (EQUIPMENT_VARIANT_NAME_BY_ID[sourceId] ?? name);
      const sheetSlot = String(cells[slotIndex]?.v ?? "").trim();
      const assignedSlot = slotAssignments[displayName] ?? slotAssignments[name];
      const slot = VALID_SLOTS.includes(assignedSlot as EquipmentSlot)
        ? assignedSlot as EquipmentSlot
        : VALID_SLOTS.includes(sheetSlot as EquipmentSlot)
          ? sheetSlot as EquipmentSlot
          : "-";

      const craftable = getNumeric(cells, studioIndex) > 0;
      if (!craftable) return null;

      const equipmentRow: EquipmentRow = {
        sourceId,
        name: displayName,
        rank: getRank(displayName),
        slot,
        weaponType: weaponTypes[displayName] ?? weaponTypes[name] ?? "",
        craftable: true,
        studioLevel: getNumeric(cells, studioIndex),
        craftingIntelligence: getNumeric(cells, intIndex),
        hp: getNumeric(cells, cols.findIndex((col) => /^hp$/i.test(col))),
        mp: getNumeric(cells, cols.findIndex((col) => /^mp$/i.test(col))),
        attack: getNumeric(cells, cols.findIndex((col) => /^atk$|^attack$/i.test(col))),
        defence: getNumeric(cells, cols.findIndex((col) => /^def$|^defence$|^defense$/i.test(col))),
        speed: getNumeric(cells, cols.findIndex((col) => /^spd$|^speed$/i.test(col))),
        intelligence: getNumeric(cells, cols.findIndex((col) => /^int$|^intelligence$/i.test(col))),
        luck: getNumeric(cells, cols.findIndex((col) => /^lck$|^luck$/i.test(col))),
      };
      return equipmentRow;
    })
    .filter((row): row is EquipmentRow => !!row);
}

async function fetchItemRows(): Promise<ItemRow[]> {
  const response = await fetch(ITEM_SHEET_URL);
  const text = await response.text();
  const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
  const data = JSON.parse(json);
  const cols: string[] = data.table.cols.map((col: { label?: string; id?: string }) => (col.label || col.id || "").trim());
  const rows = data.table.rows as Array<{ c: Array<{ v: string | number | null } | null> }>;

  const nameIndex = fallbackIndex(findColumnIndex(cols, [/^name$/i]), 1);
  const categoryIndex = fallbackIndex(findColumnIndex(cols, [/^category$/i]), 2);
  const typeIndex = fallbackIndex(findColumnIndex(cols, [/^type$/i]), 3);
  const craftGroupIndex = fallbackIndex(findColumnIndex(cols, [/^craftgroup$/i]), 6);
  const studioIndex = fallbackIndex(findColumnIndex(cols, [/prices\/craftTermStudioLevel/i, /crafttermstudiolevel/i]), 28);
  const intIndex = fallbackIndex(findColumnIndex(cols, [/prices\/craftTermIntelligence/i, /crafttermintelligence/i]), 29);
  const timeIndex = fallbackIndex(findColumnIndex(cols, [/prices\/craftTimeSeconds/i, /crafttimeseconds/i]), 30);
  const bonusCategoryIndex = fallbackIndex(findColumnIndex(cols, [/prices\/bonusCategory/i, /bonuscategory/i]), 18);
  const bonusTypeIndex = fallbackIndex(findColumnIndex(cols, [/prices\/bonusType/i, /bonustype/i]), 19);
  const bonusMinValueIndex = fallbackIndex(findColumnIndex(cols, [/prices\/bonusMinValue/i, /bonusminvalue/i]), 20);
  const bonusMaxValueIndex = fallbackIndex(findColumnIndex(cols, [/prices\/bonusMaxValue/i, /bonusmaxvalue/i]), 21);
  const eggTypeIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusType/i, /eggbonustype/i]), 22);
  const eggValueIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusValue/i, /eggbonusvalue/i]), 23);
  const eggExpIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusExp/i, /eggbonusexp/i]), 24);
  const eggTimeIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusTime/i, /eggbonustime/i]), 25);
  const shopFlagIndices = cols
    .map((col, index) => (/^flag$/i.test(col) ? index : -1))
    .filter((index) => index >= 0);
  const fallbackShopFlagIndex = fallbackIndex(findColumnIndex(cols, [/^flag$/i]), 32);

  const sheetRows = rows
    .map((row) => {
      const cells = row.c ?? [];
      const name = getText(cells, nameIndex);
      const studioLevel = getNumeric(cells, studioIndex);
      const craftingIntelligence = getNumeric(cells, intIndex);
      if (!name) return null;

      const mergedShopFlag = (shopFlagIndices.length > 0 ? shopFlagIndices : [fallbackShopFlagIndex])
        .reduce((acc, index) => {
          const value = Number(cells[index]?.v ?? 0);
          return acc | (Number.isFinite(value) ? value : 0);
        }, 0);

      return {
        name,
        category: getNumeric(cells, categoryIndex),
        type: getNumeric(cells, typeIndex),
        craftGroup: getNumeric(cells, craftGroupIndex),
        studioLevel,
        craftingIntelligence,
        craftTimeSeconds: getNumeric(cells, timeIndex),
        bonusCategory: getNumeric(cells, bonusCategoryIndex),
        bonusType: getNumeric(cells, bonusTypeIndex),
        bonusMinValue: getNumeric(cells, bonusMinValueIndex),
        bonusMaxValue: getNumeric(cells, bonusMaxValueIndex),
        eggBonusType: getNumeric(cells, eggTypeIndex),
        eggBonusValue: getNumeric(cells, eggValueIndex),
        eggBonusExp: getNumeric(cells, eggExpIndex),
        eggBonusTime: getNumeric(cells, eggTimeIndex),
        shopFlag: mergedShopFlag,
      };
    })
    .filter((row): row is ItemRow => !!row);

  const fallbackRows = parseItemRowsFromCsv(itemCsv);
  if (fallbackRows.length === 0) {
    return sheetRows.sort((a, b) => {
      const studioDiff = a.studioLevel - b.studioLevel;
      return studioDiff !== 0 ? studioDiff : a.name.localeCompare(b.name);
    });
  }

  const mergedByName = new Map<string, ItemRow>();
  for (const row of fallbackRows) mergedByName.set(row.name, row);
  for (const row of sheetRows) mergedByName.set(row.name, { ...mergedByName.get(row.name), ...row });

  return Array.from(mergedByName.values()).sort((a, b) => {
    const studioDiff = a.studioLevel - b.studioLevel;
    return studioDiff !== 0 ? studioDiff : a.name.localeCompare(b.name);
  });
}

function parseItemRowsFromCsv(rawCsv: string): ItemRow[] {
  const rows = parseCsv(rawCsv);
  if (rows.length === 0) return [];

  const headerRow = rows.find((row) => row.some((cell) => /^id$/i.test(String(cell).trim())) && row.some((cell) => /^name$/i.test(String(cell).trim())));
  if (!headerRow) return [];

  const header = headerRow.map((cell) => String(cell).trim());
  const dataStart = rows.indexOf(headerRow) + 1;
  const indexOf = (label: string, fallback = -1) => {
    const index = header.findIndex((cell) => cell.toLowerCase() === label.toLowerCase());
    return index >= 0 ? index : fallback;
  };

  const nameIndex = indexOf("name", 1);
  const categoryIndex = indexOf("category", 2);
  const typeIndex = indexOf("type", 3);
  const craftGroupIndex = indexOf("craftGroup", 6);
  const bonusCategoryIndex = indexOf("bonusCategory", 18);
  const bonusTypeIndex = indexOf("bonusType", 19);
  const bonusMinValueIndex = indexOf("bonusMinValue", 20);
  const bonusMaxValueIndex = indexOf("bonusMaxValue", 21);
  const eggTypeIndex = indexOf("eggBonusType", 22);
  const eggValueIndex = indexOf("eggBonusValue", 23);
  const eggExpIndex = indexOf("eggBonusExp", 24);
  const eggTimeIndex = indexOf("eggBonusTime", 25);
  const studioIndex = indexOf("craftTermStudioLevel", 28);
  const intIndex = indexOf("craftTermIntelligence", 29);
  const timeIndex = indexOf("craftTimeSeconds", 30);
  const flagIndexes = header.map((cell, index) => (/^flag$/i.test(cell) ? index : -1)).filter((index) => index >= 0);

  const output: ItemRow[] = [];
  for (const row of rows.slice(dataStart)) {
    const name = String(row[nameIndex] ?? "").trim();
    if (!name) continue;

    const mergedShopFlag = (flagIndexes.length > 0 ? flagIndexes : [32])
      .reduce((acc, index) => {
        const value = Number(row[index] ?? 0);
        return acc | (Number.isFinite(value) ? value : 0);
      }, 0);

    output.push({
      name,
      category: Number(row[categoryIndex] ?? 0) || 0,
      type: Number(row[typeIndex] ?? 0) || 0,
      craftGroup: Number(row[craftGroupIndex] ?? 0) || 0,
      studioLevel: Number(row[studioIndex] ?? 0) || 0,
      craftingIntelligence: Number(row[intIndex] ?? 0) || 0,
      craftTimeSeconds: Number(row[timeIndex] ?? 0) || 0,
      bonusCategory: Number(row[bonusCategoryIndex] ?? 0) || 0,
      bonusType: Number(row[bonusTypeIndex] ?? 0) || 0,
      bonusMinValue: Number(row[bonusMinValueIndex] ?? 0) || 0,
      bonusMaxValue: Number(row[bonusMaxValueIndex] ?? 0) || 0,
      eggBonusType: Number(row[eggTypeIndex] ?? 0) || 0,
      eggBonusValue: Number(row[eggValueIndex] ?? 0) || 0,
      eggBonusExp: Number(row[eggExpIndex] ?? 0) || 0,
      eggBonusTime: Number(row[eggTimeIndex] ?? 0) || 0,
      shopFlag: mergedShopFlag,
    });
  }

  return output;
}

function ShopHeader({ selectedShop }: {
  selectedShop?: ShopRecord | null;
}) {
  return (
    <PageHeader
      className="mb-6"
      icon={selectedShop ? SHOP_ICONS[selectedShop.slug] : <Store className="w-5 h-5 text-indigo-500" />}
      title={selectedShop ? selectedShop.title : "Shops and items"}
    >
      <p>
        {selectedShop
          ? selectedShop.description
          : "Browse shops, item requirements, and ally feed planning data in one place."}
      </p>
    </PageHeader>
  );
}

function ShopTabs({ currentSlug }: { currentSlug?: ShopSlug }) {
  return (
    <div className="space-y-2 mb-6">
      <div className="flex flex-wrap gap-2">
        {PRIMARY_SHOPS.map((shop) => (
          <Link key={shop.slug} href={`/shops/${shop.slug}`}>
            <button
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                currentSlug === shop.slug
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {SHOP_ICONS[shop.slug]}
              {shop.shortTitle}
            </button>
          </Link>
        ))}
      </div>
      {SECONDARY_FACILITIES.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Other Facilities</span>
          {SECONDARY_FACILITIES.map((shop) => (
            <Link key={shop.slug} href={`/shops/${shop.slug}`}>
              <button
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  currentSlug === shop.slug
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {SHOP_ICONS[shop.slug]}
                {shop.shortTitle}
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildingSlotRow({ label, values, highlight }: { label: string; values: [number,number,number,number]; highlight?: boolean }) {
  const allZero = values.every(v => v === 0);
  return (
    <tr className={allZero ? "opacity-30" : ""}>
      <td className={`pr-2 py-0.5 text-[11px] whitespace-nowrap ${highlight ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className={`text-center px-2 py-0.5 text-xs tabular-nums ${highlight && v > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
          {v === 0 ? "×" : v}
        </td>
      ))}
    </tr>
  );
}

function ShopBuildingPanel({ shop }: { shop: ShopRecord }) {
  const b = shop.building;
  if (!b) return null;

  return (
    <DataCard
      title={shop.title}
      action={<CategoryBadge category="shop">Shop</CategoryBadge>}
      contentClassName="space-y-3"
    >
      <CostPills costs={b} />
      <StatTable>
        <thead>
          <tr>
            <th className="pr-2 text-left text-[10px] font-medium text-muted-foreground/60 pb-1"></th>
            {PLOT_SIZES.map(s => (
              <StatTableHeaderCell key={s} label={s} sublabel={PLOT_TILES[s]} />
            ))}
          </tr>
        </thead>
        <tbody>
          <BuildingSlotRow label="Extra beds"   values={b.beds} highlight />
          {b.store.some(v => v > 0) && (
            <BuildingSlotRow label="Shelves"    values={b.store} highlight />
          )}
        </tbody>
      </StatTable>
    </DataCard>
  );
}

// Workbench item costs: all shop workbenches use item group 9
// qty = max(1, floor(N/3)), where N = level (1-indexed)
const WORKBENCH_ITEMS: [string, number][] = [
  ["Large Nail", 3],
  ["Iron Ore",   2],
  ["Pretty Cloth", 1],
  ["Copper Coin", 3],
];

function formatUpgTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// FacilityCard is still rendered from Houses until it moves to a shared KA component.



function ShopOwnerLink({ owner }: { owner: string }) {
  const ownerSuffix = owner === "Farmer" ? "C+" : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <EntityLink
        type="job"
        name={owner}
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors"
      >
        {owner}
      </EntityLink>
      {ownerSuffix && <span className="font-medium text-foreground">{ownerSuffix}</span>}
    </span>
  );
}

function dedupeEquipmentRows(rows: EquipmentRow[]): EquipmentRow[] {
  const byKey = new Map<string, EquipmentRow>();
  for (const row of rows) {
    const key = row.sourceId === null
      ? `${row.name}::${row.slot}::${row.weaponType}`
      : `id:${row.sourceId}`;
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

function normalizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchesQuery(name: string, query: string): boolean {
  const parts = normalizeQuery(query);
  if (parts.length === 0) return true;
  const normalizedName = name.toLowerCase();
  return parts.every((part) => normalizedName.includes(part));
}

function getKnownItemFlagNames(shopFlag: number): string[] {
  return KNOWN_ITEM_SHOP_FLAGS.filter((flag) => (shopFlag & flag.mask) !== 0).map((flag) => flag.label);
}

function getUnknownItemFlagBits(shopFlag: number): number[] {
  const knownMask = KNOWN_ITEM_SHOP_FLAGS.reduce((mask, flag) => mask | flag.mask, 0);
  const unknownMask = (shopFlag & ~knownMask) >>> 0;
  const bits: number[] = [];
  for (let bit = 0; bit < 31; bit += 1) {
    const value = 1 << bit;
    if ((unknownMask & value) !== 0) bits.push(value);
  }
  return bits;
}

function EquipmentTable({ rows, showWeaponType = false }: { rows: EquipmentRow[]; showWeaponType?: boolean }) {
  type SortCol = "name" | "rank" | "studio" | "int";
  const [sortCol, setSortCol] = useState<SortCol>("studio");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }
  const sorted = useMemo(() => {
    const rankOrder: Record<string, number> = { S: 1, A: 2, B: 3, C: 4, D: 5, E: 6, F: 7 };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortCol) {
        case "rank": return ((rankOrder[a.rank] ?? 99) - (rankOrder[b.rank] ?? 99)) * dir;
        case "studio": return (((a.studioLevel ?? 0) - (b.studioLevel ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "int": return (((a.craftingIntelligence ?? 0) - (b.craftingIntelligence ?? 0)) * dir) || a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [rows, sortCol, sortDir]);
  const arrow = (col: SortCol) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅";
  const thC = "px-3 py-2 font-medium cursor-pointer select-none hover:bg-muted/60 transition-colors";
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className={`${thC} text-left`} onClick={() => toggleSort("name")}>Name{arrow("name")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("rank")}>Rank{arrow("rank")}</th>
            <th className="px-3 py-2 text-center font-medium">Slot</th>
            {showWeaponType && <th className="px-3 py-2 text-center font-medium">Type</th>}
            <th className={`${thC} text-center`} onClick={() => toggleSort("studio")}>Studio{arrow("studio")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("int")}>INT{arrow("int")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.name} className="border-t border-border/70">
              <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-2 text-center">{row.rank || "-"}</td>
              <td className="px-3 py-2 text-center">{row.slot}</td>
              {showWeaponType && <td className="px-3 py-2 text-center">{row.weaponType || "-"}</td>}
              <td className="px-3 py-2 text-center">{row.studioLevel}</td>
              <td className="px-3 py-2 text-center">{row.craftingIntelligence || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillsTable({ rows }: { rows: SkillRow[] }) {
  type SortCol = "name" | "studio" | "int" | "buy" | "sell";
  const [sortCol, setSortCol] = useState<SortCol>("studio");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortCol) {
        case "studio": return (((a.studioLevel ?? 0) - (b.studioLevel ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "int": return (((a.craftingIntelligence ?? 0) - (b.craftingIntelligence ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "buy": return (((a.buyPrice ?? 0) - (b.buyPrice ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "sell": return (((a.sellPrice ?? 0) - (b.sellPrice ?? 0)) * dir) || a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [rows, sortCol, sortDir]);
  const arrow = (col: SortCol) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅";
  const thC = "px-3 py-2 font-medium cursor-pointer select-none hover:bg-muted/60 transition-colors";
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className={`${thC} text-left`} onClick={() => toggleSort("name")}>Skill{arrow("name")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("studio")}>Studio{arrow("studio")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("int")}>INT{arrow("int")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("buy")}>Buy{arrow("buy")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("sell")}>Sell{arrow("sell")}</th>
            <th className="px-3 py-2 text-left font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.name} className="border-t border-border/70">
              <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-2 text-center">{row.studioLevel}</td>
              <td className="px-3 py-2 text-center">{row.craftingIntelligence || "-"}</td>
              <td className="px-3 py-2 text-center">{row.buyPrice || "-"}</td>
              <td className="px-3 py-2 text-center">{row.sellPrice || "-"}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.description || row.weaponResistance || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemTable({ rows, showStudio = true }: { rows: ItemRow[]; showStudio?: boolean }) {
  type SortCol = "name" | "studio" | "int" | "craftTime";
  const [sortCol, setSortCol] = useState<SortCol>(showStudio ? "studio" : "name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortCol) {
        case "studio": return (((a.studioLevel ?? 0) - (b.studioLevel ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "int": return (((a.craftingIntelligence ?? 0) - (b.craftingIntelligence ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "craftTime": return (((a.craftTimeSeconds ?? 0) - (b.craftTimeSeconds ?? 0)) * dir) || a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [rows, sortCol, sortDir]);
  const arrow = (col: SortCol) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅";
  const thC = "px-3 py-2 font-medium cursor-pointer select-none hover:bg-muted/60 transition-colors";
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className={`${thC} text-left`} onClick={() => toggleSort("name")}>Item{arrow("name")}</th>
            {showStudio && <th className={`${thC} text-center`} onClick={() => toggleSort("studio")}>Studio{arrow("studio")}</th>}
            <th className={`${thC} text-center`} onClick={() => toggleSort("int")}>INT{arrow("int")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("craftTime")}>Craft Time{arrow("craftTime")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.name} className="border-t border-border/70">
              <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
              {showStudio && <td className="px-3 py-2 text-center">{row.studioLevel}</td>}
              <td className="px-3 py-2 text-center">{row.craftingIntelligence || "-"}</td>
              <td className="px-3 py-2 text-center">{row.craftTimeSeconds ? `${row.craftTimeSeconds}s` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FurnitureTable({ rows }: { rows: FurnitureRow[] }) {
  type SortCol = "name" | "studio" | "int";
  const [sortCol, setSortCol] = useState<SortCol>("studio");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortCol) {
        case "studio": return (((a.studioLevel ?? 0) - (b.studioLevel ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "int": return (((a.craftingIntelligence ?? 0) - (b.craftingIntelligence ?? 0)) * dir) || a.name.localeCompare(b.name);
        default: return a.name.localeCompare(b.name) * dir;
      }
    });
  }, [rows, sortCol, sortDir]);
  const arrow = (col: SortCol) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : " ⇅";
  const thC = "px-3 py-2 font-medium cursor-pointer select-none hover:bg-muted/60 transition-colors";
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className={`${thC} text-left`} onClick={() => toggleSort("name")}>Name{arrow("name")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("studio")}>Studio{arrow("studio")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("int")}>INT{arrow("int")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.name} className="border-t border-border/70">
              <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-2 text-center">{row.studioLevel}</td>
              <td className="px-3 py-2 text-center">{row.craftingIntelligence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ShopsPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/shops/:slug");
  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState<(typeof RANKS)[number]>("All");
  const [armorSlotFilter, setArmorSlotFilter] = useState<"All" | "Head" | "Armor" | "Shield">("All");
  const [skillSearch, setSkillSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemSourceFilter, setItemSourceFilter] = useState<Set<string>>(new Set());
  const [facilitySourceFilter, setFacilitySourceFilter] = useState<Set<string>>(new Set());
  const [furnitureSearch, setFurnitureSearch] = useState("");
  const [currentAllyLevelInput, setCurrentAllyLevelInput] = useState("1");
  const [targetAllyLevelInput, setTargetAllyLevelInput] = useState("999");
  const [selectedFeedItemName, setSelectedFeedItemName] = useState("");
  const [selectedNeedExpJobName, setSelectedNeedExpJobName] = useState("");
  const [studioFilter, setStudioFilter] = useState<Set<number>>(new Set());
  const [intFilter, setIntFilter] = useState<Set<number>>(new Set());
  const [showItemReferenceDebug, setShowItemReferenceDebug] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const [openReferenceFilterMenu, setOpenReferenceFilterMenu] = useState<"shop-source" | "facility-source" | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const referenceFilterMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setOpenFilterMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (referenceFilterMenuRef.current && !referenceFilterMenuRef.current.contains(e.target as Node)) setOpenReferenceFilterMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedShop = useMemo(
    () => SHOP_RECORDS.find((shop) => shop.slug === params?.slug) ?? null,
    [params]
  );
  const statIcons = useMemo(() => {
    const shared = localSharedData as SharedDataShape;
    return shared.statIcons ?? {};
  }, []);
  const currentUrlSearch = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    const currentSearch = new URLSearchParams(window.location.search);
    const q = currentSearch.get("search") ?? "";
    if (selectedShop?.slug === "item-shop" || selectedShop?.slug === "restaurant" || selectedShop?.slug === "orchard") setItemSearch(q);
    else if (selectedShop?.slug === "furniture-shop") setFurnitureSearch(q);
    else setSearch(q);
    setItemSourceFilter(new Set());
    setFacilitySourceFilter(new Set());
    setStudioFilter(new Set());
    setIntFilter(new Set());
  }, [currentUrlSearch, selectedShop?.slug]);

  const { data: equipmentRows = [], isLoading: equipmentLoading } = useQuery({
    queryKey: ["shop-equipment-rows"],
    queryFn: fetchEquipmentRows,
    staleTime: 60_000,
  });
  const { data: itemRows = [], isLoading: itemLoading } = useQuery({
    queryKey: ["shop-item-rows"],
    queryFn: fetchItemRows,
    staleTime: 60_000,
  });

  const skillRows = useMemo(() => {
    const shared = localSharedData as SharedDataShape;
    return Object.values(shared.skills ?? {})
      .filter((skill) => (skill.studioLevel ?? 0) > 0)
      .filter((skill) => !EXCLUDED_SKILLS.has(skill.name.trim().toLowerCase()))
      .sort((a, b) => {
        const studioDiff = (a.studioLevel ?? 0) - (b.studioLevel ?? 0);
        return studioDiff !== 0 ? studioDiff : a.name.localeCompare(b.name);
      });
  }, []);

  const dedupedEquipmentRows = useMemo(() => dedupeEquipmentRows(equipmentRows), [equipmentRows]);

  const filteredEquipment = useMemo(() => {
    return dedupedEquipmentRows.filter((row) => {
      const matchesSearch = matchesQuery(row.name, search);
      const matchesRank = rankFilter === "All" || row.rank === rankFilter;
      return matchesSearch && matchesRank;
    });
  }, [dedupedEquipmentRows, rankFilter, search]);

  const weaponRows = useMemo(
    () => filteredEquipment.filter((row) => row.slot === "Weapon" && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [filteredEquipment, studioFilter, intFilter]
  );
  const armorRows = useMemo(
    () => filteredEquipment.filter((row) => ["Head", "Armor", "Shield"].includes(row.slot) && (armorSlotFilter === "All" || row.slot === armorSlotFilter) && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [armorSlotFilter, filteredEquipment, studioFilter, intFilter]
  );
  const accessoryRows = useMemo(
    () => filteredEquipment.filter((row) => row.slot === "Accessory" && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [filteredEquipment, studioFilter, intFilter]
  );
  const filteredSkillRows = useMemo(
    () => skillRows.filter((row) => matchesQuery(row.name, skillSearch) && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [skillRows, skillSearch, studioFilter, intFilter]
  );
  const itemShopRows = useMemo(
    () => itemRows.filter((row) => {
      const isCooked = (row.shopFlag & COOKED_ITEM_FLAG) !== 0;
      const isCraftable = (row.shopFlag & CRAFTABLE_ITEM_FLAG) !== 0;
      return isCraftable && !isCooked;
    }),
    [itemRows]
  );
  const restaurantRows = useMemo(
    () => itemRows.filter((row) => (row.shopFlag & COOKED_ITEM_FLAG) !== 0),
    [itemRows]
  );
  const orchardRows = useMemo(
    () => itemRows.filter((row) => row.craftGroup === ORCHARD_FRUIT_TREE_CRAFT_GROUP),
    [itemRows]
  );
  const facilityByCraftGroup = useMemo(() => parseFacilityCraftGroupMap(facilityLookupCsv), []);
  const expByLevel = useMemo(() => parseExpByLevel(expCsv), []);
  const jobNeedExpProfiles = useMemo(() => parseJobNeedExpProfiles(jobCsv), []);
  const maxExpLevel = useMemo(() => {
    const levels = Array.from(expByLevel.keys());
    return levels.length > 0 ? Math.max(...levels) : 1;
  }, [expByLevel]);
  const allReferenceItemRows = useMemo(() => {
    const byName = new Map<string, ItemRow>();
    for (const row of itemRows) {
      if (!byName.has(row.name)) byName.set(row.name, row);
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [itemRows]);
  const itemSourcesByName = useMemo(() => {
    const byName = new Map<string, Set<string>>();
    for (const row of itemRows) {
      const bucket = byName.get(row.name) ?? new Set<string>();
      const isCooked = (row.shopFlag & COOKED_ITEM_FLAG) !== 0;
      const isCraftable = (row.shopFlag & CRAFTABLE_ITEM_FLAG) !== 0;

      if (isCraftable && !isCooked) {
        bucket.add("Item Shop");
      } else {
        bucket.add("Facility only");
      }
      if (bucket.size === 0) {
        bucket.add("Other sources");
      }
      byName.set(row.name, bucket);
    }

    const output = new Map<string, string[]>();
    for (const [name, sources] of byName.entries()) {
      const knownSourceOrder = new Map<string, number>(
        ITEM_SOURCE_ORDER.map((source, index) => [source, index])
      );
      output.set(
        name,
        Array.from(sources).sort((a, b) => {
          const aKnown = knownSourceOrder.has(a);
          const bKnown = knownSourceOrder.has(b);
          if (aKnown && bKnown) return (knownSourceOrder.get(a) ?? 0) - (knownSourceOrder.get(b) ?? 0);
          if (aKnown) return -1;
          if (bKnown) return 1;
          return a.localeCompare(b);
        })
      );
    }
    return output;
  }, [itemRows]);
  const itemFacilityRows = useMemo<ItemFacilityRow[]>(() => {
    return allReferenceItemRows.map((item) => {
      const mapped = facilityByCraftGroup.get(item.craftGroup) ?? [];
      const sources = itemSourcesByName.get(item.name) ?? [];
      const needsCraftFallback = item.craftGroup < 0 && sources.includes("Item Shop");
      const fallback = needsCraftFallback ? FALLBACK_ITEM_CRAFT_FACILITIES : [];
      const facilities = mapped.length > 0 ? mapped : fallback;
      return { item, sources, facilities };
    });
  }, [allReferenceItemRows, facilityByCraftGroup, itemSourcesByName]);
  const itemFacilityByName = useMemo(() => {
    const map = new Map<string, ItemFacilityRow>();
    for (const row of itemFacilityRows) map.set(row.item.name, row);
    return map;
  }, [itemFacilityRows]);
  const itemSourceFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of itemFacilityRows) {
      const sources = row.sources.length > 0 ? row.sources : ["Other sources"];
      for (const source of sources) set.add(source);
    }
    const knownOrder = new Map<string, number>(ITEM_SOURCE_ORDER.map((source, index) => [source, index]));
    return Array.from(set).sort((a, b) => {
      const aKnown = knownOrder.has(a);
      const bKnown = knownOrder.has(b);
      if (aKnown && bKnown) return (knownOrder.get(a) ?? 0) - (knownOrder.get(b) ?? 0);
      if (aKnown) return -1;
      if (bKnown) return 1;
      return a.localeCompare(b);
    });
  }, [itemFacilityRows]);
  const facilitySourceFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of itemFacilityRows) {
      for (const facility of row.facilities) set.add(facility);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [itemFacilityRows]);
  const toggleItemSourceFilter = (source: string) => {
    setItemSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };
  const toggleFacilitySourceFilter = (source: string) => {
    setFacilitySourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };
  const filteredItemFacilityRows = useMemo(() => {
    return itemFacilityRows.filter((row) => {
      if (!matchesQuery(row.item.name, itemSearch)) return false;
      if (itemSourceFilter.size > 0 && !row.sources.some((source) => itemSourceFilter.has(source))) return false;
      if (facilitySourceFilter.size === 0) return true;
      if (facilitySourceFilter.has(NO_FACILITY_SOURCE_FILTER) && row.facilities.length === 0) return true;
      return row.facilities.some((facility) => facilitySourceFilter.has(facility));
    });
  }, [facilitySourceFilter, itemFacilityRows, itemSearch, itemSourceFilter]);
  const feedCandidateItems = useMemo(
    () => allReferenceItemRows
      .filter((row) => row.eggBonusExp > 0)
      .sort((a, b) => (b.eggBonusExp - a.eggBonusExp) || a.name.localeCompare(b.name)),
    [allReferenceItemRows]
  );
  const feedCandidateRows = useMemo<FeedCandidateRow[]>(
    () => feedCandidateItems.map((item) => ({
      item,
      sources: itemSourcesByName.get(item.name) ?? [],
      facilities: itemFacilityByName.get(item.name)?.facilities ?? [],
    })),
    [feedCandidateItems, itemFacilityByName, itemSourcesByName]
  );
  const filteredFeedCandidateRows = useMemo(() => {
    return feedCandidateRows.filter((row) => {
      if (!matchesQuery(row.item.name, itemSearch)) return false;
      if (itemSourceFilter.size > 0 && !row.sources.some((source) => itemSourceFilter.has(source))) return false;
      if (facilitySourceFilter.size === 0) return true;
      if (facilitySourceFilter.has(NO_FACILITY_SOURCE_FILTER) && row.facilities.length === 0) return true;
      return row.facilities.some((facility) => facilitySourceFilter.has(facility));
    });
  }, [facilitySourceFilter, feedCandidateRows, itemSearch, itemSourceFilter]);
  const selectedShopSourceLabel = itemSourceFilter.size === 0
    ? "All shop sources"
    : itemSourceFilter.size === 1
      ? (Array.from(itemSourceFilter)[0] ?? "All shop sources")
      : `${itemSourceFilter.size} selected`;
  const selectedFacilitySourceLabel = facilitySourceFilter.size === 0
    ? "All facility sources"
    : facilitySourceFilter.size === 1
      ? (facilitySourceFilter.has(NO_FACILITY_SOURCE_FILTER)
        ? "No facility"
        : (Array.from(facilitySourceFilter)[0] ?? "All facility sources"))
      : `${facilitySourceFilter.size} selected`;
  useEffect(() => {
    if (selectedFeedItemName && feedCandidateItems.some((item) => item.name === selectedFeedItemName)) return;
    const topGradeMeat = feedCandidateItems.find((item) => item.name === "Top-Grade Meat");
    setSelectedFeedItemName(topGradeMeat?.name ?? feedCandidateItems[0]?.name ?? "");
  }, [feedCandidateItems, selectedFeedItemName]);
  const selectedFeedItem = useMemo(
    () => feedCandidateItems.find((item) => item.name === selectedFeedItemName) ?? null,
    [feedCandidateItems, selectedFeedItemName]
  );
  useEffect(() => {
    if (selectedNeedExpJobName && jobNeedExpProfiles.some((job) => job.name === selectedNeedExpJobName)) return;
    setSelectedNeedExpJobName(jobNeedExpProfiles[0]?.name ?? "");
  }, [jobNeedExpProfiles, selectedNeedExpJobName]);
  const selectedNeedExpJob = useMemo(
    () => jobNeedExpProfiles.find((job) => job.name === selectedNeedExpJobName) ?? null,
    [jobNeedExpProfiles, selectedNeedExpJobName]
  );
  const selectedNeedExpPercent = useMemo(() => {
    if (!selectedNeedExpJob || !selectedFeedItem) return 100;
    const keys = BONUS_TYPE_PARAMETER_KEYS[selectedFeedItem.bonusType] ?? [];
    if (keys.length === 0) return 100;
    const total = keys.reduce((sum, key) => sum + (selectedNeedExpJob.needExpByParameter[key] ?? 100), 0);
    return total / keys.length;
  }, [selectedNeedExpJob, selectedFeedItem]);
  const currentAllyLevel = useMemo(() => {
    const parsed = Number.parseInt(currentAllyLevelInput, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(parsed, 1), maxExpLevel);
  }, [currentAllyLevelInput, maxExpLevel]);
  const targetAllyLevel = useMemo(() => {
    const parsed = Number.parseInt(targetAllyLevelInput, 10);
    if (!Number.isFinite(parsed)) return Math.min(999, maxExpLevel);
    return Math.min(Math.max(parsed, 1), maxExpLevel);
  }, [targetAllyLevelInput, maxExpLevel]);
  const allyExpNeeded = useMemo(
    () => getTotalExpNeeded(expByLevel, currentAllyLevel, targetAllyLevel, selectedNeedExpPercent),
    [currentAllyLevel, expByLevel, selectedNeedExpPercent, targetAllyLevel]
  );
  const feedItemsNeeded = useMemo(() => {
    if (!selectedFeedItem || selectedFeedItem.eggBonusExp <= 0) return null;
    if (allyExpNeeded <= 0) return 0;
    return Math.ceil(allyExpNeeded / selectedFeedItem.eggBonusExp);
  }, [allyExpNeeded, selectedFeedItem]);
  const selectedFeedTotalBonusRange = useMemo(() => {
    if (!selectedFeedItem || feedItemsNeeded === null || feedItemsNeeded <= 0) return 0;
    return {
      min: selectedFeedItem.bonusMinValue * feedItemsNeeded,
      max: selectedFeedItem.bonusMaxValue * feedItemsNeeded,
    };
  }, [feedItemsNeeded, selectedFeedItem]);
  const expPreviewRows = useMemo(() => {
    const start = Math.max(1, Math.min(currentAllyLevel, targetAllyLevel));
    const end = Math.min(maxExpLevel, start + 9);
    let cumulative = 0;
    for (let level = 1; level < start; level += 1) {
      cumulative += expByLevel.get(level) ?? 0;
    }

    const rows: Array<{ level: number; expToNext: number; cumulativeToNext: number }> = [];
    for (let level = start; level <= end; level += 1) {
      const baseExp = expByLevel.get(level) ?? 0;
      const expToNext = Math.floor((baseExp * selectedNeedExpPercent) / 100);
      cumulative += expToNext;
      rows.push({ level, expToNext, cumulativeToNext: cumulative });
    }
    return rows;
  }, [currentAllyLevel, expByLevel, maxExpLevel, selectedNeedExpPercent, targetAllyLevel]);
  const filteredItemRows = useMemo(
    () => itemShopRows.filter((row) => matchesQuery(row.name, itemSearch) && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [itemShopRows, itemSearch, studioFilter, intFilter]
  );
  const filteredRestaurantRows = useMemo(
    () => restaurantRows.filter((row) => matchesQuery(row.name, itemSearch) && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [restaurantRows, itemSearch, studioFilter, intFilter]
  );
  const filteredOrchardRows = useMemo(
    () => orchardRows.filter((row) => matchesQuery(row.name, itemSearch) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [orchardRows, itemSearch, intFilter]
  );
  const filteredFurnitureRows = useMemo(
    () => FURNITURE_ROWS.filter((row) => matchesQuery(row.name, furnitureSearch) && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [furnitureSearch, studioFilter, intFilter]
  );
  const shopStudioLevels = useMemo((): number[] => {
    if (!selectedShop) return [];
    const levels = (() => {
      switch (selectedShop.slug) {
        case "weapon-shop": return dedupedEquipmentRows.filter((r) => r.slot === "Weapon" && r.craftable).map((r) => r.studioLevel);
        case "armor-shop": return dedupedEquipmentRows.filter((r) => ["Head", "Armor", "Shield"].includes(r.slot) && r.craftable).map((r) => r.studioLevel);
        case "accessory-shop": return dedupedEquipmentRows.filter((r) => r.slot === "Accessory" && r.craftable).map((r) => r.studioLevel);
        case "skill-shop": return skillRows.map((r) => r.studioLevel);
        case "item-shop": return itemShopRows.map((r) => r.studioLevel);
        case "restaurant": return restaurantRows.map((r) => r.studioLevel);
        case "orchard": return [];
        case "furniture-shop": return FURNITURE_ROWS.map((r) => r.studioLevel);
        default: return [];
      }
    })();
    return [...new Set(levels.filter((v) => v > 0))].sort((a, b) => a - b);
  }, [selectedShop, dedupedEquipmentRows, skillRows, itemShopRows, restaurantRows, orchardRows]);
  const availableIntValues = useMemo(() => {
    if (!selectedShop) return [];
    type IntRow = { studioLevel: number; craftingIntelligence: number };
    const allRows: IntRow[] = (() => {
      switch (selectedShop.slug) {
        case "weapon-shop": return dedupedEquipmentRows.filter((r) => r.slot === "Weapon");
        case "armor-shop": return dedupedEquipmentRows.filter((r) => ["Head", "Armor", "Shield"].includes(r.slot));
        case "accessory-shop": return dedupedEquipmentRows.filter((r) => r.slot === "Accessory");
        case "skill-shop": return skillRows;
        case "item-shop": return itemShopRows;
        case "restaurant": return restaurantRows;
        case "orchard": return orchardRows;
        case "furniture-shop": return FURNITURE_ROWS;
        default: return [];
      }
    })();
    const base = studioFilter.size > 0 ? allRows.filter((r) => studioFilter.has(r.studioLevel)) : allRows;
    return [...new Set(base.map((r) => r.craftingIntelligence).filter((v) => v > 0))].sort((a, b) => a - b);
  }, [studioFilter, selectedShop, dedupedEquipmentRows, skillRows, itemShopRows, restaurantRows, orchardRows]);
  const toggleStudio = (level: number) => {
    setStudioFilter((prev) => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
    setIntFilter(new Set());
  };
  const toggleInt = (v: number) => setIntFilter((prev) => {
    const next = new Set(prev);
    next.has(v) ? next.delete(v) : next.add(v);
    return next;
  });
  const FilterDropdowns = ({ showRank = true, showArmorSlot = false }: { showRank?: boolean; showArmorSlot?: boolean }) => (
    <div ref={filterMenuRef} className="flex flex-wrap items-center gap-2">
      {showArmorSlot && (
        <div className="relative">
          <button onClick={() => setOpenFilterMenu((v) => v === "armorSlot" ? null : "armorSlot")}
            className={`h-8 px-3 text-xs rounded-md border font-medium flex items-center gap-1.5 transition-colors ${armorSlotFilter !== "All" ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}>
            {armorSlotFilter === "All" ? "Slot" : armorSlotFilter}<ChevronDown className={`w-3 h-3 transition-transform ${openFilterMenu === "armorSlot" ? "rotate-180" : ""}`} />
          </button>
          {openFilterMenu === "armorSlot" && (
            <div className="absolute z-50 top-full mt-1 left-0 min-w-[120px] rounded-md border border-border bg-popover shadow-md text-xs overflow-hidden">
              {(["All", "Head", "Armor", "Shield"] as const).map((opt) => (
                <button key={opt} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setArmorSlotFilter(opt); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground">
                  <span className={`w-3.5 h-3.5 shrink-0 ${armorSlotFilter === opt ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                  {opt === "All" ? "All slots" : opt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {showRank && (
        <div className="relative">
          <button onClick={() => setOpenFilterMenu((v) => v === "rank" ? null : "rank")}
            className={`h-8 px-3 text-xs rounded-md border font-medium flex items-center gap-1.5 transition-colors ${rankFilter !== "All" ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}>
            {rankFilter === "All" ? "Rank" : rankFilter}<ChevronDown className={`w-3 h-3 transition-transform ${openFilterMenu === "rank" ? "rotate-180" : ""}`} />
          </button>
          {openFilterMenu === "rank" && (
            <div className="absolute z-50 top-full mt-1 left-0 min-w-[120px] rounded-md border border-border bg-popover shadow-md text-xs overflow-hidden">
              {RANKS.map((rank) => (
                <button key={rank} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setRankFilter(rank); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground">
                  <span className={`w-3.5 h-3.5 shrink-0 ${rankFilter === rank ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                  {rank === "All" ? "All ranks" : `${rank} rank`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {shopStudioLevels.length > 0 && (
        <div className="relative">
          <button onClick={() => setOpenFilterMenu((v) => v === "studio" ? null : "studio")}
            className={`h-8 px-3 text-xs rounded-md border font-medium flex items-center gap-1.5 transition-colors ${studioFilter.size > 0 ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}>
            Studio{studioFilter.size > 0 ? ` (${studioFilter.size})` : ""}<ChevronDown className={`w-3 h-3 transition-transform ${openFilterMenu === "studio" ? "rotate-180" : ""}`} />
          </button>
          {openFilterMenu === "studio" && (
            <div className="absolute z-50 top-full mt-1 left-0 min-w-[110px] rounded-md border border-border bg-popover shadow-md text-xs overflow-hidden">
              {shopStudioLevels.map((level) => (
                <button key={level} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleStudio(level); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground">
                  <span className={`w-3.5 h-3.5 shrink-0 ${studioFilter.has(level) ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                  Lv {level}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {availableIntValues.length > 0 && (
        <div className="relative">
          <button onClick={() => setOpenFilterMenu((v) => v === "int" ? null : "int")}
            className={`h-8 px-3 text-xs rounded-md border font-medium flex items-center gap-1.5 transition-colors ${intFilter.size > 0 ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}>
            INT{intFilter.size > 0 ? ` (${intFilter.size})` : ""}<ChevronDown className={`w-3 h-3 transition-transform ${openFilterMenu === "int" ? "rotate-180" : ""}`} />
          </button>
          {openFilterMenu === "int" && (
            <div className="absolute z-50 top-full mt-1 left-0 min-w-[110px] rounded-md border border-border bg-popover shadow-md text-xs overflow-hidden">
              {availableIntValues.map((v) => (
                <button key={v} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleInt(v); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground">
                  <span className={`w-3.5 h-3.5 shrink-0 ${intFilter.has(v) ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                  INT {v}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {(rankFilter !== "All" || armorSlotFilter !== "All" || studioFilter.size > 0 || intFilter.size > 0) && (
        <button onClick={() => { setRankFilter("All"); setArmorSlotFilter("All"); setStudioFilter(new Set()); setIntFilter(new Set()); }}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          ✕ clear
        </button>
      )}
    </div>
  );
  const selectedShopResults = useMemo(() => {
    switch (selectedShop?.slug) {
      case "items-reference":
        return itemFacilityRows.filter((row) => matchesQuery(row.item.name, itemSearch)).length;
      case "weapon-shop":
        return weaponRows.length;
      case "armor-shop":
        return armorRows.length;
      case "accessory-shop":
        return accessoryRows.length;
      case "skill-shop":
        return filteredSkillRows.length;
      case "item-shop":
        return filteredItemRows.length;
      case "restaurant":
        return filteredRestaurantRows.length;
      case "orchard":
        return filteredOrchardRows.length;
      case "furniture-shop":
        return filteredFurnitureRows.length;
      default:
        return null;
    }
  }, [
    accessoryRows.length,
    armorRows.length,
    itemFacilityRows,
    itemSearch,
    filteredFurnitureRows.length,
    filteredItemRows.length,
    filteredOrchardRows.length,
    filteredRestaurantRows.length,
    filteredSkillRows.length,
    selectedShop?.slug,
    weaponRows.length,
  ]);

  if (!selectedShop) {
    return (
      <div className="min-h-screen bg-background transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <ShopHeader />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {PRIMARY_SHOPS.map((shop) => (
              <Card
                key={shop.slug}
                onClick={() => navigate(`/shops/${shop.slug}`)}
                className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all group h-full cursor-pointer"
              >
                <CardHeader className="pb-2">
                  <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors w-fit">
                    {SHOP_ICONS[shop.slug]}
                  </div>
                  <CardTitle className="text-base mt-2">{shop.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <CardDescription className="text-xs leading-relaxed">{shop.description}</CardDescription>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <ShopOwnerLink owner={shop.owner} />

                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {SECONDARY_FACILITIES.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">Other Facilities</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {SECONDARY_FACILITIES.map((shop) => (
                  <Card
                    key={shop.slug}
                    onClick={() => navigate(`/shops/${shop.slug}`)}
                    className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all group h-full cursor-pointer"
                  >
                    <CardHeader className="pb-2">
                      <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors w-fit">
                        {SHOP_ICONS[shop.slug]}
                      </div>
                      <CardTitle className="text-base mt-2">{shop.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <CardDescription className="text-xs leading-relaxed">{shop.description}</CardDescription>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <ShopOwnerLink owner={shop.owner} />

                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {ITEMS_REFERENCE_SHOPS.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3">Items Reference</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {ITEMS_REFERENCE_SHOPS.map((shop) => (
                  <Card
                    key={shop.slug}
                    onClick={() => navigate(`/shops/${shop.slug}`)}
                    className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all group h-full cursor-pointer"
                  >
                    <CardHeader className="pb-2">
                      <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors w-fit">
                        {SHOP_ICONS[shop.slug]}
                      </div>
                      <CardTitle className="text-base mt-2">{shop.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <CardDescription className="text-xs leading-relaxed">{shop.description}</CardDescription>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <ShopOwnerLink owner={shop.owner} />

                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <ShopHeader selectedShop={selectedShop} />
        <ShopTabs currentSlug={selectedShop.slug} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <ShopBuildingPanel shop={selectedShop} />
          {selectedShop.workbench && (
            (() => {
              const facility = FACILITIES.find(f => f.id === selectedShop.workbench?.id);
              return facility ? <FacilityCard f={facility} /> : null;
            })()
          )}
        </div>

        <Card className="shadow-sm mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Owner</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">Owner:</span>
            <ShopOwnerLink owner={selectedShop.owner} />

            {selectedShopResults !== null && (
              <>
                <span className="text-muted-foreground">Results:</span>
                <span className="font-medium text-foreground">{selectedShopResults}</span>
              </>
            )}
          </CardContent>
        </Card>

        {selectedShop.slug === "weapon-shop" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
            <CardTitle className="text-base">Weapon Shop Database</CardTitle>
            <CardDescription className="text-xs">
                  Browse Kingdom Adventures weapon shop data, weapon ranks, weapon types, crafting levels,
                intelligence requirements, prices, and combat stats.
            </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search weapons..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                {equipmentLoading ? <p className="text-sm text-muted-foreground">Loading weapon data...</p> : <EquipmentTable rows={weaponRows} showWeaponType />}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "armor-shop" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
            <CardTitle className="text-base">Armor Shop Database</CardTitle>
            <CardDescription className="text-xs">
                  Browse Kingdom Adventures armor shop data for headgear, armor, and shields with ranks,
                  crafting levels, intelligence requirements, prices, defence, speed, luck, HP, and MP.
            </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search armor..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showArmorSlot showRank />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                {equipmentLoading ? <p className="text-sm text-muted-foreground">Loading armor data...</p> : <EquipmentTable rows={armorRows} />}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "accessory-shop" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Accessory Shop Database</CardTitle>
                <CardDescription className="text-xs">
                  Accessory-only browsing with rank and crafting requirements.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accessories..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                {equipmentLoading ? <p className="text-sm text-muted-foreground">Loading accessory data...</p> : <EquipmentTable rows={accessoryRows} />}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "skill-shop" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Skill Shop Database</CardTitle>
                <CardDescription className="text-xs">
                  Shop-craftable skills with crafting requirements and prices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} placeholder="Search skills..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank={false} />
                  <span className="text-xs text-muted-foreground">{filteredSkillRows.length} skills</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <SkillsTable rows={filteredSkillRows} />
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "items-reference" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Item Reference</CardTitle>
                <CardDescription className="text-xs">
                  Separate cross-shop item card. Includes Item Shop, Restaurant, Orchard, and other shop-item entries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  XP uses the Exp sheet directly ({expByLevel.size.toLocaleString()} levels loaded). Required EXP is adjusted by Job.csv `needExp` using: `requiredExp = ExpSheetExp * needExp / 100` (e.g. needExp 200 = 2x EXP). Ally bonus display uses Item.csv bonus fields (`bonusCategory`, `bonusType`, `bonusMinValue`, `bonusMaxValue`) and treats category-2 feed entries as `BONUS_TYPE_LV_LIMIT`.
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items..." className="pl-9 h-9" />
                  </div>
                </div>

                <div ref={referenceFilterMenuRef} className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenReferenceFilterMenu((prev) => prev === "shop-source" ? null : "shop-source")}
                      className={`h-9 rounded-md border px-3 text-sm inline-flex items-center gap-2 font-medium transition-colors ${itemSourceFilter.size > 0 ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}
                    >
                      Shop: {selectedShopSourceLabel}
                      <ChevronDown className={`w-4 h-4 transition-transform ${openReferenceFilterMenu === "shop-source" ? "rotate-180" : ""}`} />
                    </button>
                    {openReferenceFilterMenu === "shop-source" && (
                      <div className="absolute z-50 top-full mt-1 left-0 min-w-[180px] rounded-md border border-border bg-popover shadow-md text-xs overflow-hidden max-h-64 overflow-y-auto">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setItemSourceFilter(new Set());
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground"
                        >
                          <span className={`w-3.5 h-3.5 shrink-0 ${itemSourceFilter.size === 0 ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                          All shop sources
                        </button>
                        {itemSourceFilterOptions.map((source) => (
                          <button
                            key={source}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleItemSourceFilter(source);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground"
                          >
                            <span className={`w-3.5 h-3.5 shrink-0 ${itemSourceFilter.has(source) ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                            {source}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenReferenceFilterMenu((prev) => prev === "facility-source" ? null : "facility-source")}
                      className={`h-9 rounded-md border px-3 text-sm inline-flex items-center gap-2 font-medium transition-colors ${facilitySourceFilter.size > 0 ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}
                    >
                      Facility: {selectedFacilitySourceLabel}
                      <ChevronDown className={`w-4 h-4 transition-transform ${openReferenceFilterMenu === "facility-source" ? "rotate-180" : ""}`} />
                    </button>
                    {openReferenceFilterMenu === "facility-source" && (
                      <div className="absolute z-50 top-full mt-1 left-0 min-w-[220px] rounded-md border border-border bg-popover shadow-md text-xs overflow-hidden max-h-64 overflow-y-auto">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFacilitySourceFilter(new Set());
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground"
                        >
                          <span className={`w-3.5 h-3.5 shrink-0 ${facilitySourceFilter.size === 0 ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                          All facility sources
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFacilitySourceFilter(NO_FACILITY_SOURCE_FILTER);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground"
                        >
                          <span className={`w-3.5 h-3.5 shrink-0 ${facilitySourceFilter.has(NO_FACILITY_SOURCE_FILTER) ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                          No facility
                        </button>
                        {facilitySourceFilterOptions.map((facility) => (
                          <button
                            key={facility}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleFacilitySourceFilter(facility);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground"
                          >
                            <span className={`w-3.5 h-3.5 shrink-0 ${facilitySourceFilter.has(facility) ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                            {facility}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {(itemSourceFilter.size > 0 || facilitySourceFilter.size > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setItemSourceFilter(new Set());
                        setFacilitySourceFilter(new Set());
                      }}
                      className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ✕ clear
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Item Source and Facility Matrix</h3>
                  <p className="text-xs text-muted-foreground">All item entries with where they come from and what facilities they need (when applicable).</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowItemReferenceDebug((prev) => !prev)}
                    className={`h-8 px-3 text-xs rounded-md border font-medium transition-colors ${showItemReferenceDebug ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}
                  >
                    {showItemReferenceDebug ? "Debug: on" : "Debug: off"}
                  </button>
                  <span className="text-xs text-muted-foreground">Developer only: shows raw attributes and source classification inputs.</span>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-left font-medium">Shop source(s)</th>
                        <th className="px-3 py-2 text-left font-medium">Facility source(s)</th>
                        <th className="px-3 py-2 text-center font-medium">Studio</th>
                        <th className="px-3 py-2 text-center font-medium">INT</th>
                        <th className="px-3 py-2 text-left font-medium">Ally bonus effect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItemFacilityRows.map((row) => {
                        const isCraftable = (row.item.shopFlag & CRAFTABLE_ITEM_FLAG) !== 0;
                        const isCooked = (row.item.shopFlag & COOKED_ITEM_FLAG) !== 0;
                        const knownFlags = getKnownItemFlagNames(row.item.shopFlag);
                        const unknownFlags = getUnknownItemFlagBits(row.item.shopFlag);
                        const classifiedAsItemShop = isCraftable && !isCooked;
                        const classification = classifiedAsItemShop ? "Item Shop" : "Facility only";
                        const binaryFlag = row.item.shopFlag.toString(2).padStart(12, "0");
                        return (
                        <tr key={row.item.name} className="border-t border-border/70 align-top">
                          <td className="px-3 py-2 font-medium text-foreground">
                            <div>{row.item.name}</div>
                            {showItemReferenceDebug && (
                              <div className="mt-1.5 space-y-1 text-[11px] font-normal leading-4 text-muted-foreground">
                                <div>shopFlag: {row.item.shopFlag} (0b{binaryFlag})</div>
                                <div>known flags: {knownFlags.length > 0 ? knownFlags.join(" | ") : "none"}</div>
                                <div>unknown flag bits: {unknownFlags.length > 0 ? unknownFlags.join(", ") : "none"}</div>
                                <div>isCraftable(128): {String(isCraftable)} | hasCooked(1024): {String(isCooked)}</div>
                                <div>craftGroup: {row.item.craftGroup} | category: {row.item.category} | type: {row.item.type}</div>
                                <div>classified as: {classification}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.sources.length > 0 ? row.sources.join(" / ") : "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.facilities.length > 0 ? row.facilities.join(" / ") : "-"}
                            {showItemReferenceDebug && (
                              <div className="mt-1 text-[11px] leading-4 text-muted-foreground/90">
                                fallbackUsed: {String(row.facilities.length > 0 && row.item.craftGroup < 0 && row.sources.includes("Item Shop"))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">{row.item.studioLevel}</td>
                          <td className="px-3 py-2 text-center">{row.item.craftingIntelligence || "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{renderAllyBonusEffect(row.item, statIcons)}</td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 pt-1">
                  <h3 className="text-sm font-semibold">Ally Feed Planner</h3>
                  <p className="text-xs text-muted-foreground">Target-level estimator layout is ready and will use finalized XP inputs once available.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Current ally level</label>
                    <Input
                      type="number"
                      min={1}
                      max={maxExpLevel}
                      value={currentAllyLevelInput}
                      onChange={(e) => setCurrentAllyLevelInput(e.target.value)}
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Target ally level</label>
                    <Input
                      type="number"
                      min={1}
                      max={maxExpLevel}
                      value={targetAllyLevelInput}
                      onChange={(e) => setTargetAllyLevelInput(e.target.value)}
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Feed item</label>
                    <select
                      value={selectedFeedItemName}
                      onChange={(e) => setSelectedFeedItemName(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {feedCandidateItems.map((item) => (
                        <option key={item.name} value={item.name}>
                          {item.name} (Ally EXP {item.eggBonusExp})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Job needExp profile</label>
                    <select
                      value={selectedNeedExpJobName}
                      onChange={(e) => setSelectedNeedExpJobName(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {jobNeedExpProfiles.map((job) => (
                        <option key={job.name} value={job.name}>
                          {job.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">EXP table max level</div>
                    <div className="font-semibold">{maxExpLevel}</div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">Total EXP needed</div>
                    <div className="font-semibold">{allyExpNeeded.toLocaleString()}</div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">needExp multiplier</div>
                    <div className="font-semibold">{selectedNeedExpPercent.toFixed(1)}%</div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">Selected item EXP each</div>
                    <div className="font-semibold">{selectedFeedItem?.eggBonusExp?.toLocaleString() ?? "-"}</div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">Items needed</div>
                    <div className="font-semibold">{feedItemsNeeded === null ? "-" : feedItemsNeeded.toLocaleString()}</div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <div className="text-xs text-muted-foreground">Total ally bonus effect (selected item)</div>
                    <div className="font-semibold">
                      {selectedFeedTotalBonusRange
                        ? renderAllyBonusEffect(selectedFeedItem as ItemRow, statIcons, feedItemsNeeded ?? 0)
                        : "-"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <h3 className="text-sm font-semibold">EXP Curve Preview (From Exp Sheet)</h3>
                  <p className="text-xs text-muted-foreground">Per-level EXP and cumulative EXP for the current planning window after applying selected job needExp multiplier.</p>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-center font-medium">Level</th>
                        <th className="px-3 py-2 text-center font-medium">EXP to next level</th>
                        <th className="px-3 py-2 text-center font-medium">Cumulative EXP to next level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expPreviewRows.map((row) => (
                        <tr key={row.level} className="border-t border-border/70">
                          <td className="px-3 py-2 text-center">{row.level}</td>
                          <td className="px-3 py-2 text-center">{row.expToNext.toLocaleString()}</td>
                          <td className="px-3 py-2 text-center">{row.cumulativeToNext.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 pt-1">
                  <h3 className="text-sm font-semibold">Feed Item Pool</h3>
                  <p className="text-xs text-muted-foreground">Dedicated source list of items currently carrying ally feed values.</p>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Item</th>
                        <th className="px-3 py-2 text-left font-medium">Source(s)</th>
                        <th className="px-3 py-2 text-left font-medium">Ally bonus effect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFeedCandidateRows.map((row) => {
                        const isCraftable = (row.item.shopFlag & CRAFTABLE_ITEM_FLAG) !== 0;
                        const isCooked = (row.item.shopFlag & COOKED_ITEM_FLAG) !== 0;
                        const knownFlags = getKnownItemFlagNames(row.item.shopFlag);
                        const unknownFlags = getUnknownItemFlagBits(row.item.shopFlag);
                        return (
                        <tr key={row.item.name} className="border-t border-border/70 align-top">
                          <td className="px-3 py-2 font-medium text-foreground">
                            <div>{row.item.name}</div>
                            {showItemReferenceDebug && (
                              <div className="mt-1.5 space-y-1 text-[11px] font-normal leading-4 text-muted-foreground">
                                <div>shopFlag: {row.item.shopFlag}</div>
                                <div>known flags: {knownFlags.length > 0 ? knownFlags.join(" | ") : "none"}</div>
                                <div>unknown flag bits: {unknownFlags.length > 0 ? unknownFlags.join(", ") : "none"}</div>
                                <div>isCraftable(128): {String(isCraftable)} | hasCooked(1024): {String(isCooked)}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.sources.length > 0 ? row.sources.join(" / ") : "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{renderAllyBonusEffect(row.item, statIcons)}</td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "item-shop" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Item Shop Database</CardTitle>
                <CardDescription className="text-xs">
                  Craftable item-shop entries pulled from the item sheet by studio and intelligence requirements.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank={false} />
                  <span className="text-xs text-muted-foreground">{filteredItemRows.length} items</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                {itemLoading ? <p className="text-sm text-muted-foreground">Loading item data...</p> : <ItemTable rows={filteredItemRows} />}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "furniture-shop" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Furniture Shop Database</CardTitle>
                <CardDescription className="text-xs">
                  Community-confirmed furniture catalog with studio and intelligence requirements. Prices and fuller facility effects can be added once we decode them from the source cleanly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={furnitureSearch} onChange={(e) => setFurnitureSearch(e.target.value)} placeholder="Search furniture..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank={false} />
                  <span className="text-xs text-muted-foreground">{filteredFurnitureRows.length} furniture items</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <FurnitureTable rows={filteredFurnitureRows} />
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "restaurant" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Restaurant Database</CardTitle>
                <CardDescription className="text-xs">
                  Cooked goods from the item sheet with studio and intelligence requirements.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search restaurant items..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank={false} />
                  <span className="text-xs text-muted-foreground">{filteredRestaurantRows.length} items</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                {itemLoading ? <p className="text-sm text-muted-foreground">Loading restaurant data...</p> : <ItemTable rows={filteredRestaurantRows} />}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedShop.slug === "orchard" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Orchard Database</CardTitle>
                <CardDescription className="text-xs">
                  Fruits and vegetables from harvest-tagged item data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search orchard items..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank={false} />
                  <span className="text-xs text-muted-foreground">{filteredOrchardRows.length} items</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                {itemLoading ? <p className="text-sm text-muted-foreground">Loading orchard data...</p> : <ItemTable rows={filteredOrchardRows} showStudio={false} />}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
