import { Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchEggReferenceData, type EggMonsterOutcome } from "@/lib/eggs-data";
import { MONSTER_INNATE_SKILL_BY_ID, renderSkillName, SKILL_BY_ID } from "@/lib/battle-setup";
import { getEggIconByColor, getItemIcon } from "@/lib/equipment-icons";
import { getSkillIcon } from "@/lib/skill-icons";
import { MONSTERS, STAT_KEYS, STAT_LABELS, statValueAtLevel } from "@/lib/monster-stats";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ANIMAL_MONSTER_CARDS,
  COMBAT_MONSTER_CARDS,
  MAX_AREA_LEVEL,
  filterMonsterCards,
  selectableAreaLevels,
  statXp,
  xpPerKill,
  type MonsterCard,
} from "@/lib/monster-cards";

const formatNumber = (value: number, digits = 1) =>
  value.toLocaleString(undefined, { maximumFractionDigits: digits });

function terrainChipClass(card: MonsterCard) {
  return `border-border bg-muted/40 text-foreground/90 chip-terrain-${card.terrainClass}`;
}

function MonsterArt({ card }: { card: MonsterCard }) {
  return (
    <div className="flex h-[168px] items-center justify-center rounded-t-[9px] bg-[radial-gradient(115%_90%_at_50%_105%,hsl(258_32%_22%),hsl(222_28%_14%)_62%)]">
      {card.sprite ? (
        <img
          src={card.sprite}
          alt={card.name}
          className="h-[150px] w-auto [image-rendering:pixelated]"
          loading="lazy"
        />
      ) : (
        <Skull className="h-10 w-10 text-muted-foreground/40" />
      )}
    </div>
  );
}

function Chips({ card }: { card: MonsterCard }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5 px-2.5 pt-1.5">
      <span
        className={`inline-flex items-center gap-1 self-center rounded border px-1.5 py-0.5 text-xs ${terrainChipClass(card)}`}
      >
        <span className="font-semibold">
          {card.terrainName} {card.minLevel}+
        </span>
      </span>
      {card.cave && (
        <span className="ml-auto flex flex-1 items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1">
          <img loading="lazy" decoding="async"
            src={card.cave.icon}
            alt=""
            className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground/90">{card.cave.name}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">Lv {card.minLevel}+</span>
        </span>
      )}
    </div>
  );
}

function BoxBlock({ card, animal }: { card: MonsterCard; animal: boolean }) {
  if (!card.box) return null;
  return (
    <div className="mt-2 border-t border-border/60 px-2.5 pt-2">
      <div className="flex items-center gap-2">
        <img loading="lazy" decoding="async" src={card.box.icon} alt="" className="h-9 w-9 object-contain [image-rendering:pixelated]" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{card.box.name}</span>
          <span className="block text-[11px] text-muted-foreground">
            {animal ? "Material yield" : `Treasure #${card.box.id}`}
          </span>
        </span>
        <span className="ml-auto text-right">
          <span className="block text-sm font-semibold text-violet-400">{card.box.rate}%</span>
          <span className="block text-[11px] text-muted-foreground">
            {animal ? "when collected" : "box per kill"}
          </span>
        </span>
      </div>
      <ul className="mt-1.5 space-y-[3px]">
        {card.box.rewards.map((reward) => (
          <li
            key={`${card.id}-${reward.name}`}
            className="flex items-center gap-2 rounded bg-muted/50 px-2 py-0"
          >
            {reward.icon ? (
              <img loading="lazy" decoding="async" src={reward.icon} alt="" className="h-6 w-6 object-contain [image-rendering:pixelated]" />
            ) : (
              <span className="h-6 w-6" />
            )}
            <span className="min-w-0 truncate text-xs text-foreground/90">
              {reward.name} <span className="text-muted-foreground">{formatRange(reward.min, reward.max)}</span>
            </span>
            <span className="ml-auto text-xs font-semibold tabular-nums">{reward.rate}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatRange(min: number, max: number) {
  return min === max ? `×${min}` : `×${min}-${max}`;
}

function XpBlock({ card }: { card: MonsterCard }) {
  const levelSuggestions = useMemo(() => selectableAreaLevels(card.minLevel), [card.minLevel]);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(card.minLevel);
  const [draft, setDraft] = useState(String(card.minLevel));
  const statEntries = useMemo(() => statXp(card, level), [card, level]);
  const typed = draft.trim();
  const filteredLevels = typed ? levelSuggestions.filter((entry) => String(entry).startsWith(typed)) : levelSuggestions;
  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() !== "" && Number.isInteger(parsed) && parsed >= card.minLevel && parsed <= MAX_AREA_LEVEL) {
      setLevel(parsed);
      setDraft(String(parsed));
      return;
    }
    // Nothing to commit yet (empty or below the lowest spawn level): keep the last valid level.
    if (raw.trim() === "") setDraft("");
  };
  return (
    <div className="mt-2 border-t border-border/60 bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        <span className="font-medium">XP per kill</span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-violet-400">
          {formatNumber(xpPerKill(card, level))}
        </span>
        <span className="text-[11px] text-muted-foreground">
          at Lv {level}
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-2.5 pb-2.5">
          <div className="flex items-center gap-2">
            <label htmlFor={`level-${card.id}`} className="text-[11px] font-medium text-muted-foreground">
              Area level
            </label>
            <Input
              id={`level-${card.id}`}
              list={`level-${card.id}-options`}
              inputMode="numeric"
              value={draft}
              onChange={(event) => {
                const raw = event.target.value.replace(/[^0-9]/g, "");
                setDraft(raw);
                commit(raw);
              }}
              onBlur={() => {
                if (draft.trim() === "" || Number(draft) < card.minLevel) setDraft(String(level));
              }}
              className="h-7 w-20 text-xs"
            />
            <datalist id={`level-${card.id}-options`}>
              {filteredLevels.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
            <span className="text-[11px] text-muted-foreground">
              any area level {card.minLevel}+ · biome does not restrict spawns
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Average XP per kill</span>
            <span className="text-lg font-bold tabular-nums text-violet-400">{formatNumber(xpPerKill(card, level))}</span>
          </div>
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Average XP per stat
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {statEntries.map((entry) => (
                <span
                  key={entry.stat}
                  className="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-1.5 py-px text-xs"
                  title={entry.label}
                >
                  {entry.icon ? (
                    <img loading="lazy" decoding="async" src={entry.icon} alt={entry.label} className="h-4 w-4 object-contain [image-rendering:pixelated]" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{entry.label}</span>
                  )}
                  <span className="font-semibold tabular-nums">{formatNumber(entry.value)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const statsById = new Map(MONSTERS.map((monster) => [monster.id, monster]));

function MonsterDetails({ card, egg }: { card: MonsterCard; egg?: EggMonsterOutcome }) {
  const stats = statsById.get(card.id);
  const skillId = MONSTER_INNATE_SKILL_BY_ID.get(card.id);
  const skill = skillId != null ? SKILL_BY_ID.get(skillId) : undefined;
  const skillName = skill ? renderSkillName(skill) : egg?.startingSkill;
  const eggIcon = egg && getEggIconByColor(egg.eggColor);
  const skillIcon = getSkillIcon(skillName);
  const unlockIcon = egg && getItemIcon(egg.secondSkillItem);
  const [level, setLevel] = useState("1");
  const value = Math.max(1, Math.min(10000, Number(level) || 1));

  return (
    <div className="mt-2 space-y-2 border-t border-border/60 px-2.5 py-2 text-xs">
      {egg && (
        <details>
          <summary className="cursor-pointer font-medium text-primary">
            <span className="inline-flex items-center gap-1.5 align-middle">
              {eggIcon && <img src={eggIcon} alt="" loading="lazy" className="size-5 object-contain" />}
              Hatching: {egg.eggColor.toLowerCase()} egg
            </span>
          </summary>
          <div className="mt-2 space-y-1">
            <p><strong>{egg.requiredStat}</strong> points to hatch</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              {(["Low", "Medium", "High", "Over"] as const).map((band, index, bands) => {
                const start = egg.thresholds[band];
                const nextBand = bands[index + 1];
                const next = nextBand ? egg.thresholds[nextBand] : null;
                const points = start === null || (next != null && next <= start) ? "—" : next == null
                  ? formatNumber(start, 0) + "+"
                  : next === start + 1 ? formatNumber(start, 0)
                  : formatNumber(start, 0) + "–" + formatNumber(next - 1, 0);
                return <div key={band} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">{band}</dt><dd className="tabular-nums">{points}</dd>
                </div>;
              })}
            </dl>
            <Link className="inline-block font-medium text-primary hover:underline"
              href={"/eggs?view=planner&pet=" + encodeURIComponent(egg.monsterName)}>
              Open feeding planner
            </Link>
          </div>
        </details>
      )}
      {skillName && <p className="flex items-center gap-1.5">
        {skillIcon && <img src={skillIcon} alt="" loading="lazy" className="size-5 object-contain" />}
        <span><span className="text-muted-foreground">Innate skill</span> {skillName}</span>
      </p>}
      {egg && <p className="flex items-center gap-1.5">
        {unlockIcon && <img src={unlockIcon} alt="" loading="lazy" className="size-5 object-contain" />}
        <span><span className="text-muted-foreground">Second skill item</span> {egg.secondSkillItem}</span>
      </p>}
      {stats && <details>
        <summary className="cursor-pointer font-medium text-primary">Stats by level</summary>
        <label className="my-2 flex items-center gap-2">
          Level
          <Input type="number" min={1} max={10000} value={level} onChange={(event) => setLevel(event.target.value)} className="h-8 w-24" />
        </label>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          {STAT_KEYS.map((stat) => <div key={stat} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{STAT_LABELS[stat]}</dt>
            <dd className="tabular-nums">{formatNumber(statValueAtLevel(stats.stats[stat], value), 0)}</dd>
          </div>)}
        </dl>
      </details>}
    </div>
  );
}

function MonsterTile({ card, egg, animal = false }: { card: MonsterCard; egg?: EggMonsterOutcome; animal?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <MonsterArt card={card} />
      <div className="flex items-center gap-2 px-2.5 pt-2">
        <span className="truncate text-base font-bold">{card.name}</span>
        <span className="text-[11px] text-muted-foreground">#{card.id}</span>
        <span
          className={`ml-auto rounded-full border px-2 text-[11px] ${
            animal ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-violet-500/40 bg-violet-500/10 text-violet-300"
          }`}
        >
          {animal ? "Animal" : "Combat"}
        </span>
      </div>
      <Chips card={card} />
      <BoxBlock card={card} animal={animal} />
      {animal ? (
        <p className="mt-2 border-t border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Not fought in battle, so there is no XP per kill.
        </p>
      ) : (
        <XpBlock card={card} />
      )}
      {!animal && <MonsterDetails card={card} egg={egg} />}
    </Card>
  );
}

function TileGrid({ cards, eggs, animal = false }: { cards: MonsterCard[]; eggs?: Map<number, EggMonsterOutcome>; animal?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <div key={`${card.id}-${card.terrainCode}`} id={`monster-${card.id}`}>
          <MonsterTile card={card} egg={eggs?.get(card.id)} animal={animal} />
        </div>
      ))}
    </div>
  );
}

export default function MonstersPage() {
  const params = new URLSearchParams(useSearch());
  const focus = params.get("monster") ?? "";
  const [query, setQuery] = useState(params.get("search") ?? focus);

  const { data: eggData } = useQuery({ queryKey: ["egg-reference-data"], queryFn: fetchEggReferenceData });
  const eggs = useMemo(() => new Map(eggData?.monsters.map((egg) => [egg.monsterId, egg])), [eggData]);
  const combat = useMemo(() => filterMonsterCards(COMBAT_MONSTER_CARDS, query), [query]);
  const animals = useMemo(() => filterMonsterCards(ANIMAL_MONSTER_CARDS, query), [query]);
  const total = COMBAT_MONSTER_CARDS.length + ANIMAL_MONSTER_CARDS.length;

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Skull className="h-5 w-5 text-violet-500" />
            Monster Database
          </h1>
        </div>

        <p className="mb-3 max-w-3xl text-sm text-muted-foreground">
          Look up where a monster spawns, what it drops, how much XP it gives, and its egg, skills and stats.
        </p>

        <div className="mb-3 rounded-lg border border-border bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
          Spawn biome and level range come from <code>KA GameData - Monster.csv</code>. A cave spawns monsters whose
          terrain matches the cave and whose level range contains the area level (recovered from the game code), so the
          cave level shown is the monster&apos;s own lowest level.
        </div>


        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search monsters, biomes, caves or dropped items"
            className="h-9 pl-9 text-sm"
          />
        </div>

        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Combat monsters</h2>
          <span className="text-xs text-muted-foreground">
            {query ? `${combat.length} of ${COMBAT_MONSTER_CARDS.length}` : COMBAT_MONSTER_CARDS.length}
          </span>
        </div>
        {combat.length ? (
          <TileGrid cards={combat} eggs={eggs} />
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">No combat monsters match that search.</Card>
        )}

        <div className="mb-1.5 mt-8 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Farmable animals</h2>
          <span className="text-xs text-muted-foreground">
            {query ? `${animals.length} of ${ANIMAL_MONSTER_CARDS.length}` : ANIMAL_MONSTER_CARDS.length}
          </span>
        </div>
        <p className="mb-2 max-w-3xl text-xs text-muted-foreground">
          Not fought in battle and not spawned by caves. Their row is a material yield, listed here so the treasure
          contents are still searchable.
        </p>
        {animals.length ? (
          <TileGrid cards={animals} animal />
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">No animals match that search.</Card>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {total} monster rows · {COMBAT_MONSTER_CARDS.length} combat · {ANIMAL_MONSTER_CARDS.length} farmable
        </p>
      </div>
    </div>
  );
}
