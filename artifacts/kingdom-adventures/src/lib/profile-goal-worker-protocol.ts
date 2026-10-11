import type { ProfileGoalBuild, ProfileGoalSearchCharacter, ProfileGoalSearchInput, ProfileGoalSearchPage } from "./profile-loadout-goal-planner";

type PreparedCharacter = Omit<ProfileGoalSearchCharacter, "input"> & {
  input: Omit<ProfileGoalSearchCharacter["input"], "contribution">;
  contributions: Record<string, Record<string, number>>;
};
export type ProfileWorkerInput = { characters: PreparedCharacter[]; inventory: ProfileGoalSearchInput["inventory"] };
export type ProfileWorkerMessage =
  | { type: "progress"; progress: ProfileGoalSearchPage }
  | { type: "page"; page: number; builds: ProfileGoalBuild[] }
  | { type: "error"; error: string };

/** Functions cannot cross the worker boundary. Cache the existing builder's exact
 * contributions, yielding during preparation so controls remain responsive. */
export async function prepareProfileWorkerInput(
  search: ProfileGoalSearchInput, upgrades: boolean, signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<ProfileWorkerInput> {
  if (signal.aborted) throw new DOMException("Search cancelled", "AbortError");
  const owned = new Map<string, number>();
  for (const row of search.inventory) {
    if (row.ownership !== "owned" || !Number.isInteger(row.currentLevel) || row.currentLevel! < 1 || row.currentLevel! > 99) continue;
    owned.set(row.item, Math.max(owned.get(row.item) ?? 1, row.currentLevel!));
  }
  const characters: PreparedCharacter[] = [];
  let sliceStart = performance.now();
  for (const character of search.characters) {
    const { contribution, ...input } = character.input;
    const contributions: PreparedCharacter["contributions"] = {};
    if (character.available && character.eligible) {
      for (const item of new Set(input.slots.flatMap((slot) => slot.items))) {
        const first = owned.get(item);
        if (first === undefined) continue;
        const last = upgrades ? Math.max(first, Math.min(99, Math.max(1, Math.floor(input.maxLevel ?? 99)))) : first;
        for (let level = first; level <= last; level += 1) {
          if (signal.aborted) throw new DOMException("Search cancelled", "AbortError");
          contributions[`${item}|${level}`] = contribution(item, level);
          if (performance.now() - sliceStart >= 8) {
            progress(characters.length, search.characters.length);
            await new Promise((resolve) => setTimeout(resolve, 0));
            sliceStart = performance.now();
          }
        }
      }
    }
    characters.push({ ...character, input, contributions });
    progress(characters.length, search.characters.length);
  }
  return { characters, inventory: search.inventory };
}

export function restoreProfileWorkerInput(input: ProfileWorkerInput): ProfileGoalSearchInput {
  return { inventory: input.inventory, characters: input.characters.map(({ contributions, ...character }) => ({
    ...character, input: { ...character.input, contribution: (item, level) => {
      const value = contributions[`${item}|${level}`];
      if (!value) throw new Error(`Missing prepared equipment stats: ${item} Lv${level}`);
      return value;
    } },
  })) };
}
