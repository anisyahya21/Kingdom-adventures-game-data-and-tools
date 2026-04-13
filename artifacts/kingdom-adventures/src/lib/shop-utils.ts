export type ShopStatus = "Ready" | "In Progress" | "Research Needed";

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
