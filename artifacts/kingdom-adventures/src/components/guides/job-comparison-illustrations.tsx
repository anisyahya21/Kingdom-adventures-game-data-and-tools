import { ArrowRight, Check, LockKeyhole, MapPinned, Sprout } from "lucide-react";
import { AffinityBadge } from "@/components/ka/badges";
import { CombatSkillBadge, canUseCombatSkill, combatSkills } from "@/components/guides/combat-skill-access";
import { getJobsForBuilding } from "@/game-data/job-buildings";
import { parseJobNeedExpProfiles, type JobParameterKey } from "@/game-data/job-needexp";
import { jobCurveFor, statAtLevel, type SharedLoadoutData } from "@/lib/battle-legality";
import { localSharedData } from "@/lib/local-shared-data";
import { getRankIcon } from "@/lib/rank-icons";
import rawJobs from "../../../../../data/Sheet csv/KA GameData - Job.csv?raw";

const needExp = new Map(parseJobNeedExpProfiles(rawJobs).map(profile => [profile.name, profile.needExpByParameter]));
const maxLevel = 999;
const formatValue = new Intl.NumberFormat("en-US");

function level999(job: string, stat: "hp" | "def" | "int") {
  const curve = jobCurveFor(localSharedData as SharedLoadoutData, job, "S")[stat];
  return curve ? statAtLevel(curve.base, curve.inc, maxLevel) : undefined;
}

function ExpTrack({ value }: { value: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-[3em] font-semibold tabular-nums">{value}%</span>
      <span className="grid w-full max-w-[8rem] grid-cols-4 gap-0.5" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className={`h-2 rounded-sm ${value >= (index + 1) * 50
            ? index < 2 ? "bg-primary/65" : "bg-amber-600 dark:bg-amber-400"
            : "bg-muted"}`} />
        ))}
      </span>
    </span>
  );
}

export function JobExpComparison() {
  const jobs = ["Champion", "Beast Tamer", "Wizard"];
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">Raise Defense by one level</figcaption>
      <dl className="divide-y divide-border border-y border-border">
        {jobs.map(job => {
          const value = needExp.get(job)?.DEF;
          return value === undefined ? null : (
            <div key={job} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-2.5">
              <dt className="font-medium">{job}</dt><dd><ExpTrack value={value} /></dd>
            </div>
          );
        })}
      </dl>
      <p className="text-sm text-muted-foreground">For the same Defense level-up, Wizard needs twice as much EXP as Champion. Beast Tamer sits between them.</p>
    </figure>
  );
}

type Pair = { jobA: string; jobB: string; children: string[]; affinity: string };
const pairs = localSharedData.pairs as Pair[];

export function MarriageCompatibilityComparison() {
  const parent = "Mage";
  const partners = ["Carpenter", "Farmer"];
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">Two pairings that can produce Magic Knight</figcaption>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <div className="grid gap-2">
          {partners.map(partner => {
            const pair = pairs.find(row => [row.jobA, row.jobB].includes(parent) && [row.jobA, row.jobB].includes(partner));
            if (!pair?.children.includes("Magic Knight")) return null;
            return (
              <div key={partner} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="font-medium">{partner} + {parent}</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">Compatibility <AffinityBadge affinity={pair.affinity} /></span>
              </div>
            );
          })}
        </div>
        <ArrowRight aria-hidden="true" className="hidden size-5 text-primary sm:block" />
        <div className="border-l-2 border-primary pl-3">
          <p className="text-sm text-muted-foreground">Child job in both pairings</p>
          <p className="font-semibold">Magic Knight</p>
        </div>
      </div>
    </figure>
  );
}

const farmerPlots = [
  { building: "Orchard", icon: Sprout },
  { building: "Survey Corps HQ", icon: MapPinned },
];

export function FarmerBuildingComparison() {
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">C-rank and B-rank Farmer: what can each build?</figcaption>
      <div className="grid gap-3 sm:grid-cols-2">
        {["C", "B"].map(rank => (
          <div key={rank} className="space-y-2 border-t border-border pt-2">
            <h3 className="flex items-center gap-1.5 font-medium">
              <img src={getRankIcon(rank)} alt={rank} className="h-5 w-auto [image-rendering:pixelated]" /> Rank Farmer
            </h3>
            <dl className="space-y-2">
              {farmerPlots.map(({ building, icon: Icon }) => {
                const minimum = getJobsForBuilding(building).find(owner => owner.jobName === "Farmer")?.rankNote?.match(/Rank ([DCBAS])\+/)?.[1];
                if (!minimum) return null;
                const order = "DCBAS";
                const allowed = order.indexOf(rank) >= order.indexOf(minimum);
                const Status = allowed ? Check : LockKeyhole;
                return (
                  <div key={building} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-2 ${allowed ? "border-primary/30 bg-primary/10" : "border-border bg-muted/35 text-muted-foreground"}`}>
                    <Icon aria-hidden="true" className="size-4" />
                    <dt className="text-sm font-medium">{building}</dt>
                    <dd><Status aria-hidden="true" className="size-4" /><span className="sr-only">{allowed ? "Can build" : "Cannot build"}</span></dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">C rank already opens the Orchard. B rank adds Survey Corps HQ.</p>
    </figure>
  );
}

const spreadJobs = ["Paladin", "Samurai", "Beast Tamer"];
const spreadStats = [
  { stat: "def", label: "Defense" },
  { stat: "hp", label: "HP" },
  { stat: "int", label: "Intelligence" },
] as const;

export function Level999StatComparison() {
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">Three S-rank jobs at level 999</figcaption>
      <div className="grid gap-3 sm:grid-cols-3">
        {spreadStats.map(({ stat, label }) => {
          const rows = spreadJobs.flatMap(job => {
            const value = level999(job, stat);
            return value === undefined ? [] : [{ job, value }];
          });
          if (rows.length < 2) return null;
          const low = Math.min(...rows.map(row => row.value));
          const high = Math.max(...rows.map(row => row.value));
          return (
            <div key={stat} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <h3 className="font-semibold">{label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{formatValue.format(high - low)} from lowest to highest</p>
              <dl className="mt-2 divide-y divide-border border-t border-border">
                {rows.map(({ job, value }) => (
                  <div key={job} className="flex justify-between gap-2 py-1.5 text-sm">
                    <dt>{job}</dt><dd className="font-semibold tabular-nums">{formatValue.format(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export function MagicRoleComparison() {
  const skill = combatSkills[0];
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">Two jobs that can use Magic</figcaption>
      <div className="grid gap-3 sm:grid-cols-2">
        {["Wizard", "Champion"].map(job => {
          const int = level999(job, "int");
          return (
            <div key={job} className="space-y-2 border-t border-border py-2">
              <h3 className="font-semibold">{job}</h3>
              <p><strong className="text-xl tabular-nums">{int === undefined ? "—" : formatValue.format(int)}</strong> <span className="text-sm text-muted-foreground">INT at S rank, level 999</span></p>
              <CombatSkillBadge skill={skill} allowed={canUseCombatSkill(job, skill.key)} />
            </div>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">Wizard has more INT at level 999. Champion can also equip the Attack skills used for open-map training.</p>
    </figure>
  );
}

export function First999TrainingComparison() {
  const jobs = ["Champion", "Beast Tamer"];
  const stats: { key: JobParameterKey; label: string }[] = [{ key: "HP", label: "HP" }, { key: "INT", label: "INT" }];
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">Two first-999 picks with opposite training costs</figcaption>
      <table className="w-full border-y border-border text-left text-sm">
        <thead><tr><th scope="col" className="px-2 py-2">Stat</th>{jobs.map(job => <th key={job} scope="col" className="px-2 py-2">{job}</th>)}</tr></thead>
        <tbody className="divide-y divide-border border-t border-border">
          {stats.map(({ key, label }) => (
            <tr key={key}><th scope="row" className="px-2 py-2 font-medium">{label}</th>
              {jobs.map(job => {
                const value = needExp.get(job)?.[key];
                return <td key={job} className="px-2 py-2">{value === undefined ? "—" : <ExpTrack value={value} />}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-muted-foreground">Both can use Attack, Magic, and Healing. Champion needs less EXP for HP, while Beast Tamer needs less EXP for INT.</p>
    </figure>
  );
}
