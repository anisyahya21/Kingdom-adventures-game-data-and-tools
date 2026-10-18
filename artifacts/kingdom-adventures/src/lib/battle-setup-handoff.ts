import {
  importBattleSetup,
  serializeBattleSetup,
  type BattleSetup,
  type SetupIssue,
} from "@/lib/battle-setup";

export const RAW_BATTLE_SETUP_HANDOFF_KEY = "ka_raw_battle_setup_handoff_v1";

type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type BattleSetupHandoffRead =
  | { status: "none" }
  | { status: "ok"; setup: BattleSetup; json: string }
  | { status: "invalid"; issues: SetupIssue[] }
  | { status: "storage-error" };

/** Store the exact current setup for one navigation. False means navigation must not proceed. */
export function writeBattleSetupHandoff(setup: BattleSetup, storage?: HandoffStorage): boolean {
  try {
    const target = storage ?? window.sessionStorage;
    target.setItem(RAW_BATTLE_SETUP_HANDOFF_KEY, serializeBattleSetup(setup));
    return true;
  } catch {
    return false;
  }
}

/** Consume once, validating through the raw editor's normal importer before applying. */
export function readBattleSetupHandoff(storage?: HandoffStorage): BattleSetupHandoffRead {
  let json: string | null;
  try {
    const target = storage ?? window.sessionStorage;
    json = target.getItem(RAW_BATTLE_SETUP_HANDOFF_KEY);
    if (json === null) return { status: "none" };
    target.removeItem(RAW_BATTLE_SETUP_HANDOFF_KEY);
  } catch {
    return { status: "storage-error" };
  }

  const imported = importBattleSetup(json);
  if (!imported.setup || imported.issues.some((issue) => issue.category === "ERROR")) {
    return { status: "invalid", issues: imported.issues };
  }
  return { status: "ok", setup: imported.setup, json: serializeBattleSetup(imported.setup) };
}
