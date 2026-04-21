import { useState } from "react";
import { Home, Search } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MaterialIcon } from "@/lib/material-icons";
import {
  EQUIPMENT_EXCHANGE_ENTRIES,
  EQUIPMENT_EXCHANGE_OUTPUTS,
  KairoEquipmentName,
  rankLabel,
} from "@/lib/equipment-exchange";

// -- Data (from KA GameData - House.csv) --------------------------------------
//
// CSV COLUMN ? FIELD NAME ? ACTUAL MATERIAL ? matId ? icon
// -----------------------------------------------------------------------------
// The House.csv stores build costs in 5 numeric columns. The column order does
// NOT match the material names you'd expect. Verified against in-game values:
//
//   CSV col 0  ?  field "grass"   ?  Grass        (matId 0)  flat green
//   CSV col 1  ?  field "wood"    ?  Wood         (matId 1)  flat brown log
//   CSV col 2  ?  field "food"    ?  Food         (matId 2)  flat basket
//   CSV col 3  ?  field "ore"     ?  Ore          (matId 3)  crystal blue-grey
//   CSV col 4  ?  field "mystic"  ?  Mystic Ore   (matId 4)  flat red diamond
//
// Confirmed examples:
//   Inn              ? grass:5        (5 Grass)
//   Furniture Shop   ? wood:15        (15 Wood)
//   Restaurant       ? food:8         (8 Food)
//   Weapon Shop      ? ore:12         (12 Ore)
//   Skill Shop       ? mystic:12      (12 Mystic Ore)
//   Insectarium      ? wood:65        (65 Wood)
//   Zoo              ? food:80        (80 Food)
//   Hospital         ? food:25        (25 Food)
//   Monster House    ? food:15        (15 Food)
//   Orchard          ? grass:25       (25 Grass)
// -----------------------------------------------------------------------------

type BuildingGroup = "house" | "shop" | "service" | "special";

type Building = {
  id: number;
  name: string;
  group: BuildingGroup;
  grass: number; wood: number; food: number; ore: number; mystic: number;
  cap:     [number, number, number, number];
  beds:    [number, number, number, number];
  store:   [number, number, number, number];
  monster: [number, number, number, number];
};

const BUILDINGS: Building[] = [
  //                                                        grass  wood   food   ore    mystic
  { id: 0,  name: "Commoner's House", group: "house",   grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 0,  cap: [2,3,4,5],   beds: [1,2,3,4], store: [0,0,0,0], monster: [1,1,2,3] },
  { id: 15, name: "Mansion",          group: "house",   grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 20, cap: [3,4,5,6],   beds: [2,3,4,5], store: [0,0,0,0], monster: [1,1,2,3] },
  { id: 1,  name: "Royal Room",       group: "house",   grass: 0,  wood: 3,  food: 0,  ore: 0,  mystic: 0,  cap: [1,1,2,3],   beds: [0,0,1,2], store: [0,0,0,0], monster: [1,1,1,2] },
  { id: 7,  name: "Inn",              group: "house",   grass: 5,  wood: 0,  food: 0,  ore: 0,  mystic: 0,  cap: [4,6,8,10],  beds: [3,5,7,9], store: [0,0,0,0], monster: [0,0,0,1] },
  { id: 16, name: "Monster House",    group: "house",   grass: 0,  wood: 0,  food: 15, ore: 0,  mystic: 0,  cap: [1,1,1,2],   beds: [0,0,0,1], store: [0,0,0,0], monster: [2,3,4,5] },
  { id: 2,  name: "Weapon Shop",      group: "shop",    grass: 0,  wood: 0,  food: 0,  ore: 12, mystic: 0,  cap: [1,2,2,3],   beds: [0,1,1,2], store: [3,5,7,9], monster: [0,0,0,0] },
  { id: 3,  name: "Armor Shop",       group: "shop",    grass: 0,  wood: 0,  food: 0,  ore: 8,  mystic: 0,  cap: [1,2,2,3],   beds: [0,1,1,2], store: [3,5,7,9], monster: [0,0,0,0] },
  { id: 9,  name: "Accessory Shop",   group: "shop",    grass: 0,  wood: 0,  food: 0,  ore: 15, mystic: 0,  cap: [1,2,2,3],   beds: [0,1,1,2], store: [3,5,7,9], monster: [0,0,0,0] },
  { id: 6,  name: "Skill Shop",       group: "shop",    grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 12, cap: [1,2,2,3],   beds: [0,1,1,2], store: [3,5,7,9], monster: [0,0,0,0] },
  { id: 4,  name: "Item Shop",        group: "shop",    grass: 0,  wood: 0,  food: 5,  ore: 0,  mystic: 0,  cap: [1,2,2,3],   beds: [0,1,1,2], store: [3,5,7,9], monster: [0,0,0,0] },
  { id: 5,  name: "Furniture Shop",   group: "shop",    grass: 0,  wood: 15, food: 0,  ore: 0,  mystic: 0,  cap: [1,2,2,3],   beds: [0,1,1,2], store: [3,5,7,9], monster: [0,0,0,0] },
  { id: 8,  name: "Restaurant",       group: "shop",    grass: 0,  wood: 0,  food: 8,  ore: 0,  mystic: 0,  cap: [1,2,2,3],   beds: [0,1,1,2], store: [3,5,7,9], monster: [0,0,0,0] },
  { id: 21, name: "Insectarium",      group: "shop",    grass: 0,  wood: 65, food: 0,  ore: 0,  mystic: 0,  cap: [1,1,1,2],   beds: [0,0,0,1], store: [3,5,7,9], monster: [0,0,0,1] },
  { id: 22, name: "Aquarium",         group: "shop",    grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 50, cap: [1,1,1,2],   beds: [0,0,0,1], store: [3,5,7,9], monster: [0,0,0,1] },
  { id: 23, name: "Zoo",              group: "shop",    grass: 0,  wood: 0,  food: 80, ore: 0,  mystic: 0,  cap: [1,1,1,2],   beds: [0,0,0,1], store: [3,5,7,9], monster: [0,0,0,1] },
  { id: 24, name: "Museum",           group: "shop",    grass: 0,  wood: 0,  food: 0,  ore: 99, mystic: 0,  cap: [1,1,1,2],   beds: [0,0,0,1], store: [3,5,7,9], monster: [0,0,0,1] },
  { id: 13, name: "Hospital",         group: "service", grass: 0,  wood: 0,  food: 25, ore: 0,  mystic: 0,  cap: [2,3,4,5],   beds: [1,2,3,4], store: [0,0,0,0], monster: [0,0,0,0] },
  { id: 10, name: "Recovery Room",    group: "service", grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 5,  cap: [1,2,2,3],   beds: [0,1,1,2], store: [0,0,0,0], monster: [1,1,1,2] },
  { id: 14, name: "Church",           group: "service", grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 15, cap: [1,2,2,3],   beds: [0,1,1,2], store: [0,0,0,0], monster: [0,0,0,0] },
  { id: 11, name: "Analysis Lab",     group: "service", grass: 0,  wood: 8,  food: 0,  ore: 0,  mystic: 0,  cap: [2,3,4,5],   beds: [1,2,3,4], store: [0,0,0,0], monster: [0,0,0,0] },
  { id: 12, name: "Research Lab",     group: "service", grass: 0,  wood: 10, food: 0,  ore: 0,  mystic: 0,  cap: [2,3,4,5],   beds: [1,2,3,4], store: [0,0,0,0], monster: [0,0,0,0] },
  { id: 17, name: "Survey Corps HQ",  group: "special", grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 15, cap: [2,3,4,5],   beds: [1,2,3,4], store: [0,0,0,0], monster: [1,1,2,3] },
  { id: 20, name: "Studio",           group: "special", grass: 0,  wood: 15, food: 0,  ore: 0,  mystic: 0,  cap: [2,2,2,3],   beds: [1,1,1,2], store: [0,0,0,0], monster: [1,1,1,2] },
  { id: 18, name: "Orchard",          group: "special", grass: 25, wood: 0,  food: 0,  ore: 0,  mystic: 0,  cap: [1,2,3,4],   beds: [0,1,2,3], store: [0,0,0,0], monster: [0,0,0,1] },
  { id: 19, name: "Santa's House",    group: "special", grass: 0,  wood: 0,  food: 0,  ore: 0,  mystic: 10, cap: [2,3,4,5],   beds: [1,2,3,4], store: [0,0,0,0], monster: [1,1,2,3] },
];

const PLOT_SIZES = ["S", "M", "L", "XL"] as const;
// Tile footprints per plot size (W×H, width=E-W, height=N-S). Plots are longer N-S.
const PLOT_TILES: Record<string, string> = { S: "6×6", M: "6×8", L: "8×8", XL: "8×10" };

// -- Helpers -------------------------------------------------------------------

const GROUP_LABEL: Record<BuildingGroup, string> = {
  house:   "House",
  shop:    "Shop",
  service: "Service",
  special: "Special",
};

const GROUP_STYLE: Record<BuildingGroup, string> = {
  house:   "bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-300",
  shop:    "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-300",
  service: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-300",
  special: "bg-purple-500/10 text-purple-600 border-purple-500/30 dark:text-purple-300",
};

type PageTab = "houses" | "facilities";
const PAGE_TABS: { key: PageTab; label: string }[] = [
  { key: "houses",     label: "Houses & Plots" },
  { key: "facilities", label: "Facilities" },
];

// field ? matId ? icon style  (see CSV column reference comment above)
const COST_ICONS: { field: keyof Building; matId: number; style: "flat" | "outlined" | "crystal" }[] = [
  { field: "grass",  matId: 0, style: "outlined" },
  { field: "wood",   matId: 1, style: "flat" },
  { field: "food",   matId: 2, style: "flat" },
  { field: "ore",    matId: 3, style: "crystal" },
  { field: "mystic", matId: 4, style: "flat" },
];

// -- Facilities ----------------------------------------------------------------

type FacilityTab = "env" | "materials" | "amenity" | "indoors" | "map";

const FACILITY_TABS: { key: FacilityTab; label: string }[] = [
  { key: "env",       label: "Env." },
  { key: "materials", label: "Materials" },
  { key: "amenity",   label: "Amenity" },
  { key: "indoors",   label: "Indoors" },
  { key: "map",       label: "Map" },
];

const FACILITY_TAB_STYLE: Record<FacilityTab, string> = {
  env:       "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300",
  materials: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  amenity:   "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  indoors:   "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300",
  map:       "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300",
};

interface Facility {
  id: number;
  name: string;
  tab: FacilityTab;
  size: string;        // e.g. "1×1", "2×2", "4×4", "1×2"
  rotatable?: boolean; // true if size is not square and can be rotated
  mapUnlock?: number;  // map tile level required to unlock (map-tab facilities only)
  // Build costs: min = level 1, max = max level (0 = unknown)
  minGrass: number; minWood: number; minFood: number; minOre: number; minMystic: number;
  maxGrass: number; maxWood: number; maxFood: number; maxOre: number; maxMystic: number;
  minHp: number;       // 0 = unknown
  maxHp: number;
  validRange: number;  // territory expansion radius in tiles (0 = none)
  canUpgrade: boolean;
  // Upgrade costs: lv 1?2 (min) and lv max-1?max (max). All 0 if not upgradeable.
  upgGrass: number; upgWood: number; upgFood: number; upgOre: number; upgMystic: number;
  maxUpgGrass: number; maxUpgWood: number; maxUpgFood: number; maxUpgOre: number; maxUpgMystic: number;
  // Harvest count (Field/Plantation only): how many times you can harvest per planting
  minUseCount?: number; maxUseCount?: number;
}

const FACILITIES: Facility[] = [
  // -- Env. ------------------------------------------------------------------
  { id: 17,  name: "Town Hall",                tab: "env",  size: "4×4",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  1, upgWood:  1, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 150, maxUpgWood: 300, maxUpgFood: 100, maxUpgOre:  50, maxUpgMystic: 15,
    minHp: 50, maxHp: 500, validRange: 15, canUpgrade: true },
  // Walls
  { id: 23,  name: "Fence",                    tab: "env",  size: "",
    minGrass:  1, minWood:  0, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 10, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  1, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 80, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 15, maxHp: 315, validRange:  0, canUpgrade: true },
  { id: 24,  name: "Wood Wall",                tab: "env",  size: "",
    minGrass:  0, minWood:  2, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood: 18, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  2, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 40, maxHp: 430, validRange:  0, canUpgrade: true },
  { id: 25,  name: "Defensive Wall",           tab: "env",  size: "",
    minGrass:  0, minWood:  2, minFood:  0, minOre:  2, minMystic:  0,
    maxGrass:  0, maxWood: 18, maxFood:  0, maxOre: 14, maxMystic:  0,
    upgGrass:  0, upgWood:  2, upgFood:  0, upgOre:  2, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 8,
    minHp: 65, maxHp: 650, validRange:  0, canUpgrade: true },
  { id: 26,  name: "Castle Wall",              tab: "env",  size: "",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  3, minMystic:  1,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre: 21, maxMystic:  6,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  3, upgMystic:  1,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 70, maxUpgMystic: 50,
    minHp: 90, maxHp: 975, validRange:  0, canUpgrade: true },
  { id: 28,  name: "Gate",                     tab: "env",  size: "1×2",  rotatable: true,
    minGrass:  1, minWood:  3, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 10, maxWood: 27, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  1, upgWood:  3, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 80, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 25, maxHp: 600, validRange:  0, canUpgrade: true },
  // Territory expansion
  { id: 29,  name: "Torch",                    tab: "env",  size: "",
    minGrass:  0, minWood:  3, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood: 27, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  3, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  7, canUpgrade: true },
  { id: 30,  name: "Nighttime Meeting Place",  tab: "env",  size: "",
    minGrass:  3, minWood:  4, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 30, maxWood: 36, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  3, upgWood:  4, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 90, maxUpgWood: 90, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  8, canUpgrade: true },
  { id: 31,  name: "Low Watchtower",           tab: "env",  size: "",
    minGrass:  5, minWood:  8, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 50, maxWood: 72, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  5, upgWood:  8, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 100, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange: 10, canUpgrade: true },
  { id: 32,  name: "Turret",                   tab: "env",  size: "2×2",
    minGrass:  7, minWood: 11, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 70, maxWood: 99, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  7, upgWood: 11, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 110, maxUpgWood: 125, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange: 12, canUpgrade: true },
  // Outdoor utility
  { id: 68,  name: "Info Board",               tab: "amenity",  size: "",
    minGrass:  0, minWood:  2, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass:  0, maxUpgWood:  0, maxUpgFood:  0, maxUpgOre:  0, maxUpgMystic:  0,
    minHp:  0, maxHp:   0, validRange: 10, canUpgrade: false },

  { id: 41 , name: "Canal",                         tab: "env",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 10, maxHp: 510, validRange: 0, canUpgrade: true },
  { id: 191, name: "Chaos Stone",                  tab: "env",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: false },
  { id: 76 , name: "Simple Stove",                  tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 1, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 75, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 77 , name: "Bonfire",                       tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 78 , name: "Thorny Trap",                   tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 2, upgOre: 1, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 70, maxUpgOre: 60, maxUpgMystic: 8,
    minHp: 15, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 79 , name: "Flowerbed",                     tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 80 , name: "Bushes",                        tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 2, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 85, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 81 , name: "Seedlings",                     tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 3, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 90, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 82 , name: "Fountain",                      tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 2, upgMystic: 3,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 60,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 83 , name: "Goddess Statue",                tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 3, upgMystic: 5,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 70, maxUpgMystic: 70,
    minHp: 10, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 84 , name: "Rejuvenation Spring",           tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 5, upgMystic: 3,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 80, maxUpgMystic: 60,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 85 , name: "Monster Statue",                tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 5,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 70,
    minHp: 65, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 86 , name: "Monster-Repelling Orb",         tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 1, upgMystic: 2,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 60, maxUpgMystic: 55,
    minHp: 40, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 87 , name: "Monster-Repelling Sword",       tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 1, upgMystic: 3,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 60, maxUpgMystic: 60,
    minHp: 55, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 88 , name: "Monster-Repelling Slate",       tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 1, upgMystic: 5,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 60, maxUpgMystic: 70,
    minHp: 70, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 89 , name: "Windmill",                      tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 10, upgFood: 0, upgOre: 10, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 120, maxUpgFood: 12, maxUpgOre: 105, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 91 , name: "Bench",                         tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 164, name: "Recovery Outpost",              tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },

  // -- Materials -------------------------------------------------------------
  // Standard storehouses
  { id: 33,  name: "Grass Storehouse",         tab: "materials",  size: "2×2",
    minGrass:  2, minWood:  0, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 20, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  2, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 85, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 35,  name: "Wood Storehouse",          tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  2, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood: 18, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  2, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 34,  name: "Food Storehouse",          tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  2, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood: 16, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  0, upgFood:  2, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 70, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 36,  name: "Ore Storehouse",           tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  2, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre: 14, maxMystic:  0,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  2, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 37,  name: "Mystic Ore Storehouse",    tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  0, minMystic:  2,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic: 12,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  2,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 55,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 38,  name: "Item Storehouse",          tab: "materials",  size: "2×2",
    minGrass:  2, minWood:  0, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 20, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  2, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 85, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 39,  name: "Energy Storehouse",        tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  2, minFood:  1, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood: 18, maxFood:  8, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  2, upgFood:  1, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 65, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 40,  name: "Treasure Storehouse",      tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  1, minFood:  0, minOre:  2, minMystic:  0,
    maxGrass:  0, maxWood:  9, maxFood:  0, maxOre: 14, maxMystic:  0,
    upgGrass:  0, upgWood:  1, upgFood:  0, upgOre:  2, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 75, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  // Coin storehouses
  { id: 183, name: "Copper Coin Storehouse",   tab: "materials",  size: "",
    minGrass:  0, minWood:  2, minFood:  0, minOre:  0, minMystic:  2,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  2, upgFood:  0, upgOre:  0, upgMystic:  2,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 55,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 184, name: "Silver Coin Storehouse",   tab: "materials",  size: "",
    minGrass:  0, minWood:  4, minFood:  0, minOre:  0, minMystic:  4,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  4, upgFood:  0, upgOre:  0, upgMystic:  4,
    maxUpgGrass: 15, maxUpgWood: 90, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 65,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  // High-grade storehouses
  { id: 206, name: "HG Grass Storehouse",      tab: "materials",  size: "2×2",
    minGrass:  2, minWood:  2, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 20, maxWood: 18, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  2, upgWood:  2, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 85, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 207, name: "HG Wood Storehouse",       tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  2, minFood:  2, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood: 18, maxFood: 16, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  2, upgFood:  2, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 70, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 208, name: "HG Food Storehouse",       tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  2, minOre:  2, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood: 16, maxOre: 14, maxMystic:  0,
    upgGrass:  0, upgWood:  0, upgFood:  2, upgOre:  2, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 70, maxUpgOre: 65, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 209, name: "HG Ore Storehouse",        tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  2, minMystic:  2,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre: 14, maxMystic: 12,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  2, upgMystic:  2,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 55,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 210, name: "HG Mystic Storehouse",     tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  0, minMystic:  2,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic: 12,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  2,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 55,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 211, name: "HG Energy Storehouse",     tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  3, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood: 24, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  0, upgFood:  3, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 75, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 212, name: "HG Treasure Storehouse",   tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  2, minMystic:  2,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre: 14, maxMystic: 12,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  2, upgMystic:  2,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 55,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 213, name: "HG Item Storehouse",       tab: "materials",  size: "2×2",
    minGrass:  3, minWood:  0, minFood:  0, minOre:  3, minMystic:  0,
    maxGrass: 30, maxWood:  0, maxFood:  0, maxOre: 21, maxMystic:  0,
    upgGrass:  3, upgWood:  0, upgFood:  0, upgOre:  3, upgMystic:  0,
    maxUpgGrass: 90, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 70, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 214, name: "HG Egg Storehouse",        tab: "materials",  size: "2×2",
    minGrass:  2, minWood:  0, minFood:  2, minOre:  0, minMystic:  0,
    maxGrass: 20, maxWood:  0, maxFood: 16, maxOre:  0, maxMystic:  0,
    upgGrass:  2, upgWood:  0, upgFood:  2, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 85, maxUpgWood: 14, maxUpgFood: 70, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  // Production
  { id: 42,  name: "Field",                    tab: "materials",  size: "2×2",
    minGrass:  1, minWood:  0, minFood:  2, minOre:  0, minMystic:  0,
    maxGrass: 10, maxWood:  0, maxFood: 16, maxOre:  0, maxMystic:  0,
    upgGrass:  1, upgWood:  0, upgFood:  2, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 80, maxUpgWood: 14, maxUpgFood: 70, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 10, maxHp: 510, validRange:  0, canUpgrade: true, minUseCount: 8, maxUseCount: 99 },
  { id: 43,  name: "Plantation",               tab: "materials",  size: "2×2",
    minGrass:  1, minWood:  3, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 10, maxWood: 27, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  1, upgWood:  3, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 80, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 10, maxHp: 510, validRange:  0, canUpgrade: true, minUseCount: 8, maxUseCount: 99 },
  { id: 44,  name: "Ranch",                    tab: "materials",  size: "2×2",
    minGrass:  5, minWood: 10, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass: 50, maxWood: 90, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  5, upgWood: 10, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 100, maxUpgWood: 120, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 10, maxHp: 510, validRange:  0, canUpgrade: true },
  { id: 45,  name: "Mine: Ore",                tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  3, minFood:  0, minOre:  5, minMystic:  0,
    maxGrass:  0, maxWood: 27, maxFood:  0, maxOre:  35, maxMystic:  0,
    upgGrass:  0, upgWood:  3, upgFood:  0, upgOre:  5, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 80, maxUpgMystic: 8,
    minHp: 10, maxHp: 510, validRange:  0, canUpgrade: true },
  { id: 46,  name: "Mine: Mystic Ore",         tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  0, minFood:  0, minOre:  5, minMystic:  8,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  35, maxMystic:  48,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  5, upgMystic:  8,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 80, maxUpgMystic: 85,
    minHp: 10, maxHp: 510, validRange:  0, canUpgrade: true },
  { id: 47,  name: "Mine: Energy",             tab: "materials",  size: "2×2",
    minGrass:  0, minWood:  3, minFood:  5, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood: 27, maxFood: 40, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  3, upgFood:  5, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 85, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 20, maxHp: 520, validRange:  0, canUpgrade: true },
  { id: 194, name: "Egg House",                tab: "materials",  size: "2×2",
    minGrass:  2, minWood:  0, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  2, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 85, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },

  { id: 90 , name: "Monster Feed",                  tab: "materials",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 3, upgWood: 0, upgFood: 2, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 90, maxUpgWood: 14, maxUpgFood: 70, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  // -- Amenity ---------------------------------------------------------------
  { id: 67,  name: "Well",                     tab: "amenity",  size: "",
    minGrass:  1, minWood:  2, minFood:  0, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  1, upgWood:  2, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: true },
  { id: 70,  name: "Stables",                   tab: "amenity",  size: "",
    minGrass:  0, minWood:  5, minFood:  3, minOre:  0, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass:  0, maxUpgWood:  0, maxUpgFood:  0, maxUpgOre:  0, maxUpgMystic:  0,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: false },
  { id: 71,  name: "Wagon Yard",               tab: "amenity",  size: "",
    minGrass:  0, minWood:  2, minFood:  0, minOre:  1, minMystic:  0,
    maxGrass:  0, maxWood:  0, maxFood:  0, maxOre:  0, maxMystic:  0,
    upgGrass:  0, upgWood:  0, upgFood:  0, upgOre:  0, upgMystic:  0,
    maxUpgGrass:  0, maxUpgWood:  0, maxUpgFood:  0, maxUpgOre:  0, maxUpgMystic:  0,
    minHp:  0, maxHp:   0, validRange:  0, canUpgrade: false },

  { id: 69 , name: "Wasteland Guide",               tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 14, canUpgrade: true },
  { id: 72 , name: "Outdoor: Analysis Lab",          tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 74 , name: "Outdoor: Research Lab",          tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 75 , name: "Rest Stop",                     tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 3, upgFood: 0, upgOre: 1, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 60, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 92 , name: "Expedition Hut",                tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 3, upgFood: 5, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 85, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 10, canUpgrade: true },
  { id: 102, name: "Register",                      tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 103, name: "Store Shelves",                 tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 3, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 104, name: "Skill Shelves",                 tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 3, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 105, name: "Furniture Shelves",             tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 3, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 132, name: "Training Room",                 tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 2, upgWood: 3, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 85, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 133, name: "Shooting Range",                tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 5, upgFood: 0, upgOre: 3, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 95, maxUpgFood: 12, maxUpgOre: 70, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 134, name: "Magic Training Ground",         tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 3, upgFood: 0, upgOre: 0, upgMystic: 5,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 70,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 157, name: "Monster Room",                  tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 160, name: "Dragon Stables",                tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 176, name: "Gold Exchange",                 tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 189, name: "Day Care",                      tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 193, name: "Restaurant Shelves",            tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 230, name: "Animal Cage",                   tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 3, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 231, name: "Art House",                     tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 3, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 232, name: "Water Tank",                    tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 3, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 233, name: "Bug Case",                      tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 3, maxHp: 50, validRange: 0, canUpgrade: true },
  { id: 234, name: "Cash Register",                 tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 238, name: "Reindeer Stable",               tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 242, name: "Flying Carpet",                 tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },


  { id: 162, name: "Monster Stable",                    tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 239, name: "Airport",                    tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 5, upgWood: 25, upgFood: 25, upgOre: 35, upgMystic: 50,
    maxUpgGrass: 100, maxUpgWood: 195, maxUpgFood: 185, maxUpgOre: 230, maxUpgMystic: 295,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 240, name: "Resource Center",                    tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 241, name: "Fishing Pond",                    tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 161, name: "Pitfall",                         tab: "amenity",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 5, upgWood: 0, upgFood: 5, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 100, maxUpgWood: 14, maxUpgFood: 85, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 50, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 226, name: "Bug Gathering Spot",               tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 14, canUpgrade: true },
  { id: 186, name: "Kairo King Statue",                tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 1, upgFood: 0, upgOre: 0, upgMystic: 3,
    maxUpgGrass: 15, maxUpgWood: 75, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 60,
    minHp: 50, maxHp: 500, validRange: 0, canUpgrade: true },
  // -- Indoors ---------------------------------------------------------------
  { id: 73 , name: "Temporary Shelter",             tab: "amenity",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 5, maxHp: 500, validRange: 0, canUpgrade: true },
  { id: 98 , name: "Hard Bed",                      tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 99 , name: "Bed",                           tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 100, name: "Royal Bed",                     tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 101, name: "Double Bed",                    tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 106, name: "Chair",                         tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 2, upgWood: 5, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 85, maxUpgWood: 95, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 107, name: "Royal Room",                    tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 108, name: "Research Lab",                  tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 109, name: "Hospital",                      tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 110, name: "Accessory Workshop",            tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 111, name: "Cooking Station",               tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 112, name: "Recovery Station",              tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 113, name: "Treasure Analysis Lab",         tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 114, name: "Furniture Workbench",           tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 115, name: "Weapon Workbench",              tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 116, name: "Armor Workbench",               tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 117, name: "Skill Workbench",               tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 0, upgMystic: 5,
    maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 70,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 118, name: "Item Workbench",                tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 119, name: "Decorative Plant",              tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 120, name: "Tomato",                        tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 121, name: "Flowers",                       tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 1, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 75, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 122, name: "Pansy",                         tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 1, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 75, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 123, name: "Glittering Stone",              tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 2, upgMystic: 2,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 55,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 124, name: "Dining Table",                  tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 125, name: "Couch",                         tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 2, upgWood: 4, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 85, maxUpgWood: 90, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 126, name: "Candle",                        tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 0, upgFood: 1, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 14, maxUpgFood: 65, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 127, name: "Tree Nursery",                  tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 128, name: "Decorative Armor",              tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 0, upgFood: 0, upgOre: 3, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 70, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 129, name: "Red Carpet",                    tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 130, name: "Fluffy Carpet",                 tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 131, name: "Black Mat",                     tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 135, name: "Rejuvenating Bath",             tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 3, upgFood: 0, upgOre: 2, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 136, name: "Rainwater Barrel",              tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 1, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 75, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 137, name: "Fireplace",                     tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 3, upgFood: 0, upgOre: 1, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 60, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 138, name: "Tool Workshop",                 tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 139, name: "Kitchen Shelves",               tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 140, name: "Bathtub",                       tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 2, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 141, name: "Chest of Drawers",              tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 2, upgWood: 4, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 85, maxUpgWood: 90, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 142, name: "Stove",                         tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 2, upgFood: 0, upgOre: 4, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 143, name: "Flower Vase",                   tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 144, name: "Animal Figurine",               tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 145, name: "Vanity Mirror",                 tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 3, upgMystic: 1,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 70, maxUpgMystic: 50,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 146, name: "Cooking Counter",               tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 2, upgFood: 0, upgOre: 2, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 65, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 147, name: "Shelf",                         tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 3, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 148, name: "Desk",                          tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 3, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 149, name: "Window",                        tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 150, name: "Bookshelf",                     tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 151, name: "Dresser",                       tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 2, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 80, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 152, name: "Ore Workbench",                 tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 153, name: "Study Desk",                    tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 1, upgWood: 3, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 80, maxUpgWood: 85, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 154, name: "Friend Bed",                    tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 155, name: "Guest Bed",                     tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 158, name: "Church",                        tab: "indoors",  size: "2×2",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 182, name: "Ancestor Statue",               tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 236, name: "Santa Room",                    tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },
  { id: 237, name: "Decorative Sled",               tab: "indoors",  size: "",
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 15, maxUpgWood: 14, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 8,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: true },

  // -- Map-unlocked ----------------------------------------------------------
  // These facilities are unlocked by clearing map tiles at the listed level.
  // Source: community spreadsheet (Kingdom Adventurers EN - Map.csv)
  { id: 172, name: "Ranking Board",         tab: "map",  size: "2×2", mapUnlock:   2,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 171, name: "Trophy Room",           tab: "map",  size: "2×2", mapUnlock:   3,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 167, name: "Briefing Room",         tab: "map",  size: "2×2", mapUnlock:   5,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 7,   name: "Port",                  tab: "map",  size: "2×2", mapUnlock:   7,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 195, name: "Cabin",                 tab: "map",  size: "2×2", mapUnlock:   8,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 166, name: "Friend Post Office",    tab: "map",  size: "2×2", mapUnlock:  10,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 175, name: "Material Shop",         tab: "map",  size: "2×2", mapUnlock:  10,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 165, name: "Master Smithy",         tab: "map",  size: "2×2", mapUnlock:  11,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 170, name: "Monster Farm",          tab: "map",  size: "2×2", mapUnlock:  14,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 181, name: "Underground Arena",     tab: "map",  size: "2×2", mapUnlock:  20,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 169, name: "Treasure Room",         tab: "map",  size: "2×2", mapUnlock:  21,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 168, name: "Weekly Conquest Bonus", tab: "map",  size: "2×2", mapUnlock:  22,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 198, name: "Movers",                tab: "map",  size: "2×2", mapUnlock:  23,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 173, name: "Friends Agency",        tab: "map",  size: "2×2", mapUnlock:  30,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 200, name: "Equipment Exchange",    tab: "map",  size: "2×2", mapUnlock:  34,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 174, name: "Job Center",            tab: "map",  size: "2×2", mapUnlock:  35,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 201, name: "Trading Post",          tab: "map",  size: "2×2", mapUnlock:  40,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 177, name: "Instructor's Room",     tab: "map",  size: "2×2", mapUnlock:  41,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 10,  name: "Port",                  tab: "map",  size: "2×2", mapUnlock:  44,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 178, name: "Monster Fusion Lab",    tab: "map",  size: "2×2", mapUnlock:  45,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 180, name: "Kairo Room",            tab: "map",  size: "2×2", mapUnlock:  58,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 196, name: "Legendary Cave",        tab: "map",  size: "2×2", mapUnlock: 120,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
  { id: 202, name: "Date Spot",             tab: "map",  size: "2×2", mapUnlock: 135,
    minGrass: 0, minWood: 0, minFood: 0, minOre: 0, minMystic: 0,
    maxGrass: 0, maxWood: 0, maxFood: 0, maxOre: 0, maxMystic: 0,
    upgGrass: 0, upgWood: 0, upgFood: 0, upgOre: 0, upgMystic: 0,
    maxUpgGrass: 0, maxUpgWood: 0, maxUpgFood: 0, maxUpgOre: 0, maxUpgMystic: 0,
    minHp: 0, maxHp: 0, validRange: 0, canUpgrade: false },
];

const FACILITY_PAGE_ROUTES: Partial<Record<number, string>> = {
  168: "/weekly-conquest",
  174: "/job-center",
  180: "/kairo-room",
  200: "/equipment-exchange",
};

function CostPills({ b }: { b: Building }) {
  const parts = COST_ICONS.filter(c => (b[c.field] as number) > 0);
  if (parts.length === 0)
    return <span className="text-[11px] text-muted-foreground italic">Free to build</span>;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {parts.map(c => (
        <span key={c.field} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MaterialIcon id={c.matId} style={c.style} size={18} />
          {b[c.field] as number}
        </span>
      ))}
    </div>
  );
}

function SlotRow({ label, values, highlight }: { label: string; values: [number,number,number,number]; highlight?: boolean }) {
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

function slotKey(b: Building) {
  return b.group + "|" + JSON.stringify([b.cap, b.beds, b.store]);
}

function BuildingGroupCard({ buildings }: { buildings: Building[] }) {
  const rep = buildings[0];
  const merged = buildings.length > 1;
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">
            {merged ? GROUP_LABEL[rep.group] : rep.name}
          </CardTitle>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${GROUP_STYLE[rep.group]}`}>
            {GROUP_LABEL[rep.group]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {merged ? (
          <div className="space-y-1">
            {buildings.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{b.name}</span>
                <CostPills b={b} />
              </div>
            ))}
          </div>
        ) : (
          <CostPills b={rep} />
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
              <SlotRow label="Indoor slots" values={rep.cap} />
              <SlotRow label="Beds"         values={rep.beds}    highlight />
              {rep.store.some(v => v > 0) && (
                <SlotRow label="Shelves"    values={rep.store}   highlight />
              )}
              {rep.monster.some(v => v > 0) && (
                <SlotRow label="Monster"    values={rep.monster} />
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// itemGroup per upgradeable facility (col96 from Facility_lookup.csv)
// -1 / absent = no item costs; 0 = Town Hall (handled by TownHallCard)
const FACILITY_ITEM_GROUP: Record<number, number> = {
  7:2, 17:0, 23:3, 24:3, 25:3, 26:3, 28:3, 29:4, 30:4, 31:4, 32:4,
  33:5, 34:5, 35:5, 36:5, 37:5, 38:5, 39:5, 40:5, 41:5, 42:6, 43:6,
  44:6, 45:6, 46:6, 47:6, 66:7, 67:7, 75:7, 76:7, 77:7, 78:7, 79:7,
  80:7, 81:7, 82:7, 83:7, 84:7, 85:7, 86:7, 87:7, 88:7, 89:7, 90:7,
  91:7, 92:7, 106:8, 107:9, 108:9, 109:9, 110:9, 111:9, 112:9, 113:9,
  114:9, 115:9, 116:9, 117:9, 118:9, 119:8, 120:8, 121:8, 122:8, 123:8,
  124:8, 125:8, 126:8, 128:8, 132:8, 133:8, 134:8, 135:8, 136:8, 137:8,
  139:8, 140:8, 141:8, 142:8, 145:8, 146:8, 147:8, 148:8, 150:8, 151:8,
  153:8, 158:9, 159:7, 161:7, 183:7, 184:7, 185:7, 186:7, 192:7, 194:5,
  206:5, 207:5, 208:5, 209:5, 210:5, 211:5, 212:5, 213:5, 214:5, 223:8,
  224:9, 225:9, 229:8, 236:8, 237:8, 239:2, 241:7,
};

// Item names for each group's item list
// Groups 0/2/3/5/6/7/9: 4 items always, qty = max(1, floor(N/3)) × ratios 3:2:1:3
// Groups 4/8: progressive unlock (1 + floor((N-1)/3) items), each qty=1
type ItemGroupDef =
  | { kind: "scaled"; items: [string, number][] }   // [name, ratio]
  | { kind: "progressive"; items: string[] };        // unlocked in order

const ITEM_GROUP_DEF: Record<number, ItemGroupDef> = {
  0: { kind: "scaled",      items: [["Sturdy Board",3],["Large Nail",2],["Strong Rope",1],["Copper Coin",3]] },
  2: { kind: "scaled",      items: [["Strong Rope",3],["High Grade Brick",2],["Silk Cloth",1],["Copper Coin",3]] },
  3: { kind: "scaled",      items: [["Sturdy Board",3],["Iron Ore",2],["High Grade Brick",1],["Copper Coin",3]] },
  5: { kind: "scaled",      items: [["High Grade Brick",3],["Strong Cloth",2],["Bronze",1],["Copper Coin",3]] },
  6: { kind: "scaled",      items: [["Strong Rope",3],["Large Nail",2],["Gold Nugget",1],["Copper Coin",3]] },
  7: { kind: "scaled",      items: [["High Grade Brick",3],["Strong Rope",2],["Silk Cloth",1],["Copper Coin",3]] },
  9: { kind: "scaled",      items: [["Large Nail",3],["Iron Ore",2],["Pretty Cloth",1],["Copper Coin",3]] },
  4: { kind: "progressive", items: ["Strong Rope","Silk Cloth"] },
  8: { kind: "progressive", items: ["Large Nail","Sturdy Board","Strong Cloth"] },
};

function calcItemCosts(facilityId: number, N: number): { name: string; qty: number }[] {
  const groupId = FACILITY_ITEM_GROUP[facilityId];
  if (groupId == null || groupId === 0) return [];
  const def = ITEM_GROUP_DEF[groupId];
  if (!def) return [];
  if (def.kind === "scaled") {
    const q = Math.max(1, Math.floor(N / 3));
    return def.items.map(([name, ratio]) => ({ name, qty: q * ratio }));
  } else {
    const count = 1 + Math.floor((N - 1) / 3);
    return def.items.slice(0, count).map(name => ({ name, qty: 1 }));
  }
}

function calcTownHallCoinCosts(nextRank: number): { name: string; qty: number }[] {
  const q = Math.max(1, Math.floor(nextRank / 3));
  return [
    { name: "Copper Coin", qty: q * 3 },
  ];
}

function calcTownHallMaterialCosts(nextRank: number): { name: string; qty: number }[] {
  const q = Math.max(1, Math.floor(nextRank / 3));
  return [
    { name: "Sturdy Board", qty: q * 3 },
    { name: "Large Nail", qty: q * 2 },
    { name: "Strong Rope", qty: q * 1 },
  ];
}

function formatFacilityItemName(name: string): string {
  return name === "Copper Coin" ? "🟤 Copper Coin" : name;
}

// What a facility gains from leveling up
type FacilityGain = "mine" | "farm" | "shop" | "port" | "exp" | "hp";

const FACILITY_GAIN: Partial<Record<number, FacilityGain>> = {
  // Mines / production (outdoor)
  45:"mine", 46:"mine", 47:"mine",
  194:"mine", 241:"mine",
  // Field / Plantation (more harvests per planting)
  42:"farm", 43:"farm",
  // Indoor production items
  119:"mine", 120:"mine", 121:"mine", 122:"mine", 123:"mine", 124:"mine",
  127:"mine", 136:"mine", 137:"mine", 138:"mine", 139:"mine", 142:"mine",
  146:"mine", 152:"mine",
  // Shops / workbenches / shelves / registers
  102:"shop", 103:"shop", 104:"shop", 105:"shop",
  110:"shop", 111:"shop", 112:"shop", 113:"shop", 114:"shop",
  115:"shop", 116:"shop", 117:"shop", 118:"shop",
  193:"shop", 234:"shop",
  // Ports & airports
  7:"port", 10:"port", 239:"port",
  // EXP furniture & training
  75:"exp", 106:"exp", 126:"exp", 128:"exp",
  132:"exp", 133:"exp", 134:"exp",
  141:"exp", 143:"exp", 144:"exp", 145:"exp",
  147:"exp", 148:"exp", 149:"exp", 150:"exp", 151:"exp", 153:"exp",
};

const GAIN_BADGE: Record<FacilityGain, { label: string; cls: string }> = {
  mine: { label: "⛏ Produces faster",        cls: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-300" },
  farm: { label: "🌾 More harvests",           cls: "bg-green-500/10 text-green-700 border-green-500/30 dark:text-green-300" },
  shop: { label: "🛒 More items available",   cls: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300" },
  port: { label: "⏱ Longer visit duration",  cls: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300" },
  exp:  { label: "⭐ More EXP per use",       cls: "bg-purple-500/10 text-purple-700 border-purple-500/30 dark:text-purple-300" },
  hp:   { label: "🛡 Durability only",        cls: "bg-muted/60 text-muted-foreground border-border" },
};

function facilityGain(id: number, canUpgrade: boolean): FacilityGain | null {
  if (!canUpgrade) return null;
  return FACILITY_GAIN[id] ?? "hp";
}

// From KA GameData - Warehouse.csv, matched to facility ids via Facility_lookup.csv dataId.
const FACILITY_STORAGE_CAPACITY: Partial<Record<number, string>> = {
  // Source notes: see data/sheet-research/facility-notes.md
  // Confirmed in-game behavior:
  // - low-tier storehouses display 4x the raw Warehouse.csv capacity
  // - HG storehouses match Warehouse.csv directly
  // - coin boxes are effectively unlimited for the player
  33: "20",
  34: "20",
  35: "20",
  36: "20",
  37: "20",
  38: "40",
  39: "20",
  40: "16",
  183: "Unlimited",
  184: "Unlimited",
  206: "100",
  207: "100",
  208: "100",
  209: "100",
  210: "100",
  211: "150",
  212: "50",
  213: "300",
  214: "50",
};

const MATERIAL_STOREHOUSE_IDS = new Set([
  33, 34, 35, 36, 37, 38, 39, 40,
  183, 184,
  206, 207, 208, 209, 210, 211, 212, 213, 214,
]);

function formatUpgTime(seconds: number): string {
  if (seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatHoursMinutes(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function calcEnergyMineTimeToFill(level: number): number {
  const clampedLevel = Math.max(1, Math.min(100, level));
  const levelOffset = clampedLevel - 1;
  const capacity = 50 + ((1000 - 50) / 99) * levelOffset;
  const fullTimeSeconds = 6000 + ((60000 - 6000) / 99) * levelOffset;
  const timeTo50Seconds = fullTimeSeconds * 50 / capacity;
  return Math.max(3000, timeTo50Seconds);
}

function MaterialFacilitySection({
  title,
  facilities,
  timeDiscount,
  resourceDiscount,
}: {
  title: string;
  facilities: Facility[];
  timeDiscount: number;
  resourceDiscount: number;
}) {
  if (facilities.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {facilities.map(f => f.id === 17
          ? <TownHallCard key={f.id} f={f} timeDiscount={timeDiscount} resourceDiscount={resourceDiscount} />
          : <FacilityCard key={f.id} f={f} timeDiscount={timeDiscount} resourceDiscount={resourceDiscount} />
        )}
      </div>
    </div>
  );
}

function FacilityCosts({ g, w, f, o, m }: { g: number; w: number; f: number; o: number; m: number }) {
  const vals = [
    { matId: 0, style: "outlined" as const, v: g },
    { matId: 1, style: "flat"     as const, v: w },
    { matId: 2, style: "flat"     as const, v: f },
    { matId: 3, style: "crystal"  as const, v: o },
    { matId: 4, style: "flat"     as const, v: m },
  ].filter(x => x.v > 0);
  if (vals.length === 0)
    return <span className="text-[11px] text-muted-foreground italic">Free</span>;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {vals.map(c => (
        <span key={c.matId} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MaterialIcon id={c.matId} style={c.style} size={18} />
          {c.v}
        </span>
      ))}
    </div>
  );
}

function EquipmentExchangeCalculator() {
  const [target, setTarget] = useState<KairoEquipmentName>("A/ Kairo Gun");
  const [targetCount, setTargetCount] = useState(10);
  const [sourceQuery, setSourceQuery] = useState("");
  const [currentPrices, setCurrentPrices] = useState<Record<number, number>>({});

  const entries = useMemo(
    () => EQUIPMENT_EXCHANGE_ENTRIES.filter((entry) => entry.outputName === target),
    [target],
  );

  const filteredEntries = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) => entry.inputName.toLowerCase().includes(q));
  }, [entries, sourceQuery]);

  const route = useMemo(() => {
    const states = entries.map((entry) => ({
      entry,
      currentExchange: Math.max(0, currentPrices[entry.inputId] ?? entry.startPrice),
      used: 0,
      totalCoin: 0,
      totalExchange: 0,
    }));

    const picks: Array<{ item: string; tradeCost: number; copperCost: number; combinedCost: number }> = [];
    let totalCoin = 0;
    let totalExchange = 0;

    for (let i = 0; i < targetCount; i += 1) {
      let best = states[0];
      let bestCombined = Number.POSITIVE_INFINITY;
      for (const state of states) {
        const combined = state.entry.copperCoinPrice + state.currentExchange;
        if (
          combined < bestCombined ||
          (combined === bestCombined && state.currentExchange < best.currentExchange) ||
          (combined === bestCombined && state.currentExchange === best.currentExchange && state.entry.inputName < best.entry.inputName)
        ) {
          best = state;
          bestCombined = combined;
        }
      }

      best.used += 1;
      best.totalCoin += best.entry.copperCoinPrice;
      best.totalExchange += best.currentExchange;
      totalCoin += best.entry.copperCoinPrice;
      totalExchange += best.currentExchange;
      picks.push({
        item: best.entry.inputName,
        tradeCost: best.currentExchange,
        copperCost: best.entry.copperCoinPrice,
        combinedCost: best.entry.copperCoinPrice + best.currentExchange,
      });
      best.currentExchange += best.entry.priceStep;
    }

    const usedEntries = states
      .filter((state) => state.used > 0)
      .sort((a, b) => {
        if (b.used !== a.used) return b.used - a.used;
        return a.entry.inputName.localeCompare(b.entry.inputName);
      });

    return {
      totalCoin,
      totalExchange,
      totalCombined: totalCoin + totalExchange,
      usedEntries,
      picks,
    };
  }, [currentPrices, entries, targetCount]);

  const setCurrentPrice = (inputId: number, value: number) => {
    setCurrentPrices((prev) => ({ ...prev, [inputId]: Math.max(0, value) }));
  };

  const resetVisible = () => {
    setCurrentPrices((prev) => {
      const next = { ...prev };
      for (const entry of entries) {
        delete next[entry.inputId];
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-teal-500/20 bg-teal-500/5 p-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Equipment Exchange Calculator</h4>
        <p className="text-xs text-muted-foreground">
          Decoded from the mined exchange table: each tradable equipment item has its own starting exchange price and its own increase per trade.
          The cheapest route can mix different source items, so this calculator picks the lowest live cost step-by-step.
        </p>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-200">
        Enter your current live exchange price for any source item you have checked in-game. If you leave a row untouched, it uses the mined starting price.
        The copper column uses the mined copper coin value from the equipment sheet.
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
        <div className="space-y-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Target Kairo piece</label>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_EXCHANGE_OUTPUTS.map((output) => (
              <button
                key={output}
                type="button"
                onClick={() => setTarget(output)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  target === output
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {output}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">How many needed</label>
          <Input
            type="number"
            min={1}
            value={targetCount}
            onChange={(e) => setTargetCount(Math.max(1, Number(e.target.value) || 1))}
            className="h-9"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Copper total</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{route.totalCoin}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Exchange total</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{route.totalExchange}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Combined total</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{route.totalCombined}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Best route summary</h5>
          <div className="text-xs text-muted-foreground">
            {route.usedEntries.length} source item{route.usedEntries.length === 1 ? "" : "s"} used
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {route.usedEntries.map((state) => (
            <div key={state.entry.inputId} className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{state.entry.inputName}</span>
                <span className="tabular-nums text-muted-foreground">×{state.used}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                <span>Rank {rankLabel(state.entry.inputName)}</span>
                <span>Copper {state.entry.copperCoinPrice}</span>
                <span>Start {state.entry.startPrice}</span>
                <span>+{state.entry.priceStep} each</span>
                <span className="font-medium text-foreground">Total {state.totalCoin + state.totalExchange}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-md border border-border bg-background/40">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
          Show per-trade route
        </summary>
        <div className="border-t border-border px-3 py-2">
          <div className="grid gap-1">
            {route.picks.map((pick, index) => (
              <div key={`${pick.item}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">
                  {index + 1}. {pick.item}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  copper {pick.copperCost} + exchange {pick.tradeCost} = {pick.combinedCost}
                </span>
              </div>
            ))}
          </div>
        </div>
      </details>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source items</h5>
          <div className="flex gap-2 sm:items-center">
            <Input
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
              placeholder="Filter source items"
              className="h-8 text-xs sm:w-48"
            />
            <button
              type="button"
              onClick={resetVisible}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Reset current prices
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[680px] border-collapse text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-left font-medium">Rank</th>
                <th className="px-3 py-2 text-right font-medium">Copper</th>
                <th className="px-3 py-2 text-right font-medium">Mined start</th>
                <th className="px-3 py-2 text-right font-medium">Step</th>
                <th className="px-3 py-2 text-right font-medium">Your current trade</th>
                <th className="px-3 py-2 text-right font-medium">Next total</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const current = currentPrices[entry.inputId] ?? entry.startPrice;
                return (
                  <tr key={entry.inputId} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{entry.inputName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{rankLabel(entry.inputName)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entry.copperCoinPrice}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{entry.startPrice}</td>
                    <td className="px-3 py-2 text-right tabular-nums">+{entry.priceStep}</td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={current}
                        onChange={(e) => setCurrentPrice(entry.inputId, Number(e.target.value) || 0)}
                        className="h-8 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{entry.copperCoinPrice + current}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FacilityCard({ f, timeDiscount = 0, resourceDiscount = 0 }: { f: Facility; timeDiscount?: number; resourceDiscount?: number }) {
  const [level, setLevel] = useState(0);
  const MAX_LEVEL = 99; // max upgrade level is 100; slider 0..99 = lv1..lv100
  const displayLevel = level + 1;
  const facilityRoute = FACILITY_PAGE_ROUTES[f.id];

  function interp(lv1: number, maxV: number) {
    if (lv1 === 0 && maxV === 0) return 0;
    return lv1 + Math.floor((maxV - lv1) * level / MAX_LEVEL);
  }

  const uG = Math.round(interp(f.upgGrass,   f.maxUpgGrass)  * (1 - resourceDiscount));
  const uW = Math.round(interp(f.upgWood,    f.maxUpgWood)   * (1 - resourceDiscount));
  const uF = Math.round(interp(f.upgFood,    f.maxUpgFood)   * (1 - resourceDiscount));
  const uO = Math.round(interp(f.upgOre,     f.maxUpgOre)    * (1 - resourceDiscount));
  const uM = Math.round(interp(f.upgMystic,  f.maxUpgMystic) * (1 - resourceDiscount));

  const minTime = Math.round(120 * (1 - timeDiscount));
  const maxTime = Math.round(129600 * (1 - timeDiscount));
  const upgTime = Math.round(minTime + (maxTime - minTime) * level / MAX_LEVEL);
  const energyMineTimeToFill = f.id === 47 ? calcEnergyMineTimeToFill(displayLevel) : null;
  const storageCapacity = FACILITY_STORAGE_CAPACITY[f.id] ?? null;

  const hasUpg   = f.canUpgrade && (f.upgGrass > 0 || f.upgWood > 0 || f.upgFood > 0 || f.upgOre > 0 || f.upgMystic > 0
                                  || f.maxUpgGrass > 0 || f.maxUpgWood > 0 || f.maxUpgFood > 0 || f.maxUpgOre > 0 || f.maxUpgMystic > 0);
  const tabLabel = FACILITY_TABS.find(t => t.key === f.tab)?.label ?? f.tab;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-semibold leading-tight">{f.name}</CardTitle>
            {facilityRoute && (
              <Link href={facilityRoute}>
                <Badge variant="outline" className="cursor-pointer text-[10px] bg-primary/10 text-primary border-primary/30 hover:bg-primary/15">
                  Open page
                </Badge>
              </Link>
            )}
        </div>
        {(f.canUpgrade || f.validRange > 0 || f.mapUnlock !== undefined) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {f.size && (
              <Badge variant="outline" className="text-[10px] tabular-nums font-mono">
                {f.size}{f.rotatable ? " 🔄" : ""}
              </Badge>
            )}
            {f.mapUnlock !== undefined && (
              <Badge variant="outline" className="text-[10px] tabular-nums bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300">
                Map Lv.{f.mapUnlock}
              </Badge>
            )}
            {f.canUpgrade && (
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
                Upgradeable
              </Badge>
            )}
            {(() => {
              const gain = facilityGain(f.id, f.canUpgrade);
              if (!gain) return null;
              const { label, cls } = GAIN_BADGE[gain];
              return <Badge variant="outline" className={`text-[10px] ${cls}`}>{label}</Badge>;
            })()}
            {f.validRange > 0 && (
              <Badge variant="outline" className="text-[10px] tabular-nums">
                📍 {f.validRange} tiles
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {f.minHp > 0 && (
          <p className="text-xs text-muted-foreground">HP {f.minHp}–{f.maxHp}</p>
        )}
        {f.minUseCount != null && f.maxUseCount != null && (
          <p className="text-xs text-muted-foreground">
            🌾 Harvests per planting: <span className="font-medium text-foreground">
              {f.minUseCount + Math.floor((f.maxUseCount - f.minUseCount) * level / MAX_LEVEL)}
            </span>
          </p>
        )}
        {energyMineTimeToFill != null && (
          <p className="text-xs text-muted-foreground">
            ⚡ Time to fill: <span className="font-medium text-foreground">{formatHoursMinutes(energyMineTimeToFill)}</span>
          </p>
        )}
        {storageCapacity != null && (
          <p className="text-xs text-muted-foreground">
            📦 Capacity: <span className="font-medium text-foreground">{storageCapacity}</span>
          </p>
        )}
        {f.id === 191 && (
          <div className="rounded-md border border-red-300 bg-red-50/70 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
            <strong className="text-foreground dark:text-red-200">Warning:</strong> when removing a Chaos Stone, pay the 50 diamonds or it will be lost permanently. Losing one permanently is bad enough that many players would rather restart than accept it.
          </div>
        )}
        {hasUpg && (
          <div className="space-y-1 border-t border-border pt-2 mt-1">
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
            <FacilityCosts g={uG} w={uW} f={uF} o={uO} m={uM} />
            {(() => {
              const items = calcItemCosts(f.id, level + 1);
              if (items.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {items.map(({ name, qty }) => (
                    <span key={name} className="text-xs text-muted-foreground">
                      {qty}× {formatFacilityItemName(name)}
                    </span>
                  ))}
                </div>
              );
            })()}
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">⏱ {formatUpgTime(upgTime)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -- Town Hall rank-aware card -------------------------------------------------
// Upgrade time (seconds) to reach rank N+1, indexed 0..99
// (i.e. TH_UPGRADE_TIMES[0] = time to go rank 0?1, [99] = rank 99?100)
const TH_UPGRADE_TIMES = [
    5,   120,   300,   420,   600,   900,  1200,  1800,  2700,  3600,
 7200, 10800, 14400, 18000, 21600, 25200, 28800, 32400, 36000, 39600,
43200, 46800, 50400, 54000, 57600, 61200, 64800, 68400, 72000, 75600,
79200, 82800, 86400, 90000, 93600, 97200,100800,104400,108000,111600,
115200,118800,122400,126000,129600,133200,136800,140400,144000,147600,
151200,154800,158400,162000,165600,169200,172800,180000,187200,194400,
201600,208800,216000,223200,230400,237600,244800,252000,259200,259200,
280800,302400,324000,345600,367200,388800,410400,432000,453600,475200,
496800,518400,540000,561600,583200,604800,626400,648000,669600,691200,
712800,734400,756000,777600,799200,820800,842400,864000,885600,907200,
];

function TownHallCard({ f, timeDiscount = 0, resourceDiscount = 0 }: { f: Facility; timeDiscount?: number; resourceDiscount?: number }) {
  const [rank, setRank] = useState(0);
  const maxRank = 99; // can't upgrade past 100

  function interp(minV: number, maxV: number) {
    if (minV === 0 && maxV === 0) return 0;
    return Math.round(minV + (maxV - minV) * rank / 99);
  }

  const uG = Math.round(interp(f.upgGrass, f.maxUpgGrass)  * (1 - resourceDiscount));
  const uW = Math.round(interp(f.upgWood,  f.maxUpgWood)   * (1 - resourceDiscount));
  const uF = Math.round(interp(f.upgFood,  f.maxUpgFood)   * (1 - resourceDiscount));
  const uO = Math.round(interp(f.upgOre,   f.maxUpgOre)    * (1 - resourceDiscount));
  const uM = Math.round(interp(f.upgMystic,f.maxUpgMystic) * (1 - resourceDiscount));
  const upgTime = Math.round(TH_UPGRADE_TIMES[rank] * (1 - timeDiscount));

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">{f.name}</CardTitle>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${FACILITY_TAB_STYLE[f.tab]}`}>
            {FACILITY_TABS.find(t => t.key === f.tab)?.label}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          <Badge variant="outline" className="text-[10px] tabular-nums font-mono">{f.size}</Badge>
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
            Upgradeable
          </Badge>
          {f.validRange > 0 && (
            <Badge variant="outline" className="text-[10px] tabular-nums">\ud83d\udccd {f.validRange} tiles</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {f.minHp > 0 && (
          <p className="text-xs text-muted-foreground">HP {f.minHp}×{f.maxHp}</p>
        )}
        <div className="space-y-1 border-t border-border pt-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide font-medium">
              Upgrade cost (Rank {rank}\u2192{rank + 1})
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setRank(r => Math.max(0, r - 1))}
                disabled={rank === 0}
                className="w-5 h-5 rounded text-xs font-bold border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >-</button>
              <span className="text-xs tabular-nums w-7 text-center font-medium">{rank}</span>
              <button
                onClick={() => setRank(r => Math.min(maxRank, r + 1))}
                disabled={rank === maxRank}
                className="w-5 h-5 rounded text-xs font-bold border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >+</button>
            </div>
          </div>
          <FacilityCosts g={uG} w={uW} f={uF} o={uO} m={uM} />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {calcTownHallMaterialCosts(rank + 1).map(({ name, qty }) => (
              <span key={name} className="text-xs text-muted-foreground">
                {qty}× {formatFacilityItemName(name)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {calcTownHallCoinCosts(rank + 1).map(({ name, qty }) => (
              <span key={name} className="text-xs text-muted-foreground">
                {qty}× {formatFacilityItemName(name)}
              </span>
            ))}
          </div>
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">⏱ {formatUpgTime(upgTime)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// -- Page ----------------------------------------------------------------------

export default function HousesPage() {
  const search = useSearch();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<PageTab>("houses");
  const [facilityTab, setFacilityTab] = useState<FacilityTab>("env");
  const [knowHow, setKnowHow] = useState(0);
  const [craftsman, setCraftsman] = useState(0);
  const timeDiscount = knowHow * 0.05;
  const resourceDiscount = craftsman * 0.05;

  useEffect(() => {
    const params = new URLSearchParams(search);
    const nextTab = params.get("tab");
    if (nextTab === "houses" || nextTab === "facilities") {
      setTab(nextTab);
    }
    const nextFacilityTab = params.get("facilityTab");
    if (
      nextFacilityTab === "env" ||
      nextFacilityTab === "materials" ||
      nextFacilityTab === "amenity" ||
      nextFacilityTab === "indoors" ||
      nextFacilityTab === "map"
    ) {
      setFacilityTab(nextFacilityTab);
    }
    const nextQuery = params.get("search");
    if (nextQuery !== null) {
      setQuery(nextQuery);
    }
  }, [search]);

  const q = query.trim().toLowerCase();

  // All current buildings are plots × they all appear in the Houses & Plots tab.
  // Facilities (walls, gates, roads, torches, townhall×) are non-plot infrastructure
  // and will be added separately under the Facilities tab.
  const filtered = tab === "facilities" ? [] : BUILDINGS.filter(b => {
    if (!q) return true;
    return b.name.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Houses & Facilities</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Land plots (S / M / L / XL) are built into one of these building types.
          The building type determines what can go inside and how many slots you get per plot size.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {PAGE_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl border px-5 py-4 text-left transition-all ${
                tab === t.key
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-muted/30 text-foreground border-border hover:bg-muted/60"
              }`}
            >
              <div className="text-base font-semibold">{t.label}</div>
              <div className={`mt-1 text-xs leading-relaxed ${tab === t.key ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                {t.key === "houses"
                  ? "Plots, building types, capacity, beds, shelves, and monster room slots."
                  : "Town facilities, indoor objects, map unlocks, upgrade costs, and utility structures."}
              </div>
            </button>
          ))}
        </div>

        <div className="relative sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search buildings×"
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {tab === "houses" && <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground border border-border rounded-md px-4 py-3 bg-muted/20">
        <span><span className="font-semibold">Indoor slots</span> × total items placeable inside</span>
        <span><span className="font-semibold">Beds</span> × how many bed items fit (1 resident each)</span>
        <span><span className="font-semibold">Shelves</span> × shop display slots for goods</span>
        <span><span className="font-semibold">Monster</span> × monster room slots</span>
      </div>}

      {tab === "facilities" ? (
        <div className="space-y-4">
          {/* Modifier panel */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-muted/20 px-4 py-2.5">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground/60 shrink-0">Modifiers</span>
            {([
              { label: "Know-How Journal", value: knowHow, set: setKnowHow, suffix: "-5% upgrade time each" },
              { label: "Master Craftsman's Tools", value: craftsman, set: setCraftsman, suffix: "-5% resource cost each" },
            ] as { label: string; value: number; set: (n: number) => void; suffix: string }[]).map(({ label, value, set, suffix }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>
                <span className="text-xs text-muted-foreground sm:hidden">{label.split("'")[0].trim()}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => set(Math.max(0, value - 1))}
                    disabled={value === 0}
                    className="w-5 h-5 rounded text-xs font-bold border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >-</button>
                  <span className="text-xs tabular-nums w-4 text-center font-medium">{value}</span>
                  <button
                    onClick={() => set(Math.min(6, value + 1))}
                    disabled={value === 6}
                    className="w-5 h-5 rounded text-xs font-bold border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >+</button>
                </div>
                {value > 0 ? (
                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">-{value * 5}%</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40">{suffix}</span>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {FACILITY_TABS.map(ft => (
              <button
                key={ft.key}
                onClick={() => setFacilityTab(ft.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors border ${
                  facilityTab === ft.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted/70"
                }`}
              >
                {ft.label}
              </button>
            ))}
          </div>
          {(() => {
            const inTab = FACILITIES.filter(f => f.tab === facilityTab);
            const sorted = facilityTab === "map"
              ? [...inTab].sort((a, b) => (a.mapUnlock ?? 0) - (b.mapUnlock ?? 0))
              : inTab;
            const shown = q ? sorted.filter(f => f.name.toLowerCase().includes(q)) : sorted;
            if (shown.length === 0)
              return (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    {q ? `No facilities found for "${query}".` : "No data yet for this tab."}
                  </p>
                </div>
              );
            if (facilityTab === "materials") {
              const storehouses = shown.filter(f => MATERIAL_STOREHOUSE_IDS.has(f.id));
              const production = shown.filter(f => !MATERIAL_STOREHOUSE_IDS.has(f.id));
              return (
                <div className="space-y-6">
                  <MaterialFacilitySection
                    title="Storehouse"
                    facilities={storehouses}
                    timeDiscount={timeDiscount}
                    resourceDiscount={resourceDiscount}
                  />
                  <MaterialFacilitySection
                    title="Production"
                    facilities={production}
                    timeDiscount={timeDiscount}
                    resourceDiscount={resourceDiscount}
                  />
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {shown.map(f => f.id === 17
                  ? <TownHallCard key={f.id} f={f} timeDiscount={timeDiscount} resourceDiscount={resourceDiscount} />
                  : <FacilityCard key={f.id} f={f} timeDiscount={timeDiscount} resourceDiscount={resourceDiscount} />
                )}
              </div>
            );
          })()}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(() => {
            const seen = new Map<string, Building[]>();
            for (const b of filtered) {
              const k = slotKey(b);
              if (!seen.has(k)) seen.set(k, []);
              seen.get(k)!.push(b);
            }
            return Array.from(seen.values()).map(group => (
              <BuildingGroupCard key={slotKey(group[0])} buildings={group} />
            ));
          })()}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No buildings found{q ? ` for "${query}"` : ""}.
        </p>
      )}
    </div>
  );
}

export { FacilityCard, FACILITIES };
