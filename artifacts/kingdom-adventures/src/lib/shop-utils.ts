export type ShopStatus = "Ready" | "In Progress" | "Research Needed";

export type ShopBuilding = {
  /** Build cost — only the non-zero material will have a value > 0 */
  grass: number; wood: number; food: number; ore: number; mystic: number;
  /** Per-size values: [S, M, L, XL] */
  cap:   [number, number, number, number];
  beds:  [number, number, number, number];
  store: [number, number, number, number];
};

export type ShopFacility = {
  id: number;
  name: string;
  size: string;
  upgGrass: number; upgWood: number; upgFood: number; upgOre: number; upgMystic: number;
  maxUpgGrass: number; maxUpgWood: number; maxUpgFood: number; maxUpgOre: number; maxUpgMystic: number;
};

export type ShopSlug =
  | "weapon-shop"
  | "armor-shop"
  | "accessory-shop"
  | "item-shop"
  | "furniture-shop"
  | "restaurant"
  | "skill-shop";

export type ShopRecord = {
  slug: ShopSlug;
  title: string;
  shortTitle: string;
  description: string;
  status: ShopStatus;
  owner: string;
  dataSource: string;
  currentScope: string[];
  nextSteps: string[];
  /** Building stats from House.csv — present for all shop-type buildings */
  building?: ShopBuilding;
  /** Primary crafting workbench placed inside this shop */
  workbench?: ShopFacility;
};

export const SHOP_RECORDS: ShopRecord[] = [
  {
    slug: "weapon-shop",
    title: "Weapon Shop",
    shortTitle: "Weapon",
    description: "Player-facing weapon shop view built from the translated equipment database.",
    status: "Ready",
    owner: "Blacksmith",
    dataSource: "Equipment Stats",
    currentScope: [
      "Weapons already exist in the equipment database.",
      "Rank and craftability filters are already decoded.",
      "Weapon type mapping is already stored in shared data.",
    ],
    nextSteps: [
      "Link shop-made weapons directly into this page.",
      "Add price and unlock details when those sources are decoded.",
    ],
    building: { grass: 0, wood: 0, food: 0, ore: 12, mystic: 0, cap: [1,2,2,3], beds: [0,1,1,2], store: [3,5,7,9] },
    workbench: { id: 115, name: "Weapon Workbench", size: "2×2", upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0, maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8 },
  },
  {
    slug: "armor-shop",
    title: "Armor Shop",
    shortTitle: "Armor",
    description: "Armor, headgear, and shield browsing built from the translated equipment database.",
    status: "Ready",
    owner: "Blacksmith",
    dataSource: "Equipment Stats",
    currentScope: [
      "Armor, headgear, and shields already exist in the equipment database.",
      "Slot translation is already available for player-facing browsing.",
    ],
    nextSteps: [
      "Add price and unlock details when those sources are decoded.",
      "Expand subtype filters if players want armor-only or shield-only drill-downs.",
    ],
    building: { grass: 0, wood: 0, food: 0, ore: 8, mystic: 0, cap: [1,2,2,3], beds: [0,1,1,2], store: [3,5,7,9] },
    workbench: { id: 116, name: "Armor Workbench", size: "2×2", upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0, maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8 },
  },
  {
    slug: "accessory-shop",
    title: "Accessory Shop",
    shortTitle: "Accessories",
    description: "Accessory browsing built from the translated equipment database.",
    status: "Ready",
    owner: "Trader",
    dataSource: "Equipment Stats",
    currentScope: [
      "Accessory data already exists in the equipment database.",
      "Rank and craftability filters are already available.",
    ],
    nextSteps: [
      "Add price and unlock details when those sources are decoded.",
    ],
    building: { grass: 0, wood: 0, food: 0, ore: 15, mystic: 0, cap: [1,2,2,3], beds: [0,1,1,2], store: [3,5,7,9] },
    workbench: { id: 110, name: "Accessory Workshop", size: "2×2", upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0, maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8 },
  },
  {
    slug: "item-shop",
    title: "Item Shop",
    shortTitle: "Items",
    description: "Craftable item browsing built from the translated item sheet.",
    status: "Ready",
    owner: "Trader",
    dataSource: "Item data",
    currentScope: [
      "The item sheet includes craftTermStudioLevel and craftTermIntelligence.",
      "Craftable item rows are now shown as a read-only item-shop database.",
    ],
    nextSteps: [
      "Separate shop items from feed-only and other special-use items more precisely.",
      "Add pricing and clearer shop-only categories if the source exposes them cleanly.",
    ],
    building: { grass: 0, wood: 0, food: 5, ore: 0, mystic: 0, cap: [1,2,2,3], beds: [0,1,1,2], store: [3,5,7,9] },
    workbench: { id: 118, name: "Item Workbench", size: "2×2", upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0, maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8 },
  },
  {
    slug: "furniture-shop",
    title: "Furniture Shop",
    shortTitle: "Furniture",
    description: "Furniture browsing built from the confirmed furniture catalog, with facility/source details still growing.",
    status: "Ready",
    owner: "Artisan",
    dataSource: "Facility lookup + confirmed catalog",
    currentScope: [
      "Furniture outputs are known from confirmed gameplay/community research.",
      "Studio and intelligence requirements are now shown in a real furniture database view.",
    ],
    nextSteps: [
      "Add furniture prices and unlock requirements.",
      "Decode the facility source into richer effect and upgrade details.",
    ],
    building: { grass: 0, wood: 15, food: 0, ore: 0, mystic: 0, cap: [1,2,2,3], beds: [0,1,1,2], store: [3,5,7,9] },
    workbench: { id: 114, name: "Furniture Workbench", size: "2×2", upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0, maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8 },
  },
  {
    slug: "restaurant",
    title: "Restaurant",
    shortTitle: "Restaurant",
    description: "Restaurant ownership is understood, but the food output source still needs to be traced cleanly.",
    status: "Research Needed",
    owner: "Cook",
    dataSource: "Pending",
    currentScope: [
      "Shop ownership is already understood.",
      "Food output still needs a clean translated source.",
    ],
    nextSteps: [
      "Find the source for restaurant outputs.",
      "Split food items away from the broader item system cleanly.",
    ],
    building: { grass: 0, wood: 0, food: 8, ore: 0, mystic: 0, cap: [1,2,2,3], beds: [0,1,1,2], store: [3,5,7,9] },
    workbench: { id: 111, name: "Cooking Station", size: "2×2", upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 4, upgMystic: 0, maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 75, maxUpgMystic: 8 },
  },
  {
    slug: "skill-shop",
    title: "Skill Shop",
    shortTitle: "Skills",
    description: "Player-facing skill shop view built from the translated skills database.",
    status: "Ready",
    owner: "Mage",
    dataSource: "Skills Database",
    currentScope: [
      "Craftability rules are already understood.",
      "The skills database already contains pricing and crafting requirements.",
    ],
    nextSteps: [
      "Add more shop-specific explanations as the translation layer grows.",
    ],
    building: { grass: 0, wood: 0, food: 0, ore: 0, mystic: 12, cap: [1,2,2,3], beds: [0,1,1,2], store: [3,5,7,9] },
    workbench: { id: 117, name: "Skill Workbench", size: "2×2", upgGrass: 0, upgWood: 8, upgFood: 0, upgOre: 0, upgMystic: 5, maxUpgGrass: 15, maxUpgWood: 110, maxUpgFood: 12, maxUpgOre: 10, maxUpgMystic: 70 },
  },
];

export const SHOP_NAME_TO_SLUG: Record<string, ShopSlug> = {
  "Weapon Shop": "weapon-shop",
  "Armor Shop": "armor-shop",
  "Accessory Shop": "accessory-shop",
  "Item Shop": "item-shop",
  "Furniture Shop": "furniture-shop",
  Restaurant: "restaurant",
  "Skill Shop": "skill-shop",
};

export function getShopSlug(shopName: string): ShopSlug | null {
  return SHOP_NAME_TO_SLUG[shopName] ?? null;
}

export function getShopHref(shopName: string): string | null {
  const slug = getShopSlug(shopName);
  return slug ? `/shops/${slug}` : null;
}
