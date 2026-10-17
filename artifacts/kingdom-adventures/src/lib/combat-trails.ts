import nativeDraw from "@/game-data/combat-trails.json";
import { battleCamera } from "@/lib/battle-replay";
import { feedbackAlive } from "@/lib/combat-feedback";
import type { BattleReplayEvent } from "@/lib/battle-replay-result";

function vector(value: unknown, length: number): number[] | null {
  return Array.isArray(value) && value.length === length && value.every((part) => typeof part === "number" && Number.isFinite(part)) ? value : null;
}

/** DrawTrailEffect 0x1560000: fixed birth endpoints, white width-2 line, native alpha. */
export function combatTrailsAt(events: BattleReplayEvent[], tick: number, rowOffset: number, viewPanX: number) {
  const camera = battleCamera(rowOffset);
  return events.flatMap((event) => {
    if (event.kind !== "effect_birth" || event.type !== 17 || event.lifetime !== nativeDraw.source.lifetime) return [];
    const age = tick - event.tick;
    if (!feedbackAlive(age, nativeDraw.source.lifetime)) return [];
    const position = vector(event.position, 3), previous = vector(event.screen, 2);
    if (!position || !previous) return [];
    const [x,y,z] = position.map(Math.fround);
    const screenX = Math.trunc(Math.fround(x-z));
    const screenY = Math.trunc(Math.fround(Math.fround(Math.fround(x+z)*0.5)-y));
    return [{key:`trail-${event.seq}`,x1:screenX-camera.x-viewPanX,y1:screenY-camera.y,
      x2:previous[0]-camera.x-viewPanX,y2:previous[1]-camera.y,
      width:2,alpha:nativeDraw.frames[age+1].alpha}];
  });
}
