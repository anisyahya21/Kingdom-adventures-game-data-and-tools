import data from "@/game-data/native-treasure.json";

export const TREASURE_BOXES = data.treasures;
export const TREASURE_MONSTERS = data.monsters;
export const TREASURE_SPECIAL_BOSSES = data.specialBosses;
// CheckTerm kind 3 compares GetRealDayOfWeek; JCalendar uses Sunday=1.
const weekdays = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function specialBossDay(boss: typeof TREASURE_SPECIAL_BOSSES[number]) {
  const term = boss.terms.find(t => t[0] === 3 && t.length === 2);
  return term ? weekdays[term[1]] : undefined;
}
export function chanceLabel(rate: number) {
  const percent = `${rate.toLocaleString(undefined, { maximumFractionDigits: 3 })}%`;
  const inverse = 100 / rate;
  return rate > 0 && rate < 100 && Math.abs(inverse - Math.round(inverse)) < 1e-9 ? `${percent} · 1 in ${Math.round(inverse)}` : percent;
}
export type TreasureBox = typeof TREASURE_BOXES[number];
export const TREASURE_BY_ID = new Map(TREASURE_BOXES.map(box => [box.id, box]));
export const TREASURE_TERRAIN_NAMES: Record<number,string> = {0:"Water",1:"Ground / dirt",2:"Grass",3:"Sand",4:"Rock",5:"Volcano",6:"Snow",7:"Swamp",8:"Snow soil",9:"Desert soil",10:"Volcanic soil",11:"Rocky soil",12:"Swamp soil",13:"Grassland soil"};
export function treasureDisplayName(name:string) { return name.replace(/<pic=([^>]+)>/g,(_,s:string)=>s.charAt(0).toUpperCase()+s.slice(1)).replace(/_/g," ").trim(); }
export function gatheringTerrains(group: number) {
  return data.terrains.filter(t => t.category === 0 && t.dropGroup === group && t.rate > 0);
}
export function gatheringPool(group: number, level: number) {
  return TREASURE_BOXES.filter(box => box.group === group && box.minLevel <= level && box.maxLevel >= level);
}
export function gatheringCheckRates(group: number, type?: number) {
  const rates = gatheringTerrains(group).filter(t=>type===undefined || t.type===type).map(t => Math.min(1000,t.rate)/10);
  return rates.length ? { min:Math.min(...rates),max:Math.max(...rates) } : undefined;
}
export function levelLabel(min: number, max: number) { return min === max ? `${min}` : `${min}–${max}`; }
