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
  if (icons) {
    for (const key of getEquipmentIconKeys(name)) {
      const icon = icons[key];
      if (icon) return icon;
    }
  }
  return publicEquipmentIconUrl(name);
}
