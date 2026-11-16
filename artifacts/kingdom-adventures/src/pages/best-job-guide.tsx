import { Children, createContext, isValidElement, useContext, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Check, LockKeyhole, Zap } from "lucide-react";
import { Link } from "wouter";
import { PageHeader } from "@/components/ka/page-header";
import { ToolIdentityArtwork } from "@/components/ka/tool-identity";
import { CombatJobComparison, CombatSkillTypes } from "@/components/guides/combat-skill-access";
import { ActionRangesIllustration } from "@/components/guides/action-ranges-illustration";
import { DefenseExpComparison } from "@/components/guides/defense-exp-comparison";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WEAPON_ACCESS_CLASS } from "@/game-data/job-equipment";
import { getEquipmentIcon } from "@/lib/equipment-icons";
import { localSharedData } from "@/lib/local-shared-data";
import { getRankIcon } from "@/lib/rank-icons";
import { getSkillIcon } from "@/lib/skill-icons";
import { getStatIcon } from "@/lib/stat-icons";

const sharedTraits = [
  "All jobs share the same 12 stats.",
  "All jobs can reach a max of 9 skill slots.",
  "All jobs can fight and do nearly anything when given the required skills. In example, treasure analysis is not unique to merchants, give that skill to any other job and they will analyze treasure, research is not unique to researcher, and the construction chief bonus a carpenter has is not unique to them, not only can these skills be added to any other job and grant them that access, but it can be stripped from the original job, a researcher can't research without the skill, and a merchant can not treasure analyze if you strip them from that skill.",
  "An archer has no bonus when using a bow, and isn't better at it than any other job, a gunner is not better at using a gun than other jobs, and has no advantage for using it.",
];

const buildingExamples = [
  ["A.", "Only mage can build a skill shop, Only Monk can build a church/recovery room."],
  ["B.", "Only B+ Carpenter, Farmer, Merchant, Mover, Rancher can build a Survey Corps HQ, so only those have access to surveying."],
  ["C.", "Only C+ Farmer can build on orchard."],
  ["D.", "Rancher is the only job that can build a Monster house, which can hold 2 more monster rooms, allowing a rancher to bring 5 monsters to a fight, while all other jobs can bring a max of 3."],
];

const hpExamples = [
  ["Paladin", "Max level 30,", "Max value 332"],
  ["Champion", "Max level 30,", "Max value 381"],
  ["Viking", "Max level 30,", "Max value 342"],
  ["Artist", "Max level 25,", "Max value 243"],
];
const hpIcon = getStatIcon(localSharedData.statIcons as Record<string, string>, "hp");
const shieldIcon = getEquipmentIcon(null, "F/ Wooden Shield");
const shieldResistanceIcon = getSkillIcon("Shield Resistance");
const equipmentStates = [
  { key: "can", label: "Can equip", effect: "Full equipment stats", fill: "w-full bg-green-600 dark:bg-green-400" },
  { key: "weak", label: "Weak", effect: "Half the equipment stats", fill: "w-1/2 bg-amber-600 dark:bg-amber-400" },
  { key: "cannot", label: "Cannot equip", effect: "Equipment is locked" },
] as const;
const formatHpLevel = (text: string) => text.replace(/^Max level (\d+),?$/, "$1");
const formatHpValue = (text: string) => text.replace(/^Max value (\d+)$/, "$1");

function formatHpIntro(text: string) {
  const match = /\bD(?=\s+rank\b)/i.exec(text);
  const icon = getRankIcon("D");
  if (!match || !icon) return text;
  return (
    <>
      {text.slice(0, match.index)}
      <img src={icon} alt={match[0]} className="inline h-[1.35em] w-auto align-[-0.26em] object-contain" style={{ imageRendering: "pixelated" }} />
      {text.slice(match.index + match[0].length)}
    </>
  );
}

function EquipmentAccessStates() {
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">What equipment access means</figcaption>
      <dl className="grid gap-2 sm:grid-cols-3">
        {equipmentStates.map(state => (
          <div key={state.key} className="space-y-2 rounded-lg border border-border bg-card p-3">
            <dt><span className={`inline-flex rounded-md border px-2 py-0.5 text-sm font-semibold ${WEAPON_ACCESS_CLASS[state.key]}`}>{state.label}</span></dt>
            <dd className="space-y-2 text-sm">
              <p>{state.effect}</p>
              {"fill" in state ? (
                <div className="h-2 rounded-full bg-muted" aria-hidden="true">
                  <div className={`h-full rounded-full ${state.fill}`} />
                </div>
              ) : <LockKeyhole className="size-4 text-muted-foreground" aria-hidden="true" />}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

function ArcherShieldExample() {
  return (
    <figure className="space-y-3">
      <figcaption className="font-semibold">What Shield Resistance changes for an Archer</figcaption>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-stretch">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
          <LockKeyhole className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div><p className="text-sm text-muted-foreground">Before</p><p className="font-semibold">Cannot equip a shield</p></div>
        </div>
        <div className="flex items-center justify-center gap-2 px-1 py-1.5 text-sm font-medium sm:flex-col sm:text-center">
          {shieldResistanceIcon && <img src={shieldResistanceIcon} alt="" className="size-6 object-contain [image-rendering:pixelated]" />}
          <span>Equip Shield Resistance</span>
          <ArrowDown className="size-4 shrink-0 text-primary sm:hidden" aria-hidden="true" />
          <ArrowRight className="hidden size-4 shrink-0 text-primary sm:block" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
          {shieldIcon && <img src={shieldIcon} alt="" className="size-8 shrink-0 object-contain [image-rendering:pixelated]" />}
          <div>
            <p className="text-sm text-muted-foreground">After</p>
            <p className="flex items-center gap-1 font-semibold">Can equip a shield <Check className="size-4 shrink-0 text-primary" aria-hidden="true" /></p>
          </div>
        </div>
      </div>
    </figure>
  );
}

const sectionClass = "mt-12 scroll-mt-24 space-y-5 border-t pt-8";
const topicClass = "space-y-4 border-t border-border pt-7 [&+section]:mt-7";
const headingClass = "scroll-mt-24 text-xl font-semibold leading-snug tracking-tight sm:text-2xl";
const calloutClass = "space-y-3 border-l-2 border-primary pl-4";
const tableClass = "w-full text-left text-sm [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_tr:not(:last-child)]:border-b";
const draftKey = "ka-best-job-guide-local-edits";
const draftRevisionKey = "$revision";
const draftRevision = "food-training-v2";
type DraftEdits = Record<string, string>;
const renumberedDifferences = [
  "starting-skills", "buildings-intro", "combat-access", "equipment-access",
  "action-ranges", "exp-cost", "stat-growth",
];

const DraftEditor = createContext<{
  enabled: boolean;
  edits: DraftEdits;
  active: string | null;
  setActive: (id: string | null) => void;
  save: (id: string, text: string) => boolean;
} | null>(null);

function readDraftEdits(): DraftEdits {
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey) ?? "{}");
    const edits = Object.fromEntries(Object.entries(stored).filter(([key, value]) => key !== draftRevisionKey && typeof value === "string")) as DraftEdits;
    if (stored[draftRevisionKey] !== draftRevision) delete edits["food-training"];
    renumberedDifferences.forEach((id, index) => {
      if (edits[id] !== undefined) {
        edits[id] = edits[id].replace(new RegExp(`^${index + 1}[.)](?=\\s)`), `${index + 2}.`);
      }
    });
    if (edits["equipment-resistance"] !== undefined) {
      edits["equipment-resistance"] = edits["equipment-resistance"].replace(/\bcross ponding\b/g, "corresponding");
    }
    if (edits["defense-spread"] !== undefined) {
      edits["defense-spread"] = edits["defense-spread"].replace(/\+\s*-\s*/g, "± ");
    }
    return edits;
  } catch {
    return {};
  }
}

function renderEditedText(text: string, original: ReactNode) {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const child of Children.toArray(original)) {
    if (!isValidElement<{ children: ReactNode }>(child)) continue;
    const phrase = child.props.children;
    if (typeof phrase !== "string" || !phrase) continue;
    const start = text.indexOf(phrase, offset);
    if (start < 0) continue;
    parts.push(text.slice(offset, start), child);
    offset = start + phrase.length;
  }
  parts.push(text.slice(offset));
  return parts;
}

function DraftText({ id, className, children, format, as: Tag = "p" }: {
  id: string;
  className?: string;
  children: ReactNode;
  format?: (text: string) => ReactNode;
  as?: "p" | "h2" | "h3";
}) {
  const editor = useContext(DraftEditor)!;
  const content = useRef<HTMLElement | null>(null);
  const originalValue = useRef("");
  const [value, setValue] = useState("");
  const [failed, setFailed] = useState(false);
  const editing = editor.enabled && editor.active === id;
  const savedText = editor.edits[id];
  const plainText = savedText ?? (typeof children === "string" ? children : undefined);

  if (editing) {
    return (
      <form id={id} className="space-y-2 text-left" onSubmit={event => {
        event.preventDefault();
        if (value === originalValue.current) {
          editor.setActive(null);
        } else {
          setFailed(!editor.save(id, value));
        }
      }}>
        <textarea
          autoFocus
          aria-label="Draft text"
          className="min-h-24 w-full min-w-0 rounded-md border bg-background p-2 text-sm font-normal text-foreground"
          value={value}
          onChange={event => setValue(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="submit">Save locally</Button>
          <Button size="sm" type="button" variant="outline" onClick={() => editor.setActive(null)}>Cancel</Button>
        </div>
        {failed && <p role="alert">This browser couldn’t save the edit. Your text is still in the editor.</p>}
      </form>
    );
  }

  return (
    <Tag id={id} className={className}>
      <span ref={node => { content.current = node; }} className={savedText === undefined ? undefined : "whitespace-pre-wrap"}>
        {format && plainText !== undefined && !editor.enabled
          ? format(plainText)
          : savedText === undefined ? children : renderEditedText(savedText, children)}
      </span>
      {editor.enabled && (
        <button type="button" disabled={editor.active !== null} className="ml-2 rounded border px-2 py-0.5 text-xs font-medium disabled:opacity-50"
          onClick={() => {
            const text = plainText ?? content.current?.innerText.trim() ?? "";
            originalValue.current = text;
            setValue(text);
            setFailed(false);
            editor.setActive(id);
          }}>
          Edit
        </button>
      )}
    </Tag>
  );
}

export default function BestJobGuidePage() {
  const [enabled, setEnabled] = useState(false);
  const [edits, setEdits] = useState(() => import.meta.env.DEV ? readDraftEdits() : {});
  const [active, setActive] = useState<string | null>(null);
  function save(id: string, text: string) {
    const next = { ...edits, [id]: text };
    try {
      localStorage.setItem(draftKey, JSON.stringify({ ...next, [draftRevisionKey]: draftRevision }));
    } catch {
      return false;
    }
    setEdits(next);
    setActive(null);
    return true;
  }

  return (
    <DraftEditor.Provider value={{ enabled, edits, active, setActive, save }}>
    <article className="mx-auto max-w-3xl px-4 py-6 leading-relaxed sm:px-6 sm:py-10">
      <Link href="/guides" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All guides
      </Link>
      {import.meta.env.DEV && <div className="mb-4 flex flex-wrap items-center gap-3">
        {enabled && <Link href="/guides/what-is-the-best-job/designs" className="text-sm text-primary underline underline-offset-4">Design previews</Link>}
        <Button type="button" size="sm" variant="outline" aria-pressed={enabled} onClick={() => {
          if (active) return;
          setEnabled(!enabled);
        }} disabled={active !== null}>
          {enabled ? "Done editing" : "Edit local draft"}
        </Button>
        {enabled && <span className="text-sm text-muted-foreground">Edits are saved in this browser.</span>}
      </div>}
      <PageHeader title="What is the best Job.">
        <DraftText id="intro">Before answering what the best job is, you first need to understand the difference between jobs.</DraftText>
      </PageHeader>

      <nav aria-label="In this guide" className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 text-sm">
        <a className="text-primary underline-offset-4 hover:underline" href="#jobs-same">What jobs share</a>
        <a className="text-primary underline-offset-4 hover:underline" href="#jobs-different">What changes by job</a>
        <a className="text-primary underline-offset-4 hover:underline" href="#best-job">Choosing a job</a>
        <a className="text-primary underline-offset-4 hover:underline" href="#first-999">Your first 999</a>
      </nav>

      <section className="mt-8 space-y-4" aria-labelledby="jobs-same">
        <DraftText as="h2" id="jobs-same" className={headingClass}>First how are Jobs the same:</DraftText>
        <ul className="grid gap-3 sm:grid-cols-2">
          {sharedTraits.map((text, index) => (
            <li key={text} className={index >= 2 ? "sm:col-span-2" : undefined}>
              <div className={index < 2 ? "h-full border-l-2 border-primary bg-muted/40 p-4" : "space-y-4 py-2"}>
                  <DraftText id={`shared-${index}`}>{index < 2 ? <strong>{text}</strong> : text}</DraftText>
                  {index === 2 && (
                    <table className={`${tableClass} border-t border-border`}>
                      <caption className="pb-2 text-left font-semibold">Equipping and changing skills</caption>
                      <thead className="border-b border-border bg-muted">
                        <tr><th scope="col">Skill change</th><th scope="col">What it means</th></tr>
                      </thead>
                      <tbody>
                        <tr><th scope="row">Equip a skill</th><td>Gain the ability</td></tr>
                        <tr><th scope="row">Remove a skill</th><td>Lose the ability</td></tr>
                        <tr><th scope="row">Starting skills</th><td>Can be replaced</td></tr>
                      </tbody>
                    </table>
                  )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={sectionClass} aria-labelledby="jobs-different">
        <DraftText as="h2" id="jobs-different" className={headingClass}>How are jobs different and this is much more important:</DraftText>
        <section aria-label="Marriage and children" className="space-y-4 pt-2">
          <DraftText id="marriage" className="font-semibold">1. Marriage compatibility and what children they would produce.</DraftText>
        </section>
        <section aria-label="Starting skills" className={topicClass}>
          <DraftText id="starting-skills">2. They are born with different skills, you can simply replace those skills.</DraftText>
        </section>
        <section aria-label="Building access" className={topicClass}>
          <DraftText id="buildings-intro">3. They can build different types of buildings on plots, and this is important as it can not be changed, here are some examples:</DraftText>
          <div className="overflow-x-auto rounded-lg border">
            <table aria-label="Building examples" className={tableClass}>
              <tbody>
                {buildingExamples.map(([label, text]) => (
                  <tr key={label}><th scope="row" className="align-top">{label}</th><td><DraftText id={`building-${label}`}>{text}</DraftText></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <DraftText id="buildings-note" className={calloutClass}>I would say that this is the most unique thing about jobs.</DraftText>
        </section>
        <section aria-label="Combat skill access" className={topicClass}>
          <DraftText id="combat-access"><strong>4. Combat related Skill restrictions,</strong> there are three types of combat skills, Attack skills, Magic skills, Healing skills, an archer for example can only use Attack skills, while a Carpenter, Trader, Artist and a few more jobs cannot use any of those skills, this can not be changed.</DraftText>
          <CombatSkillTypes />
          <CombatJobComparison />
        </section>
        <section aria-label="Equipment access" className={topicClass}>
          <DraftText id="equipment-access"><strong>5. Equipment access and weakness,</strong> a job by default will either can use a piece of equipment, be weak at a piece of equipment or cannot use it at all, weak means they only get half the stats of that equipment.</DraftText>
          <EquipmentAccessStates />
          <DraftText id="equipment-resistance" className={calloutClass}>Luckily these restrictions can be removed by equipping that ally with the corresponding resistance skill, an Archer for example cannot wield a shield, give them the shield resistance skill and now they can equip a shield, it also removes the 50% penalty if a job was only weak with that piece of equipment.</DraftText>
          <ArcherShieldExample />
        </section>
        <section aria-label="Action ranges and deployment cost" className={topicClass}>
          <DraftText id="action-ranges"><strong>6. Action ranges,</strong> deployment range ( area ), deployment cost, searching range, and Defog AoE is unique between jobs. The values change even between ranks of the same job.</DraftText>
          <ActionRangesIllustration />
          <div className="flex items-start gap-2.5 border-t border-border pt-3">
            <Zap aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-semibold">Deployment cost</h3>
              <p className="text-sm">Energy spent to deploy. The Job Database shows how much extra energy the job and rank add to the base cost.</p>
            </div>
          </div>
        </section>
        <section aria-label="Experience costs" className={topicClass}>
          <DraftText id="exp-cost"><strong>7. Experience needed to level up a stat</strong> is also unique and cannot be changed, it ranges from <strong>100%</strong> which means no weakliness, <strong>150%</strong> which means they need 50% more exp or 1.5 the exp, and finally <strong>200%</strong> which means they need double the Exp, and you will absolutely feel the difference when leveling up a 999 character.</DraftText>
          <DefenseExpComparison />
        </section>
        <section aria-label="Stat caps and growth" className={topicClass}>
          <DraftText id="stat-growth"><strong>8. Base stats at 0 awakening ( Max level per stat ), stat growth per level gained.</strong> This differs between jobs, and even between ranks of the same job.</DraftText>
          <DraftText id="examples-intro">Here are some examples:</DraftText>
          <DraftText id="hp-intro" format={formatHpIntro}>I will first compare between D rank jobs at 0 awakening we will take Hp as our example:</DraftText>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table aria-label="D rank HP examples" className={`w-full table-fixed text-left ${enabled ? "min-w-[36rem]" : ""}`}>
              <thead className="border-b border-border bg-muted text-xs text-foreground sm:text-sm">
                <tr>
                  <th scope="col" className="w-2/5 px-3 py-2.5 sm:px-4">Job</th>
                  <th scope="col" className="w-[30%] px-2 py-2.5 text-center sm:px-4">Max HP level</th>
                  <th scope="col" className="w-[30%] px-2 py-2.5 text-center sm:px-4">
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {hpIcon && <img src={hpIcon} alt="" width={16} height={16} className="hidden sm:block" />}
                      Max HP value
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm sm:text-base">
                {hpExamples.map(([job, level, value]) => (
                  <tr key={job}>
                    <th scope="row" className="px-3 py-2.5 font-semibold sm:px-4">
                      <DraftText id={`hp-job-${job}`}>{job}</DraftText>
                    </th>
                    <td className="bg-muted/40 px-2 py-2.5 text-center font-medium tabular-nums sm:px-4">
                      <DraftText id={`hp-level-${job}`} format={formatHpLevel}>{level}</DraftText>
                    </td>
                    <td className="px-2 py-2.5 text-center font-semibold tabular-nums sm:px-4">
                      <DraftText id={`hp-value-${job}`} format={formatHpValue}>{value}</DraftText>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DraftText id="d-rank-gap">So a max level difference of 5 for D rank jobs, I am excluding some unique jobs, like Monarch, Royal, Scholar, and Santa.</DraftText>
          <DraftText id="s-rank-gap">At S rank the level difference is bigger, looking at the table I can see that the difference can reach to 25 levels. It feels more extreme at 0 awakenings, the higher the awakenings the less of an impact a 25 level gap makes. And this does not matter at all on a level 999 character, what matters then is only stat growth per level.</DraftText>
          <DraftText id="defense-intro">Now lets take Defense at level 999 on S rank characters, I am still excluding the unique jobs.</DraftText>
          <DraftText id="defense-spread">The highest value of defense at level 999 is <strong>3025 for Paladin</strong>, and the lowest is <strong>2997 for Beast Tamer and Samurai</strong>. So everyone falls in a the range of <strong>3011 ± 14</strong>, I dare to call them identical.</DraftText>
          <DraftText id="hp-int">The difference in Hp, is a lot more extreme, I would say the same about int, feel free to scan the table yourself in the <Link className="text-primary underline underline-offset-4" href="/jobs">job database</Link>.</DraftText>
        </section>
      </section>

      <section className={sectionClass} aria-labelledby="best-job">
        <DraftText as="h2" id="best-job" className={headingClass}>Now that you understand the similarities and the differences it is time to try and answer your question, what is the best job?</DraftText>
        <DraftText id="why-asking" className="font-semibold">Well why are you asking?</DraftText>
        <div className="space-y-3">
            <DraftText id="mage">The best job to make skills, is <strong>Mage</strong>, it is the only job that can discover skills.</DraftText>
            <DraftText id="monk">The best job to build a recovery room is <strong>Monk</strong>, and again, it is the only job that can do that.</DraftText>
        </div>
        <section aria-label="Combat roles and training" className="space-y-5 border-t border-border pt-6">
        <DraftText id="combat-role">But you are probably asking about combat, what is the best job for combat? and again I counter your question, what role will they have in combat?</DraftText>
        <div className={calloutClass}>
          <DraftText id="rancher">The best job to bring the max number of monsters to a fight is a <strong>Rancher</strong>.</DraftText>
          <DraftText id="wizard">While if you are asking about the highest Dps for magic skills it is a <strong>Wizard</strong>, and it also eliminates all jobs that cannot use Magic skills from the answer.</DraftText>
        </div>
        <aside className="border-l-2 border-border pl-4 text-sm">
            <DraftText id="magic-damage">I also would like you to note that Int replaces attack for Magic combat, a character using Magic with 1 attack while do the same damage with a spell as a character with 999 attack.</DraftText>
            <Link className="mt-2 inline-block font-medium text-primary underline underline-offset-4" href="/combat/formulas">See how magic damage is calculated</Link>
        </aside>
        <DraftText id="open-map">For regular open map combat Attack skills are very important, both for being able to kill, and for gaining exp, although I did mention a Wizard has the best DPS with Magic skills, good luck maxing them out.</DraftText>
        <DraftText id="training-int" className="whitespace-pre-wrap">{`Int is very painful to level up in general, and leveling Hp, Mp, Vig, Atk, Def, Spd, Lck on the map without attack spells is a nightmare for 999 characters.

Another note is Guerilla skill is only obtainable by breeding a Guerilla, but again the skill can be removed from the Guerilla Job and given to any other Job.`}</DraftText>
        <DraftText id="combat-conclusion" className="font-medium">So what is the best Job for combat is depending on the role, and we might be answering wizard if you can magically have a maxed 999 wizard, but that isn't the case.</DraftText>
        </section>
      </section>

      <section className={sectionClass} aria-labelledby="first-999">
        <DraftText as="h2" id="first-999" className={headingClass}>What is the best job for my first 999?</DraftText>
        <div className={calloutClass}>
          <DraftText id="first-picks" className="text-lg leading-relaxed">With all that has been said my answer would be <strong>Champion/Beast Tamer/Magic Knight.</strong></DraftText>
          <DraftText as="h3" id="first-why" className="font-semibold">Why?</DraftText>
          <DraftText id="first-reason">Because they are versatile and have access to all types of skills. I would personally say Attack skills are a must on ALL 999s for easier training, but Magic skills are superior in off-map combat.</DraftText>
        </div>
        <DraftText id="food-training">A character that you will not manually awaken can easily be maxed using food and facilities because the earlier levels do not need much xp, therefore they are much more forgiving for not having attack skills for leveling up, but again the best skills to deal with monsters on the map are attack skills like, Multi hit skills, Myriad Arrows, Area attack, and Direct attack.</DraftText>
        <aside className="space-y-3 border-t border-border pt-5">
            <h3 className="font-semibold">Situational choices</h3>
            <DraftText id="defog">Best character for clearing fog are characters with high <strong>Defog AoE.</strong></DraftText>
            <DraftText id="deployment">A character with low deployment range and searching range is also very useful in many cases, like deploying to somewhere very close to the edge of the map, without building unwanted rafts, or for farming monsters in close proximity to other allies without getting interrupted by searching range ( aggro range ).</DraftText>
        </aside>
      </section>
      <nav className={sectionClass} aria-labelledby="useful-links">
        <h2 id="useful-links" className={headingClass}>Useful links</h2>
        <Link href="/combat/formulas" className="flex items-center gap-3 rounded-lg border border-primary/35 bg-primary/10 px-3 py-3 hover:border-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4">
          <ToolIdentityArtwork artworkKey="/combat/formulas" size={32} />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-primary">Combat Formulas</span>
            <span className="block text-sm text-muted-foreground">How damage, skills, and stats work in combat</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-primary" aria-hidden="true" />
        </Link>
        <ul className="flex flex-wrap gap-x-6 gap-y-3">
          <li><Link className="text-primary underline underline-offset-4" href="/guides/stat-effects">Resident Stats</Link></li>
          <li><Link className="text-primary underline underline-offset-4" href="/jobs">Job Database</Link></li>
        </ul>
      </nav>
    </article>
    </DraftEditor.Provider>
  );
}
