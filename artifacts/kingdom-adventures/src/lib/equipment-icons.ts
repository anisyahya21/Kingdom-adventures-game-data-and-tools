import iconManifest from "../../../../website_icons/manifest.json";

// Build equipment name to icon path lookup from manifest
const equipmentIconLookup = new Map<string, string>();
if (iconManifest && iconManifest.equipment) {
  for (const equip of iconManifest.equipment) {
    const iconPath = `/website_icons/equipment/${equip.filename}?v=20260515r4`;
    // Store with original name
    equipmentIconLookup.set(equip.name, iconPath);
    // Also store with slash format (e.g., "A/ Ancient Sword")
    const slashName = toSlashEquipmentName(equip.name);
    equipmentIconLookup.set(slashName, iconPath);
    // Also store with dash format (e.g., "A- Ancient Sword")  
    const dashName = toDashEquipmentName(equip.name);
    equipmentIconLookup.set(dashName, iconPath);
  }
}

export type EquipmentIconMap = Record<string, string> | undefined | null;

export function toSlashEquipmentName(name: string): string {
  return name.trim().replace(/^([FSABCDE])-\s*/i, (_, rank: string) => `${rank.toUpperCase()}/ `);
}

export function toDashEquipmentName(name: string): string {
  return name.trim().replace(/^([FSABCDE])\s*\/\s*/i, (_, rank: string) => `${rank.toUpperCase()}- `);
}

export function getEquipmentIconKeys(name: string | undefined | null): string[] {
  if (!name) return [];
  const cleanName = name.trim();
  if (!cleanName) return [];
  const slashName = toSlashEquipmentName(cleanName);
  const dashName = toDashEquipmentName(cleanName);
  return Array.from(new Set([
    `equip:${cleanName}`,
    cleanName,
    `equip:${slashName}`,
    slashName,
    `equip:${dashName}`,
    dashName,
  ]));
}

const PUBLIC_EQUIPMENT_ICON_NAMES = new Set([
  "A- Kairo Bow",
  "A- Kairo Gun",
  "A- Kairo Hammer",
  "A- Kairo Lance",
  "A- Kairo Sword",
  "A- Swift Bow",
  "D- Lumberjack's Axe",
  "E- Infantry Shield",
  "F- Adze",
  "F- Leather Shield",
  "F- Wooden Shield",
  "S- Legendary Axe",
]);

function publicEquipmentIconUrl(name: string): string | undefined {
  const dashName = toDashEquipmentName(name);
  if (!PUBLIC_EQUIPMENT_ICON_NAMES.has(dashName)) return undefined;
  return `/Images/cropped/${encodeURIComponent(dashName)}.png`;
}

export function getEquipmentIcon(icons: EquipmentIconMap, name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  
  // First check the static equipment icon lookup from website_icons
  const cleanName = name.trim();
  if (equipmentIconLookup.has(cleanName)) {
    return equipmentIconLookup.get(cleanName);
  }
  
  // Try slash and dash variants
  const slashName = toSlashEquipmentName(cleanName);
  if (equipmentIconLookup.has(slashName)) {
    return equipmentIconLookup.get(slashName);
  }
  
  const dashName = toDashEquipmentName(cleanName);
  if (equipmentIconLookup.has(dashName)) {
    return equipmentIconLookup.get(dashName);
  }
  
  // Fallback to dynamic icons from API if available
  if (icons) {
    for (const key of getEquipmentIconKeys(name)) {
      const icon = icons[key];
      if (icon) return icon;
    }
  }
  
  // Last fallback to public cropped images
  return publicEquipmentIconUrl(name);
}

// Map from <pic=X> tag to display word, used for pouch aliases
const PIC_TAG_TO_WORD: Record<string, string> = {
  grass: "Grass",
  wood: "Wood",
  food: "Food",
  iron: "Iron",
  magic: "Magic",
};

/** Converts a raw item name from game data into a clean display name.
 *  "<pic=grass> Pouch" => "Grass Pouch", others unchanged. */
function toItemDisplayName(name: string): string {
  return name.replace(/^<pic=(\w+)>\s*/i, (_, key: string) => {
    const word = PIC_TAG_TO_WORD[key.toLowerCase()] ?? (key.charAt(0).toUpperCase() + key.slice(1).toLowerCase());
    return word + " ";
  }).trim();
}

// Build item name to icon path lookup from manifest
const itemIconLookup = new Map<string, string>();
if (iconManifest && iconManifest.items) {
  for (const item of iconManifest.items) {
    const iconPath = item.filename.includes("/") ? `/website_icons/${item.filename}?v=20260515r4` : `/website_icons/items/${item.filename}?v=20260515r4`;
    itemIconLookup.set(item.name, iconPath);
    itemIconLookup.set(item.name.toLowerCase(), iconPath);
    // Register clean alias for pic-tag names (e.g. "<pic=grass> Pouch" -> "Grass Pouch")
    const alias = toItemDisplayName(item.name);
    if (alias !== item.name) {
      itemIconLookup.set(alias, iconPath);
      itemIconLookup.set(alias.toLowerCase(), iconPath);
    }
  }
}

// Build egg color name to icon path lookup from manifest
const eggIconLookup = new Map<string, string>();
if (iconManifest && iconManifest.eggs) {
  for (const egg of iconManifest.eggs) {
    const iconPath = `/website_icons/eggs/${egg.filename}?v=20260515r4`;
    // Map full name "White Egg" â†’ path
    eggIconLookup.set(egg.name, iconPath);
    // Map color-only "White" â†’ path (strip " Egg" suffix)
    const colorOnly = egg.name.replace(/ Egg$/, "");
    eggIconLookup.set(colorOnly, iconPath);
    eggIconLookup.set(colorOnly.toLowerCase(), iconPath);
  }
}

export function getItemIcon(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const clean = name.trim();
  // Direct lookup
  const direct = itemIconLookup.get(clean) ?? itemIconLookup.get(clean.toLowerCase());
  if (direct) return direct;
  // Strip leading quantity prefix ("2x ", "3x ", "Nx ", etc.) and retry
  const stripped = clean.replace(/^\d+x\s+/i, "");
  if (stripped !== clean) {
    return itemIconLookup.get(stripped) ?? itemIconLookup.get(stripped.toLowerCase());
  }
  return undefined;
}

export function getEggIconByColor(colorName: string | undefined | null): string | undefined {
  if (!colorName) return undefined;
  const clean = colorName.trim();
  return eggIconLookup.get(clean) ?? eggIconLookup.get(clean.replace(/ Egg$/, "")) ?? eggIconLookup.get(clean.toLowerCase());
}

// Build furniture name to icon path lookup from manifest
const furnitureIconLookup = new Map<string, string>();
if (iconManifest && (iconManifest as Record<string, unknown>).furniture) {
  for (const item of (iconManifest as Record<string, unknown>).furniture as Array<{ name: string; filename: string }>) {
    const iconPath = `/website_icons/furniture/${item.filename}?v=20260515r5`;
    furnitureIconLookup.set(item.name, iconPath);
    furnitureIconLookup.set(item.name.toLowerCase(), iconPath);
  }
}

export function getFurnitureIcon(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const clean = name.trim();
  return furnitureIconLookup.get(clean) ?? furnitureIconLookup.get(clean.toLowerCase());
}


// Build facility id to icon path lookup from manifest
const facilityIconLookup = new Map<number, string>();
if (iconManifest && (iconManifest as Record<string, unknown>).facilities) {
  for (const fac of (iconManifest as Record<string, unknown>).facilities as Array<{ id: number; type: string; name: string; filename: string }>) {
    const iconPath = `/website_icons/facilities_confirmed/${fac.filename}?v=20260515r1`;
    // Prefer facility-type over mapchip-type on ID collision
    if (fac.type === 'facility' || !facilityIconLookup.has(fac.id)) {
      facilityIconLookup.set(fac.id, iconPath);
    }
  }
}

export function getFacilityIcon(id: number | undefined | null): string | undefined {
  if (id == null) return undefined;
  return facilityIconLookup.get(id);
}
