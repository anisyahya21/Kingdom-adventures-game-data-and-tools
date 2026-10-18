export function levelingStorageKey(base: string, accountScope: string | null) {
  return accountScope ? `${base}:${accountScope}` : base;
}

/** Checked means available as a source; importing selects only recorded equipment. */
export function accountEquipmentRows(items: Array<{ id: number; name: string }>, equipment: Record<string, number>) {
  return Object.fromEntries(items.map((item) => [String(item.id), {
    checked: Boolean(equipment[item.name]),
    level: equipment[item.name] || 1,
  }]));
}

/** A current-level edit changes only that equipment entry in the shared collection. */
export function withCurrentEquipmentLevel<T extends { equipment: Record<string, number> }>(profile: T, name: string, level: number): T {
  if (!name || !Number.isFinite(level)) return profile;
  const current = Math.max(1, Math.min(99, Math.floor(level)));
  if (profile.equipment[name] === current) return profile;
  return { ...profile, equipment: { ...profile.equipment, [name]: current } };
}
