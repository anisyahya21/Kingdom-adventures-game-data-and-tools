import { CalendarDays, Check, Swords } from "lucide-react";
import { ENCOUNTER_FAMILIES, ENCOUNTER_VARIANTS, MONSTER_BY_ID } from "@/lib/battle-setup";
import { MONSTER_ICON_MAP } from "@/lib/monster-icons";
import { KA_DIFFICULTY_BADGE_CLASS, type KaDifficulty } from "@/design-system/category-styles";

export function EncounterCards({ encounterId, onSelect }: { encounterId: number; onSelect: (id: number) => void }) {
  const selected = ENCOUNTER_VARIANTS.find((entry) => entry.id === encounterId);
  return <div className="space-y-3">
    <div className="grid gap-4 lg:grid-cols-2" aria-label="Encounters">
      {ENCOUNTER_FAMILIES.map((family) => {
        const entry = family.variants[0];
        const parts = entry.familyName.split(" - ");
        const day = parts.length > 1 ? parts[0] : null;
        const title = parts.length > 1 ? parts.slice(1).join(" - ") : entry.familyName;
        const boss = MONSTER_BY_ID.get(entry.boss.monsterId);
        const art = boss?.src || (boss && MONSTER_ICON_MAP[boss.name]);
        const active = selected?.familyId === family.id;
        return <div key={family.id} className={`relative overflow-hidden rounded-xl border p-4 sm:p-5 ${active ? "border-primary/70 bg-primary/5" : "bg-card"}`}>
          <div className="flex min-h-24 items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-base font-semibold">{day ? <CalendarDays className="h-4 w-4 shrink-0 text-primary" /> : <Swords className="h-4 w-4 shrink-0 text-primary" />}{day ?? title}</h3>
              {day && <p className="mt-1 text-sm text-muted-foreground">{title}</p>}
              {active && <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"><Check className="h-3 w-3" />Selected · {selected.difficultyName}</span>}
            </div>
            {art && <img src={art} alt={boss?.name ?? ""} className="h-24 w-24 shrink-0 object-contain [image-rendering:pixelated]" />}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2" aria-label={`${title} difficulty`}>
            {family.variants.map((variant) => <button key={variant.id} type="button" aria-label={`${title} · ${variant.difficultyName}`} aria-pressed={variant.id === encounterId} data-encounter-option={variant.id} data-difficulty={variant.difficulty} onClick={() => onSelect(variant.id)} className={`min-h-11 rounded-lg border px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${KA_DIFFICULTY_BADGE_CLASS[variant.difficultyName as KaDifficulty]} ${variant.id === encounterId ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "hover:brightness-125"}`}>{variant.difficultyName}</button>)}
          </div>
        </div>;
      })}
    </div>
    {selected && <p data-selected-encounter={selected.id} className="text-xs text-muted-foreground">{selected.familyName} · {selected.difficultyName} · {selected.enemyTotal} enemies · Lv {selected.levelField}</p>}
  </div>;
}
