import { attackFrameFromSpeed } from "@/lib/combat-simulator";

export type CombatSpeedBracket = {
  /** Inclusive speed bounds. A null maximum represents the open-ended fastest bracket. */
  min: number;
  max: number | null;
  attackFrames: number;
  value: string;
  label: string;
};

function attackFramesAt(speed: number): number {
  return Math.floor(attackFrameFromSpeed(speed));
}

/** Find the first integer speed whose floored attack interval is at most this many frames. */
function firstSpeedAtMost(frameLimit: number): number {
  let high = 1;
  while (attackFramesAt(high) > frameLimit) high *= 2;

  let low = 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (attackFramesAt(middle) <= frameLimit) high = middle;
    else low = middle + 1;
  }
  return low;
}

function buildCombatSpeedBrackets(): CombatSpeedBracket[] {
  const slowestFrames = attackFramesAt(1);
  const brackets: CombatSpeedBracket[] = [];

  // The referenced formula rounds attack frames down. Each bracket groups integer speeds with the
  // same rounded attack interval, including the low-speed ranges before the known 315 breakpoint.
  for (let attackFrames = slowestFrames; attackFrames >= 0; attackFrames -= 1) {
    // The shared combat helper clamps speed to 1, so speed 0 has the same interval as speed 1.
    const min = attackFrames === slowestFrames ? 0 : firstSpeedAtMost(attackFrames);
    const max = attackFrames === 0 ? null : firstSpeedAtMost(attackFrames - 1) - 1;
    if (max !== null && max < min) continue;

    const bounds = max === null
      ? `${min.toLocaleString()}+`
      : min === max
        ? min.toLocaleString()
        : `${min.toLocaleString()}-${max.toLocaleString()}`;
    brackets.push({
      min,
      max,
      attackFrames,
      value: String(min),
      label: bounds,
    });
  }

  return brackets;
}

/**
 * Integer speed ranges that share one round-down attack interval, ordered from slowest to fastest.
 * The formula is documented in `data/sheet-research/raw-copies/KA GameData - Formula - FAQ.csv`;
 * this module derives ranges from the shared combat helper instead of maintaining cutoffs by hand.
 */
export const COMBAT_SPEED_BRACKETS = buildCombatSpeedBrackets();
