import type { ProfileWorkerInput } from "./profile-goal-worker-protocol";
import type { ResearchBankGroup } from "./research-strategy-bank";
import type { ChestStrategyOption } from "./chest-strategy-targets";

/** Broad independent bounds exclude unreachable targets, never prove a gear match.
 * Ten percent here is a search-nearness filter, not a safe combat tolerance. */
export function compatibleResearchTargets(input: ProfileWorkerInput, groups: ResearchBankGroup[]): ChestStrategyOption[] {
  const stats = ["atk", "spd", "lck", "dex"];
  const bounds = input.characters.filter(c => c.available && c.eligible).map(c => {
    const low = stats.map(s => c.input.baseStats[s] ?? 0), high = [...low];
    for (const slot of c.input.slots) {
      const items = new Set(slot.items), minimum = [0,0,0,0], maximum = [0,0,0,0];
      for (const [key, contribution] of Object.entries(c.contributions)) {
        if (!items.has(key.slice(0,key.lastIndexOf("|")))) continue;
        stats.forEach((s,i) => { minimum[i]=Math.min(minimum[i],contribution[s] ?? 0); maximum[i]=Math.max(maximum[i],contribution[s] ?? 0); });
      }
      stats.forEach((_,i) => { low[i]+=minimum[i]; high[i]+=maximum[i]; });
    }
    return {low,high};
  });
  const byTuple = new Map<string, ResearchBankGroup>();
  for (const group of groups) {
    // Small exploratory samples remain browsable, but are not automatic targets.
    if (group.n < 20 || !bounds.some(b => group.stats.every((v,i) => b.low[i] <= v*1.1 && b.high[i] >= v*0.9))) continue;
    const key=group.stats.join(":"), old=byTuple.get(key);
    if (!old || group.n>old.n || group.n===old.n && group.id.localeCompare(old.id)<0) byTuple.set(key,group);
  }
  return [...byTuple.values()].sort((a,b) => Number(b.n>=200)-Number(a.n>=200) || b.mean-a.mean || a.id.localeCompare(b.id)).map(g => ({
    id:`research:${g.id}`,encounter:g.encounter,atk:g.stats[0],spd:g.stats[1],lck:g.stats[2],dex:g.stats[3],
    mean:g.mean,highest:g.highest,median:g.median,n:g.n,lowAtMost1:g.low,defeats:g.defeats,
    meanDpsMp:g.meanDpsMp ?? undefined,meanHealerMp:g.meanHealerMp ?? undefined,
    source:"Exact sufficient-MP cohort",sourceCohort:g.cohortId ?? g.id,setupId:g.profileId ?? undefined,mpMode:"sufficient",
    status:g.n<200 ? "Exploratory cohort; nearby stats unmeasured" : "Measured cohort; nearby stats unmeasured",
  }));
}
