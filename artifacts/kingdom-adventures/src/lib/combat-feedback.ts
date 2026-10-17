import feedback from "@/game-data/combat-feedback.json";

/** ProcessAttackEffect 0x168f480 / CreateSkillBalloon 0x15e0620. */
export const COMBAT_FEEDBACK = {
  textLifetime: 30,
  skillLifetime: 20,
  impactLifetime: 9,
  damageHeight: 20,
  statusHeight: 15,
  skillHeight: 50,
  impactHeight: 10,
} as const;

/** Garbage is decremented on the birth tick; the expiry tick is never painted. */
export function feedbackAlive(age: number, lifetime: number): boolean {
  return Number.isInteger(age) && age >= 0 && age < lifetime - 1;
}

/** Tables captured by export_combat_feedback.py from the original drawing routines.
 * EffectSystem advances frame (and number Y) before the end-of-tick draw.
 */
export function feedbackDraw(kind: "damage" | "heal" | "miss" | "critical" | "status" | "stationary" | "skill", age: number, critical = false) {
  const frame = Math.max(0, Math.min(30, Math.trunc(age) + 1));
  // DrawAttackStrEffect animates only selectors 0 and 1..4; 5/6 stay fixed.
  if (kind === "stationary") return { offsetY: -COMBAT_FEEDBACK.statusHeight, scale: 1, alpha: 1 };
  if (kind === "skill") {
    const draw = feedback.tables.skill[Math.min(20, frame)];
    return { offsetY: -COMBAT_FEEDBACK.skillHeight + draw.y, scale: 1, alpha: draw.alpha };
  }
  if (kind === "miss" || kind === "critical" || kind === "status") {
    const draw = feedback.tables[kind][frame];
    return { offsetY: -COMBAT_FEEDBACK.statusHeight + draw.y, scale: 1, alpha: draw.alpha };
  }
  const draw = feedback.tables.damage[frame];
  return {
    offsetY: -COMBAT_FEEDBACK.damageHeight - frame + draw.y,
    scale: Math.trunc(Math.round(draw.scale * 100) * (critical ? 150 : 100) / 100) / 100,
    alpha: draw.alpha,
  };
}

/** ModifyAnimation type 4: six-update monster hit shake, no generic body bounce. */
export function monsterHitOffset(age: number): number {
  if (age < 0 || age >= 6) return 0;
  const offset = Math.trunc((6 - age) / 2);
  return age % 2 ? offset : -offset;
}
