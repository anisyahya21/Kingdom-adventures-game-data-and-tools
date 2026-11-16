import itemCsv from "../../../../data/sheet-research/raw-copies/KA GameData - Item.csv?raw";
import { BRIEFING_MISSION_TEMPLATES } from "@/game-data/briefing-room";
import { parseCsv } from "@/lib/csv";
import { JOB_SKILL_DATA } from "@/lib/generated-job-skill-data";
import { localSharedData } from "@/lib/local-shared-data";
import { matchesLooseSearch } from "@/lib/search-normalize";
import { normalizeRewardName, REWARD_TARGETS, rewardKey, type RewardTarget, type RewardType } from "@/lib/treasure-source-graph";

const targets = new Map(REWARD_TARGETS.map((target) => [rewardKey(target.type, target.name), target]));
const jobsBySkill = new Map<string, Map<string, string[]>>();
const itemIdsByName = new Map<string, Set<number>>();
const briefingRewardIds = new Set(BRIEFING_MISSION_TEMPLATES.map((mission) => mission.rewardId));

function addCatalogEntry(type: RewardType, name: string) {
  const key = rewardKey(type, name);
  if (key && !targets.has(key)) targets.set(key, { type, name, profileCount: 0, directCount: 0 });
  return key;
}

const skills = localSharedData.skills as Record<string, { name: string }>;
for (const skill of Object.values(skills)) addCatalogEntry("skill", skill.name);

for (const [job, byRank] of Object.entries(JOB_SKILL_DATA)) {
  for (const [rank, names] of Object.entries(byRank)) {
    for (const name of names) {
      const key = addCatalogEntry("skill", name);
      let jobs = jobsBySkill.get(key);
      if (!jobs) jobsBySkill.set(key, jobs = new Map());
      const ranks = jobs.get(job) ?? [];
      if (!ranks.includes(rank)) jobs.set(job, [...ranks, rank]);
    }
  }
}

const [itemHeader, ...itemRows] = parseCsv(itemCsv);
const itemNameColumn = itemHeader.indexOf("name");
const itemIdColumn = itemHeader.indexOf("id");
for (const row of itemRows) {
  const name = row[itemNameColumn]?.replace(/<br\s*\/?>/gi, " ").trim();
  const rawId = row[itemIdColumn];
  if (!name || name.toLowerCase() === "not used" || !/^\d+$/.test(rawId)) continue;
  const key = addCatalogEntry("item", name);
  const ids = itemIdsByName.get(key) ?? new Set<number>();
  ids.add(Number(rawId));
  itemIdsByName.set(key, ids);
}

export const ITEM_SOURCE_CATALOG = [...targets.values()]
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.type.localeCompare(b.type));

export function findCatalogEntries(query: string, type: RewardType | "all"): RewardTarget[] {
  const search = normalizeRewardName(query);
  const matches = ITEM_SOURCE_CATALOG.filter((target) =>
    (type === "all" || type === target.type) && matchesLooseSearch(normalizeRewardName(target.name), search),
  );
  if (!search) return matches;
  const priority = ({ name }: RewardTarget) => {
    const normalized = normalizeRewardName(name);
    return normalized === search ? 0 : normalized.startsWith(search) ? 1 : 2;
  };
  return matches.sort((a, b) => priority(a) - priority(b));
}

export function jobsWithSkill(name: string) {
  return [...(jobsBySkill.get(rewardKey("skill", name)) ?? [])];
}

export function isBriefingReward(name: string) {
  return [...(itemIdsByName.get(rewardKey("item", name)) ?? [])].some((id) => briefingRewardIds.has(id));
}
