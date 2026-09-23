import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterPreviewCanvas } from "@/components/character-preview-canvas";
import { MONSTER_BY_ID, type BattleSetup } from "@/lib/battle-setup";
import { MONSTER_ICON_MAP } from "@/lib/monster-icons";
import { gearInSlot, type BuilderSharedData, type DraftCharacter } from "@/lib/battle-team-draft";

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

export function TeamFormation({ characters, setup, data }: {
  characters: DraftCharacter[];
  setup: BattleSetup | null;
  data: BuilderSharedData | null;
}) {
  const entries = formationEntries(characters, setup);
  const slotCount = Math.max(COLUMNS, Math.ceil(entries.length / COLUMNS) * COLUMNS);
  return (
    <Card data-team-formation data-formation-units={entries.length} data-formation-rows={slotCount / COLUMNS}>
      <CardHeader>
        <CardTitle>2 - Team formation</CardTitle>
        <CardDescription>Starting order</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2" aria-label="Team formation">
          {Array.from({ length: slotCount }, (_, index) => {
            const entry = entries[index];
            return (
              <div
                key={index}
                className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/70 bg-muted/10 px-0.5 py-2 text-center sm:px-2"
                data-formation-slot={index + 1}
                data-formation-kind={entry?.kind ?? "empty"}
                title={entry?.kind === "pet" ? `${entry.name} · ${entry.owner}'s pet` : entry?.name}
              >
                <span className="text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="flex h-14 w-full items-center justify-center sm:h-16">
                  {entry ? <FormationSprite entry={entry} data={data} /> : null}
                </span>
                <span className="w-full truncate text-[10px] font-medium sm:text-xs">{entry?.name ?? ""}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
