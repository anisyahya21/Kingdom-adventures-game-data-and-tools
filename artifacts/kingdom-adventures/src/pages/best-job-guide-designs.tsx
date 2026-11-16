import { useEffect, useState } from "react";
import { Link } from "wouter";
import { PageHeader } from "@/components/ka/page-header";
import { ActionRangesIllustration } from "@/components/guides/action-ranges-illustration";
import { ExperienceIllustration } from "@/components/guides/best-job-guide-illustrations";
import {
  FarmerBuildingComparison, First999TrainingComparison, JobExpComparison,
  Level999StatComparison, MagicRoleComparison, MarriageCompatibilityComparison,
} from "@/components/guides/job-comparison-illustrations";
import {
  accessJobs, canUseCombatSkill, CombatJobComparison, CombatSkillBadge,
  combatSkills, CombatSkillTypes,
} from "@/components/guides/combat-skill-access";

const guidePath = "/guides/what-is-the-best-job";
type Layout = "reader" | "table" | "cards" | "steps" | "focus" | "reference" | "bars" | "paired" | "illustrated" | "comparison";
type Item = {
  label: string;
  value: string;
  blocks?: string[];
  amount?: number;
  localValues?: string[];
};
type Option = [name: string, layout: Layout, order?: number[]];
type Section = {
  name: string;
  intro?: string[];
  items: Item[];
  options: [Option, ...Option[]];
};

const sections: Section[] = [
  {
    name: "Transferable and starting skills",
    items: [
      { label: "Equip a skill", value: "Gain the ability", blocks: ["shared-2"] },
      { label: "Remove a skill", value: "Lose the ability" },
      { label: "Starting skills", value: "Can be replaced", blocks: ["starting-skills"] },
    ],
    options: [["Equip and remove side by side", "paired"], ["Equipping and changing skills", "table"],
      ["Original explanation with a margin note", "reader"], ["From starting skill to replacement", "steps", [2, 0, 1]]],
  },
  {
    name: "Marriage and children",
    items: [
      { label: "Marriage compatibility", value: "Which jobs pair" },
      { label: "Children", value: "Which child jobs they can produce", blocks: ["marriage"] },
    ],
    options: [["Same child, different compatibility", "comparison"], ["Two parts of the decision", "paired"],
      ["Compatibility → children", "steps"], ["Two-row reference", "table"]],
  },
  {
    name: "Building access",
    intro: ["buildings-intro", "buildings-note"],
    items: [
      { label: "Skill Shop", value: "Mage", blocks: ["building-A."] },
      { label: "Church / Recovery Room", value: "Monk" },
      { label: "Survey Corps HQ", value: "B+ Carpenter, Farmer, Merchant, Mover, Rancher", blocks: ["building-B."] },
      { label: "Orchard", value: "C+ Farmer", blocks: ["building-C."] },
      { label: "Monster House", value: "Rancher · up to 5 monsters", blocks: ["building-D."] },
    ],
    options: [["What B rank adds for Farmer", "comparison"], ["Building reference list", "reference"],
      ["Rancher example first", "focus", [4, 0, 1, 2, 3]], ["Building cards", "cards"]],
  },
  {
    name: "Combat skill restrictions",
    items: [],
    options: [["Compare three jobs", "paired"], ["Same spell, different access", "paired"], ["Learn the three skill types", "cards"], ["Archer combat skills", "focus"]],
  },
  {
    name: "Equipment access and weakness",
    items: [
      { label: "Can equip", value: "Full equipment stats" },
      { label: "Weak", value: "Half equipment stats", blocks: ["equipment-access"] },
      { label: "Cannot equip", value: "Equip skill required" },
      { label: "Shield Resistance", value: "Archer can equip a shield", blocks: ["equipment-resistance"] },
    ],
    options: [["Three equipment states and the exception", "table"], ["Archer shield example first", "focus", [3, 0, 1, 2]],
      ["Default states versus a resistance skill", "paired"], ["Read the rule, then the shield example", "reader"]],
  },
  {
    name: "Deployment, searching and fog",
    items: [],
    options: [["Compare jobs at the same rank", "comparison"]],
  },
  {
    name: "Experience needed per stat",
    items: [],
    options: [["Compare three jobs on Defense EXP", "comparison"], ["Build up the required EXP", "illustrated"]],
  },
  {
    name: "Stat caps and growth examples",
    intro: ["stat-growth", "examples-intro", "hp-intro", "d-rank-gap", "s-rank-gap", "defense-intro", "defense-spread", "hp-int"],
    items: [
      { label: "Paladin", value: "30 · 332", amount: 332, localValues: ["hp-level-Paladin", "hp-value-Paladin"] },
      { label: "Champion", value: "30 · 381", amount: 381, localValues: ["hp-level-Champion", "hp-value-Champion"] },
      { label: "Viking", value: "30 · 342", amount: 342, localValues: ["hp-level-Viking", "hp-value-Viking"] },
      { label: "Artist", value: "25 · 243", amount: 243, localValues: ["hp-level-Artist", "hp-value-Artist"] },
    ],
    options: [["Same three jobs, three stat spreads", "comparison"], ["HP bars with level labels", "bars"],
      ["Artist comparison in focus", "focus", [3, 0, 1, 2]], ["One job per row with larger values", "cards"]],
  },
  {
    name: "Best job by role",
    items: [],
    options: [["Wizard and Champion", "comparison"]],
  },
  {
    name: "Your first level 999",
    items: [],
    options: [["Champion and Beast Tamer training", "comparison"]],
  },
];

type DraftCopy = Record<string, string>;

function readDraft(frame: HTMLIFrameElement): DraftCopy | undefined {
  const doc = frame.contentDocument;
  if (!doc?.getElementById("intro") || !doc.getElementById("deployment")) return;
  const blocks = [...doc.querySelectorAll<HTMLElement>("article p[id], article h2[id], article h3[id]")];
  return Object.fromEntries(blocks.map(block => {
    const copy = block.cloneNode(true) as HTMLElement;
    for (const image of copy.querySelectorAll("img")) image.replaceWith(doc.createTextNode(image.alt));
    return [block.id, copy.textContent?.trim() ?? ""];
  }));
}

function itemValue(item: Item, copy: DraftCopy) {
  if (!item.localValues) return item.value;
  const values = item.localValues.map(id => copy[id]);
  return values.every(Boolean) ? values.join(" · ") : item.value;
}

function ItemSummary({ item, copy }: { item: Item; copy: DraftCopy }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{item.label}</p>
      <p className="font-semibold">{itemValue(item, copy)}</p>
    </div>
  );
}

function DraftBlocks({ ids = [], copy }: { ids?: string[]; copy: DraftCopy }) {
  return <>{ids.map(id => copy[id] && <p key={id} className="leading-relaxed">{copy[id]}</p>)}</>;
}

function ComparedSection({ section, copy }: { section: Section; copy: DraftCopy }) {
  switch (section.name) {
    case "Marriage and children":
      return <><DraftBlocks ids={["marriage"]} copy={copy} /><MarriageCompatibilityComparison /></>;
    case "Building access":
      return <>
        <DraftBlocks ids={["buildings-intro"]} copy={copy} />
        <FarmerBuildingComparison />
        <DraftBlocks ids={["building-A.", "building-B.", "building-C.", "building-D.", "buildings-note"]} copy={copy} />
      </>;
    case "Experience needed per stat":
      return <><DraftBlocks ids={["exp-cost"]} copy={copy} /><JobExpComparison /></>;
    case "Stat caps and growth examples":
      return <>
        <DraftBlocks ids={["stat-growth", "defense-intro", "defense-spread", "hp-int"]} copy={copy} />
        <Level999StatComparison />
      </>;
    case "Best job by role":
      return <>
        <DraftBlocks ids={["best-job", "why-asking", "mage", "monk", "combat-role", "rancher", "wizard", "magic-damage"]} copy={copy} />
        <MagicRoleComparison />
        <DraftBlocks ids={["open-map", "training-int", "combat-conclusion"]} copy={copy} />
      </>;
    case "Your first level 999":
      return <>
        <DraftBlocks ids={["first-picks", "first-why", "first-reason"]} copy={copy} />
        <First999TrainingComparison />
        <DraftBlocks ids={["food-training"]} copy={copy} />
      </>;
    default:
      return null;
  }
}

function CombatAccessDesign({ copy, optionIndex }: { copy: DraftCopy; optionIndex: number }) {
  const spell = combatSkills[1];

  return (
    <div className="space-y-5">
      <DraftBlocks ids={["combat-access"]} copy={copy} />

      {optionIndex === 0 && <CombatJobComparison />}

      {optionIndex === 1 && (
        <figure className="space-y-3">
          <figcaption className="font-semibold">Can this job equip {spell.example}?</figcaption>
          <div className="grid gap-3 sm:grid-cols-2">
            {[accessJobs[0], accessJobs[2]].map(job => {
              const allowed = canUseCombatSkill(job, spell.key);
              return (
                <div key={job} className="space-y-2 rounded-lg border border-border bg-card p-4">
                  <h3 className="font-semibold">{job}</h3>
                  <CombatSkillBadge skill={spell} allowed={allowed} />
                  <p className="text-sm">{allowed ? "Can equip" : "Cannot equip"} {spell.example}.</p>
                </div>
              );
            })}
          </div>
        </figure>
      )}

      {optionIndex === 2 && <CombatSkillTypes />}

      {optionIndex === 3 && (
        <figure className="space-y-3">
          <figcaption className="font-semibold">What can an Archer equip?</figcaption>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div className="space-y-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium">Can equip</p>
              <CombatSkillBadge skill={combatSkills[0]} allowed />
              <p className="text-sm text-muted-foreground">Example: Area Attack</p>
            </div>
            <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-medium">Cannot equip</p>
              <div className="flex flex-wrap gap-2">
                {combatSkills.slice(1).map(type => <CombatSkillBadge key={type.key} skill={type} allowed={false} />)}
              </div>
              <p className="text-sm text-muted-foreground">Examples: Fire Magic Ⅰ and Heal M</p>
            </div>
          </div>
        </figure>
      )}
    </div>
  );
}

function Design({ section, option, copy }: { section: Section; option: Option; copy: DraftCopy }) {
  const [, layout, order] = option;
  const items = order ? order.map(index => section.items[index]) : section.items;
  const allBlocks = [...(section.intro ?? []), ...section.items.flatMap(item => item.blocks ?? [])];
  const isHp = items.every(item => item.localValues);

  if (layout === "reader") {
    return (
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]">
        <div className="space-y-4"><DraftBlocks ids={allBlocks} copy={copy} /></div>
        <aside className="space-y-3 border-l border-border pl-4">
          {items.map(item => <ItemSummary key={item.label} item={item} copy={copy} />)}
        </aside>
      </div>
    );
  }

  if (layout === "table") {
    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table aria-label={section.name} className="w-full text-left text-sm">
          <thead className="bg-muted">
            {isHp ? <tr><th scope="col" className="p-3">Job</th><th scope="col" className="p-3">Max HP level</th><th scope="col" className="p-3">Max HP value</th></tr>
              : <tr><th scope="col" className="p-3">{section.name === "Transferable and starting skills" ? "Skill change" : "What to look at"}</th><th scope="col" className="p-3">What it means</th></tr>}
          </thead>
          <tbody className="divide-y divide-border">
            {items.map(item => (
              <tr key={item.label}>
                <th scope="row" className="px-3 py-2.5">{item.label}</th>
                {item.localValues ? item.localValues.map(id => <td key={id} className="px-3 py-2.5 tabular-nums">{copy[id]}</td>)
                  : <td className="px-3 py-2.5">{item.value}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (layout === "reference") {
    return (
      <dl className="space-y-3">
        {items.map(item => (
          <div key={item.label} className="border-l-2 border-primary/40 pl-3">
            <dt className="font-semibold">{item.label}</dt>
            <dd className="text-sm">{itemValue(item, copy)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  if (layout === "bars") {
    const amounts = items.map(item => {
      if (!item.localValues) return item.amount ?? 0;
      const amount = Number(copy[item.localValues[1]]?.match(/\d+/)?.[0]);
      return Number.isFinite(amount) ? amount : 0;
    });
    const max = Math.max(1, ...amounts);
    return (
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={item.label} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4"><strong>{item.label}</strong><span>{itemValue(item, copy)}</span></div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${amounts[index] / max * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (layout === "steps") {
    return (
      <ol className="space-y-4 border-l-2 border-primary/40 pl-5">
        {items.map((item, index) => (
          <li key={item.label} className="relative">
            <span aria-hidden="true" className="absolute -left-[1.87rem] top-1 rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">{index + 1}</span>
            <ItemSummary item={item} copy={copy} />
          </li>
        ))}
      </ol>
    );
  }

  if (layout === "paired") {
    const midpoint = Math.ceil(items.length / 2);
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[items.slice(0, midpoint), items.slice(midpoint)].map((group, index) => (
          <div key={index} className={`space-y-4 rounded-lg border border-border p-4 ${index === 1 ? "bg-muted/50" : ""}`}>
            {group.map(item => <ItemSummary key={item.label} item={item} copy={copy} />)}
          </div>
        ))}
      </div>
    );
  }

  if (layout === "focus") {
    const [lead, ...rest] = items;
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/50 p-5">
          <div>
            <p className="text-sm text-muted-foreground">{lead.label}</p>
            <p className="text-xl font-semibold">{itemValue(lead, copy)}</p>
          </div>
          <div className="space-y-2"><DraftBlocks ids={lead.blocks} copy={copy} /></div>
        </div>
        {rest.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{rest.map(item => <ItemSummary key={item.label} item={item} copy={copy} />)}</div>}
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map(item => <li key={item.label} className="rounded-lg border border-border p-4"><ItemSummary item={item} copy={copy} /></li>)}
    </ul>
  );
}

export default function BestJobGuideDesigns() {
  const [sectionIndex, setSectionIndex] = useState(0);
  const [optionIndex, setOptionIndex] = useState(0);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  const [copy, setCopy] = useState<DraftCopy>();
  const [error, setError] = useState(false);
  const section = sections[sectionIndex];
  const option = section.options[optionIndex];
  const combatAccess = section.name === "Combat skill restrictions";
  const actionRanges = section.name === "Deployment, searching and fog";
  const illustrated = option[1] === "illustrated";
  const comparison = option[1] === "comparison";

  useEffect(() => {
    if (!frame) return;
    let observer: MutationObserver | undefined;
    const timeout = window.setTimeout(() => setError(true), 12000);
    function connect() {
      observer?.disconnect();
      if (!frame) return;
      const currentFrame = frame;
      const update = () => {
        const draft = readDraft(currentFrame);
        if (draft) {
          setCopy(draft);
          setError(false);
          window.clearTimeout(timeout);
          observer?.disconnect();
        }
      };
      const doc = currentFrame.contentDocument;
      if (!doc) return;
      observer = new MutationObserver(update);
      observer.observe(doc, { childList: true, subtree: true });
      update();
    }

    frame.addEventListener("load", connect);
    connect();
    return () => {
      observer?.disconnect();
      frame.removeEventListener("load", connect);
      window.clearTimeout(timeout);
    };
  }, [frame]);

  return (
    <article className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6">
      <Link className="text-sm text-primary underline underline-offset-4" href={guidePath}>Back to guide draft</Link>
      <PageHeader title="What is the best Job? · Design previews" />
      <iframe ref={setFrame} hidden aria-hidden="true" title="Local guide draft" src={guidePath} />
      <label className="block max-w-md space-y-1">
        <span className="text-sm font-semibold">Guide section</span>
        <select className="w-full rounded-md border border-border bg-background p-2" value={sectionIndex}
          onChange={event => { setSectionIndex(Number(event.target.value)); setOptionIndex(0); }}>
          {sections.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
        </select>
      </label>
      {section.options.length > 1 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Design options" role="group">
          {section.options.map(([name], index) => (
            <button type="button" key={name} aria-pressed={optionIndex === index}
              className="min-h-12 rounded-md border border-border px-3 py-2 text-left text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              onClick={() => setOptionIndex(index)}>{name}</button>
          ))}
        </div>
      )}
      <section className="space-y-4 border-t border-border pt-5" aria-label={option[0]}>
        <h2 className="text-xl font-semibold">{section.name}</h2>
        {copy ? combatAccess
          ? <CombatAccessDesign key={optionIndex} copy={copy} optionIndex={optionIndex} />
          : actionRanges
          ? <div className="space-y-4">
              <DraftBlocks ids={["action-ranges"]} copy={copy} />
              <ActionRangesIllustration />
            </div>
          : illustrated
          ? <div className="space-y-4"><DraftBlocks ids={["exp-cost"]} copy={copy} /><ExperienceIllustration /></div>
          : comparison
          ? <div className="space-y-4"><ComparedSection section={section} copy={copy} /></div>
          : <Design key={`${sectionIndex}-${optionIndex}`} section={section} option={option} copy={copy} />
          : <p role="status">{error ? "Could not load the local guide draft. Reload this page to try again." : "Loading your local guide draft…"}</p>}
        {copy && !combatAccess && !actionRanges && !illustrated && !comparison && option[1] !== "reader" && (
          <div className="space-y-3 border-t border-border pt-3">
            <DraftBlocks ids={[...(section.intro ?? []), ...section.items.flatMap(item => item.blocks ?? [])]} copy={copy} />
          </div>
        )}
      </section>
    </article>
  );
}
