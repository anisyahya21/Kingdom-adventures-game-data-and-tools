import sprites from "@/game-data/monster-sprites.json";

// Original map body poses, linked by Monster.img; no portrait/icon fallbacks.
const byName = new Map(sprites.map(sprite => [sprite.name, sprite]));
export function getMonsterSprite(name: string | undefined) {
  return name ? byName.get(name) : undefined;
}
