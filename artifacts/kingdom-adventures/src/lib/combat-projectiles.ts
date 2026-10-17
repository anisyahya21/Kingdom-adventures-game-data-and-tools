import assets from "@/game-data/combat-projectiles.json";
import { SKILL_BY_ID } from "@/lib/battle-setup";
import { nativeWorldViewPos } from "@/lib/battle-replay";
import type { BattleReplayEvent } from "@/lib/battle-replay-result";

type Vec3 = [number, number, number];
const f = Math.fround;
/** FastMath.Atan2 0x23dd46c reverses its arguments to libm atan2, then
 * adds 180 for negative screen Y; ProjectileSystem adds another 180. */
export function projectileAngle(dx: number, dy: number) {
  const degrees = f(Math.atan2(f(dy), f(dx)) * 180 / Math.PI);
  const wrapped = dy < 0 ? f(degrees + 180) : degrees;
  return Math.trunc(dy < 0 ? f(wrapped + 180) : wrapped) + 90;
}
function vector(value: unknown): Vec3 | null {
  return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v))
    ? value.map(f) as Vec3 : null;
}
function arc(height: number, length: number, frame: number): number {
  if (!length) return 0;
  const t = f(f(frame) / f(length)), fourT = f(t * 4);
  return Math.trunc(f(f(fourT - f(t * fourT)) * f(height)));
}

/** ProjectileSystem 0x15cece0 followed by MoveSystem, float32 throughout.
 * Only presentation is integrated; impact damage always comes from replay events.
 */
export function projectilePosition(start: Vec3, end: Vec3, speed: number, age: number) {
  const delta = end.map((v, i) => f(v - start[i]));
  const distance = f(Math.sqrt(f(f(f(delta[0] * delta[0]) + f(delta[1] * delta[1])) + f(delta[2] * delta[2]))));
  const step = Math.max(1, Math.trunc(speed));
  const length = Math.trunc(f(distance / f(step)));
  const height = Math.min(100, Math.max(20, Math.trunc(f(f(distance * distance) / 100))));
  const velocity = delta.map((d) => distance ? f(f(d / distance) * f(step)) : 0);
  let position: Vec3 = [...start];
  for (let frame = 0; frame <= age; frame++) {
    const y = f(start[1] + arc(height, length, frame));
    const dy = f(f(start[1] + arc(height, length, frame + 1)) - y);
    if (length < 1 || (dy <= 0 && frame >= 1 && y <= end[1])) {
      return { position: [...end] as Vec3, impacted: true, velocity, dy, impactAge: frame };
    }
    position = [f(position[0] + velocity[0]), y, f(position[2] + velocity[2])];
    if (frame === age) return { position, impacted: false, velocity, dy, impactAge: null };
  }
  return null;
}

/** A projectile requires its real launch coordinates and a recovered resource binding. */
export function combatProjectilesAt(events: BattleReplayEvent[], tick: number, rowOffset: number, viewPanX: number) {
  const images = assets.images as Record<string, (typeof assets.images)["27"]>;
  return events.flatMap((event) => {
    if (event.kind !== "projectile_launch" || event.tick > tick || typeof event.skillId !== "number") return [];
    const start = vector(event.start), end = vector(event.end);
    const skill = SKILL_BY_ID.get(event.skillId);
    if (!start || !end || !skill || skill.res !== 28 || skill.seb !== 27) return [];
    const image = images[String(skill.img)];
    const expectedCellHeight = skill.img === 34 ? 16 : 24;
    if (!image || image.cellWidth !== 16 || image.cellHeight !== expectedCellHeight) return [];
    const age = tick - event.tick;
    // Every supported launch has speed 10 (FireProjectile 0x15e1c90); a supplied speed wins.
    const flight = projectilePosition(start, end, typeof event.speed === "number" ? event.speed : 10, age);
    if (!flight) return [];
    const fadeAge = flight.impactAge === null ? 0 : age - flight.impactAge;
    if (flight.impacted && (skill.img !== 27 || fadeAge >= 20)) return [];
    const record = assets.clip.frames[age % assets.clip.maxFrame];
    const cell = Math.floor(record.v / image.cellHeight) * image.columns + Math.floor(record.u / image.cellWidth);
    const parts = image.cells[cell];
    if (!parts) return [];
    const pos = nativeWorldViewPos(...flight.position, rowOffset);
    const [vx, , vz] = flight.velocity;
    const dx = f(vx - vz), dy = f(f(f(vx + vz) * 0.5) - flight.dy);
    const angle = flight.impacted ? 180 : projectileAngle(dx, dy);
    const t = fadeAge / 20;
    const alpha = flight.impacted ? Math.max(0, Math.trunc(255 * (1 - (t - Math.sin(t * Math.PI) / Math.PI))) / 255) : 1;
    return [{ key: `projectile-${event.seq}`, left: pos.x - viewPanX, top: pos.y, angle, alpha,
      file: image.file, parts, transX: record.transX, transY: record.transY }];
  });
}
