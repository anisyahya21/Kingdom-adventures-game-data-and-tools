import catalog from "./battle-skill-catalog.json";

// Native evidence: Skill.txt + UseSkill 0x15e0c2c, CalcDamage 0x168cf80,
// Attack 0x168d1e8, target predicate 0x15e2240 / range predicate 0x15e2418.
// Original ARM64 checks rerun 2026-10-16. Not a captured original-game fight.
export const ATTACK_SPELLS = catalog.skills.filter((skill) => skill.type === 1);
export const ARROW_SKILLS = catalog.skills.filter((skill) => skill.id === 4 || skill.id === 36);
export const DEFENSIVE_REACTION_SKILLS = catalog.skills
  .filter((skill) => skill.type === 18 || skill.type === 21)
  .sort((left, right) => right.type - left.type || left.value - right.value);
export const ARMOR_BREAKER_TIERS = catalog.skills.filter((skill) => skill.type === 66);

// CalcBuffTurnNum 0x168e760: integer, float32 Easing(2,5,1000,INT,0).
// SkillSystem.Update 0x15ddc04 spends one duration unit every 20 updates;
// Attack 0x168d1e8 also spends one after its hit check succeeds.
export const ARMOR_BREAKER_DURATION_BRACKETS = [
  { minInt: 0, maxInt: 333, duration: 2 },
  { minInt: 334, maxInt: 666, duration: 3 },
  { minInt: 667, maxInt: 999, duration: 4 },
  { minInt: 1000, maxInt: null, duration: 5 },
] as const;
export const STATUS_DURATION_TICKS = 20;
export function projectileFootprint(size: number) {
  const cells: { x: number; y: number }[] = [];
  for (let y = 1 - size; y < size; y++) for (let x = 1 - size; x < size; x++) {
    if (Math.abs(x) + Math.abs(y) < size) cells.push({ x, y });
  }
  return cells;
}
export const MAGIC_TIER_ROWS = ATTACK_SPELLS.filter((skill) => skill.id >= 5 && skill.id <= 9).map((skill, index) => ({
  ...skill, tier: ["I", "II", "III", "IV", "V"][index], cells: projectileFootprint(skill.range).length,
}));

// GetInvocationRate 0x15dff08; native index 0/1/2 is High/Normal/Low.
// Keep rates in the shared mechanics layer, separate from article wording.
export const SKILL_ACTIVATION_RATES = [
  { name: "Attack skills", high: 36, normal: 18, low: 9 },
  { name: "Healing", high: 80, normal: 50, low: 30 },
  { name: "Revival", high: 100, normal: 60, low: 30 },
] as const;

export function damageExample(offense: number, defense: number, critical: boolean) {
  const i32 = (value: number) => value | 0;
  const usedDefense = critical ? Math.trunc(defense / 8) : defense;
  const attackPart = Math.max(1, Math.trunc(i32(offense * 100) / 100));
  const defensePart = Math.trunc(i32(usedDefense * 80) / 100);
  const raw = i32(attackPart - defensePart);
  return { usedDefense, attackPart, defensePart, damage: raw <= 5 ? "1–10" : raw.toLocaleString() };
}
