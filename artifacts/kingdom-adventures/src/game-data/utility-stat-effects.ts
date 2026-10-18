import type { StatKey } from "@/game-data/stat-parameter-ids";

/** Code-backed world-work consumers; evidence: skill-catalog-audit.md,
 * skills-and-utility-stats.md and wagon-and-fog.md. Not an exhaustive combat guide.
 */
export const UTILITY_STAT_EFFECTS: { key: StatKey; name: string; effect: string; training: string }[] = [
  { key: "vig", name: "Vigor", effect: "Keeps residents active for longer. When Vigor runs out, their usual travel speed is halved.", training: "Auto Recovery Vigor restores 5 Vigor at a time. All-Out Sprint lets a resident keep moving at full sprint speed even with empty Vigor." },
  { key: "int", name: "Intelligence", effect: "Lets residents craft items with higher Intelligence requirements. It also helps them analyse treasure faster.", training: "For crafting, aim to meet the item's listed requirement. For treasure analysis, the speed benefit increases every 5 Intelligence, starting at 10." },
  { key: "dex", name: "Dexterity", effect: "Helps residents repair damaged buildings and restore wasteland faster.", training: "A resident with 200 Dexterity repairs twice as much damage per repair action as one with 100. Agriculturist doubles the amount of wasteland restored each time a resident works." },
  { key: "gth", name: "Gathering", effect: "Makes attempts to collect resources more likely to succeed. The chance rises from 10% at 0 Gathering to 40% at 999.", training: "With Agriculturist, Gathering also speeds up crop production. Both benefits stop increasing at 999 Gathering." },
  { key: "mov", name: "Move", effect: "Lets residents carry more in a wagon, as well as when hauling materials around town. It does not make them walk faster.", training: "Each point of Move lets a wagon carry one material, one coin, or one stored item. Use the resident's Move value, including equipment bonuses, rather than the stat's level." },
  { key: "hrt", name: "Heart", effect: "Helps residents clear fog faster and improves their chance of completing surveys.", training: "Higher Heart clears more fog with each clearing action. De-Fogger increases how far they can reach instead." },
];

// Graph.Easing strength 0: original float32 divide, multiply and add, then trunc.
function nativeLinear(start: number, end: number, term: number, input: number) {
  if (input < 0) return start;
  if (input >= term) return end;
  const ratio = Math.fround(Math.fround(input) / Math.fround(term));
  return Math.max(start, Math.min(end, Math.trunc(Math.fround(Math.fround(Math.fround(end - start) * ratio) + start))));
}
export function freshFogHp(areaLevel: number): number {
  const level = Math.max(1, Math.trunc(areaLevel));
  const mappedLevel = nativeLinear(1, 100, 499, level - 1);
  return nativeLinear(100, 1000, 99, mappedLevel - 1);
}
export function fogPulses(hp: number, heart: number): number | null {
  if (hp <= 0) return 0;
  return heart > 0 ? Math.ceil(hp / heart) : null;
}
export function wagonMaterialLoad(move: number, stock: number): number {
  return Math.max(0, Math.min(Math.trunc(move), Math.trunc(stock)));
}
