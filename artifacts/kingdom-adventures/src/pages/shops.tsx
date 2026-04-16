import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import {
  CheckCircle2,
  ChevronDown,
  Hammer,
  Package,
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
import { Badge } from "@/components/ui/badge";
import { localSharedData } from "@/lib/local-shared-data";
import { SHOP_RECORDS, type ShopRecord, type ShopSlug, type ShopBuilding, type ShopFacility } from "@/lib/shop-utils";
import { MaterialIcon } from "@/lib/material-icons";

type EquipmentSlot = "Head" | "Weapon" | "Shield" | "Armor" | "Accessory" | "-";
type EquipmentRow = {
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
  studioLevel: number;
  craftingIntelligence: number;
  craftTimeSeconds: number;
  eggBonusType: number;
  eggBonusValue: number;
  eggBonusExp: number;
  eggBonusTime: number;
};

type FurnitureRow = {
  name: string;
  studioLevel: number;
  craftingIntelligence: number;
};

type SharedDataShape = {
  slotAssignments?: Record<string, string>;
  weaponTypes?: Record<string, string>;
  skills?: Record<string, SkillRow>;
};

const EQUIP_SHEET_URL = "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=123527243";
const ITEM_SHEET_URL = "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/gviz/tq?tqx=out:json&gid=1863106351";
const VALID_SLOTS: EquipmentSlot[] = ["Head", "Weapon", "Shield", "Armor", "Accessory", "-"];
const STATUS_STYLE = {
  Ready: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  "In Progress": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  "Research Needed": "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
} as const;
const RANKS = ["All", "S", "A", "B", "C", "D", "E", "F"] as const;
const CRAFT_FILTERS = ["All", "Craftable", "Not Craftable"] as const;
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

const SHOP_ICONS: Record<ShopSlug, JSX.Element> = {
  "weapon-shop": <Hammer className="w-5 h-5 text-amber-500" />,
  "armor-shop": <Shield className="w-5 h-5 text-sky-500" />,
  "accessory-shop": <Store className="w-5 h-5 text-violet-500" />,
  "item-shop": <Package className="w-5 h-5 text-emerald-500" />,
  "furniture-shop": <Sofa className="w-5 h-5 text-orange-500" />,
  restaurant: <UtensilsCrossed className="w-5 h-5 text-rose-500" />,
  "skill-shop": <WandSparkles className="w-5 h-5 text-cyan-500" />,
};

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
      const sheetSlot = String(cells[slotIndex]?.v ?? "").trim();
      const assignedSlot = slotAssignments[name];
      const slot = VALID_SLOTS.includes(assignedSlot as EquipmentSlot)
        ? assignedSlot as EquipmentSlot
        : VALID_SLOTS.includes(sheetSlot as EquipmentSlot)
          ? sheetSlot as EquipmentSlot
          : "-";

      return {
        name,
        rank: getRank(name),
        slot,
        weaponType: weaponTypes[name] ?? "",
        craftable: getNumeric(cells, studioIndex) > 0,
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
  const studioIndex = fallbackIndex(findColumnIndex(cols, [/prices\/craftTermStudioLevel/i, /crafttermstudiolevel/i]), 28);
  const intIndex = fallbackIndex(findColumnIndex(cols, [/prices\/craftTermIntelligence/i, /crafttermintelligence/i]), 29);
  const timeIndex = fallbackIndex(findColumnIndex(cols, [/prices\/craftTimeSeconds/i, /crafttimeseconds/i]), 30);
  const eggTypeIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusType/i, /eggbonustype/i]), 22);
  const eggValueIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusValue/i, /eggbonusvalue/i]), 23);
  const eggExpIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusExp/i, /eggbonusexp/i]), 24);
  const eggTimeIndex = fallbackIndex(findColumnIndex(cols, [/prices\/eggBonusTime/i, /eggbonustime/i]), 25);

  return rows
    .map((row) => {
      const cells = row.c ?? [];
      const name = getText(cells, nameIndex);
      const studioLevel = getNumeric(cells, studioIndex);
      const craftingIntelligence = getNumeric(cells, intIndex);
      if (!name || studioLevel <= 0) return null;
      return {
        name,
        studioLevel,
        craftingIntelligence,
        craftTimeSeconds: getNumeric(cells, timeIndex),
        eggBonusType: getNumeric(cells, eggTypeIndex),
        eggBonusValue: getNumeric(cells, eggValueIndex),
        eggBonusExp: getNumeric(cells, eggExpIndex),
        eggBonusTime: getNumeric(cells, eggTimeIndex),
      };
    })
    .filter((row): row is ItemRow => !!row)
    .sort((a, b) => {
      const studioDiff = a.studioLevel - b.studioLevel;
      return studioDiff !== 0 ? studioDiff : a.name.localeCompare(b.name);
    });
}

function describeEggBonusType(type: number): string {
  switch (type) {
    case 1: return "Attack";
    case 2: return "Defence";
    case 3: return "Balanced";
    case 4: return "Special";
    default: return "-";
  }
}

function ShopHeader({ selectedShop }: {
  selectedShop?: ShopRecord | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div className="flex items-start gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {(selectedShop ? SHOP_ICONS[selectedShop.slug] : <Store className="w-5 h-5 text-indigo-500" />)}
            <h1 className="text-2xl font-bold text-foreground">{selectedShop ? selectedShop.title : "Shops"}</h1>
            {selectedShop && (
              <Badge variant="outline" className={STATUS_STYLE[selectedShop.status]}>
                {selectedShop.status}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            {selectedShop
              ? selectedShop.description
              : "Browse shop databases by owner and category. Ready shops already use translated game data; unfinished shops stay clearly marked as research-backed."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ShopTabs({ currentSlug }: { currentSlug?: ShopSlug }) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {SHOP_RECORDS.map((shop) => (
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
  );
}

const BUILDING_COST_ICONS: { field: keyof ShopBuilding; matId: number; style: "flat" | "outlined" | "crystal" }[] = [
  { field: "grass",  matId: 0, style: "outlined" },
  { field: "wood",   matId: 1, style: "flat" },
  { field: "food",   matId: 2, style: "flat" },
  { field: "ore",    matId: 3, style: "crystal" },
  { field: "mystic", matId: 4, style: "flat" },
];
const PLOT_TILES: Record<string, string> = { S: "6×6", M: "6×8", L: "8×8", XL: "8×10" };
const PLOT_SIZES = ["S", "M", "L", "XL"] as const;

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

  const costs = BUILDING_COST_ICONS.filter(c => (b[c.field] as number) > 0);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{shop.title}</CardTitle>
          <Badge variant="outline" className="text-[10px] shrink-0 bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-300">
            Shop
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {costs.length === 0 ? (
          <span className="text-[11px] text-muted-foreground italic">Free to build</span>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {costs.map(c => (
              <span key={c.field} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MaterialIcon id={c.matId} style={c.style} size={18} />
                {b[c.field] as number}
              </span>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="pr-2 text-left text-[10px] font-medium text-muted-foreground/60 pb-1"></th>
                {PLOT_SIZES.map(s => (
                  <th key={s} className="text-center px-2 text-[10px] font-semibold text-muted-foreground pb-1">
                    <div>{s}</div>
                    <div className="font-normal text-muted-foreground/50 text-[9px] tabular-nums">{PLOT_TILES[s]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <BuildingSlotRow label="Indoor slots" values={b.cap} />
              <BuildingSlotRow label="Beds"         values={b.beds} highlight />
              {b.store.some(v => v > 0) && (
                <BuildingSlotRow label="Shelves"    values={b.store} highlight />
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
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

function WorkbenchCard({ facility }: { facility: ShopFacility }) {
  const [level, setLevel] = useState(0);
  const MAX_LEVEL = 99;

  function interp(lv1: number, maxV: number) {
    if (lv1 === 0 && maxV === 0) return 0;
    return lv1 + Math.floor((maxV - lv1) * level / MAX_LEVEL);
  }

  const costs = [
    { matId: 0, style: "outlined" as const, v: interp(facility.upgGrass,  facility.maxUpgGrass)  },
    { matId: 1, style: "flat"     as const, v: interp(facility.upgWood,   facility.maxUpgWood)   },
    { matId: 2, style: "flat"     as const, v: interp(facility.upgFood,   facility.maxUpgFood)   },
    { matId: 3, style: "crystal"  as const, v: interp(facility.upgOre,    facility.maxUpgOre)    },
    { matId: 4, style: "flat"     as const, v: interp(facility.upgMystic, facility.maxUpgMystic) },
  ].filter(c => c.v > 0);

  const minTime = 120;
  const maxTime = 129600;
  const upgTime = Math.round(minTime + (maxTime - minTime) * level / MAX_LEVEL);

  const N = level + 1;
  const q = Math.max(1, Math.floor(N / 3));
  const items = WORKBENCH_ITEMS.map(([name, ratio]) => ({ name, qty: q * ratio }));

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{facility.name}</CardTitle>
          <Badge variant="outline" className="text-[10px] shrink-0 bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300">
            Indoors
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          <Badge variant="outline" className="text-[10px] tabular-nums font-mono">{facility.size}</Badge>
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">Upgradeable</Badge>
          <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300">🛒 More items available</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide font-medium">
              Upgrade cost (Lv. {level + 1}→{level + 2})
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setLevel(l => Math.max(0, l - 1))}
                disabled={level === 0}
                className="w-5 h-5 rounded text-xs font-bold border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >-</button>
              <span className="text-xs tabular-nums w-7 text-center font-medium">{level + 1}</span>
              <button
                onClick={() => setLevel(l => Math.min(MAX_LEVEL, l + 1))}
                disabled={level === MAX_LEVEL}
                className="w-5 h-5 rounded text-xs font-bold border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >+</button>
            </div>
          </div>
          {costs.length === 0 ? (
            <span className="text-[11px] text-muted-foreground italic">Free</span>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {costs.map(c => (
                <span key={c.matId} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MaterialIcon id={c.matId} style={c.style} size={18} />
                  {c.v}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {items.map(({ name, qty }) => (
              <span key={name} className="text-xs text-muted-foreground">{qty}× {name}</span>
            ))}
          </div>
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">⏱ {formatUpgTime(upgTime)}</p>
        </div>
      </CardContent>
    </Card>
  );
}



function ShopOwnerLink({ owner }: { owner: string }) {
  return (
    <Link href={`/jobs/${encodeURIComponent(owner)}`}>
      <button
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-purple-600 dark:text-purple-400 hover:text-purple-500 dark:hover:text-purple-300 transition-colors"
      >
        {owner}
      </button>
    </Link>
  );
}

function dedupeEquipmentRows(rows: EquipmentRow[]): EquipmentRow[] {
  const byKey = new Map<string, EquipmentRow>();
  for (const row of rows) {
    const key = `${row.name}::${row.slot}::${row.weaponType}`;
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
            <th className="px-3 py-2 text-center font-medium">Craftable</th>
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
              <td className="px-3 py-2 text-center">{row.craftable ? "Yes" : "No"}</td>
              <td className="px-3 py-2 text-center">{row.craftable ? row.studioLevel : "-"}</td>
              <td className="px-3 py-2 text-center">{row.craftable ? row.craftingIntelligence || "-" : "-"}</td>
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

function ItemTable({ rows }: { rows: ItemRow[] }) {
  type SortCol = "name" | "studio" | "int" | "craftTime" | "eggExp";
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
        case "craftTime": return (((a.craftTimeSeconds ?? 0) - (b.craftTimeSeconds ?? 0)) * dir) || a.name.localeCompare(b.name);
        case "eggExp": return (((a.eggBonusExp ?? 0) - (b.eggBonusExp ?? 0)) * dir) || a.name.localeCompare(b.name);
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
            <th className={`${thC} text-center`} onClick={() => toggleSort("studio")}>Studio{arrow("studio")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("int")}>INT{arrow("int")}</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("craftTime")}>Craft Time{arrow("craftTime")}</th>
            <th className="px-3 py-2 text-center font-medium">Egg Stat</th>
            <th className="px-3 py-2 text-center font-medium">Egg +Stat</th>
            <th className={`${thC} text-center`} onClick={() => toggleSort("eggExp")}>Egg EXP{arrow("eggExp")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.name} className="border-t border-border/70">
              <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
              <td className="px-3 py-2 text-center">{row.studioLevel}</td>
              <td className="px-3 py-2 text-center">{row.craftingIntelligence || "-"}</td>
              <td className="px-3 py-2 text-center">{row.craftTimeSeconds ? `${row.craftTimeSeconds}s` : "-"}</td>
              <td className="px-3 py-2 text-center">{describeEggBonusType(row.eggBonusType)}</td>
              <td className="px-3 py-2 text-center">{row.eggBonusValue || "-"}</td>
              <td className="px-3 py-2 text-center">{row.eggBonusExp || "-"}</td>
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

function ResearchShopView({ shop }: { shop: ShopRecord }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="shadow-sm lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Current Scope</CardTitle>
          <CardDescription className="text-xs">
            This shop is wired into the site and navigation now, but the full player-facing data source still needs translation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {shop.currentScope.map((line) => (
            <div key={line} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">{line}</div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Shop Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Owner job</div>
            <ShopOwnerLink owner={shop.owner} />
          </div>
          <div>

          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Next Build Steps</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
          {shop.nextSteps.map((line) => (
            <div key={line} className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">{line}</div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ShopsPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/shops/:slug");
  const [search, setSearch] = useState("");
  const [rankFilter, setRankFilter] = useState<(typeof RANKS)[number]>("All");
  const [craftFilter, setCraftFilter] = useState<(typeof CRAFT_FILTERS)[number]>("All");
  const [armorSlotFilter, setArmorSlotFilter] = useState<"All" | "Head" | "Armor" | "Shield">("All");
  const [skillSearch, setSkillSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [furnitureSearch, setFurnitureSearch] = useState("");
  const [studioFilter, setStudioFilter] = useState<Set<number>>(new Set());
  const [intFilter, setIntFilter] = useState<Set<number>>(new Set());
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setOpenFilterMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedShop = useMemo(
    () => SHOP_RECORDS.find((shop) => shop.slug === params?.slug) ?? null,
    [params]
  );
  const currentUrlSearch = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    const currentSearch = new URLSearchParams(window.location.search);
    const q = currentSearch.get("search") ?? "";
    if (selectedShop?.slug === "item-shop") setItemSearch(q);
    else if (selectedShop?.slug === "furniture-shop") setFurnitureSearch(q);
    else setSearch(q);
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
      const matchesCraft = craftFilter === "All"
        || (craftFilter === "Craftable" && row.craftable)
        || (craftFilter === "Not Craftable" && !row.craftable);
      return matchesSearch && matchesRank && matchesCraft;
    });
  }, [craftFilter, dedupedEquipmentRows, rankFilter, search]);

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
  const filteredItemRows = useMemo(
    () => itemRows.filter((row) => matchesQuery(row.name, itemSearch) && (studioFilter.size === 0 || studioFilter.has(row.studioLevel)) && (intFilter.size === 0 || intFilter.has(row.craftingIntelligence))),
    [itemRows, itemSearch, studioFilter, intFilter]
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
        case "item-shop": return itemRows.map((r) => r.studioLevel);
        case "furniture-shop": return FURNITURE_ROWS.map((r) => r.studioLevel);
        default: return [];
      }
    })();
    return [...new Set(levels.filter((v) => v > 0))].sort((a, b) => a - b);
  }, [selectedShop, dedupedEquipmentRows, skillRows, itemRows]);
  const availableIntValues = useMemo(() => {
    if (!selectedShop) return [];
    type IntRow = { studioLevel: number; craftingIntelligence: number };
    const allRows: IntRow[] = (() => {
      switch (selectedShop.slug) {
        case "weapon-shop": return dedupedEquipmentRows.filter((r) => r.slot === "Weapon");
        case "armor-shop": return dedupedEquipmentRows.filter((r) => ["Head", "Armor", "Shield"].includes(r.slot));
        case "accessory-shop": return dedupedEquipmentRows.filter((r) => r.slot === "Accessory");
        case "skill-shop": return skillRows;
        case "item-shop": return itemRows;
        case "furniture-shop": return FURNITURE_ROWS;
        default: return [];
      }
    })();
    const base = studioFilter.size > 0 ? allRows.filter((r) => studioFilter.has(r.studioLevel)) : allRows;
    return [...new Set(base.map((r) => r.craftingIntelligence).filter((v) => v > 0))].sort((a, b) => a - b);
  }, [studioFilter, selectedShop, dedupedEquipmentRows, skillRows, itemRows]);
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
  const FilterDropdowns = ({ showRank = true, showCraft = true, showArmorSlot = false }: { showRank?: boolean; showCraft?: boolean; showArmorSlot?: boolean }) => (
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
      {showCraft && (
        <div className="relative">
          <button onClick={() => setOpenFilterMenu((v) => v === "craft" ? null : "craft")}
            className={`h-8 px-3 text-xs rounded-md border font-medium flex items-center gap-1.5 transition-colors ${craftFilter !== "All" ? "bg-primary text-primary-foreground border-primary" : "border-input bg-background text-muted-foreground hover:text-foreground"}`}>
            {craftFilter === "All" ? "Craftable" : craftFilter}<ChevronDown className={`w-3 h-3 transition-transform ${openFilterMenu === "craft" ? "rotate-180" : ""}`} />
          </button>
          {openFilterMenu === "craft" && (
            <div className="absolute z-50 top-full mt-1 left-0 min-w-[140px] rounded-md border border-border bg-popover shadow-md text-xs overflow-hidden">
              {CRAFT_FILTERS.map((opt) => (
                <button key={opt} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setCraftFilter(opt); }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-foreground">
                  <span className={`w-3.5 h-3.5 shrink-0 ${craftFilter === opt ? "text-primary" : "opacity-0"}`}><CheckCircle2 className="w-3.5 h-3.5" /></span>
                  {opt === "All" ? "All craftable" : opt}
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
      {(rankFilter !== "All" || craftFilter !== "All" || armorSlotFilter !== "All" || studioFilter.size > 0 || intFilter.size > 0) && (
        <button onClick={() => { setRankFilter("All"); setCraftFilter("All"); setArmorSlotFilter("All"); setStudioFilter(new Set()); setIntFilter(new Set()); }}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          ✕ clear
        </button>
      )}
    </div>
  );
  const selectedShopResults = useMemo(() => {
    switch (selectedShop?.slug) {
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
      case "furniture-shop":
        return filteredFurnitureRows.length;
      default:
        return null;
    }
  }, [
    accessoryRows.length,
    armorRows.length,
    filteredFurnitureRows.length,
    filteredItemRows.length,
    filteredSkillRows.length,
    selectedShop?.slug,
    weaponRows.length,
  ]);

  if (!selectedShop) {
    return (
      <div className="min-h-screen bg-background transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <ShopHeader />

          <Card className="shadow-sm mb-4 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Batch B Shop System</CardTitle>
              <CardDescription className="text-xs">
                Ready shops now open as real database views. Item, furniture, and restaurant stay visible too, but are clearly marked until their translated sources are fully decoded.
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {SHOP_RECORDS.map((shop) => (
              <Card
                key={shop.slug}
                onClick={() => navigate(`/shops/${shop.slug}`)}
                className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all group h-full cursor-pointer"
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                      {SHOP_ICONS[shop.slug]}
                    </div>
                    <Badge variant="outline" className={STATUS_STYLE[shop.status]}>
                      {shop.status}
                    </Badge>
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
          {selectedShop.workbench && <WorkbenchCard facility={selectedShop.workbench} />}
        </div>

        <Card className="shadow-sm mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Owner & Scope</CardTitle>
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
                  Read-only weapon browsing from the translated equipment data. Fixed weapon data stays reference-only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search weapons..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank showCraft />
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
                  Covers headgear, armor, and shields in one shop-facing view.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search armor..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showArmorSlot showRank showCraft />
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
                  Accessory-only browsing from the translated equipment database.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accessories..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank showCraft />
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
                  Only shop-craftable skills are shown here. Fixed skill data stays read-only.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={skillSearch} onChange={(e) => setSkillSearch(e.target.value)} placeholder="Search skills..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank={false} showCraft={false} />
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

        {selectedShop.slug === "item-shop" && (
          <div className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Item Shop Database</CardTitle>
                <CardDescription className="text-xs">
                  Craftable items pulled from the item sheet by studio and intelligence requirements. Egg-feed columns are shown too because they already live in the same source.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Search items..." className="pl-9 h-9" />
                  </div>
                  <FilterDropdowns showRank={false} showCraft={false} />
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
                  <FilterDropdowns showRank={false} showCraft={false} />
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
          <ResearchShopView shop={selectedShop} />
        )}
      </div>
    </div>
  );
}
