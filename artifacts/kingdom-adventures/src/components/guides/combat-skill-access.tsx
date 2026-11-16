import { Check, LockKeyhole } from "lucide-react";
import { getResolvedSkillAccess, type JobSkillAccessLike, type SkillAccessKey } from "@/game-data/job-skills";
import { localSharedData } from "@/lib/local-shared-data";
import { getSkillIcon } from "@/lib/skill-icons";

export const combatSkills = [
  { key: "attack", label: "Attack", example: "Area Attack", tone: "border-orange-500/35 bg-orange-500/10 text-orange-900 dark:text-orange-200" },
  { key: "attackMagic", label: "Magic", example: "Fire Magic Ⅰ", tone: "border-violet-500/35 bg-violet-500/10 text-violet-900 dark:text-violet-200" },
  { key: "recovery", label: "Healing", example: "Heal M", tone: "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200" },
] as const;
export const accessJobs = ["Archer", "Carpenter", "Champion"];
const accessJobData = localSharedData.jobs as Record<string, JobSkillAccessLike>;
export type CombatSkill = (typeof combatSkills)[number];

export function canUseCombatSkill(job: string, key: SkillAccessKey) {
  // The guide's Archer example explicitly limits access to Attack skills.
  if (job === "Archer") return key === "attack";
  return getResolvedSkillAccess(job, accessJobData[job] ?? {}, "A")[key] === "can";
}

function SkillArt({ skill }: { skill: CombatSkill }) {
  const icon = getSkillIcon(skill.example);
  return icon && <img src={icon} alt="" width={24} height={24} className="size-6 shrink-0 object-contain [image-rendering:pixelated]" />;
}

export function CombatSkillBadge({ skill, allowed }: { skill: CombatSkill; allowed: boolean }) {
  const Symbol = allowed ? Check : LockKeyhole;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm font-medium ${allowed ? skill.tone : "border-border bg-muted/50 text-muted-foreground"}`}>
      {allowed && <SkillArt skill={skill} />}
      <span>{skill.label}</span>
      <Symbol className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">{allowed ? "available" : "locked"}</span>
    </span>
  );
}

export function CombatJobComparison() {
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">Combat skills each job can equip</figcaption>
      <dl className="divide-y divide-border border-y border-border">
        {accessJobs.map(name => (
          <div key={name} className="grid gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
            <dt className="font-semibold">{name}</dt>
            <dd className="flex flex-wrap gap-2">
              {combatSkills.map(type => <CombatSkillBadge key={type.key} skill={type} allowed={canUseCombatSkill(name, type.key)} />)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Check className="size-4" aria-hidden="true" /> Can equip</span>
        <span className="inline-flex items-center gap-1"><LockKeyhole className="size-4" aria-hidden="true" /> Cannot equip</span>
      </p>
    </figure>
  );
}

export function CombatSkillTypes() {
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">Check the skill type before you pick a job</figcaption>
      <dl className="grid gap-3 sm:grid-cols-3">
        {combatSkills.map(type => (
          <div key={type.key} className={`rounded-xl border p-4 ${type.tone}`}>
            <dt className="flex items-center gap-2 font-semibold"><SkillArt skill={type} />{type.label}</dt>
            <dd className="mt-2 text-sm">Example: {type.example}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">Then check whether the job can equip that type. Archer can equip Attack skills like Area Attack.</p>
    </figure>
  );
}
