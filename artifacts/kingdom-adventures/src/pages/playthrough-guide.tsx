import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { BookOpenText, ExternalLink, Link2, ListTree, Loader2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemedNumberInput } from "@/components/ui/themed-number-input";
import {
  type GuideLinkTarget,
  type GuideLinkOverrides,
  getGuideLinkOverrides,
  normalizeGuideLinkOverrides,
  saveGuideLinkOverrides,
  setGuideLinkOverrides,
} from "@/lib/community-guides";
import { EQUIPMENT_CATALOG } from "@/lib/generated-equipment-data";
import { JOB_RANGE_DATA } from "@/lib/generated-job-range-data";
import { localSharedData } from "@/lib/local-shared-data";
import { SHOP_RECORDS, getShopHref } from "@/lib/shop-utils";
import {
  PLAYTHROUGH_GUIDE_DOC_ID,
  PLAYTHROUGH_GUIDE_LOCAL_URL,
  PLAYTHROUGH_GUIDE_SECTION_OVERLAYS,
} from "@/lib/playthrough-guide";
import { googleSheetUrl, googleDocUrl } from "@/lib/api";

type GuideSection = {
  id: string;
  title: string;
  level: 1 | 2;
  lines: string[];
};

const GUIDE_PREVIEW_DIALOG_CLASS =
  "h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-4 pt-12 sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-[95vw] sm:p-6 xl:max-w-6xl";

type ParsedGuide = {
  imageMap: Record<string, string>;
  sections: GuideSection[];
};

type GuideLink = {
  id?: string;
  label: string;
  href: string;
  kind?: "auto" | "custom";
  target?: GuideLinkTarget;
  occurrenceKey?: string;
};

type ProtectedPhrase = {
  phrase: string;
  blockedLabels: string[];
};

type MarkdownLinkMatch = {
  label: string;
  url: string;
  start: number;
  end: number;
};

type SelectedGuideLink = {
  id?: string;
  label: string;
  href: string;
  kind: "auto" | "custom";
  target?: GuideLinkTarget;
  occurrenceKey?: string;
};

type EquipmentCatalogItem = {
  id: number;
  name: string;
  type: number;
  rankLabel?: string;
  buyPrice?: number;
  requiredKairo?: string;
};

type StatOverride = Record<string, { base?: number; inc?: number }>;

type EquipmentPreviewItem = {
  name: string;
  slot: string;
  rankLabel: string;
  buyPrice?: number;
  requiredKairo?: string;
  weaponType?: string;
  shopName: string;
  studioLevel?: number;
  craftingIntelligence?: number;
  equipIcon?: string;
  statIcons: Record<string, string>;
  stats: Array<{
    name: string;
    base: number;
    inc: number;
  }>;
};

type EquipmentCraftInfo = {
  studioLevel: number;
  craftingIntelligence: number;
};

type LinkTargetType = "equipment" | "job" | "equipment-set" | "marriage-sim" | "custom";

type LinkPickerOption = {
  value: string;
  label: string;
};

type JobStatEntry = {
  base: number;
  inc: number;
  levels?: Record<string, number>;
};

type GuideJob = {
  generation: 1 | 2;
  type?: "combat" | "non-combat";
  icon?: string;
  ranks: Record<string, { stats: Record<string, JobStatEntry> }>;
  shield?: "can" | "cannot";
  weaponEquip?: Partial<Record<string, "can" | "cannot" | "weak">>;
  skillAccess?: Partial<Record<"attack" | "attackMagic" | "recovery" | "casting", "can" | "cannot">>;
  skills?: string[];
  shops?: string[];
  notes?: string;
};

type JobPreviewItem = {
  name: string;
  job: GuideJob;
  statIcons: Record<string, string>;
  weaponCategories: string[];
  shops: string[];
  ranges: Array<{ label: string; groups: Array<{ label: string; value: number }> }>;
};

type EquipmentSetPreviewItem = {
  label: string;
  equipment: Array<{ name: string; level: number }>;
};

type MarriageSimPreviewItem = {
  label: string;
  parentA?: string;
  parentB?: string;
  child?: string;
};

type GuideMarriagePair = {
  jobA: string;
  jobB: string;
  children: string[];
  rank?: string;
  affinity?: string;
  affinityNum?: number;
};

type GuideSimRank = "D" | "C" | "B" | "A" | "S";

const GUIDE_SIM_RANKS: GuideSimRank[] = ["D", "C", "B", "A", "S"];
const GUIDE_SAME_RANK_BONUS: Record<GuideSimRank, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const GUIDE_SIM_RANK_VALUE: Record<GuideSimRank, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const GUIDE_SIM_VALUE_RANK: Record<number, GuideSimRank> = { 1: "D", 2: "C", 3: "B", 4: "A", 5: "S" };
const GUIDE_AFFINITY_NUM_TO_LETTER: Record<number, string> = {
  100: "A",
  95: "B",
  90: "B",
  80: "C",
  75: "D",
  70: "D",
  65: "E",
  60: "E",
};
const GUIDE_AFFINITY_STYLE: Record<string, string> = {
  A: "bg-amber-100 text-amber-800 border-amber-400 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-600",
  B: "bg-violet-100 text-violet-800 border-violet-400 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-600",
  C: "bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-600",
  D: "bg-sky-100 text-sky-800 border-sky-400 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-600",
  E: "bg-slate-100 text-slate-600 border-slate-400 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
};
const GUIDE_SIM_RANK_STYLE: Record<GuideSimRank, string> = {
  S: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-700",
  A: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-700",
  B: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700",
  C: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700",
  D: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGuideLinkLabel(value: string) {
  return value
    .replace(/â€™|â€˜|[’‘]/g, "'")
    .trim()
    .toLowerCase();
}

function escapeGuideLinkLabel(value: string) {
  return escapeRegex(value)
    .replace(/'/g, "(?:'|’|‘|â€™|â€˜)")
    .replace(/’/g, "(?:'|’|‘|â€™|â€˜)")
    .replace(/‘/g, "(?:'|’|‘|â€™|â€˜)")
    .replace(/â€™/g, "(?:'|’|‘|â€™|â€˜)")
    .replace(/â€˜/g, "(?:'|’|‘|â€™|â€˜)");
}

function buildGuideLinks(): GuideLink[] {
  const shared = localSharedData as {
    jobs?: Record<string, unknown>;
    overrides?: Record<string, unknown>;
    skills?: Record<string, unknown>;
  };

  const links = new Map<string, string>();

  const add = (label: string, href: string) => {
    const key = label.trim().toLowerCase();
    if (!key || links.has(key)) return;
    links.set(key, href);
  };

  const blockedAutoLabels = new Set([
    "important",
    "miner",
    "mover",
    "research",
    "royal",
  ]);

  Object.keys(shared.jobs ?? {}).forEach((name) => {
    if (blockedAutoLabels.has(name.trim().toLowerCase())) return;
    add(name, `/jobs/${encodeURIComponent(name)}`);
  });

  Object.keys(shared.skills ?? {}).forEach((name) => {
    if (blockedAutoLabels.has(name.trim().toLowerCase())) return;
    add(name, "/skills");
  });

  Object.keys(shared.overrides ?? {}).forEach((name) => {
    if (/^[FSABCDE]\s*\/\s*/i.test(name)) {
      add(name, `/equipment-stats?search=${encodeURIComponent(name)}`);
    }
  });

  SHOP_RECORDS.forEach((shop) => {
    const href = getShopHref(shop.title);
    if (href) {
      add(shop.title, href);
      add(shop.title.toLowerCase(), href);
    }

    if (shop.owner) {
      add(shop.owner, `/jobs/${encodeURIComponent(shop.owner)}`);
    }
  });

  [
    "Port",
    "Legendary Cave",
    "Kairo Room",
    "Job Center",
  ].forEach((facilityName) => {
    add(
      facilityName,
      `/houses?tab=facilities&facilityTab=map&search=${encodeURIComponent(facilityName)}`,
    );
  });

  add("Master Smithy", "/houses?tab=facilities&facilityTab=map");
  add("Novel", `/equipment-stats?search=${encodeURIComponent("F/ Novel")}`);
  add("Weapon Shop", "/shops/weapon-shop");
  add("Weapons Shop", "/shops/weapon-shop");
  add("Armor Shop", "/shops/armor-shop");
  add("Accessory Shop", "/shops/accessory-shop");
  add("Acc shop", "/shops/accessory-shop");
  add("Furniture shop", "/shops/furniture-shop");
  add("Item shop", "/shops/item-shop");
  add("Skill shop", "/shops/skill-shop");
  add("Restaurant", "/shops/restaurant");
  add("Item", "/shops/item-shop");
  add("Armor", "/shops/armor-shop");
  add("Weekly Conquest", "/weekly-conquest");
  add("Friend Post Office", "/houses?tab=facilities&facilityTab=map&search=Friend%20Post%20Office");
  add("Wooden Stick", "/equipment-stats?search=Wooden%20Stick");
  add("Magic Pendant", "/equipment-stats?search=Magic%20Pendant");
  add("Leather Armor", "/equipment-stats?search=Leather%20Armor");
  add("Mage's Hat", "/equipment-stats?search=Mage%27s%20Hat");
  add("Mage’s Hat", "/equipment-stats?search=Mage%E2%80%99s%20Hat");
  add("Lightning Staff", "/equipment-stats?search=Lightning%20Staff");
  add("Ninja Headband", "/equipment-stats?search=Ninja%20Headband");
  add("Craftsmanship V", "/skills");
  add("Stove", "/houses?tab=facilities&search=Stove");
  add("Simple Stove", "/houses?tab=facilities&search=Simple%20Stove");
  add("Bonfire", "/houses?tab=facilities&search=Bonfire");
  add("Kitchen Shelf", "/houses?tab=facilities&search=Kitchen%20Shelf");
  add("Cooking Counter", "/houses?tab=facilities&search=Cooking%20Counter");

  return Array.from(links.entries())
    .map(([label, href]) => ({ label, href }))
    .sort((a, b) => b.label.length - a.label.length);
}

const GUIDE_LINKS = buildGuideLinks();
const PROTECTED_PHRASES: ProtectedPhrase[] = [
  { phrase: "Royal Room", blockedLabels: ["royal"] },
  { phrase: "Master Smithy", blockedLabels: ["smithy"] },
  { phrase: "Friend Post Office", blockedLabels: ["friend", "post", "office"] },
  { phrase: "Weekly Conquest", blockedLabels: ["weekly", "conquest"] },
  { phrase: "Weapon Shop", blockedLabels: ["weapon"] },
  { phrase: "Armor Shop", blockedLabels: ["armor"] },
  { phrase: "Item Shop", blockedLabels: ["item"] },
  { phrase: "Weapon Sample", blockedLabels: ["weapon"] },
  { phrase: "Armor Sample", blockedLabels: ["armor"] },
  { phrase: "Accessory Sample", blockedLabels: ["accessory"] },
  { phrase: "Skill Sample", blockedLabels: ["skill"] },
  { phrase: "Mage's Potion", blockedLabels: ["mage"] },
  { phrase: "Mage’s Potion", blockedLabels: ["mage"] },
];
function buildGuideLinkPattern(links: GuideLink[]) {
  return links.length > 0
    ? new RegExp(`(^|[^A-Za-z0-9/])(${links.map((link) => escapeGuideLinkLabel(link.label)).join("|")})(?=$|[^A-Za-z0-9])`, "gi")
    : null;
}

function buildGuideOccurrenceKey(scope: string | undefined, index: number, label: string) {
  return scope ? `${scope}:${index}:${normalizeGuideLinkLabel(label)}` : "";
}

function findGuideLinkForOccurrence(links: GuideLink[], label: string, occurrenceKey: string) {
  const normalizedLabel = normalizeGuideLinkLabel(label);
  return links.find((item) => item.occurrenceKey === occurrenceKey && normalizeGuideLinkLabel(item.label) === normalizedLabel)
    ?? links.find((item) => !item.occurrenceKey && item.kind === "custom" && normalizeGuideLinkLabel(item.label) === normalizedLabel)
    ?? links.find((item) => !item.occurrenceKey && normalizeGuideLinkLabel(item.label) === normalizedLabel);
}

function buildEffectiveGuideLinks(overrides?: GuideLinkOverrides): GuideLink[] {
  const disabledLabels = new Set((overrides?.disabledAutoLinks ?? []).map(normalizeGuideLinkLabel));
  const customLinks = (overrides?.customLinks ?? []).map((link) => ({
    id: link.id,
    label: link.phrase,
    href: link.href,
    kind: "custom" as const,
    target: link.target,
    occurrenceKey: link.occurrenceKey,
  }));

  const customLabels = new Set(customLinks.filter((link) => !link.occurrenceKey).map((link) => normalizeGuideLinkLabel(link.label)));
  const autoLinks = GUIDE_LINKS
    .filter((link) => !disabledLabels.has(normalizeGuideLinkLabel(link.label)))
    .filter((link) => !customLabels.has(normalizeGuideLinkLabel(link.label)))
    .map((link) => ({ ...link, kind: "auto" as const }));

  return [...customLinks, ...autoLinks].sort((a, b) => b.label.length - a.label.length);
}

const GUIDE_EQUIPMENT_STATS = [
  "HP",
  "MP",
  "Vigor",
  "Attack",
  "Defence",
  "Speed",
  "Luck",
  "Intelligence",
  "Dexterity",
  "Gather",
  "Move",
  "Heart",
];

const GUIDE_STAT_SHORT: Record<string, string> = {
  HP: "HP",
  MP: "MP",
  Vigor: "Vig",
  Attack: "Atk",
  Defence: "Def",
  Speed: "Spd",
  Luck: "Lck",
  Intelligence: "Int",
  Dexterity: "Dex",
  Gather: "Gth",
  Move: "Mov",
  Heart: "Hrt",
};

function equipmentSlotFromType(rawType: number) {
  if (rawType === 11) return "Shield";
  if (rawType === 12) return "Armor";
  if (rawType === 13) return "Head";
  if (rawType === 14) return "Accessory";
  if (Number.isFinite(rawType) && rawType > 0) return "Weapon";
  return "";
}

function equipmentShopFromType(rawType: number) {
  if (rawType === 14) return "Accessory shop";
  if (rawType === 11 || rawType === 12 || rawType === 13) return "Armor shop";
  if (Number.isFinite(rawType) && rawType > 0) return "Weapon shop";
  return "Equipment shop";
}

function normalizeEquipmentName(value: string) {
  return value
    .toLowerCase()
    .replace(/^[fsabcde]\s*\/\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getEquipmentSearchFromHref(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    if (url.pathname !== "/equipment-stats") return "";
    return url.searchParams.get("search") ?? "";
  } catch {
    return "";
  }
}

function isEquipmentStatsHref(href: string) {
  return Boolean(getEquipmentSearchFromHref(href));
}

function buildEquipmentStatsHref(name: string) {
  return `/equipment-stats?search=${encodeURIComponent(name)}`;
}

function buildJobHref(name: string) {
  return `/jobs/${encodeURIComponent(name)}`;
}

function getJobNameFromHref(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    const prefix = "/jobs/";
    if (!url.pathname.startsWith(prefix)) return "";
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return "";
  }
}

function findEquipmentCatalogItem(search: string) {
  if (!search) return null;
  const catalog = EQUIPMENT_CATALOG as readonly EquipmentCatalogItem[];
  const exactSearch = search.toLowerCase().trim();
  const normalizedSearch = normalizeEquipmentName(search);
  return catalog.find((candidate) => candidate.name.toLowerCase() === exactSearch)
    ?? catalog.find((candidate) => normalizeEquipmentName(candidate.name) === normalizedSearch)
    ?? catalog.find((candidate) => normalizeEquipmentName(candidate.name).includes(normalizedSearch))
    ?? null;
}

function inferLinkTarget(href: string): { type: LinkTargetType; equipmentName: string; jobName: string; customHref: string } {
  const empty = { type: "equipment" as LinkTargetType, equipmentName: "", jobName: "", customHref: "" };
  if (!href) return empty;

  const equipmentSearch = getEquipmentSearchFromHref(href);
  if (equipmentSearch) {
    return {
      ...empty,
      type: "equipment",
      equipmentName: findEquipmentCatalogItem(equipmentSearch)?.name ?? equipmentSearch,
    };
  }

  try {
    const url = new URL(href, window.location.origin);
    const jobPrefix = "/jobs/";
    if (url.pathname.startsWith(jobPrefix)) {
      return {
        ...empty,
        type: "job",
        jobName: decodeURIComponent(url.pathname.slice(jobPrefix.length)),
      };
    }
  } catch {}

  return { ...empty, type: "custom", customHref: href };
}

function guideTargetToHref(target: GuideLinkTarget) {
  if (target.type === "equipment") return buildEquipmentStatsHref(target.equipmentName);
  if (target.type === "job") return buildJobHref(target.jobName);
  if (target.type === "equipment-set") return "#guide-equipment-set";
  if (target.type === "marriage-sim") return "/match-finder?tab=simulator";
  return target.href;
}

function guideTargetLabel(target?: GuideLinkTarget) {
  if (!target) return "";
  if (target.type === "equipment") return `Equipment: ${target.equipmentName}`;
  if (target.type === "job") return `Job: ${target.jobName}`;
  if (target.type === "equipment-set") return `Equipment Set: ${target.equipment.length} item${target.equipment.length === 1 ? "" : "s"}`;
  if (target.type === "marriage-sim") {
    const parents = [target.parentA, target.parentB].filter(Boolean).join(" + ");
    return `Marriage Sim${parents ? `: ${parents}` : ""}${target.child ? ` -> ${target.child}` : ""}`;
  }
  return target.href;
}

const EQUIPMENT_SHEET_ID = "1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk";
const EQUIPMENT_SHEET_GID = "123527243";
let guideEquipmentCraftInfoPromise: Promise<Record<string, EquipmentCraftInfo>> | null = null;

async function fetchGuideEquipmentCraftInfo() {
  if (guideEquipmentCraftInfoPromise) return guideEquipmentCraftInfoPromise;

  guideEquipmentCraftInfoPromise = (async () => {
    const url = googleSheetUrl("equipment");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Equipment sheet request failed with ${response.status}`);
    const text = await response.text();
    const json = text.replace(/^[^(]+\(/, "").replace(/\);?\s*$/, "");
    const data = JSON.parse(json) as {
      table?: {
        cols?: Array<{ id?: string; label?: string; type?: string }>;
        rows?: Array<{ c?: Array<{ v?: string | number | null } | null> }>;
      };
    };
    const cols = (data.table?.cols ?? []).map((col) => (col.label || col.id || "").trim());
    const colTypes = (data.table?.cols ?? []).map((col) => col.type ?? "");
    const nameColIdx = (() => {
      const exact = cols.findIndex((col) => /^(name|item.?name|equipment.?name|equip(ment)?)$/i.test(col));
      if (exact >= 0) return exact;
      return colTypes.findIndex((type) => type === "string");
    })();
    const craftLvlIdx = cols.findIndex((col) => /crafterstudio|studio.?level|crafter.?studio/i.test(col));
    const craftIntIdx = cols.findIndex((col) => /craftermintelligence|crafter.?intel|craft.*int/i.test(col));

    if (nameColIdx < 0 || craftLvlIdx < 0 || craftIntIdx < 0) return {};

    const craftInfo: Record<string, EquipmentCraftInfo> = {};
    for (const row of data.table?.rows ?? []) {
      const cells = row.c ?? [];
      const get = (index: number) => (index >= 0 && index < cells.length ? cells[index]?.v ?? null : null);
      const name = String(get(nameColIdx) ?? "").trim();
      if (!name || /^\d+$/.test(name)) continue;

      const studioLevel = Number(get(craftLvlIdx)) || 0;
      const craftingIntelligence = Number(get(craftIntIdx)) || 0;
      if (studioLevel > 0 || craftingIntelligence > 0) {
        craftInfo[name] = { studioLevel, craftingIntelligence };
      }
    }
    return craftInfo;
  })();

  return guideEquipmentCraftInfoPromise;
}

function findGuideEquipmentPreview(href: string, label: string): EquipmentPreviewItem | null {
  const search = getEquipmentSearchFromHref(href) || label;
  if (!search) return null;

  const item = findEquipmentCatalogItem(search);

  if (!item) return null;

  const shared = localSharedData as {
    overrides?: Record<string, StatOverride>;
    slotAssignments?: Record<string, string>;
    weaponTypes?: Record<string, string>;
    equipIcons?: Record<string, string>;
    statIcons?: Record<string, string>;
    skills?: Record<string, { studioLevel?: number; craftingIntelligence?: number }>;
  };
  const overrides = shared.overrides?.[item.name] ?? {};
  const stats = GUIDE_EQUIPMENT_STATS
    .map((stat) => ({
      name: stat,
      base: overrides[stat]?.base ?? 0,
      inc: overrides[stat]?.inc ?? 0,
    }))
    .filter((stat) => stat.base !== 0 || stat.inc !== 0);

  return {
    name: item.name,
    slot: shared.slotAssignments?.[item.name] || equipmentSlotFromType(item.type),
    rankLabel: item.rankLabel ?? item.name.match(/^([FSABCDE])\s*\//i)?.[1]?.toUpperCase() ?? "",
    buyPrice: item.buyPrice,
    requiredKairo: item.requiredKairo,
    weaponType: shared.weaponTypes?.[item.name],
    shopName: equipmentShopFromType(item.type),
    studioLevel: shared.skills?.[item.name]?.studioLevel,
    craftingIntelligence: shared.skills?.[item.name]?.craftingIntelligence,
    equipIcon: shared.equipIcons?.[`equip:${item.name}`],
    statIcons: shared.statIcons ?? {},
    stats,
  };
}

const GUIDE_KNOWN_JOB_SHOPS: Record<string, string[]> = {
  Artisan: ["Furniture Shop"],
  Artist: ["Studio"],
  Blacksmith: ["Weapon Shop", "Armor Shop"],
  "Beast Tamer": ["Zoo"],
  Carpenter: ["Survey Corps HQ (Rank B+)"],
  Cook: ["Restaurant"],
  Doctor: ["Hospital"],
  Entertainer: ["Insectarium", "Aquarium", "Museum"],
  Farmer: ["Orchard (Rank C+)", "Survey Corps HQ (Rank B+)"],
  Mage: ["Skill Shop"],
  Merchant: ["Survey Corps HQ (Rank B+)"],
  Monk: ["Church"],
  Mover: ["Survey Corps HQ (Rank B+)"],
  Rancher: ["Monster House", "Survey Corps HQ (Rank B+)"],
  Researcher: ["Analysis Lab", "Research Lab"],
  "Santa Claus": ["Santa's House"],
  Trader: ["Item Shop", "Accessory Shop"],
};

const GUIDE_JOB_RANGE_RANK_ORDER = ["D", "C", "B", "A", "S"] as const;
const GUIDE_JOB_RANGE_LABELS = [
  { label: "Searching Range", index: 0 },
  { label: "Deployment Range", index: 1 },
  { label: "Defog AoE", index: 2 },
] as const;

function formatGuideRangeRankLabel(startRank: string, endRank: string) {
  if (startRank === endRank) return `${startRank} rank`;
  if (endRank === "S") return `${startRank}+ rank`;
  return `${startRank}-${endRank} rank`;
}

function getGuideCollapsedRangeGroups(jobName: string, index: 0 | 1 | 2) {
  const ranges = (JOB_RANGE_DATA as Record<string, Partial<Record<string, readonly [number, number, number]>>>)[jobName];
  if (!ranges) return [];

  const entries = GUIDE_JOB_RANGE_RANK_ORDER
    .map((rank) => {
      const values = ranges[rank];
      return values ? { rank, value: values[index] } : null;
    })
    .filter((entry): entry is { rank: (typeof GUIDE_JOB_RANGE_RANK_ORDER)[number]; value: number } => Boolean(entry && Number.isFinite(entry.value)));

  if (!entries.length) return [];
  const groups: Array<{ label: string; value: number }> = [];
  const firstEntry = entries[0]!;
  let start = firstEntry.rank;
  let end = firstEntry.rank;
  let value = firstEntry.value;

  for (const entry of entries.slice(1)) {
    if (entry.value === value) {
      end = entry.rank;
    } else {
      groups.push({ label: formatGuideRangeRankLabel(start, end), value });
      start = entry.rank;
      end = entry.rank;
      value = entry.value;
    }
  }
  groups.push({ label: formatGuideRangeRankLabel(start, end), value });
  return groups;
}

function findGuideJobPreview(href: string, label: string): JobPreviewItem | null {
  const jobName = getJobNameFromHref(href) || label;
  if (!jobName) return null;
  const shared = localSharedData as {
    jobs?: Record<string, GuideJob>;
    statIcons?: Record<string, string>;
    weaponCategories?: string[];
  };
  const foundName = Object.keys(shared.jobs ?? {}).find((name) => name.toLowerCase() === jobName.toLowerCase()) ?? jobName;
  const job = shared.jobs?.[foundName];
  if (!job) return null;

  return {
    name: foundName,
    job,
    statIcons: shared.statIcons ?? {},
    weaponCategories: shared.weaponCategories ?? [],
    shops: job.shops?.length ? job.shops : GUIDE_KNOWN_JOB_SHOPS[foundName] ?? [],
    ranges: GUIDE_JOB_RANGE_LABELS
      .map((range) => ({ label: range.label, groups: getGuideCollapsedRangeGroups(foundName, range.index) }))
      .filter((range) => range.groups.length > 0),
  };
}

function parseGuide(markdown: string): ParsedGuide {
  const normalized = markdown.replace(/\r/g, "");
  const imageMap: Record<string, string> = {};

  // Google Docs markdown export defines images at the bottom like:
  // [image155]: <data:image/png;base64,...>
  //
  // Keep those data URLs directly instead of converting them to
  // /guides/images/image155.png. That way new Google Doc images can render
  // without also uploading static image files to the website.
  for (const match of normalized.matchAll(/^\[image(?<id>\d+)\]:\s*<(?<src>data:image\/[a-zA-Z0-9.+-]+;base64,[^>\n]+)>\s*$/gm)) {
    const id = match.groups?.id;
    const src = match.groups?.src;
    if (!id || !src) continue;
    imageMap[`image${id}`] = src;
  }

  // Remove Google Docs image definition lines from the visible article text.
  // If a malformed export ever misses the closing ">", this still removes the
  // whole definition line so the base64 text does not flood the page.
  const cleaned = normalized
    .replace(/^\[image\d+\]:\s*<data:image\/[^\n>]+>?\s*$/gm, "")
    .replace(/^\[image\d+\]:\s*<data:image\/.*$/gm, "");

  // Fallback only: if the markdown references an image but did not include a
  // data URL definition, try the old static public image path.
  const referencedImages = Array.from(normalized.matchAll(/!\[\]\[(image\d+)\]/g)).map((m) => m[1]);
  for (const imageId of referencedImages) {
    if (!imageMap[imageId]) {
      imageMap[imageId] = `/guides/images/${imageId}.png`;
    }
  }

  const lines = cleaned.split("\n");
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\\!/g, "!").replace(/\\#/g, "#");
    const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2;
      const title = headingMatch[2].trim();
      current = {
        id: slugify(title),
        title,
        level,
        lines: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = {
        id: "overview",
        title: "Overview",
        level: 1,
        lines: [],
      };
      sections.push(current);
    }

    current.lines.push(line);
  }

  return {
    imageMap,
    sections: sections.filter((section) => section.lines.join("").trim() || section.title),
  };
}

function renderInlineContent(
  text: string,
  options?: {
    effectiveLinks?: GuideLink[];
    disabledOccurrenceKeys?: Set<string>;
    linkEditMode?: boolean;
    exactSpotPickMode?: boolean;
    selectedOccurrenceKeys?: Set<string>;
    occurrenceScope?: string;
    onSelectLink?: (link: SelectedGuideLink) => void;
    onToggleExactSpot?: (link: SelectedGuideLink) => void;
    onOpenEquipmentPreview?: (href: string, label: string) => void;
    onOpenJobPreview?: (href: string, label: string) => void;
    onOpenGuideTarget?: (link: GuideLink, label: string) => void;
  },
) {
  const effectiveLinks = options?.effectiveLinks ?? GUIDE_LINKS;
  const guideLinkPattern = buildGuideLinkPattern(effectiveLinks);
  const markdownLinks = Array.from(text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)).map((match) => ({
    label: match[1],
    url: match[2],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  })) as MarkdownLinkMatch[];

  if (!options?.exactSpotPickMode && !guideLinkPattern && markdownLinks.length === 0) return text;

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  const pushSelectableWords = (segment: string, segmentStart: number) => {
    const wordPattern = /[A-Za-z0-9][A-Za-z0-9'’‘/-]*/g;
    let wordLastIndex = 0;
    for (const match of segment.matchAll(wordPattern)) {
      const word = match[0];
      const wordStart = match.index ?? 0;
      const absoluteIndex = segmentStart + wordStart;
      if (wordStart > wordLastIndex) parts.push(segment.slice(wordLastIndex, wordStart));
      const occurrenceKey = buildGuideOccurrenceKey(options?.occurrenceScope, absoluteIndex, word);
      const selected = options?.selectedOccurrenceKeys?.has(occurrenceKey);
      parts.push(
        <button
          key={`exact-${occurrenceKey}`}
          type="button"
          className={`rounded px-0.5 font-medium underline underline-offset-4 decoration-dashed ${
            selected ? "bg-primary text-primary-foreground decoration-primary-foreground" : "text-primary hover:bg-primary/10"
          }`}
          onClick={() => options?.onToggleExactSpot?.({ label: word, href: "", kind: "custom", occurrenceKey })}
        >
          {word}
        </button>,
      );
      wordLastIndex = wordStart + word.length;
    }
    if (wordLastIndex < segment.length) parts.push(segment.slice(wordLastIndex));
  };

  const pushExactSpotText = (segment: string, segmentStart: number) => {
    if (!guideLinkPattern) {
      pushSelectableWords(segment, segmentStart);
      return;
    }

    let innerLastIndex = 0;
    for (const match of segment.matchAll(guideLinkPattern)) {
      const prefix = match[1] ?? "";
      const fullMatch = match[2];
      const rawMatchStart = match.index ?? 0;
      const matchIndex = rawMatchStart + prefix.length;
      const absoluteMatchIndex = segmentStart + matchIndex;
      const occurrenceKey = buildGuideOccurrenceKey(options?.occurrenceScope, absoluteMatchIndex, fullMatch);
      const link = findGuideLinkForOccurrence(effectiveLinks, fullMatch, occurrenceKey);
      const href = link?.href ?? "";

      if (rawMatchStart > innerLastIndex) {
        pushSelectableWords(segment.slice(innerLastIndex, rawMatchStart), segmentStart + innerLastIndex);
      }
      if (prefix) parts.push(prefix);

      const selected = options?.selectedOccurrenceKeys?.has(occurrenceKey);
      parts.push(
        <button
          key={`exact-${occurrenceKey}`}
          type="button"
          className={`rounded px-0.5 font-medium underline underline-offset-4 decoration-dashed ${
            selected ? "bg-primary text-primary-foreground decoration-primary-foreground" : "text-primary hover:bg-primary/10"
          }`}
          onClick={() => options?.onToggleExactSpot?.({ id: link?.id, label: fullMatch, href, kind: link?.kind ?? "custom", target: link?.target, occurrenceKey })}
        >
          {fullMatch}
        </button>,
      );
      innerLastIndex = rawMatchStart + prefix.length + fullMatch.length;
    }

    if (innerLastIndex < segment.length) {
      pushSelectableWords(segment.slice(innerLastIndex), segmentStart + innerLastIndex);
    }
  };

  if (options?.exactSpotPickMode) {
    for (const mdLink of markdownLinks) {
      if (mdLink.start > lastIndex) {
        pushExactSpotText(text.slice(lastIndex, mdLink.start), lastIndex);
      }
      const occurrenceKey = buildGuideOccurrenceKey(options.occurrenceScope, mdLink.start, mdLink.label);
      const overrideLink = findGuideLinkForOccurrence(effectiveLinks, mdLink.label, occurrenceKey);
      const selected = options.selectedOccurrenceKeys?.has(occurrenceKey);
      parts.push(
        <button
          key={`exact-${occurrenceKey}`}
          type="button"
          className={`rounded px-0.5 font-medium underline underline-offset-4 decoration-dashed ${
            selected ? "bg-primary text-primary-foreground decoration-primary-foreground" : "text-primary hover:bg-primary/10"
          }`}
          onClick={() => options.onToggleExactSpot?.({ id: overrideLink?.id, label: mdLink.label, href: overrideLink?.href ?? mdLink.url, kind: overrideLink?.kind ?? "custom", target: overrideLink?.target, occurrenceKey })}
        >
          {mdLink.label}
        </button>,
      );
      lastIndex = mdLink.end;
    }
    if (lastIndex < text.length) {
      pushExactSpotText(text.slice(lastIndex), lastIndex);
    }
    return parts.length > 0 ? parts : text;
  }

  const pushMarkdownLinkAwareText = (segment: string, segmentStart: number) => {
    if (!guideLinkPattern) {
      parts.push(segment);
      return;
    }

    let innerLastIndex = 0;
    for (const match of segment.matchAll(guideLinkPattern)) {
      const prefix = match[1] ?? "";
      const fullMatch = match[2];
      const rawMatchStart = match.index ?? 0;
      const matchIndex = rawMatchStart + prefix.length;
      const absoluteMatchIndex = segmentStart + matchIndex;
      const normalizedLabel = normalizeGuideLinkLabel(fullMatch);
      const occurrenceKey = buildGuideOccurrenceKey(options?.occurrenceScope, absoluteMatchIndex, fullMatch);
      if (options?.disabledOccurrenceKeys?.has(occurrenceKey)) continue;
      const link = findGuideLinkForOccurrence(effectiveLinks, fullMatch, occurrenceKey);
      const href = link?.href;

      if (!href) continue;

      const blockedByPhrase = PROTECTED_PHRASES.some(({ phrase, blockedLabels }) => {
        if (!blockedLabels.includes(normalizedLabel)) return false;
        const phraseIndex = segment.toLowerCase().indexOf(phrase.toLowerCase());
        return phraseIndex !== -1 && matchIndex >= phraseIndex && matchIndex < phraseIndex + phrase.length;
      });

      if (blockedByPhrase) continue;

      if (rawMatchStart > innerLastIndex) {
        parts.push(segment.slice(innerLastIndex, rawMatchStart));
      }

      if (prefix) parts.push(prefix);

      if (options?.linkEditMode && options.onSelectLink) {
        parts.push(
          <button
            key={`${fullMatch}-${absoluteMatchIndex}`}
            type="button"
            className="font-medium text-primary underline underline-offset-4 decoration-dashed"
            onClick={() => options.onSelectLink?.({ id: link?.id, label: fullMatch, href, kind: link?.kind ?? "auto", target: link?.target, occurrenceKey })}
          >
            {fullMatch}
          </button>,
        );
      } else if (link?.target && options?.onOpenGuideTarget) {
        parts.push(
          <button
            key={`${fullMatch}-${absoluteMatchIndex}`}
            type="button"
            className="font-medium text-primary underline underline-offset-4"
            onClick={() => options.onOpenGuideTarget?.(link, fullMatch)}
          >
            {fullMatch}
          </button>,
        );
      } else if (options?.onOpenEquipmentPreview && isEquipmentStatsHref(href)) {
        parts.push(
          <button
            key={`${fullMatch}-${absoluteMatchIndex}`}
            type="button"
            className="font-medium text-primary underline underline-offset-4"
            onClick={() => options.onOpenEquipmentPreview?.(href, fullMatch)}
          >
            {fullMatch}
          </button>,
        );
      } else if (options?.onOpenJobPreview && getJobNameFromHref(href)) {
        parts.push(
          <button
            key={`${fullMatch}-${absoluteMatchIndex}`}
            type="button"
            className="font-medium text-primary underline underline-offset-4"
            onClick={() => options.onOpenJobPreview?.(href, fullMatch)}
          >
            {fullMatch}
          </button>,
        );
      } else {
        parts.push(
          <a
            key={`${fullMatch}-${absoluteMatchIndex}`}
            href={href}
            className="font-medium text-primary underline underline-offset-4"
          >
            {fullMatch}
          </a>,
        );
      }

      innerLastIndex = rawMatchStart + prefix.length + fullMatch.length;
    }

    if (innerLastIndex < segment.length) {
      parts.push(segment.slice(innerLastIndex));
    }
  };

  for (const mdLink of markdownLinks) {
    if (mdLink.start > lastIndex) {
      pushMarkdownLinkAwareText(text.slice(lastIndex, mdLink.start), lastIndex);
    }

    const occurrenceKey = buildGuideOccurrenceKey(options?.occurrenceScope, mdLink.start, mdLink.label);
    const occurrenceDisabled = options?.disabledOccurrenceKeys?.has(occurrenceKey);
    const overrideLink = findGuideLinkForOccurrence(effectiveLinks, mdLink.label, occurrenceKey);
    const href = occurrenceDisabled ? mdLink.url : overrideLink?.href ?? mdLink.url;
    if (options?.linkEditMode && options.onSelectLink) {
      parts.push(
        <button
          key={`${mdLink.label}-${mdLink.start}`}
          type="button"
          className="font-medium text-primary underline underline-offset-4 decoration-dashed"
          onClick={() => options.onSelectLink?.({ id: overrideLink?.id, label: mdLink.label, href, kind: overrideLink?.kind ?? "custom", target: overrideLink?.target, occurrenceKey })}
        >
          {mdLink.label}
        </button>,
      );
    } else if (!occurrenceDisabled && overrideLink?.target && options?.onOpenGuideTarget) {
      parts.push(
        <button
          key={`${mdLink.label}-${mdLink.start}`}
          type="button"
          className="font-medium text-primary underline underline-offset-4"
          onClick={() => options.onOpenGuideTarget?.(overrideLink, mdLink.label)}
        >
          {mdLink.label}
        </button>,
      );
    } else if (!occurrenceDisabled && options?.onOpenEquipmentPreview && isEquipmentStatsHref(href)) {
      parts.push(
        <button
          key={`${mdLink.label}-${mdLink.start}`}
          type="button"
          className="font-medium text-primary underline underline-offset-4"
          onClick={() => options.onOpenEquipmentPreview?.(href, mdLink.label)}
        >
          {mdLink.label}
        </button>,
      );
    } else if (!occurrenceDisabled && options?.onOpenJobPreview && getJobNameFromHref(href)) {
      parts.push(
        <button
          key={`${mdLink.label}-${mdLink.start}`}
          type="button"
          className="font-medium text-primary underline underline-offset-4"
          onClick={() => options.onOpenJobPreview?.(href, mdLink.label)}
        >
          {mdLink.label}
        </button>,
      );
    } else if (occurrenceDisabled) {
      parts.push(mdLink.label);
    } else {
      parts.push(
        <a
          key={`${mdLink.label}-${mdLink.start}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-4"
        >
          {mdLink.label}
        </a>,
      );
    }
    lastIndex = mdLink.end;
  }

  if (lastIndex < text.length) {
    pushMarkdownLinkAwareText(text.slice(lastIndex), lastIndex);
  }

  return parts.length > 0 ? parts : text;
}

function renderLine(
  line: string,
  index: number,
  imageMap: Record<string, string>,
  options?: {
    effectiveLinks?: GuideLink[];
    disabledOccurrenceKeys?: Set<string>;
    linkEditMode?: boolean;
    exactSpotPickMode?: boolean;
    selectedOccurrenceKeys?: Set<string>;
    occurrenceScope?: string;
    onSelectLink?: (link: SelectedGuideLink) => void;
    onToggleExactSpot?: (link: SelectedGuideLink) => void;
    onOpenEquipmentPreview?: (href: string, label: string) => void;
    onOpenJobPreview?: (href: string, label: string) => void;
    onOpenGuideTarget?: (link: GuideLink, label: string) => void;
  },
) {
  const trimmed = line.trim();

  if (!trimmed) {
    return <div key={index} className="h-2" />;
  }

  const referencedImageIds = Array.from(trimmed.matchAll(/!\[\]\[(image\d+)\]/g)).map((match) => match[1]);
  const inlineImageSources = Array.from(trimmed.matchAll(/!\[[^\]]*\]\((data:image\/[^)]+)\)/g)).map((match) => match[1]);
  const imageSources = [
    ...referencedImageIds.map((imageId) => ({ id: imageId, src: imageMap[imageId] })),
    ...inlineImageSources.map((src, i) => ({ id: `inline-image-${index}-${i}`, src })),
  ].filter((image): image is { id: string; src: string } => Boolean(image.src));

  if (imageSources.length > 0) {
    return (
      <div key={index} className="flex flex-wrap gap-3 py-2">
        {imageSources.map(({ id, src }) => (
          <a
            key={id}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm"
          >
            <img
              src={src}
              alt={id}
              className="max-h-80 w-auto max-w-full object-contain"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    );
  }

  if (/^[-*]\s+/.test(trimmed)) {
    return (
      <li key={index} className="ml-5 list-disc text-sm leading-7 text-foreground/95">
        {renderInlineContent(trimmed.replace(/^[-*]\s+/, ""), options)}
      </li>
    );
  }

  if (/^\d+\)\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return (
      <li key={index} className="ml-5 list-decimal text-sm leading-7 text-foreground/95">
        {renderInlineContent(trimmed.replace(/^\d+[.)]\s+/, ""), options)}
      </li>
    );
  }

  return (
    <p key={index} className="text-sm leading-7 text-foreground/95 whitespace-pre-wrap">
      {renderInlineContent(trimmed, options)}
    </p>
  );
}

function makeCustomLinkId() {
  return `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOwnerHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function statAtLevel(base: number, inc: number, level: number) {
  return Math.round(base + (level - 1) * inc);
}

function EquipmentPreviewDialog({
  item,
  open,
  onOpenChange,
}: {
  item: EquipmentPreviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [level, setLevel] = useState(99);
  const [craftInfo, setCraftInfo] = useState<EquipmentCraftInfo | null>(null);
  const [craftLoading, setCraftLoading] = useState(false);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (open) setLevel(99);
  }, [open, item?.name]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !item) {
      setCraftInfo(null);
      setCraftLoading(false);
      return;
    }

    setCraftInfo(null);
    setCraftLoading(true);
    fetchGuideEquipmentCraftInfo()
      .then((info) => {
        if (!cancelled) setCraftInfo(info[item.name] ?? null);
      })
      .catch(() => {
        if (!cancelled) setCraftInfo(null);
      })
      .finally(() => {
        if (!cancelled) setCraftLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, item]);

  if (!item) return null;

  const setClampedLevel = (value: number) => {
    setLevel(Math.min(99, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1)));
  };
  const statMap = new Map(item.stats.map((stat) => [stat.name, stat]));
  const displayStudioLevel = craftInfo?.studioLevel ?? item.studioLevel;
  const displayCraftingIntelligence = craftInfo?.craftingIntelligence ?? item.craftingIntelligence;
  const hasCraftingInfo = displayStudioLevel != null || displayCraftingIntelligence != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={GUIDE_PREVIEW_DIALOG_CLASS}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1}>{item.name}</DialogTitle>
          <DialogDescription>
            Equipment stats shown at the selected level.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <div className="min-w-[1060px]">
            <div className="grid grid-cols-[240px_78px_110px_190px_repeat(12,minmax(58px,1fr))] items-stretch border-b border-border bg-muted/25 text-xs text-muted-foreground">
              <div className="px-4 py-3 font-medium">Name</div>
              <div className="px-2 py-3 text-center font-medium">Level</div>
              <div className="px-2 py-3 font-medium">Slot</div>
              <div className="px-2 py-3 font-medium">Studio Lv / INT Req</div>
              {GUIDE_EQUIPMENT_STATS.map((stat) => (
                <div key={stat} className="flex flex-col items-center gap-0.5 px-1 py-2 text-center">
                  {item.statIcons[stat] ? (
                    <img src={item.statIcons[stat]} alt={stat} className="h-4 w-4 object-contain" />
                  ) : (
                    <span className="text-[10px] font-semibold text-primary">{GUIDE_STAT_SHORT[stat] ?? stat}</span>
                  )}
                  <span className="text-[10px]">{GUIDE_STAT_SHORT[stat] ?? stat}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[240px_78px_110px_190px_repeat(12,minmax(58px,1fr))] items-center border-b border-border text-sm">
              <div className="flex min-w-0 items-center gap-2 px-4 py-3 font-semibold">
                {item.equipIcon ? (
                  <img src={item.equipIcon} alt={item.name} className="h-6 w-6 rounded object-contain" />
                ) : (
                  <span className="h-6 w-6 rounded border border-dashed border-border bg-muted/30" />
                )}
                <span className="truncate">{item.name}</span>
              </div>
              <div className="px-2 py-3">
                <ThemedNumberInput
                  value={level}
                  min={1}
                  max={99}
                  onValueChange={setClampedLevel}
                  className="h-9 w-[68px]"
                  inputClassName="px-1"
                />
              </div>
              <div className="px-2 py-3">
                <span className="inline-flex rounded-full border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium">
                  {item.weaponType || item.slot || "Equipment"}
                </span>
              </div>
              <div className="px-2 py-3 text-xs font-semibold">
                {craftLoading ? (
                  <span className="text-muted-foreground">Loading...</span>
                ) : hasCraftingInfo ? (
                  <span>{item.shopName} Lv {displayStudioLevel ?? "-"} / INT {displayCraftingIntelligence ?? "-"}</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
              {GUIDE_EQUIPMENT_STATS.map((statName) => {
                const stat = statMap.get(statName);
                const value = stat ? statAtLevel(stat.base, stat.inc, level) : 0;
                return (
                  <div
                    key={statName}
                    className={`px-1 py-3 text-center text-xs tabular-nums ${
                      stat ? "font-semibold text-foreground" : "text-destructive"
                    }`}
                  >
                    {stat ? value : "-"}
                  </div>
                );
              })}
            </div>

            {item.stats.length ? (
              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6">
                {item.stats.map((stat) => (
                  <div key={stat.name} className="rounded-md border border-border bg-background/70 px-2 py-2">
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                      {item.statIcons[stat.name] ? <img src={item.statIcons[stat.name]} alt={stat.name} className="h-3 w-3 object-contain" /> : null}
                      {stat.name}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                      <div>
                        <div className="text-[9px] text-muted-foreground/70">Base</div>
                        <div className="text-sm font-medium tabular-nums">{stat.base}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-muted-foreground/70">+/Lv</div>
                        <div className="text-sm font-medium tabular-nums">{stat.inc}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-muted-foreground/70">Lv {level}</div>
                        <div className="text-sm font-semibold text-primary tabular-nums">{statAtLevel(stat.base, stat.inc, level)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">No contributed stat data found for this equipment yet.</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {item.rankLabel ? <Badge variant="outline">Rank {item.rankLabel}</Badge> : null}
          {item.buyPrice ? <Badge variant="outline">{item.buyPrice} copper</Badge> : null}
          {item.requiredKairo ? <Badge variant="outline">Exchange: {item.requiredKairo}</Badge> : null}
        </div>

        <Link href={`/equipment-stats?search=${encodeURIComponent(item.name)}`}>
          <Button variant="outline" className="w-full">Open Full Equipment Page</Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentSetPreviewDialog({
  item,
  open,
  onOpenChange,
}: {
  item: EquipmentSetPreviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [levels, setLevels] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !item) return;
    setLevels(Object.fromEntries(item.equipment.map((entry) => [entry.name, entry.level])));
  }, [open, item]);

  if (!item) return null;

  const previewRows = item.equipment
    .map((entry) => {
      const preview = findGuideEquipmentPreview(buildEquipmentStatsHref(entry.name), entry.name);
      return preview ? { entry, preview } : null;
    })
    .filter((row): row is { entry: { name: string; level: number }; preview: EquipmentPreviewItem } => Boolean(row));
  const totals = Object.fromEntries(GUIDE_EQUIPMENT_STATS.map((stat) => [stat, 0])) as Record<string, number>;

  previewRows.forEach(({ entry, preview }) => {
    const level = levels[entry.name] ?? entry.level;
    preview.stats.forEach((stat) => {
      totals[stat.name] = (totals[stat.name] ?? 0) + statAtLevel(stat.base, stat.inc, level);
    });
  });

  const setItemLevel = (name: string, value: number) => {
    const level = Math.min(99, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1));
    setLevels((current) => ({ ...current, [name]: level }));
  };

  const statIcons = previewRows[0]?.preview.statIcons ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={GUIDE_PREVIEW_DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle>{item.label}</DialogTitle>
          <DialogDescription>Equipment set stats. Change item levels to compare the setup.</DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[240px_78px_110px_170px_repeat(8,minmax(58px,1fr))] items-stretch border-b border-border bg-muted/25 text-xs text-muted-foreground">
              <div className="px-4 py-3 font-medium">Name</div>
              <div className="px-2 py-3 text-center font-medium">Level</div>
              <div className="px-2 py-3 font-medium">Slot</div>
              <div className="px-2 py-3 font-medium">Studio Lv / INT Req</div>
              {GUIDE_EQUIPMENT_STATS.filter((stat) => (totals[stat] ?? 0) > 0).slice(0, 8).map((stat) => (
                <div key={stat} className="flex flex-col items-center gap-0.5 px-1 py-2 text-center">
                  {statIcons[stat] ? <img src={statIcons[stat]} alt={stat} className="h-4 w-4 object-contain" /> : <span className="text-[10px] font-semibold text-primary">{GUIDE_STAT_SHORT[stat] ?? stat}</span>}
                  <span className="text-[10px]">{GUIDE_STAT_SHORT[stat] ?? stat}</span>
                </div>
              ))}
            </div>

            {previewRows.map(({ entry, preview }) => {
              const level = levels[entry.name] ?? entry.level;
              const statMap = new Map(preview.stats.map((stat) => [stat.name, stat]));
              const shownStats = GUIDE_EQUIPMENT_STATS.filter((stat) => (totals[stat] ?? 0) > 0).slice(0, 8);
              return (
                <div key={entry.name} className="grid grid-cols-[240px_78px_110px_170px_repeat(8,minmax(58px,1fr))] items-center border-b border-border text-sm">
                  <div className="flex min-w-0 items-center gap-2 px-4 py-3 font-semibold">
                    {preview.equipIcon ? <img src={preview.equipIcon} alt={preview.name} className="h-6 w-6 rounded object-contain" /> : <span className="h-6 w-6 rounded border border-dashed border-border bg-muted/30" />}
                    <span className="truncate">{preview.name}</span>
                  </div>
                  <div className="px-2 py-3">
                    <ThemedNumberInput value={level} min={1} max={99} onValueChange={(value) => setItemLevel(entry.name, value)} className="h-9 w-[68px]" inputClassName="px-1" />
                  </div>
                  <div className="px-2 py-3">
                    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium">{preview.weaponType || preview.slot || "Equipment"}</span>
                  </div>
                  <div className="px-2 py-3 text-xs font-semibold">
                    {preview.studioLevel || preview.craftingIntelligence ? `${preview.shopName} Lv ${preview.studioLevel ?? "-"} / INT ${preview.craftingIntelligence ?? "-"}` : preview.shopName}
                  </div>
                  {shownStats.map((statName) => {
                    const stat = statMap.get(statName);
                    return (
                      <div key={statName} className={`px-1 py-3 text-center text-xs tabular-nums ${stat ? "font-semibold text-foreground" : "text-muted-foreground/40"}`}>
                        {stat ? statAtLevel(stat.base, stat.inc, level) : "-"}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div className="grid grid-cols-[598px_repeat(8,minmax(58px,1fr))] items-center bg-muted/20 text-sm font-semibold">
              <div className="px-4 py-3">Total</div>
              {GUIDE_EQUIPMENT_STATS.filter((stat) => (totals[stat] ?? 0) > 0).slice(0, 8).map((stat) => (
                <div key={stat} className="px-1 py-3 text-center text-primary tabular-nums">{totals[stat]}</div>
              ))}
            </div>
          </div>
        </div>

        <Link href="/loadout">
          <Button variant="outline" className="w-full">Open Full Equipment Builder</Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

function getGuideMarriagePair(parentA?: string, parentB?: string, pairs?: GuideMarriagePair[]) {
  if (!parentA || !parentB) return null;
  const selected = [parentA.toLowerCase(), parentB.toLowerCase()].sort().join("|");
  return (pairs ?? []).find((entry) => {
    const jobs = [entry.jobA.toLowerCase(), entry.jobB.toLowerCase()].sort().join("|");
    return jobs === selected;
  }) ?? null;
}

function getGuideMarriageChildren(parentA?: string, parentB?: string, pairs?: GuideMarriagePair[]) {
  return getGuideMarriagePair(parentA, parentB, pairs)?.children ?? [];
}

function isGuideMarriageChildAllowed(parentA?: string, parentB?: string, child?: string, pairs?: GuideMarriagePair[]) {
  if (!parentA || !parentB || !child) return true;
  return getGuideMarriageChildren(parentA, parentB, pairs).some((entry) => entry.toLowerCase() === child.toLowerCase());
}

function calcGuideChildRank(fatherRank: GuideSimRank, motherRank: GuideSimRank): GuideSimRank {
  const averageRank = Math.round((GUIDE_SIM_RANK_VALUE[fatherRank] + GUIDE_SIM_RANK_VALUE[motherRank]) / 2);
  const sameRankBonus = fatherRank === motherRank ? 1 : 0;
  return GUIDE_SIM_VALUE_RANK[Math.min(5, averageRank + sameRankBonus)];
}

function isGuideSimRank(value: string): value is GuideSimRank {
  return (GUIDE_SIM_RANKS as string[]).includes(value);
}

function MarriageSimPreviewDialog({
  item,
  open,
  onOpenChange,
}: {
  item: MarriageSimPreviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const shared = localSharedData as {
    jobs?: Record<string, GuideJob>;
    pairs?: GuideMarriagePair[];
  };
  const [parentA, setParentA] = useState("");
  const [parentB, setParentB] = useState("");
  const [child, setChild] = useState("");
  const [fatherRank, setFatherRank] = useState<GuideSimRank>("S");
  const [motherRank, setMotherRank] = useState<GuideSimRank>("S");
  const [fatherAwakening, setFatherAwakening] = useState(0);
  const [motherAwakening, setMotherAwakening] = useState(0);
  const parentJobs = Object.entries(shared.jobs ?? {})
    .filter(([, job]) => job.generation === 1)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    if (!open || !item) return;
    const startingParentA = item.parentA ?? "";
    const startingParentB = item.parentB ?? "";
    setParentA(startingParentA);
    setParentB(startingParentB);
    setFatherRank("S");
    setMotherRank("S");
    setFatherAwakening(0);
    setMotherAwakening(0);
    setChild(isGuideMarriageChildAllowed(startingParentA, startingParentB, item.child, shared.pairs) ? item.child ?? "" : "");
  }, [open, item?.label, item?.parentA, item?.parentB, item?.child]);

  if (!item) return null;

  const children = getGuideMarriageChildren(parentA, parentB, shared.pairs);
  const selectedChildAllowed = isGuideMarriageChildAllowed(parentA, parentB, child, shared.pairs);
  const pair = getGuideMarriagePair(parentA, parentB, shared.pairs);
  const affinityNum = pair?.affinityNum;
  const affinityLetter = affinityNum ? GUIDE_AFFINITY_NUM_TO_LETTER[affinityNum] ?? pair?.affinity ?? "?" : pair?.affinity ?? "";
  const childRank = calcGuideChildRank(fatherRank, motherRank);
  const sameRankBonus = fatherRank === motherRank ? GUIDE_SAME_RANK_BONUS[fatherRank] : 0;
  const childAwakening = affinityNum ? Math.floor((affinityNum * (fatherAwakening + motherAwakening + sameRankBonus)) / 100) : null;
  const summaryChild = child || children[0] || "";
  const rankOptions = GUIDE_SIM_RANKS;
  const setClampedAwakening = (setter: (value: number) => void) => (value: number) => {
    setter(Math.min(999, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={GUIDE_PREVIEW_DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle>{item.label}</DialogTitle>
          <DialogDescription>Change parents and ranks to check compatibility from inside the guide.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 font-semibold">Father</div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Job</label>
                <select value={parentA} onChange={(event) => { setParentA(event.target.value); setChild(""); }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select father's job...</option>
                  {parentJobs.map((job) => <option key={job} value={job}>{job}</option>)}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Rank</label>
                  <div className="grid grid-cols-5 overflow-hidden rounded-md border border-border">
                    {rankOptions.map((rank) => (
                      <button key={rank} type="button" className={`h-8 text-xs font-semibold ${fatherRank === rank ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`} onClick={() => setFatherRank(rank)}>
                        {rank}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Awakening</label>
                  <ThemedNumberInput value={fatherAwakening} min={0} max={999} onValueChange={setClampedAwakening(setFatherAwakening)} className="h-8 w-full" inputClassName="px-1" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-3 font-semibold">Mother</div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Job</label>
                <select value={parentB} onChange={(event) => { setParentB(event.target.value); setChild(""); }} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Select mother's job...</option>
                  {parentJobs.map((job) => <option key={job} value={job}>{job}</option>)}
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_130px]">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Rank</label>
                  <div className="grid grid-cols-5 overflow-hidden rounded-md border border-border">
                    {rankOptions.map((rank) => (
                      <button key={rank} type="button" className={`h-8 text-xs font-semibold ${motherRank === rank ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`} onClick={() => setMotherRank(rank)}>
                        {rank}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Awakening</label>
                  <ThemedNumberInput value={motherAwakening} min={0} max={999} onValueChange={setClampedAwakening(setMotherAwakening)} className="h-8 w-full" inputClassName="px-1" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`rounded-lg border p-4 ${pair ? "border-primary/20 bg-primary/5" : parentA && parentB ? "border-destructive/40 bg-destructive/10" : "border-border"}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Child Summary</div>
            {children.length > 1 ? (
              <select value={child} onChange={(event) => setChild(event.target.value)} className="h-8 min-w-48 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Select child...</option>
                {children.map((childName) => (
                  <option key={childName} value={childName}>{childName}</option>
                ))}
              </select>
            ) : null}
          </div>
          {!parentA || !parentB ? (
            <div className="text-sm text-muted-foreground">Select both parents to see compatibility.</div>
          ) : !pair ? (
            <div className="text-sm text-destructive">This pair has no compatible marriage data.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Compatibility</p>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded border px-2 py-0.5 text-sm font-bold ${GUIDE_AFFINITY_STYLE[affinityLetter] ?? "bg-muted border-border text-foreground"}`}>
                    {affinityLetter || "?"}
                  </span>
                  {affinityNum ? <span className="text-xs text-muted-foreground">({affinityNum}%)</span> : null}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Child Job</p>
                <p className="text-sm font-semibold">{summaryChild || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Child Rank</p>
                <Badge className={`border px-2.5 py-0.5 text-sm font-bold ${GUIDE_SIM_RANK_STYLE[childRank]}`}>{childRank}</Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Child Awakening</p>
                <p className="text-sm font-semibold">{childAwakening ?? "-"}</p>
                {fatherRank === motherRank ? (
                  <p className="text-[10px] text-muted-foreground">+{sameRankBonus} same-rank bonus</p>
                ) : null}
              </div>
            </div>
          )}
          {child && !selectedChildAllowed ? (
            <div className="mt-2 text-xs text-destructive">That child is not compatible with the selected parents.</div>
          ) : null}
        </div>

        <Link href="/match-finder?tab=simulator">
          <Button variant="outline" className="w-full">Open Full Marriage Simulator</Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

function jobStatAtLevel(entry: JobStatEntry, level: number) {
  const override = entry.levels?.[String(level)];
  if (override !== undefined) return override;
  return entry.base + (level - 1) * entry.inc;
}

function JobPreviewDialog({
  item,
  open,
  onOpenChange,
}: {
  item: JobPreviewItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [level, setLevel] = useState(1);
  const [rank, setRank] = useState("");
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    const ranks = Object.keys(item.job.ranks);
    setRank(ranks.includes("S") ? "S" : ranks[0] ?? "");
    setLevel(1);
  }, [open, item?.name]);

  if (!item) return null;

  const rankList = Object.keys(item.job.ranks);
  const rankData = item.job.ranks[rank] ?? item.job.ranks[rankList[0] ?? ""];
  const skillAccess = item.job.skillAccess ?? {};
  const skillChips = [
    { label: "Attack Skills", value: skillAccess.attack },
    { label: "Casting Skills", value: skillAccess.attackMagic ?? skillAccess.casting },
    { label: "Healing Skills", value: skillAccess.recovery },
  ];
  const setClampedLevel = (value: number) => {
    setLevel(Math.min(999, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={GUIDE_PREVIEW_DIALOG_CLASS}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1} className="flex items-center gap-2">
            {item.job.icon ? <img src={item.job.icon} alt={item.name} className="h-7 w-7 rounded object-contain" /> : null}
            {item.name}
          </DialogTitle>
          <DialogDescription>Job reference from the database.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{item.job.generation === 1 ? "Non-Marriage" : "Marriage Exclusive"}</Badge>
          {item.job.type ? <Badge variant="outline">{item.job.type === "combat" ? "Combat" : "Non-Combat"}</Badge> : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 text-sm font-semibold">Equipment & Skills</div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Equipment</div>
                <div className="flex flex-wrap gap-2">
                  {item.weaponCategories.map((weapon) => {
                    const access = item.job.weaponEquip?.[weapon] ?? "cannot";
                    return (
                      <Badge key={weapon} variant="outline" className={access === "can" ? "text-green-500" : access === "weak" ? "text-amber-500" : "text-muted-foreground"}>
                        {weapon}: {access === "can" ? "Can" : access === "weak" ? "Weak" : "Can't"}
                      </Badge>
                    );
                  })}
                  <Badge variant="outline" className={item.job.shield === "can" ? "text-green-500" : "text-muted-foreground"}>
                    Shield: {item.job.shield === "can" ? "Can" : "Can't"}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-muted-foreground">Skill Access</div>
                <div className="flex flex-wrap gap-2">
                  {skillChips.map((skill) => (
                    <Badge key={skill.label} variant="outline" className={skill.value === "cannot" ? "text-muted-foreground" : "text-green-500"}>
                      {skill.label}: {skill.value === "cannot" ? "Can't" : "Can"}
                    </Badge>
                  ))}
                </div>
              </div>
              {item.job.skills?.length ? (
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Skills</div>
                  <div className="flex flex-wrap gap-2">
                    {item.job.skills.map((skill) => <Badge key={skill} variant="outline">{skill}</Badge>)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-sm font-semibold">Lands & Shops</div>
              {item.shops.length ? (
                <div className="flex flex-wrap gap-2">
                  {item.shops.map((shop) => <Badge key={shop} variant="outline">{shop}</Badge>)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No lands or shops listed.</div>
              )}
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 text-sm font-semibold">Job Ranges</div>
              {item.ranges.length ? (
                <div className="space-y-2">
                  {item.ranges.map((range) => (
                    <div key={range.label} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-muted-foreground">{range.label}</span>
                      {range.groups.map((group) => (
                        <Badge key={`${range.label}-${group.label}`} variant="outline">{group.label}: {group.value}</Badge>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No job range data.</div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">Stats</div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={rank} onChange={(event) => setRank(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-sm">
                {rankList.map((rankName) => <option key={rankName} value={rankName}>{rankName} rank</option>)}
              </select>
              <ThemedNumberInput value={level} min={1} max={999} onValueChange={setClampedLevel} className="h-8 w-20" inputClassName="px-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {GUIDE_EQUIPMENT_STATS.map((stat) => {
              const entry = rankData?.stats[stat];
              const value = entry ? jobStatAtLevel(entry, level) : null;
              return (
                <div key={stat} className="rounded-md border border-border bg-background/70 px-2 py-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                    {item.statIcons[stat] ? <img src={item.statIcons[stat]} alt={stat} className="h-3 w-3 object-contain" /> : null}
                    {stat}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                    <div><div className="text-[9px] text-muted-foreground/70">Base</div><div className="text-sm font-medium tabular-nums">{entry?.base ?? "-"}</div></div>
                    <div><div className="text-[9px] text-muted-foreground/70">+/Lv</div><div className="text-sm font-medium tabular-nums">{entry ? `+${entry.inc}` : "-"}</div></div>
                    <div><div className="text-[9px] text-muted-foreground/70">Lv {level}</div><div className="text-sm font-semibold text-primary tabular-nums">{value ?? "-"}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Link href={buildJobHref(item.name)}>
          <Button variant="outline" className="w-full">Open Full Job Page</Button>
        </Link>
      </DialogContent>
    </Dialog>
  );
}

function GuideLinkTargetPicker({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: LinkPickerOption[];
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";
  const search = query.trim().toLowerCase();
  const filtered = (search
    ? options.filter((option) => option.label.toLowerCase().includes(search))
    : options
  ).slice(0, 40);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (value) onChange("");
        }}
        placeholder={placeholder}
      />
      <div className="max-h-44 overflow-y-auto rounded-md border border-border bg-background">
        {filtered.length ? (
          filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-muted/70 ${
                option.value === value ? "bg-primary/10 font-medium text-primary" : ""
              }`}
              onClick={() => {
                onChange(option.value);
                setQuery(option.label);
              }}
            >
              {option.label}
            </button>
          ))
        ) : (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</div>
        )}
      </div>
    </div>
  );
}

export function GuideDocumentPage({
  title,
  description,
  docId,
  docUrl,
  fallbackUrl,
  overlays = {},
  ownerGuideId,
  ownerToken,
  serverLinkOverrides,
}: {
  title: string;
  description: string;
  docId: string;
  docUrl?: string;
  fallbackUrl?: string;
  overlays?: typeof PLAYTHROUGH_GUIDE_SECTION_OVERLAYS;
  ownerGuideId?: string;
  ownerToken?: string;
  serverLinkOverrides?: GuideLinkOverrides;
}) {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkOverrides, setLinkOverridesState] = useState<GuideLinkOverrides>(() => {
    const normalizedServerOverrides = normalizeGuideLinkOverrides(serverLinkOverrides);
    if (normalizedServerOverrides.disabledAutoLinks.length || normalizedServerOverrides.customLinks.length) return normalizedServerOverrides;
    return ownerGuideId ? getGuideLinkOverrides(ownerGuideId) : normalizedServerOverrides;
  });
  const [linkEditMode, setLinkEditMode] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkSaveError, setLinkSaveError] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<SelectedGuideLink | null>(null);
  const [selectedExactSpots, setSelectedExactSpots] = useState<SelectedGuideLink[]>([]);
  const [exactSpotPickMode, setExactSpotPickMode] = useState(false);
  const [linkScope, setLinkScope] = useState<"phrase" | "spot">("phrase");
  const [draftPhrase, setDraftPhrase] = useState("");
  const [draftHref, setDraftHref] = useState("");
  const [targetType, setTargetType] = useState<LinkTargetType>("equipment");
  const [selectedEquipmentName, setSelectedEquipmentName] = useState("");
  const [selectedJobName, setSelectedJobName] = useState("");
  const [equipmentSetDraft, setEquipmentSetDraft] = useState<Array<{ name: string; level: number }>>([
    { name: "", level: 99 },
  ]);
  const [marriageParentA, setMarriageParentA] = useState("");
  const [marriageParentB, setMarriageParentB] = useState("");
  const [marriageChild, setMarriageChild] = useState("");
  const [equipmentPreview, setEquipmentPreview] = useState<EquipmentPreviewItem | null>(null);
  const [equipmentPreviewOpen, setEquipmentPreviewOpen] = useState(false);
  const [jobPreview, setJobPreview] = useState<JobPreviewItem | null>(null);
  const [jobPreviewOpen, setJobPreviewOpen] = useState(false);
  const [equipmentSetPreview, setEquipmentSetPreview] = useState<EquipmentSetPreviewItem | null>(null);
  const [equipmentSetPreviewOpen, setEquipmentSetPreviewOpen] = useState(false);
  const [marriageSimPreview, setMarriageSimPreview] = useState<MarriageSimPreviewItem | null>(null);
  const [marriageSimPreviewOpen, setMarriageSimPreviewOpen] = useState(false);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  const isOwner = Boolean(ownerGuideId);

  const saveLinkOverrides = (next: GuideLinkOverrides) => {
    const normalized = normalizeGuideLinkOverrides(next);
    setLinkOverridesState(normalized);
    setLinkSaveError(null);
    if (ownerGuideId) {
      setGuideLinkOverrides(ownerGuideId, normalized);
    }
    if (ownerGuideId && ownerToken) {
      saveGuideLinkOverrides(ownerGuideId, ownerToken, normalized, title)
        .then((payload) => {
          const saved = payload.guide?.linkOverrides ? normalizeGuideLinkOverrides(payload.guide.linkOverrides) : normalized;
          setLinkOverridesState(saved);
          setGuideLinkOverrides(ownerGuideId, saved);
        })
        .catch((err) => {
          setLinkSaveError(err instanceof Error ? err.message : "Could not save guide links.");
        });
    }
  };

  const effectiveLinks = useMemo(() => buildEffectiveGuideLinks(linkOverrides), [linkOverrides]);
  const disabledOccurrenceKeys = useMemo(() => new Set(linkOverrides.disabledOccurrences ?? []), [linkOverrides.disabledOccurrences]);
  const selectedExactSpotKeys = useMemo(() => new Set(selectedExactSpots.map((spot) => spot.occurrenceKey).filter(Boolean) as string[]), [selectedExactSpots]);
  const equipmentOptions = useMemo(
    () => (EQUIPMENT_CATALOG as readonly EquipmentCatalogItem[])
      .map((item) => ({ value: item.name, label: item.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [],
  );
  const jobOptions = useMemo(() => {
    const shared = localSharedData as { jobs?: Record<string, unknown> };
    return Object.keys(shared.jobs ?? {})
      .map((name) => ({ value: name, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);
  const parentJobOptions = useMemo(() => {
    const shared = localSharedData as { jobs?: Record<string, GuideJob> };
    return Object.entries(shared.jobs ?? {})
      .filter(([, job]) => job.generation === 1)
      .map(([name]) => ({ value: name, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);
  const marriagePairs = useMemo(() => {
    const shared = localSharedData as { pairs?: GuideMarriagePair[] };
    return shared.pairs ?? [];
  }, []);

  useEffect(() => {
    const normalizedServerOverrides = normalizeGuideLinkOverrides(serverLinkOverrides);
    setLinkOverridesState(
      normalizedServerOverrides.disabledAutoLinks.length || normalizedServerOverrides.customLinks.length
        ? normalizedServerOverrides
        : ownerGuideId
          ? getGuideLinkOverrides(ownerGuideId)
          : normalizedServerOverrides,
    );
    setLinkEditMode(false);
    setExactSpotPickMode(false);
    setSelectedExactSpots([]);
    setSelectedLink(null);
    setLinkScope("phrase");
    setLinkDialogOpen(false);
  }, [ownerGuideId, serverLinkOverrides]);

  useEffect(() => {
    let cancelled = false;

    async function loadGuide() {
      try {
        setLoading(true);
        setError(null);
        // Fetch guide via the server-side cache proxy (avoids hitting Google on every user load)
        const googleDocUrlProxy = googleDocUrl(docId);
        let fetchedMarkdown = "";
        let usedGoogleDoc = false;
        try {
          const response = await fetch(googleDocUrlProxy);
          if (response.ok) {
            const text = await response.text();
            // Only use if it contains markdown headings and image refs
            if (/^#|^##|!\[\]\[image\d+\]/m.test(text)) {
              fetchedMarkdown = text;
              usedGoogleDoc = true;
            }
          }
        } catch {}

        if (!usedGoogleDoc && fallbackUrl) {
          // Fallback to local markdown
          const fallback = await fetch(fallbackUrl);
          if (!fallback.ok) throw new Error(`Guide request failed with ${fallback.status}`);
          fetchedMarkdown = await fallback.text();
        }
        if (!fetchedMarkdown) throw new Error("Guide request failed. Make sure the Google Doc is public or published.");
        if (!cancelled) {
          setMarkdown(fetchedMarkdown);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load guide");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGuide();

    return () => {
      cancelled = true;
    };
  }, [docId, fallbackUrl]);

  const parsedGuide = useMemo(() => parseGuide(markdown), [markdown]);
  const sections = parsedGuide.sections;
  const toc = sections.filter((section) => section.level <= 2);

  const navigateToSection = (sectionId: string, closeMobileToc = false) => {
    const scrollToTarget = () => {
      const section = document.getElementById(sectionId);
      if (!section) return;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      if (window.location.hash !== `#${sectionId}`) {
        window.history.replaceState({}, "", `#${sectionId}`);
      }
    };

    if (closeMobileToc) {
      setMobileTocOpen(false);
      window.requestAnimationFrame(scrollToTarget);
      return;
    }

    scrollToTarget();
  };

  const openLinkTools = () => {
    setSelectedLink(null);
    setSelectedExactSpots([]);
    setExactSpotPickMode(false);
    setLinkScope("phrase");
    setLinkDialogOpen(true);
  };

  const applyTargetFromHref = (href: string, savedTarget?: GuideLinkTarget) => {
    if (savedTarget) {
      setTargetType(savedTarget.type);
      setSelectedEquipmentName(savedTarget.type === "equipment" ? savedTarget.equipmentName : "");
      setSelectedJobName(savedTarget.type === "job" ? savedTarget.jobName : "");
      setEquipmentSetDraft(savedTarget.type === "equipment-set" ? savedTarget.equipment : [{ name: "", level: 99 }]);
      setMarriageParentA(savedTarget.type === "marriage-sim" ? savedTarget.parentA ?? "" : "");
      setMarriageParentB(savedTarget.type === "marriage-sim" ? savedTarget.parentB ?? "" : "");
      setMarriageChild(savedTarget.type === "marriage-sim" ? savedTarget.child ?? "" : "");
      setDraftHref(savedTarget.type === "custom" ? savedTarget.href : "");
      return;
    }
    const target = inferLinkTarget(href);
    setTargetType(target.type);
    setSelectedEquipmentName(target.equipmentName);
    setSelectedJobName(target.jobName);
    setEquipmentSetDraft([{ name: "", level: 99 }]);
    setMarriageParentA("");
    setMarriageParentB("");
    setMarriageChild("");
    setDraftHref(target.customHref);
  };

  const getDraftTarget = (): GuideLinkTarget | null => {
    if (targetType === "equipment") return selectedEquipmentName ? { type: "equipment", equipmentName: selectedEquipmentName } : null;
    if (targetType === "job") return selectedJobName ? { type: "job", jobName: selectedJobName } : null;
    if (targetType === "equipment-set") {
      const equipment = equipmentSetDraft
        .map((entry) => ({ name: entry.name.trim(), level: Math.min(99, Math.max(1, Math.round(Number(entry.level) || 99))) }))
        .filter((entry) => entry.name);
      return equipment.length ? { type: "equipment-set", equipment } : null;
    }
    if (targetType === "marriage-sim") {
      if (!isGuideMarriageChildAllowed(marriageParentA, marriageParentB, marriageChild, marriagePairs)) return null;
      return { type: "marriage-sim", parentA: marriageParentA, parentB: marriageParentB, child: marriageChild };
    }
    const href = normalizeOwnerHref(draftHref);
    return href ? { type: "custom", href } : null;
  };

  const getDraftTargetHref = () => {
    const target = getDraftTarget();
    if (!target) return "";
    if (target.type === "equipment-set" || target.type === "marriage-sim") return guideTargetToHref(target);
    if (target.type === "equipment") return buildEquipmentStatsHref(target.equipmentName);
    if (target.type === "job") return buildJobHref(target.jobName);
    return normalizeOwnerHref(draftHref);
  };

  const addCustomLink = () => {
    const phrase = draftPhrase.trim();
    const target = getDraftTarget();
    const href = target ? guideTargetToHref(target) : "";
    const spots = linkScope === "spot"
      ? (selectedExactSpots.length ? selectedExactSpots : selectedLink ? [selectedLink] : [])
      : [];
    if ((!phrase && !spots.length) || !href) return;
    const occurrenceKeys = spots.map((spot) => spot.occurrenceKey).filter(Boolean) as string[];
    const occurrenceKeySet = new Set(occurrenceKeys);

    saveLinkOverrides({
      disabledAutoLinks: phrase
        ? linkOverrides.disabledAutoLinks.filter((label) => normalizeGuideLinkLabel(label) !== normalizeGuideLinkLabel(phrase))
        : linkOverrides.disabledAutoLinks,
      disabledOccurrences: occurrenceKeys.length
        ? (linkOverrides.disabledOccurrences ?? []).filter((key) => !occurrenceKeySet.has(key))
        : linkOverrides.disabledOccurrences,
      customLinks: [
        ...linkOverrides.customLinks.filter((link) => {
          if (link.occurrenceKey && occurrenceKeySet.has(link.occurrenceKey)) return false;
          const samePhrase = phrase && normalizeGuideLinkLabel(link.phrase) === normalizeGuideLinkLabel(phrase);
          if (occurrenceKeys.length) return true;
          return !samePhrase || Boolean(link.occurrenceKey);
        }),
        ...(occurrenceKeys.length
          ? spots
            .filter((spot): spot is SelectedGuideLink & { occurrenceKey: string } => Boolean(spot.occurrenceKey))
            .map((spot) => ({ id: makeCustomLinkId(), phrase: spot.label, href, target: target ?? undefined, occurrenceKey: spot.occurrenceKey }))
          : [{ id: makeCustomLinkId(), phrase, href, target: target ?? undefined }]),
      ],
    });
    setDraftPhrase("");
    setSelectedExactSpots([]);
    setSelectedLink(null);
    setLinkScope("phrase");
    setSelectedEquipmentName("");
    setSelectedJobName("");
    setEquipmentSetDraft([{ name: "", level: 99 }]);
    setMarriageParentA("");
    setMarriageParentB("");
    setMarriageChild("");
    setDraftHref("");
  };

  const removeSelectedGuideLink = () => {
    if (!selectedLink) return;
    const label = normalizeGuideLinkLabel(selectedLink.label);
    if (!label) return;
    const removeBySpot = linkScope === "spot" && selectedLink.occurrenceKey;

    saveLinkOverrides({
      disabledAutoLinks: selectedLink.kind === "auto" && !removeBySpot
        ? Array.from(new Set([...linkOverrides.disabledAutoLinks, label]))
        : linkOverrides.disabledAutoLinks,
      disabledOccurrences: removeBySpot
        ? Array.from(new Set([...(linkOverrides.disabledOccurrences ?? []), selectedLink.occurrenceKey!]))
        : linkOverrides.disabledOccurrences,
      customLinks: linkOverrides.customLinks.filter((link) => {
        if (selectedLink.id && link.id === selectedLink.id) return false;
        if (removeBySpot) return link.occurrenceKey !== selectedLink.occurrenceKey;
        return normalizeGuideLinkLabel(link.phrase) !== label;
      }),
    });
    setSelectedLink(null);
    setDraftPhrase("");
  };

  const removeCustomLink = (id: string) => {
    saveLinkOverrides({
      ...linkOverrides,
      customLinks: linkOverrides.customLinks.filter((link) => link.id !== id),
    });
  };

  const restoreAutoLink = (label: string) => {
    saveLinkOverrides({
      ...linkOverrides,
      disabledAutoLinks: linkOverrides.disabledAutoLinks.filter((item) => item !== label),
    });
  };

  const restoreDisabledOccurrence = (occurrenceKey: string) => {
    saveLinkOverrides({
      ...linkOverrides,
      disabledOccurrences: (linkOverrides.disabledOccurrences ?? []).filter((item) => item !== occurrenceKey),
    });
  };

  const startExactSpotPicking = () => {
    setLinkDialogOpen(false);
    setLinkEditMode(true);
    setExactSpotPickMode(true);
    setLinkScope("spot");
    setSelectedLink(null);
    setSelectedExactSpots([]);
  };

  const toggleExactSpot = (link: SelectedGuideLink) => {
    if (!link.occurrenceKey) return;
    setSelectedExactSpots((current) => {
      if (current.some((spot) => spot.occurrenceKey === link.occurrenceKey)) {
        return current.filter((spot) => spot.occurrenceKey !== link.occurrenceKey);
      }
      return [...current, link];
    });
  };

  const finishExactSpotPicking = () => {
    setExactSpotPickMode(false);
    setLinkEditMode(false);
    setLinkDialogOpen(true);
    setLinkScope("spot");
    const firstSpot = selectedExactSpots[0] ?? null;
    setSelectedLink(firstSpot);
    setDraftPhrase(selectedExactSpots.map((spot) => spot.label).join(", "));
    if (firstSpot) applyTargetFromHref(firstSpot.href, firstSpot.target);
  };

  const openEquipmentPreview = (href: string, label: string) => {
    const item = findGuideEquipmentPreview(href, label);
    if (!item) {
      window.location.href = href;
      return;
    }
    setEquipmentPreview(item);
    setEquipmentPreviewOpen(true);
  };

  const openJobPreview = (href: string, label: string) => {
    const item = findGuideJobPreview(href, label);
    if (!item) {
      window.location.href = href;
      return;
    }
    setJobPreview(item);
    setJobPreviewOpen(true);
  };

  const openGuideTarget = (link: GuideLink, label: string) => {
    const target = link.target;
    if (!target) return;
    if (target.type === "equipment") {
      openEquipmentPreview(buildEquipmentStatsHref(target.equipmentName), label);
      return;
    }
    if (target.type === "job") {
      openJobPreview(buildJobHref(target.jobName), label);
      return;
    }
    if (target.type === "equipment-set") {
      setEquipmentSetPreview({ label, equipment: target.equipment });
      setEquipmentSetPreviewOpen(true);
      return;
    }
    if (target.type === "marriage-sim") {
      setMarriageSimPreview({ label, parentA: target.parentA, parentB: target.parentB, child: target.child });
      setMarriageSimPreviewOpen(true);
      return;
    }
    window.location.href = target.href;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-24 space-y-6 lg:pb-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpenText className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={docUrl ?? `https://docs.google.com/document/d/${docId}/edit`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Open Google Doc
            </Button>
          </a>
          {isOwner ? (
            <>
              <Button
                variant={linkEditMode ? "default" : "outline"}
                className="gap-2"
                onClick={() => {
                  setLinkEditMode((value) => !value);
                  setExactSpotPickMode(false);
                }}
              >
                <Pencil className="w-4 h-4" />
                Edit Links
              </Button>
              <Button variant="outline" className="gap-2" onClick={openLinkTools}>
                <Link2 className="w-4 h-4" />
                Link Tools
              </Button>
            </>
          ) : null}
        </div>
        {isOwner && linkEditMode ? (
          <div className="flex max-w-3xl flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Badge variant="outline">{exactSpotPickMode ? "Picking exact spots" : "Owner link edit mode"}</Badge>
            {exactSpotPickMode
              ? "Click any word or linked phrase. Pick as many spots as needed, then finish."
              : "Click an underlined auto-link in the guide to remove it or replace it with a custom target."}
          </div>
        ) : null}
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading guide...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10 space-y-2">
            <div className="font-medium">Could not load the guide.</div>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <aside className="hidden lg:block lg:w-72 lg:shrink-0 lg:self-start lg:sticky lg:top-20">
              <Card className="max-h-[calc(100vh-7rem)] overflow-hidden flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Table of Contents</CardTitle>
                  <CardDescription className="text-xs">
                    Generated from the guide headings so we can preserve structure as the source changes later.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 overflow-y-auto flex-1 min-h-0">
                  {toc.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => navigateToSection(section.id)}
                      className={`block rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 ${
                        section.level === 2 ? "ml-3 text-muted-foreground" : ""
                      }`}
                    >
                      {section.title}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </aside>

            <div className="min-w-0 flex-1 space-y-4">
              {sections.map((section) => {
                const overlay = overlays[section.title];
                return (
                  <Card key={section.id} id={section.id}>
                    <CardContent className="p-5 md:p-7 space-y-4">
                      {section.level === 1 ? (
                        <h2 className="text-2xl font-bold tracking-tight">{section.title}</h2>
                      ) : (
                        <h3 className="text-xl font-semibold tracking-tight">{section.title}</h3>
                      )}

                      {overlay ? (
                        <Card className="border-primary/20 bg-primary/5">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">{overlay.title}</CardTitle>
                            <CardDescription className="text-xs leading-relaxed">
                              {overlay.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <Link href={overlay.href}>
                              <Button size="sm" variant="outline">{overlay.cta}</Button>
                            </Link>
                          </CardContent>
                        </Card>
                      ) : null}

                      <div className="space-y-2">
                        {section.lines.map((line, index) =>
                          renderLine(line, index, parsedGuide.imageMap, {
                            effectiveLinks,
                            disabledOccurrenceKeys,
                            linkEditMode,
                            exactSpotPickMode,
                            selectedOccurrenceKeys: selectedExactSpotKeys,
                            occurrenceScope: `${section.id}:${index}`,
                            onOpenEquipmentPreview: openEquipmentPreview,
                            onOpenJobPreview: openJobPreview,
                            onOpenGuideTarget: openGuideTarget,
                            onToggleExactSpot: toggleExactSpot,
                            onSelectLink: (link) => {
                              if (exactSpotPickMode) {
                                toggleExactSpot(link);
                                return;
                              }
                              setSelectedLink(link);
                              setDraftPhrase(link.label);
                              setLinkScope(link.occurrenceKey ? "spot" : "phrase");
                              applyTargetFromHref(link.href, link.target);
                              setLinkDialogOpen(true);
                            },
                          }),
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
          <div className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 lg:hidden">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-between rounded-full border-primary/40 bg-background/95 px-4 shadow-lg backdrop-blur"
              onClick={() => setMobileTocOpen(true)}
            >
              <span className="inline-flex items-center gap-2">
                <ListTree className="h-4 w-4 text-primary" />
                Table of Contents
              </span>
              <span className="text-xs text-muted-foreground">{toc.length}</span>
            </Button>
          </div>

          <Dialog open={mobileTocOpen} onOpenChange={setMobileTocOpen}>
            <DialogContent className="top-auto bottom-0 h-[75dvh] w-full max-w-none translate-y-0 rounded-t-xl p-4 pt-12 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
              <DialogHeader>
                <DialogTitle>Table of Contents</DialogTitle>
                <DialogDescription>Jump to a section in the guide.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="space-y-1 pb-4">
                  {toc.map((section) => (
                    <button
                      key={`mobile-${section.id}`}
                      type="button"
                      onClick={() => navigateToSection(section.id, true)}
                      className={`block rounded-md px-3 py-2 text-sm hover:bg-muted/50 ${
                        section.level === 2 ? "ml-3 text-muted-foreground" : "font-medium"
                      }`}
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {isOwner ? (
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Guide Link Tools</DialogTitle>
              <DialogDescription>
                Override auto-links for this guide without changing the Google Doc text.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              {linkSaveError ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {linkSaveError}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Word or phrase</label>
                <Input value={draftPhrase} onChange={(event) => setDraftPhrase(event.target.value)} placeholder="Iron staff" />
                <div className="text-xs text-muted-foreground">Matches every matching phrase in this guide.</div>
              </div>

              {selectedLink ? (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">{selectedExactSpots.length > 1 ? "Selected guide spots" : "Clicked guide spot"}</div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">
                    {selectedExactSpots.length > 1 ? `${selectedExactSpots.length} exact spots selected` : selectedLink.href || selectedLink.label}
                  </div>
                  {selectedExactSpots.length > 1 ? (
                    <div className="mt-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                      {selectedExactSpots.map((spot) => (
                        <Badge key={spot.occurrenceKey} variant="outline">{spot.label}</Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant={linkScope === "phrase" ? "default" : "outline"} onClick={() => setLinkScope("phrase")}>
                      Every Matching Phrase
                    </Button>
                    <Button
                      size="sm"
                      variant={linkScope === "spot" ? "default" : "outline"}
                      onClick={() => setLinkScope("spot")}
                      disabled={!selectedLink.occurrenceKey}
                    >
                      Only This Exact Spot
                    </Button>
                    <Button size="sm" variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={removeSelectedGuideLink}>
                      <Trash2 className="h-4 w-4" />
                      Remove This Link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        setDraftPhrase(selectedLink.label);
                        applyTargetFromHref(selectedLink.href, selectedLink.target);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      Use Clicked Text
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">Pick exact spot</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Link only one mention instead of every matching phrase.
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 gap-2"
                    onClick={startExactSpotPicking}
                  >
                    <Pencil className="h-4 w-4" />
                    Pick Exact Spot In Guide
                  </Button>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Link to</label>
                  <select
                    value={targetType}
                    onChange={(event) => setTargetType(event.target.value as LinkTargetType)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="equipment">Equipment (popup)</option>
                    <option value="equipment-set">Equipment Set (popup)</option>
                    <option value="job">Job (popup)</option>
                    <option value="marriage-sim">Marriage Sim (popup)</option>
                    <option value="custom">Custom URL</option>
                  </select>
                </div>

                {targetType === "equipment" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Equipment</label>
                    <GuideLinkTargetPicker
                      value={selectedEquipmentName}
                      onChange={setSelectedEquipmentName}
                      options={equipmentOptions}
                      placeholder="Choose equipment..."
                    />
                  </div>
                ) : null}

                {targetType === "equipment-set" ? (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Equipment Set</label>
                    <div className="space-y-2">
                      {equipmentSetDraft.map((entry, index) => (
                        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_88px_36px]">
                          <GuideLinkTargetPicker
                            value={entry.name}
                            onChange={(name) => setEquipmentSetDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item))}
                            options={equipmentOptions}
                            placeholder="Choose equipment..."
                          />
                          <ThemedNumberInput
                            value={entry.level}
                            min={1}
                            max={99}
                            onValueChange={(level) => setEquipmentSetDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, level } : item))}
                            className="h-9 w-full"
                            inputClassName="px-1"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => setEquipmentSetDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            disabled={equipmentSetDraft.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove equipment</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setEquipmentSetDraft((current) => [...current, { name: "", level: 99 }])}>
                      <Plus className="h-4 w-4" />
                      Add Equipment
                    </Button>
                  </div>
                ) : null}

                {targetType === "job" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Job</label>
                    <GuideLinkTargetPicker
                      value={selectedJobName}
                      onChange={setSelectedJobName}
                      options={jobOptions}
                      placeholder="Choose job..."
                    />
                  </div>
                ) : null}

                {targetType === "marriage-sim" ? (
                  <div className="space-y-2">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Parent 1</label>
                        <GuideLinkTargetPicker value={marriageParentA} onChange={setMarriageParentA} options={parentJobOptions} placeholder="Optional..." />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Parent 2</label>
                        <GuideLinkTargetPicker value={marriageParentB} onChange={setMarriageParentB} options={parentJobOptions} placeholder="Optional..." />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Child</label>
                        <GuideLinkTargetPicker value={marriageChild} onChange={setMarriageChild} options={jobOptions} placeholder="Optional..." />
                      </div>
                    </div>
                    {marriageParentA && marriageParentB && marriageChild && !isGuideMarriageChildAllowed(marriageParentA, marriageParentB, marriageChild, marriagePairs) ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        This parent pair cannot produce {marriageChild}. Choose a compatible child or leave child empty.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {targetType === "custom" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Target link</label>
                    <Input value={draftHref} onChange={(event) => setDraftHref(event.target.value)} placeholder="/equipment-stats?search=F%2F%20Iron%20staff" />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-xs text-muted-foreground">
                  Target: <span className="break-all text-foreground/80">{guideTargetLabel(getDraftTarget() ?? undefined) || getDraftTargetHref() || "Choose a target"}</span>
                </div>
                <Button className="gap-2" onClick={addCustomLink} disabled={!(draftPhrase.trim() || selectedExactSpots.length) || !getDraftTargetHref()}>
                  <Link2 className="h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>Custom Links</span>
                  {linkOverrides.customLinks.length ? <span className="text-xs font-normal text-muted-foreground">{linkOverrides.customLinks.length}</span> : null}
                </div>
                {linkOverrides.customLinks.length ? (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {linkOverrides.customLinks.map((link) => (
                      <div key={link.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {link.phrase}
                            {link.occurrenceKey ? <span className="ml-2 text-[10px] uppercase text-primary">one spot</span> : null}
                          </div>
                          <div className="break-all text-xs text-muted-foreground">{guideTargetLabel(link.target) || link.href}</div>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => removeCustomLink(link.id)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove custom link</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No custom links yet.</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span>Removed Auto-Links</span>
                  {linkOverrides.disabledAutoLinks.length || (linkOverrides.disabledOccurrences ?? []).length ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {linkOverrides.disabledAutoLinks.length + (linkOverrides.disabledOccurrences ?? []).length}
                    </span>
                  ) : null}
                </div>
                {linkOverrides.disabledAutoLinks.length || (linkOverrides.disabledOccurrences ?? []).length ? (
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {linkOverrides.disabledAutoLinks.map((label) => (
                      <div key={label} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                        <div className="min-w-0 truncate text-sm font-medium">{label}</div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => restoreAutoLink(label)}>
                          <RotateCcw className="h-4 w-4" />
                          <span className="sr-only">Restore auto-link</span>
                        </Button>
                      </div>
                    ))}
                    {(linkOverrides.disabledOccurrences ?? []).map((key) => (
                      <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
                        <div className="min-w-0 truncate text-sm font-medium">
                          one exact spot
                          <span className="ml-2 text-[10px] uppercase text-primary">one spot</span>
                        </div>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => restoreDisabledOccurrence(key)}>
                          <RotateCcw className="h-4 w-4" />
                          <span className="sr-only">Restore exact spot link</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No removed auto-links.</div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {isOwner ? (
        exactSpotPickMode ? (
          <div className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-background/95 p-3 shadow-lg backdrop-blur">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Pick exact guide spots</div>
              <div className="text-xs text-muted-foreground">
                {selectedExactSpots.length} selected. Click any word or linked phrase in the guide.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedExactSpots([])} disabled={!selectedExactSpots.length}>
                Clear
              </Button>
              <Button
                size="sm"
                onClick={finishExactSpotPicking}
                disabled={!selectedExactSpots.length}
              >
                Done Picking
              </Button>
            </div>
          </div>
        ) : null
      ) : null}

      {isOwner ? (
        <div className="fixed bottom-4 right-24 z-40 flex flex-col gap-2 rounded-lg border border-border bg-background/95 p-2 shadow-lg backdrop-blur sm:flex-row">
          <Button
            size="sm"
            variant={linkEditMode ? "default" : "outline"}
            className="gap-2"
            onClick={() => {
              setLinkEditMode((value) => !value);
              setExactSpotPickMode(false);
            }}
          >
            <Pencil className="h-4 w-4" />
            {linkEditMode ? "Exit Link Edit" : "Edit Links"}
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={openLinkTools}>
            <Link2 className="h-4 w-4" />
            Link Tools
          </Button>
        </div>
      ) : null}

      <EquipmentPreviewDialog
        item={equipmentPreview}
        open={equipmentPreviewOpen}
        onOpenChange={setEquipmentPreviewOpen}
      />
      <JobPreviewDialog
        item={jobPreview}
        open={jobPreviewOpen}
        onOpenChange={setJobPreviewOpen}
      />
      <EquipmentSetPreviewDialog
        item={equipmentSetPreview}
        open={equipmentSetPreviewOpen}
        onOpenChange={setEquipmentSetPreviewOpen}
      />
      <MarriageSimPreviewDialog
        item={marriageSimPreview}
        open={marriageSimPreviewOpen}
        onOpenChange={setMarriageSimPreviewOpen}
      />
    </div>
  );
}

export default function PlaythroughGuidePage() {
  return (
    <GuideDocumentPage
      title="Playthrough Guide by Jaza"
      description="Website-styled version of the community playthrough guide, kept live from the Google Doc when available."
      docId={PLAYTHROUGH_GUIDE_DOC_ID}
      docUrl={`https://docs.google.com/document/d/${PLAYTHROUGH_GUIDE_DOC_ID}/edit`}
      fallbackUrl={PLAYTHROUGH_GUIDE_LOCAL_URL}
      overlays={PLAYTHROUGH_GUIDE_SECTION_OVERLAYS}
    />
  );
}
