import { UserRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterPreviewCanvas } from "@/components/character-preview-canvas";
import { MONSTER_BY_ID, type BattleSetup } from "@/lib/battle-setup";
import { MONSTER_ICON_MAP } from "@/lib/monster-icons";
import { gearInSlot, type BuilderSharedData, type DraftCharacter } from "@/lib/battle-team-draft";
import type { BattlePreview } from "@/lib/battle-preview";

const COLUMNS = 5;

type FormationEntry =
  | { kind: "human"; name: string; character: DraftCharacter }
  | { kind: "pet"; name: string; monsterId: number; owner: string };

function formationEntries(characters: DraftCharacter[], setup: BattleSetup | null): FormationEntry[] {
  const humans: FormationEntry[] = characters.map((character, index) => ({
    kind: "human",
    name: setup?.playerTeam[index]?.name ?? character.name?.trim() ?? `Character ${index + 1}`,
    character,
  }));
  const pets: FormationEntry[] = [];
  for (const [ownerIndex, character] of characters.entries()) {
    const owner = humans[ownerIndex].name;
    const convertedPets = setup?.households?.[owner] ?? [];
    for (const [petIndex, pet] of (character.householdPets ?? []).entries()) {
      const species = MONSTER_BY_ID.get(pet.monsterId);
      pets.push({
        kind: "pet",
        name: convertedPets[petIndex]?.name ?? pet.name?.trim() ?? species?.name ?? `Pet ${petIndex + 1}`,
        monsterId: pet.monsterId,
        owner,
      });
    }
  }
  return [...humans, ...pets];
}

function FormationSprite({ entry, data }: { entry: FormationEntry; data: BuilderSharedData | null }) {
  if (entry.kind === "pet") {
    const species = MONSTER_BY_ID.get(entry.monsterId);
    const image = species?.src || (species?.name ? MONSTER_ICON_MAP[species.name] : undefined);
    return image ? (
      <img src={image} alt="" className="h-14 w-14 object-contain [image-rendering:pixelated] sm:h-16 sm:w-16" />
    ) : <span className="text-sm text-muted-foreground">?</span>;
  }
  const character = entry.character;
  const weapon = gearInSlot(character, "weapon", data?.slotAssignments);
  const shield = gearInSlot(character, "shield", data?.slotAssignments);
  return (
    <CharacterPreviewCanvas
      jobName={character.jobName ?? "Guard"}
      rank={character.rank}
      variant={character.gender === 1 ? 2 : 1}
      equipState="right"
      weaponName={weapon?.name ?? null}
      shieldName={shield?.name ?? null}
      scale={2}
      poseFrame={0}
      label={`${entry.name} sprite`}
      className="h-14 w-auto max-w-full object-contain sm:h-16"
    />
  );
}

export function TeamFormation({ characters, setup, data, preview, previewStatus }: {
  characters: DraftCharacter[];
  setup: BattleSetup | null;
  data: BuilderSharedData | null;
  preview: BattlePreview | null;
  previewStatus: "idle" | "loading" | "ok" | "error";
}) {
  const entries = formationEntries(characters, setup);
  const allies = preview?.units.filter((unit) => unit.side === "ally" && unit.cell && unit.rosterIndex !== null) ?? [];
  const prepared = allies.length > 0;
  const firstRow = prepared ? Math.min(...allies.map((unit) => unit.cell![1])) : 0;
  const lastRow = prepared ? Math.max(...allies.map((unit) => unit.cell![1])) : 0;
  const rowCount = Math.max(2, prepared ? lastRow - firstRow + 1 : Math.ceil(entries.length / COLUMNS));
  const rows = Array.from({ length: rowCount }, (_, index) => firstRow + index);
  const cells = new Map(allies.map((unit) => [`${unit.cell![0]},${unit.cell![1]}`, unit]));
  return (
    <Card data-team-formation data-formation-units={entries.length} data-formation-rows={rows.length}>
      <CardHeader>
        <CardTitle>2 - Team formation</CardTitle>
        <CardDescription>{prepared ? "Front row first. Positions follow formation priority and defense." : entries.length ? "Team preview. Battle positions appear when the formation is ready." : "Add characters to fill your formation."}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3" aria-label="Team formation">
          {rows.map((row, rowIndex) => (
            <div key={row}>
              <div className="mb-2 text-xs text-muted-foreground">{rowIndex === 0 ? "Front row" : `Back row ${rowIndex}`}</div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {Array.from({ length: COLUMNS }, (_, column) => {
                  const unit = cells.get(`${column},${row}`);
                  const entry = prepared
                    ? unit?.rosterIndex === null || unit?.rosterIndex === undefined ? undefined : entries[unit.rosterIndex]
                    : entries[rowIndex * COLUMNS + column];
                  return (
                    <div
                      key={column}
                      className={`flex min-h-28 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-0.5 py-3 text-center sm:min-h-32 sm:px-2 ${entry || unit ? "border-border bg-muted/20" : "border-dashed border-border/60 bg-muted/5"}`}
                      data-formation-cell={`${column},${row}`}
                      data-formation-kind={entry?.kind ?? "empty"}
                      aria-label={entry?.name ?? unit?.name ?? `Empty slot ${rowIndex * COLUMNS + column + 1}`}
                      title={entry?.kind === "pet" ? `${entry.name} · ${entry.owner}'s pet` : entry?.name}
                    >
                      <span className="flex h-14 w-full items-center justify-center sm:h-16">
                        {entry ? <FormationSprite entry={entry} data={data} /> : <UserRound aria-hidden="true" className="h-7 w-7 text-muted-foreground/20" />}
                      </span>
                      <span className={`w-full truncate text-[10px] sm:text-xs ${entry || unit ? "font-medium" : "text-muted-foreground/50"}`}>{entry?.name ?? unit?.name ?? "Empty"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {entries.length > 0 && !prepared && previewStatus === "loading" && <p role="status" className="mt-3 text-xs text-muted-foreground">Arranging battle positions…</p>}
      </CardContent>
    </Card>
  );
}
