import { parseJobNeedExpProfiles } from "@/game-data/job-needexp";
import rawJobs from "../../../../../data/Sheet csv/KA GameData - Job.csv?raw";

const profiles = new Map(parseJobNeedExpProfiles(rawJobs).map(profile => [profile.name, profile.needExpByParameter]));
const jobs = ["Champion", "Beast Tamer", "Wizard"];
const rows = jobs.flatMap(job => {
  const cost = profiles.get(job)?.DEF;
  return cost === undefined ? [] : [{ job, cost }];
});
const baseline = profiles.get("Champion")?.DEF;
const largest = Math.max(...rows.map(row => row.cost));
const formatExp = new Intl.NumberFormat("en-US");

// Exp.txt rows 1–998, summed after applying JobData.GetParamNeedExp's
// integer division by 100 to each row. At level 999, no further EXP is needed.
const totalExpByCost = new Map([
  [100, 95_040_115],
  [150, 142_560_035],
  [200, 190_080_230],
]);

export function DefenseExpComparison() {
  if (baseline === undefined || rows.length !== jobs.length) return null;
  return <figure data-defense-exp-comparison className="space-y-4 border-y border-border py-5">
    <figcaption>
      <h3 className="font-semibold">Defense EXP from level 1 to 999</h3>
      <p className="mt-1 text-sm text-muted-foreground">Champion’s cost is the starting point. The striped part is the extra EXP the other job needs.</p>
    </figcaption>
    <dl className="space-y-4">
      {rows.map(row => {
        const extra = row.cost - baseline;
        const totalExp = totalExpByCost.get(row.cost);
        return <div key={row.job} className="grid gap-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center sm:gap-4">
          <dt className="font-medium">{row.job}</dt>
          <dd>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{row.cost}% rate</span>
              {totalExp !== undefined && <strong className="tabular-nums">{formatExp.format(totalExp)} EXP</strong>}
            </div>
            <div className="relative flex h-9 w-full border-r border-border bg-muted/40" aria-hidden="true">
              <span className="flex h-full items-center justify-center bg-primary/80 text-sm font-semibold text-primary-foreground" style={{ width: `${baseline / largest * 100}%` }}>100%</span>
              {extra > 0 && <span className="flex h-full items-center justify-center border-y border-r border-amber-700/60 bg-amber-400/25 text-sm font-semibold text-amber-950 dark:border-amber-300/60 dark:text-amber-100"
                style={{ width: `${extra / largest * 100}%`, backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 5px, rgb(180 110 0 / .15) 5px, rgb(180 110 0 / .15) 7px)" }}>+{extra}%</span>}
              <span className="pointer-events-none absolute inset-y-0 border-l border-dashed border-foreground/35" style={{ left: `${baseline / largest * 100}%` }} />
            </div>
          </dd>
        </div>;
      })}
    </dl>
  </figure>;
}
