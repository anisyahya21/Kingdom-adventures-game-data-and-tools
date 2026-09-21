import { createRoot } from "react-dom/client";
import "@/index.css";
import BattleSetupPage from "@/pages/battle-setup";
import {
  battleSetupToCombatScenario,
  BattleSetupAdapterError,
} from "@/lib/battle-setup-adapter";
import { humanIdleCharacterForUnit } from "@/lib/human-battle-idle";
import {
  createHttpBattleScenarioTransport,
  runBattleSetup,
  type BattleScenarioTransport,
} from "@/lib/battle-setup-runner";
import {
  battleSetupFromLoadouts,
  battleSkillIdForName,
  describeNativeRunnerRejection,
  readLoadoutHandoff,
  resolveCombatEquipmentId,
  writeLoadoutHandoff,
  type SavedLoadout,
  type SharedLoadoutData,
} from "@/lib/battle-legality";
import { localSharedData } from "@/lib/local-shared-data";
import { serializeBattleReplayResult } from "@/lib/battle-replay-result";
import {
  ENCOUNTER_BY_ID,
  ENCOUNTER_FAMILIES,
  ENCOUNTER_VARIANTS,
  EQUIPMENT_BY_ID,
  LARGE_POTION_ITEM,
  PARTY_LIMIT_INITIAL_MAX,
  SKILL_BY_ID,
  createDefaultBattleSetup,
  createHumanUnit,
  createPetMonsterUnit,
  difficultyName,
  emptyParameters,
  encounterCoverage,
  importBattleSetup,
  serializeBattleSetup,
  validateBattleSetup,
  type BattleSetup,
  type EncounterSelection,
  type HumanUnit,
  type PetMonsterUnit,
  type RawParameterSet,
} from "@/lib/battle-setup";

type Check = { name: string; passed: boolean; detail: string };

const checks: Check[] = [];
const check = (name: string, actual: unknown, expected: unknown) => {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({
    name,
    passed,
    detail: passed ? "ok" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  });
};
const checkTruthy = (name: string, actual: unknown, detail = "expected truthy") => {
  checks.push({ name, passed: Boolean(actual), detail: actual ? "ok" : detail });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  /* Catalog and model checks. */
  check("exactly 20 encounters", ENCOUNTER_VARIANTS.length, 20);
  check("encounter ids 0..19", ENCOUNTER_VARIANTS.map((entry) => entry.id), Array.from({ length: 20 }, (_, index) => index));
  check("five families", ENCOUNTER_FAMILIES.length, 5);
  check("four difficulties per family", ENCOUNTER_FAMILIES.map((family) => family.variants.length), [4, 4, 4, 4, 4]);
  check("difficulty 3 displays Extreme", ENCOUNTER_VARIANTS.filter((entry) => entry.difficulty === 3).every((entry) => difficultyName(entry.difficulty) === "Extreme"), true);
  check("source roster order preserved for Wairo Tank", ENCOUNTER_VARIANTS[19].followers.map((entry) => entry.monsterId), [116, 116, 116, 116, 116, 116, 116, 121, 116, 116, 116, 122, 116, 116, 116, 114, 116, 116, 116, 106]);
  check("partial-art encounters exist", ENCOUNTER_VARIANTS.some((entry) => encounterCoverage(entry) === "PARTIAL"), true);
  check("all encounters selectable by data contract", ENCOUNTER_VARIANTS.every((entry) => entry.id >= 0), true);

  const base = createDefaultBattleSetup(19);
  check("default encounter", base.encounter.encounterId, 19);
  check("initial party limit", base.partyLimit.initialMax, PARTY_LIMIT_INITIAL_MAX);

  const human = createHumanUnit(1);
  const pet = createPetMonsterUnit(2, 116);
  check("human kind", human.kind, "human");
  check("pet kind", pet.kind, "monster");
  check("pet monster id", pet.monsterId, 116);

  const mixed: BattleSetup = { ...base, playerTeam: [human, pet] };
  const mixedIssues = validateBattleSetup(mixed);
  check("mixed roster has one human", mixed.playerTeam.filter((unit) => unit.kind === "human").length, 1);
  checkTruthy("mixed roster has unknown-native warnings", mixedIssues.some((issue) => issue.category === "UNKNOWN_NATIVE_RULE"));

  const reordered: BattleSetup = { ...base, playerTeam: [pet, human] };
  check("reorder preserves roster order", reordered.playerTeam.map((unit) => unit.name), [pet.name, human.name]);

  const noHuman: BattleSetup = { ...base, playerTeam: [pet] };
  check("no-human product rule", validateBattleSetup(noHuman).some((issue) => issue.code === "PRODUCT_RULE_NO_HUMAN" && issue.category === "ERROR"), true);

  const larger: BattleSetup = {
    ...base,
    playerTeam: [human, createHumanUnit(2), createHumanUnit(3)],
  };
  check("roster over 2 warns instead of rejecting", validateBattleSetup(larger).some((issue) => issue.code === "PARTY_CAP_UNVALIDATED" && issue.category === "WARNING"), true);

  const equipped: BattleSetup = {
    ...base,
    playerTeam: [
      {
        ...human,
        equipmentSlots: {
          ...human.equipmentSlots,
          weapon: { id: 72, level: 5, affinity: 2 },
        },
        weaponId: 72,
        skills: [
          { skillId: 37, invocationLevel: 2 },
          { skillId: 109, invocationLevel: 1 },
        ],
      },
    ],
  };
  const serialized = serializeBattleSetup(equipped);
  check("equipment slot serializes", serialized.includes('"id": 72'), true);
  check("weapon motion retained through catalog id", EQUIPMENT_BY_ID.get(72)?.motion, 9);
  check("skill ids retained", serialized.includes('"skillId": 37') && serialized.includes('"skillId": 109'), true);
  check("skill order retained", serialized.indexOf('"skillId": 37') < serialized.indexOf('"skillId": 109'), true);
  check("invocation levels retained", serialized.includes('"invocationLevel": 2') && serialized.includes('"invocationLevel": 1'), true);
  check("skill motion retained through catalog id", SKILL_BY_ID.get(37)?.motion, 31);

  const roundTrip = importBattleSetup(serializeBattleSetup(equipped));
  check("JSON round trip", roundTrip.setup ? serializeBattleSetup(roundTrip.setup) : null, serializeBattleSetup(equipped));
  const invalid = importBattleSetup(JSON.stringify({ ...equipped, encounter: { encounterId: 99, familyId: "x", difficulty: 9, sourceTitle: "x" } }));
  check("invalid encounter id rejected", invalid.issues.some((issue) => issue.code === "ENCOUNTER_UNKNOWN"), true);

  /* ---------------------------------------------------------------- */
  /* PASS 16 COMMAND 16.3: BattleSetup -> authoritative scenario       */
  /* ---------------------------------------------------------------- */

  const humanParameters = (training: number, hp: number, mp: number): RawParameterSet => {
    const parameters = emptyParameters("human");
    for (const key of Object.keys(parameters)) {
      const pool = key === "10" || key === "11";
      const value = key === "10" ? hp : key === "11" ? mp : 1;
      parameters[key] = {
        rawValue: value,
        rawMax: pool ? value : 2147483647,
        extraValue: 0,
        extraMax: 0,
        trainingLevel: training,
      };
    }
    return parameters;
  };

  const monsterParameters = (training: number, hp: number, mp: number): RawParameterSet => {
    const parameters = emptyParameters("monster");
    for (const key of Object.keys(parameters)) {
      const pool = key === "10" || key === "11";
      const value = key === "10" ? hp : key === "11" ? mp : 1;
      parameters[key] = {
        rawValue: value,
        rawMax: pool ? value : 2147483647,
        extraValue: 0,
        extraMax: 0,
        trainingLevel: training,
      };
    }
    return parameters;
  };

  const encounterSelection = (id: number): EncounterSelection => {
    const variant = ENCOUNTER_BY_ID.get(id)!;
    return {
      encounterId: variant.id,
      familyId: variant.familyId,
      difficulty: variant.difficulty,
      sourceTitle: variant.title,
    };
  };

  /* Frozen 12.36 demonstration lineup: Guard D (job 65) and Archer C (job 91), gender 0, flag 0. */
  const guardD: HumanUnit = {
    kind: "human",
    name: "Guard D",
    jobId: "Guard",
    rank: "D",
    gender: 0,
    parameters: humanParameters(123, 5000, 1000),
    equipmentSlots: {
      weapon: { id: 72, level: 5, affinity: 2 },
      shield: { id: 178, level: 5, affinity: 2 },
      head: null,
      body: null,
      accessory: null,
    },
    weaponId: 72,
    skills: [
      { skillId: 37, invocationLevel: 1 },
      { skillId: 109, invocationLevel: 1 },
    ],
    humanFlags: 0,
    appearanceInputs: { flag: 0, source: "SOURCE_INPUT" },
  };

  const archerC: HumanUnit = {
    kind: "human",
    name: "Archer C",
    jobId: "Archer",
    rank: "C",
    gender: 0,
    parameters: humanParameters(123, 4200, 900),
    equipmentSlots: {
      weapon: { id: 162, level: 5, affinity: 2 },
      shield: null,
      head: null,
      body: null,
      accessory: null,
    },
    weaponId: 162,
    skills: [{ skillId: 37, invocationLevel: 0 }],
    humanFlags: 0,
    appearanceInputs: { flag: 0, source: "SOURCE_INPUT" },
  };

  const pet116 = (name: string, owner: string | null): PetMonsterUnit => ({
    kind: "monster",
    name,
    monsterId: 116,
    parameters: monsterParameters(1, 440, 60),
    skills: [{ skillId: 37, invocationLevel: 1 }],
    ...(owner ? { petOwnerName: owner } : {}),
  });

  const horizon = { tickLimit: 200 };
  type AdapterScenarioUnit = {
    name: string;
    human: boolean;
    monsterId: number | null;
    weaponId: number;
    equipment: Array<{ id: number; level: number; affinity: number }>;
    visitor: boolean;
    leaderIdentity: boolean;
    skills: number[];
    invocationLevels: number[];
    parameters: Record<
      string,
      { rawValue: number; rawMax: number; extraValue: number; extraMax: number; trainingLevel: number }
    >;
    humanFlags?: number;
    isHouseOwner?: boolean;
    petOwnerName?: string;
  };
  type AdapterScenario = {
    schema: string;
    encounterId: number;
    defeatCount: number;
    mathSeed: number;
    libSeed: number;
    tickLimit: number;
    ownUnits: AdapterScenarioUnit[];
    housePets?: Record<string, AdapterScenarioUnit[]>;
    holyHerbStock: number;
    inputs: unknown[];
    prePlacement?: unknown;
    note?: string;
  };
  type AdapterVisualUnit = {
    name: string;
    kind: "human" | "monster";
    jobId?: string;
    rank?: string;
    weaponId: number;
    weaponMotion: number | null;
    skills: Array<{ skillId: number; motion: number | null }>;
  };
  type AdapterFixture = {
    id: string;
    label: string;
    expectation: string;
    setup: BattleSetup;
    /** normalized unit order the authoritative loader must produce (selected, then house pets) */
    expectedUnits: string[];
  };

  const fixtureList: AdapterFixture[] = [
    {
      id: "A",
      label: "reference Wairo Tank guard/archer",
      expectation: "frozen demonstration lineup, encounter 19",
      setup: { ...base, encounter: encounterSelection(19), horizon, seeds: { mathSeed: 7, libSeed: 8 }, playerTeam: [guardD, archerC] },
      expectedUnits: ["Guard D", "Archer C"],
    },
    {
      id: "B",
      label: "one human",
      expectation: "default serialized human, encounter 0",
      setup: { ...base, encounter: encounterSelection(0), playerTeam: [createHumanUnit(1)] },
      expectedUnits: ["Human 1"],
    },
    {
      id: "C",
      label: "two humans and one pet",
      expectation: "ownerless pet stays in ownUnits after the humans",
      setup: { ...base, encounter: encounterSelection(19), horizon, playerTeam: [guardD, archerC, pet116("Pet 1", null)] },
      expectedUnits: ["Guard D", "Archer C", "Pet 1"],
    },
    {
      id: "D",
      label: "roster above the initial cap",
      expectation: "three humans convert with PARTY_CAP_UNVALIDATED",
      setup: { ...base, encounter: encounterSelection(0), playerTeam: [guardD, archerC, createHumanUnit(3)] },
      expectedUnits: ["Guard D", "Archer C", "Human 3"],
    },
    {
      id: "G",
      label: "owner-bound house pet",
      expectation: "declared household pet leaves ownUnits and is appended by the loader",
      setup: {
        ...base,
        encounter: encounterSelection(19),
        horizon,
        playerTeam: [guardD, archerC],
        households: { "Guard D": [pet116("House pet", null)] },
      },
      expectedUnits: ["Guard D", "Archer C", "House pet"],
    },
    {
      id: "P",
      label: "explicit pre-placement",
      expectation: "structure passed through unchanged",
      setup: {
        ...base,
        startProfile: undefined,
        encounter: encounterSelection(0),
        playerTeam: [createHumanUnit(1)],
        prePlacement: {
          "Human 1": {
            cell: [0, 1],
            position: [0, 0, 24],
            offset: [0, 0, 0],
            board: { 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
            longBoard: {},
          },
        },
      },
      expectedUnits: ["Human 1"],
    },
    {
      id: "S",
      label: "seeds, horizon, inputs and herbs",
      expectation: "direct mapping, no silent defaults",
      setup: {
        ...base,
        encounter: encounterSelection(12),
        seeds: { mathSeed: 11, libSeed: 22 },
        horizon: { tickLimit: 321 },
        inputs: [{ tick: 5, type: "holy_herb", phase: "before_fighters" }],
        holyHerbStock: 3,
        playerTeam: [createHumanUnit(1)],
      },
      expectedUnits: ["Human 1"],
    },
  ];

  const familyEncounterIds = ["saturday-kairobot-knight", "tuesday-kairobot-mage", "thursday-aloha-kairobot", "sunday-kairo-kommander", "wairo-dungeon"].map(
    (familyId) => ENCOUNTER_FAMILIES.find((family) => family.id === familyId)!.variants[0].id,
  );
  for (const id of familyEncounterIds) {
    fixtureList.push({
      id: `E${id}`,
      label: `family sample encounter ${id}`,
      expectation: "one encounter from each recovered family",
      setup: { ...base, encounter: encounterSelection(id), playerTeam: [createHumanUnit(1)] },
      expectedUnits: ["Human 1"],
    });
  }
  for (const variant of ENCOUNTER_VARIANTS) {
    fixtureList.push({
      id: `F${variant.id}`,
      label: `every encounter id ${variant.id}`,
      expectation: "encounter id maps directly",
      setup: { ...base, encounter: encounterSelection(variant.id), playerTeam: [createHumanUnit(1)] },
      expectedUnits: ["Human 1"],
    });
  }

  /*
   * PASS 16 COMMAND 16.4 run fixtures.
   *
   * `R`/`RL` keep the recovered Guard D loadout (Fisherman's Pike, motion 9). COMMAND 16.5 integrated
   * every recovered ordinary weapon behaviour, so the spear now runs; `R4` keeps the sword
   * substitution 16.4 had to use, for continuity of that evidence.
   */
  const guardDRunnable: HumanUnit = {
    ...guardD,
    equipmentSlots: { ...guardD.equipmentSlots, weapon: { id: 93, level: 5, affinity: 2 } },
    weaponId: 93,
  };
  const humanWithWeapon = (unit: HumanUnit, weaponId: number): HumanUnit => ({
    ...unit,
    equipmentSlots: { ...unit.equipmentSlots, weapon: { id: weaponId, level: 5, affinity: 2 } },
    weaponId,
  });
  fixtureList.push(
    {
      id: "R",
      label: "reference Wairo guard/archer (recovered weapons)",
      expectation: "spear motion 9 and bow motion 11, encounter 19",
      setup: {
        ...base,
        encounter: encounterSelection(19),
        horizon,
        seeds: { mathSeed: 7, libSeed: 8 },
        playerTeam: [guardD, archerC],
      },
      expectedUnits: ["Guard D", "Archer C"],
    },
    {
      id: "R4",
      label: "reference sword substitution kept from 16.4",
      expectation: "sword motion 4 and bow motion 11, encounter 19",
      setup: {
        ...base,
        encounter: encounterSelection(19),
        horizon,
        seeds: { mathSeed: 7, libSeed: 8 },
        playerTeam: [guardDRunnable, archerC],
      },
      expectedUnits: ["Guard D", "Archer C"],
    },
    {
      id: "RL",
      label: "reference long horizon",
      expectation: "1000 ticks reach knock-down, leaving and a verdict",
      setup: {
        ...base,
        encounter: encounterSelection(19),
        horizon: { tickLimit: 1000 },
        seeds: { mathSeed: 7, libSeed: 8 },
        playerTeam: [guardD, archerC],
      },
      expectedUnits: ["Guard D", "Archer C"],
    },
    {
      id: "RM",
      label: "mixed human/human/pet",
      expectation: "three stable identities across humans and a pet",
      setup: {
        ...base,
        encounter: encounterSelection(19),
        horizon,
        seeds: { mathSeed: 7, libSeed: 8 },
        playerTeam: [guardDRunnable, archerC, pet116("Pet 1", null)],
      },
      expectedUnits: ["Guard D", "Archer C", "Pet 1"],
    },
    {
      id: "RD",
      label: "large roster above the initial cap",
      expectation: "four humans run with PARTY_CAP_UNVALIDATED",
      setup: {
        ...base,
        encounter: encounterSelection(0),
        horizon,
        seeds: { mathSeed: 7, libSeed: 8 },
        playerTeam: [guardDRunnable, archerC, createHumanUnit(3), createHumanUnit(4)],
      },
      expectedUnits: ["Guard D", "Archer C", "Human 3", "Human 4"],
    },
  );

  /*
   * PASS 16 COMMAND 16.5 per-motion fixtures. One runnable scenario per recovered ordinary weapon
   * motion the equipment catalog uses (motion id = the weapon's EquipData motion = the behaviour
   * EnterAttacking requests), plus the spear matrix used for the all-20 re-run.
   */
  const WEAPON_MOTION_FIXTURES: Array<[string, number, string]> = [
    ["W4", 93, "sword (D/ Steel Sword)"],
    ["W9", 72, "spear (E/ Fisherman's Pike)"],
    ["W10", 157, "gun (D/ Pistol)"],
    ["W11", 162, "bow (D/ Bow)"],
    ["W12", 9, "tool (Torch)"],
    ["W16", 10, "scoop (Shovel)"],
    ["W37", 16, "rake (Rake)"],
  ];
  for (const [id, weaponId, label] of WEAPON_MOTION_FIXTURES) {
    fixtureList.push({
      id,
      label: `weapon motion fixture: ${label}`,
      expectation: "ordinary attack runs with the recovered weapon behaviour",
      setup: {
        ...base,
        encounter: encounterSelection(19),
        horizon,
        seeds: { mathSeed: 7, libSeed: 8 },
        playerTeam: [humanWithWeapon(guardD, weaponId), archerC],
      },
      expectedUnits: ["Guard D", "Archer C"],
    });
  }
  for (const variant of ENCOUNTER_VARIANTS) {
    fixtureList.push({
      id: `M${variant.id}`,
      label: `spear matrix encounter ${variant.id}`,
      expectation: "recovered spear loadout runs every encounter",
      setup: {
        ...base,
        encounter: encounterSelection(variant.id),
        horizon,
        seeds: { mathSeed: 7, libSeed: 8 },
        playerTeam: [guardD, archerC],
      },
      expectedUnits: ["Guard D", "Archer C"],
    });
  }

  const adapterFixtures: Record<string, unknown> = {};
  for (const fixture of fixtureList) {
    try {
      const { scenario, warnings, visualSetup } = battleSetupToCombatScenario(fixture.setup);
      const selected = scenario.ownUnits.map((unit) => unit.name);
      const appended = Object.values(scenario.housePets ?? {}).flat().map((pet) => pet.name);
      adapterFixtures[fixture.id] = {
        label: fixture.label,
        expectation: fixture.expectation,
        expectedUnits: fixture.expectedUnits,
        /** The serialized setup is kept so the 16.4 bridge pass can re-run this exact instance. */
        setup: fixture.setup,
        warnings: warnings.map((issue) => `${issue.category}:${issue.code}`),
        unitNames: selected,
        scenario,
        visualSetup,
      };
      check(`adapter ${fixture.id} converts`, true, true);
      check(`adapter ${fixture.id} encounter id`, scenario.encounterId, fixture.setup.encounter.encounterId);
      check(`adapter ${fixture.id} normalized unit order`, [...selected, ...appended], fixture.expectedUnits);
    } catch (error) {
      adapterFixtures[fixture.id] = {
        label: fixture.label,
        expectation: fixture.expectation,
        error: String(error),
      };
      check(`adapter ${fixture.id} converts`, `threw ${String(error)}`, true);
    }
  }

  const fixtureScenario = (id: string): AdapterScenario | undefined =>
    (adapterFixtures[id] as { scenario?: AdapterScenario } | undefined)?.scenario;
  const fixtureWarnings = (id: string): string[] =>
    (adapterFixtures[id] as { warnings?: string[] } | undefined)?.warnings ?? [];
  const fixtureVisual = (id: string): AdapterVisualUnit[] =>
    (adapterFixtures[id] as { visualSetup?: { units: AdapterVisualUnit[] } } | undefined)?.visualSetup?.units ?? [];

  const reference = fixtureScenario("A")!;
  check("reference scenario unit count", reference.ownUnits.length, 2);
  check("reference encounter is Wairo Tank", reference.encounterId, 19);
  check("reference human mapping", reference.ownUnits.map((unit) => unit.human), [true, true]);
  check("reference monster id is null for humans", reference.ownUnits.map((unit) => unit.monsterId), [null, null]);
  check("reference weapon ids", reference.ownUnits.map((unit) => unit.weaponId), [72, 162]);
  check(
    "reference equipment order keeps weapon then shield",
    reference.ownUnits[0].equipment,
    [
      { id: 72, level: 5, affinity: 2 },
      { id: 178, level: 5, affinity: 2 },
    ],
  );
  check(
    "reference equipment order keeps the bow only",
    reference.ownUnits[1].equipment,
    [{ id: 162, level: 5, affinity: 2 }],
  );
  check("reference skill order preserved", reference.ownUnits[0].skills, [37, 109]);
  check("reference invocation levels preserved", reference.ownUnits[0].invocationLevels, [1, 1]);
  check("reference second unit skill order", reference.ownUnits[1].skills, [37]);
  const referenceParameters = reference.ownUnits[0].parameters;
  check("reference HP parameter preserved", [referenceParameters["10"].rawValue, referenceParameters["10"].rawMax], [5000, 5000]);
  check("reference MP parameter preserved", [referenceParameters["11"].rawValue, referenceParameters["11"].rawMax], [1000, 1000]);
  check("reference MP training level preserved", referenceParameters["11"].trainingLevel, 123);
  check(
    "reference human parameter ids are the training set",
    Object.keys(referenceParameters).map(Number).sort((a, b) => a - b),
    [10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22],
  );
  for (const leaked of ["jobId", "rank", "gender", "appearanceInputs", "equipmentSlots", "kind", "ownerPlayer"]) {
    check(
      `reference scenario unit does not carry ${leaked}`,
      Object.keys(reference.ownUnits[0] as unknown as Record<string, unknown>).includes(leaked),
      false,
    );
  }
  const referenceVisual = fixtureVisual("A");
  check("visual setup keeps job ids", referenceVisual.map((unit) => unit.jobId), ["Guard", "Archer"]);
  check("visual setup keeps ranks", referenceVisual.map((unit) => unit.rank), ["D", "C"]);
  check("visual setup keeps weapon motions", referenceVisual.map((unit) => unit.weaponMotion), [9, 11]);
  check("visual setup keeps skill motions", referenceVisual[0].skills.map((entry) => entry.motion), [31, 4]);
  check("frozen Guard D entry resolves from the setup label", humanIdleCharacterForUnit({ jobName: "Guard", rank: "D" })?.jobSourceId, 65);
  check("frozen Archer C entry resolves from the setup label", humanIdleCharacterForUnit({ jobName: "Archer", rank: "C" })?.jobSourceId, 91);
  check("frozen Guard D flag matches the setup flag", humanIdleCharacterForUnit({ jobName: "Guard", rank: "D" })?.flag, guardD.humanFlags);
  check("frozen Archer C gender matches the setup gender", humanIdleCharacterForUnit({ jobName: "Archer", rank: "C" })?.genderIndex, archerC.gender);

  const petUnit = fixtureScenario("C")!.ownUnits[2];
  check("pet unit maps human=false", petUnit.human, false);
  check("pet unit maps monsterId", petUnit.monsterId, 116);
  check("pet compatibility weapon id", petUnit.weaponId, 0);
  check("pet compatibility equipment list", petUnit.equipment, []);
  check("pet compatibility visitor flag", petUnit.visitor, false);
  check("pet compatibility leader flag", petUnit.leaderIdentity, false);
  check("ownerless pet stays in ownUnits", fixtureScenario("C")!.housePets, undefined);
  const housePetFixture = fixtureScenario("G")!;
  check("owner-bound pet leaves ownUnits", housePetFixture.ownUnits.map((unit) => unit.name), ["Guard D", "Archer C"]);
  check("owner-bound pet marks the human house owner", housePetFixture.ownUnits[0].isHouseOwner, true);
  check("house pet recorded under its owner", housePetFixture.housePets?.["Guard D"]?.map((pet) => pet.name), ["House pet"]);
  check("house pet keeps petOwnerName", housePetFixture.housePets?.["Guard D"]?.[0].petOwnerName, "Guard D");
  const emptyHousehold = battleSetupToCombatScenario({
    ...base,
    encounter: encounterSelection(19),
    horizon,
    playerTeam: [guardD, archerC],
    households: { "Guard D": [] },
  }).scenario;
  check("declared empty household is emitted", emptyHousehold.housePets, { "Guard D": [] });
  check("declared empty household marks the owner", emptyHousehold.ownUnits[0].isHouseOwner, true);
  check(
    "undeclared monster carries the missing-data issue",
    validateBattleSetup({ ...base, playerTeam: [guardD, pet116("Stray", null)] }).some(
      (issue) => issue.code === "PET_MEMBERSHIP_MISSING_DATA",
    ),
    true,
  );
  check(
    "petOwnerName monsters are refused in playerTeam",
    validateBattleSetup({ ...base, playerTeam: [guardD, pet116("Pet 1", "Guard D")] }).some(
      (issue) => issue.code === "PET_OWNER_IN_PLAYER_TEAM" && issue.category === "ERROR",
    ),
    true,
  );
  check(
    "a household entry outside the roster is rejected",
    validateBattleSetup({ ...base, playerTeam: [guardD], households: { Ghost: [] } }).some(
      (issue) => issue.code === "PET_OWNER_NOT_SELECTED_HUMAN" && issue.category === "ERROR",
    ),
    true,
  );

  check("recovered reference keeps the pike", fixtureScenario("A")!.ownUnits[0].weaponId, 72);
  check(
    "reference weapon motions are the recovered ones",
    fixtureVisual("R").map((unit) => unit.weaponMotion),
    [9, 11],
  );
  check("sword substitution fixture keeps motion 4", fixtureVisual("R4").map((unit) => unit.weaponMotion), [4, 11]);
  check("runnable reference is encounter 19", fixtureScenario("R")!.encounterId, 19);
  check("long reference horizon", fixtureScenario("RL")!.tickLimit, 1000);
  check("mixed run fixture keeps three identities", fixtureScenario("RM")!.ownUnits.map((unit) => unit.name), ["Guard D", "Archer C", "Pet 1"]);
  check("mixed run fixture pet is a monster", fixtureScenario("RM")!.ownUnits[2].monsterId, 116);
  check("large run fixture has four units", fixtureScenario("RD")!.ownUnits.length, 4);
  check("large run fixture warns but converts", fixtureWarnings("RD").includes("WARNING:PARTY_CAP_UNVALIDATED"), true);
  check(
    "one fixture per recovered weapon motion",
    [["W4", 4], ["W9", 9], ["W10", 10], ["W11", 11], ["W12", 12], ["W16", 16], ["W37", 37]].map(
      ([id, motion]) => [id, fixtureVisual(id as string)[0]?.weaponMotion, motion],
    ),
    [["W4", 4, 4], ["W9", 9, 9], ["W10", 10, 10], ["W11", 11, 11], ["W12", 12, 12], ["W16", 16, 16], ["W37", 37, 37]],
  );
  check("spear matrix covers all 20 encounters", ENCOUNTER_VARIANTS.every((variant) => Boolean(fixtureScenario(`M${variant.id}`))), true);

  const largerWarnings = fixtureWarnings("D");
  check(
    "roster above the cap warns without rejecting",
    largerWarnings.includes("WARNING:PARTY_CAP_UNVALIDATED"),
    true,
  );
  const familyScenarios = familyEncounterIds.map((id) => fixtureScenario(`E${id}`));
  check("five family samples convert", familyScenarios.every(Boolean), true);
  check("five distinct encounter ids from five families", familyScenarios.map((scenario) => scenario?.encounterId), familyEncounterIds);
  const allEncounterScenarios = ENCOUNTER_VARIANTS.map((variant) => fixtureScenario(`F${variant.id}`));
  check("all 20 encounter ids convert", allEncounterScenarios.filter(Boolean).length, 20);
  check(
    "all 20 encounter ids map directly",
    allEncounterScenarios.map((scenario) => scenario?.encounterId),
    ENCOUNTER_VARIANTS.map((variant) => variant.id),
  );

  const seedsFixture = fixtureScenario("S")!;
  check("seeds map directly", [seedsFixture.mathSeed, seedsFixture.libSeed], [11, 22]);
  check("horizon maps directly", seedsFixture.tickLimit, 321);
  check("herb stock maps directly", seedsFixture.holyHerbStock, 3);
  check("explicit inputs map directly", seedsFixture.inputs, [{ tick: 5, type: "holy_herb", phase: "before_fighters" }]);
  const prePlacementFixture = fixtureScenario("P")!;
  check(
    "pre-placement maps directly",
    prePlacementFixture.prePlacement,
    {
      "Human 1": {
        cell: [0, 1],
        position: [0, 0, 24],
        offset: [0, 0, 0],
        board: { 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
        longBoard: {},
      },
    },
  );
  const bareHanded = { ...base, encounter: encounterSelection(0), playerTeam: [createHumanUnit(1)] };
  check("bare-handed default human is not a validation error", validateBattleSetup(bareHanded).filter((issue) => issue.category === "ERROR").length, 0);

  const adapterErrorCodes = (setup: BattleSetup): string[] => {
    try {
      battleSetupToCombatScenario(setup);
      return [];
    } catch (error) {
      return error instanceof BattleSetupAdapterError
        ? error.issues.map((issue) => issue.code)
        : [`NOT_ADAPTER_ERROR:${String(error)}`];
    }
  };
  check("pet-only roster is rejected by the adapter", adapterErrorCodes({ ...base, playerTeam: [pet116("Pet 1", null)] }), ["PRODUCT_RULE_NO_HUMAN"]);
  check(
    "unknown encounter is rejected by the adapter",
    adapterErrorCodes({ ...base, encounter: { encounterId: 99, familyId: "x", difficulty: 0, sourceTitle: "x" }, playerTeam: [guardD] }),
    ["ENCOUNTER_UNKNOWN"],
  );
  check(
    "weapon/slot contradiction is rejected by the adapter",
    adapterErrorCodes({ ...base, playerTeam: [{ ...guardD, weaponId: 162 }] }),
    ["WEAPON_SLOT_MISMATCH"],
  );
  check(
    "non-zero weapon id beside weaponId 0 is rejected by the adapter",
    adapterErrorCodes({ ...base, playerTeam: [{ ...guardD, weaponId: 0 }] }),
    ["WEAPON_SLOT_MISMATCH"],
  );
  check(
    "unknown pet owner is rejected by the adapter",
    adapterErrorCodes({ ...base, playerTeam: [guardD], households: { Nobody: [pet116("Pet 1", "Nobody")] } }),
    ["PET_OWNER_NOT_SELECTED_HUMAN"],
  );
  check("bare-handed human converts", adapterErrorCodes(bareHanded), []);

  const setupBeforeConversion = JSON.stringify({ ...base, playerTeam: [guardD, archerC] });
  battleSetupToCombatScenario({ ...base, playerTeam: [guardD, archerC] });
  check(
    "conversion does not mutate the setup model",
    JSON.stringify({ ...base, playerTeam: [guardD, archerC] }),
    setupBeforeConversion,
  );
  check(
    "conversion is deterministic",
    JSON.stringify(battleSetupToCombatScenario({ ...base, playerTeam: [guardD, archerC] }).scenario) ===
      JSON.stringify(battleSetupToCombatScenario({ ...base, playerTeam: [guardD, archerC] }).scenario),
    true,
  );

  /* Render the actual setup page and run DOM-level checks. */
  const root = createRoot(document.getElementById("root")!);
  root.render(<BattleSetupPage />);
  await sleep(700);

  const rootElement = document.querySelector("[data-battle-setup-root]");
  checkTruthy("setup page rendered", rootElement);
  check("DOM encounter count", Number(rootElement?.getAttribute("data-encounter-count")), 20);
  check("DOM family count", Number(rootElement?.getAttribute("data-family-count")), 5);
  const options = Array.from(document.querySelectorAll("[data-encounter-option]"));
  check("DOM has 20 encounter options", options.length, 20);
  check("DOM options are selectable", options.every((option) => option.getAttribute("data-selectable") === "true"), true);
  check("DOM partial coverage remains selectable", options.some((option) => option.getAttribute("data-coverage") === "PARTIAL"), true);
  check("DOM difficulty 3 option shows Extreme", options.some((option) => option.getAttribute("data-difficulty") === "3" && (option.textContent ?? "").includes("Extreme")), true);

  const click = (selector: string) => {
    const button = document.querySelector(selector);
    if (!button) return false;
    (button as HTMLElement).click();
    return true;
  };
  check("add-human action exists", click('[data-action="add-human"]'), true);
  await sleep(100);
  check("add-pet action exists", click('[data-action="add-pet"]'), true);
  await sleep(100);
  checkTruthy("party cap warning appears above 2 units", document.querySelector("[data-party-cap-warning]"));
  checkTruthy("rendered units are mixed", document.querySelector('[data-unit-kind="human"]') && document.querySelector('[data-unit-kind="monster"]'));
  check("rendered party size is 3", Number(document.querySelector("[data-party-size]")?.getAttribute("data-party-size")), 3);

  check("add-skill action exists", click('[data-action="add-skill"]'), true);
  await sleep(100);
  checkTruthy("skill row rendered with motion", document.querySelector("[data-skill-index]"));
  checkTruthy("unknown-native rules remain warnings in DOM", document.querySelector('[data-category="UNKNOWN_NATIVE_RULE"]'));

  /* Player-facing item budget, exact-tick schedule and user-preset controls. */
  checkTruthy("user preset card rendered", document.querySelector("[data-user-preset-card]"));
  checkTruthy("load-user-preset action exists", document.querySelector('[data-action="load-user-preset"]'));
  checkTruthy(
    "preset known/assumed split rendered",
    document.querySelector("[data-user-preset-known]") && document.querySelector("[data-user-preset-assumed]"),
  );
  checkTruthy("item budget card rendered", document.querySelector("[data-item-budget-card]"));
  checkTruthy("holy herb finite budget control rendered", document.querySelector("[data-holy-herb-stock]"));
  checkTruthy(
    "canonical Large Potion row (or explicit unavailable reason) rendered",
    document.querySelector("[data-large-potion-stock]") || document.querySelector("[data-large-potion-unavailable]"),
  );
  checkTruthy("item schedule region rendered", document.querySelector("[data-item-schedule]"));
  check("schedule-herb action adds a row", click('[data-action="schedule-herb"]'), true);
  await sleep(150);
  check("one scheduled row rendered", document.querySelectorAll("[data-item-schedule-row]").length, 1);
  check("scheduled herb row is a holy_herb input", document.querySelector('[data-input-kind="holy_herb"]') !== null, true);
  check("schedule-potion action adds a canonical item row", click('[data-action="schedule-potion"]'), true);
  await sleep(150);
  check("two scheduled rows rendered", document.querySelectorAll("[data-item-schedule-row]").length, 2);
  check(
    "scheduled battle item names the canonical Large Potion row",
    (document.querySelector('[data-input-kind="item"]')?.textContent ?? "").includes(LARGE_POTION_ITEM?.name ?? ""),
    true,
  );
  check(
    "run card states the native-checked conditional prediction",
    (document.querySelector("[data-run-battle-card]")?.textContent ?? "").includes("conditional prediction"),
    true,
  );
  checkTruthy("comparison item/input policy block rendered", document.querySelector("[data-comparison-item-budget]"));

  check("export action exists", click('[data-action="export-json"]'), true);
  await sleep(100);
  const textarea = document.querySelector("[data-export-json]") as HTMLTextAreaElement | null;
  check("exported JSON has schema", Boolean(textarea?.value.includes('"schema": "ka-battle-setup-1"')), true);
  check("exported JSON has no DOM state", Boolean(textarea?.value.includes("data-battle-setup-root")), false);

  if (textarea) {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, "{not-json");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  await sleep(100);
  check("invalid import action exists", click('[data-action="import-json"]'), true);
  await sleep(100);
  checkTruthy("invalid import reports a message", document.querySelector("[data-import-message]"));

  /*
   * PASS 16 COMMAND 16.4 bridge pass.
   *
   * Once the run driver has written `./bridge-input.json` (real `ka-battle-replay-1` payloads from
   * the authoritative Python runner), exercise the production bridge `runBattleSetup(setup,
   * transport)` on those exact setups: adapter, transport boundary, parse/join, deterministic
   * fixture text and the rejection paths. Without that file the pass reports itself as skipped.
   */
  type BridgeSummary = { entries: number; passed: number; total: number; failed: string[] };
  let bridge: BridgeSummary;
  let httpTransport: Record<string, unknown> | null = null;
  try {
    /* A missing file is answered by the dev server's SPA fallback (HTML, 200), so check the content
     * type before parsing; otherwise the whole pass would abort on an unrelated HTML body. */
    const loadJson = async (name: string) => {
      try {
        const loaded = await fetch(name, { cache: "no-store" });
        if (!loaded.ok) return null;
        if (!(loaded.headers.get("content-type") ?? "").includes("application/json")) return null;
        return await loaded.json();
      } catch {
        return null;
      }
    };
    const input = await loadJson("./bridge-input.json");
    if (!input?.entries?.length) {
      bridge = { entries: 0, passed: 0, total: 0, failed: [] };
      /*
       * PASS 16 COMMAND 16.8: when `./preview-transport.json` names an HTTP endpoint, drive the
       * production transport (`createHttpBattleScenarioTransport`) over the network and publish
       * what came back, so the check driver can compare it with the file-transport payload.
       */
      try {
        const transportConfig = await loadJson("./preview-transport.json");
        if (transportConfig?.endpoint) {
          const setup = (adapterFixtures.R as { setup: BattleSetup }).setup;
          const run = await runBattleSetup(setup, createHttpBattleScenarioTransport(transportConfig.endpoint));
          const serialized = serializeBattleReplayResult(run.result);
          httpTransport = {
            endpoint: transportConfig.endpoint,
            status: "ok",
            schema: run.result.schema,
            unitNames: run.result.units.filter((unit) => unit.side === "ally").map((unit) => unit.name),
            enemyCount: run.result.units.filter((unit) => unit.side === "enemy").length,
            eventCount: run.result.events.length,
            warnings: run.result.setupSummary.warnings ?? [],
            visuals: Object.keys(run.result.visuals ?? {}).sort(),
            serializedLength: serialized.length,
          };
          check("browser HTTP transport returns a replay result", run.result.schema, "ka-battle-replay-1");
          check(
            "browser HTTP transport keeps the reference roster",
            run.result.units.filter((unit) => unit.side === "ally").map((unit) => unit.name),
            ["Guard D", "Archer C"],
          );
          checkTruthy("browser HTTP transport joins the visual metadata", Object.keys(run.result.visuals ?? {}).length === 2);
          checkTruthy(
            "browser HTTP transport keeps the ordinary weapon attack events",
            run.result.events.some((event) => event.kind === "attack" && event.skillId === null),
          );
        }
      } catch (error) {
        httpTransport = { status: "error", error: String(error) };
        check("browser HTTP transport returns a replay result", `threw ${String(error)}`, "ka-battle-replay-1");
      }
    } else {
      const start = checks.length;
      let transportCalls = 0;
      for (const entry of input.entries as Array<{
        fixtureId: string;
        setup: BattleSetup;
        scenario: unknown;
        replayJson: string;
        warnings: string[];
        expectedUnits: string[];
      }>) {
        const transport: BattleScenarioTransport = async (scenarioJson) => {
          transportCalls += 1;
          check(`bridge ${entry.fixtureId} sends the adapter scenario unchanged`, scenarioJson, JSON.stringify(entry.scenario));
          return entry.replayJson;
        };
        try {
          const run = await runBattleSetup(entry.setup, transport);
          check(`bridge ${entry.fixtureId} returns a replay result`, run.result.schema, "ka-battle-replay-1");
          check(
            `bridge ${entry.fixtureId} keeps the ally roster order`,
            run.result.units.filter((unit) => unit.side === "ally").map((unit) => unit.name),
            entry.expectedUnits,
          );
          check(
            `bridge ${entry.fixtureId} joins the visual metadata by unitId`,
            Object.keys(run.result.visuals ?? {}).sort(),
            entry.expectedUnits.map((_, index) => `ally:${index}`),
          );
          check(
            `bridge ${entry.fixtureId} carries the adapter warnings into the summary`,
            run.result.setupSummary.warnings,
            entry.warnings,
          );
          check(
            `bridge ${entry.fixtureId} produces deterministic fixture text`,
            run.replayJson === serializeBattleReplayResult(run.result) && run.replayJson.endsWith("\n"),
            true,
          );
        } catch (error) {
          check(`bridge ${entry.fixtureId} returns a replay result`, `threw ${String(error)}`, "ka-battle-replay-1");
        }
      }
      const runnableReference = (adapterFixtures.R as { setup: BattleSetup }).setup;
      let rejected = 0;
      for (const [label, transport] of [
        ["non-JSON transport output", async () => "not-json"],
        ["payload with the wrong schema", async () => JSON.stringify({ schema: "nope" })],
        ["payload without units", async () => JSON.stringify({ schema: "ka-battle-replay-1" })],
      ] as Array<[string, BattleScenarioTransport]>) {
        try {
          await runBattleSetup(runnableReference, transport);
          check(`bridge rejects ${label}`, "resolved", "rejected");
        } catch {
          rejected += 1;
          check(`bridge rejects ${label}`, true, true);
        }
      }
      const callsBeforeErrorCase = transportCalls;
      try {
        await runBattleSetup(
          { ...base, playerTeam: [pet116("Pet 1", null)] },
          async () => {
            transportCalls += 1;
            return "{}";
          },
        );
        check("bridge rejects an ERROR setup", "resolved", "rejected");
      } catch {
        check("bridge rejects an ERROR setup", true, true);
      }
      checkTruthy(
        "bridge never contacts the transport for an ERROR setup",
        transportCalls === callsBeforeErrorCase,
        `transport calls ${transportCalls} vs ${callsBeforeErrorCase}`,
      );
      const slice = checks.slice(start);
      bridge = {
        entries: (input.entries as unknown[]).length,
        passed: slice.filter((entry) => entry.passed).length,
        total: slice.length,
        failed: slice.filter((entry) => !entry.passed).map((entry) => entry.name),
      };
      void rejected;
    }
  } catch (error) {
    bridge = { entries: 0, passed: 0, total: 0, failed: [`bridge pass error: ${String(error)}`] };
  }

  /*
   * PASS 16 COMMAND 16.14: saved-loadout -> battle setup legality and lossless transfer.
   *
   * Uses the bundled local shared data (the same owner the pages read) and the real page, so the
   * browser check exercises the conversion, the import card and the handoff between the two pages.
   */
  const sharedLoadoutData = localSharedData as unknown as SharedLoadoutData;
  const siteEquipment = Object.keys(sharedLoadoutData.slotAssignments ?? {});
  const weaponName = siteEquipment.find(
    (name) =>
      sharedLoadoutData.slotAssignments?.[name] === "Weapon" &&
      sharedLoadoutData.weaponTypes?.[name] === "Sword" &&
      resolveCombatEquipmentId(name) !== null,
  );
  const shieldName = siteEquipment.find(
    (name) => sharedLoadoutData.slotAssignments?.[name] === "Shield" && resolveCombatEquipmentId(name) !== null,
  );
  const knightLoadout: SavedLoadout = {
    id: "harness-knight",
    name: "Harness Knight",
    jobName: "Knight",
    rank: "S",
    statLevels: { hp: 25, atk: 20, def: 20 },
    equipment: [
      ...(weaponName ? [{ name: weaponName, level: 12 }] : []),
      ...(shieldName ? [{ name: shieldName, level: 5 }] : []),
    ],
    skills: ["Area Attack Ⅰ", "Critical UP"],
    residentStatItems: { life: 2 },
  };

  const loadoutConversion = battleSetupFromLoadouts([knightLoadout], sharedLoadoutData, { encounterId: 19 });
  check("harness loadout converts with no ERROR issues", loadoutConversion.issues.filter((issue) => issue.category === "ERROR"), []);
  checkTruthy("harness loadout produced a setup", loadoutConversion.setup);
  const convertedUnit = loadoutConversion.units[0];
  check("harness conversion keeps the job and rank", [convertedUnit.jobId, convertedUnit.rank], ["Knight", "S"]);
  check("harness conversion carries the weapon id", convertedUnit.weaponId, weaponName ? resolveCombatEquipmentId(weaponName) : 0);
  check("harness conversion carries the equipment levels", [convertedUnit.equipmentSlots.weapon?.level ?? null, convertedUnit.equipmentSlots.shield?.level ?? null], [weaponName ? 12 : null, shieldName ? 5 : null]);
  check(
    "harness conversion carries the two Water of Life items on the bounded HP maximum",
    [convertedUnit.parameters["10"].extraValue, convertedUnit.parameters["10"].extraMax],
    [0, 20],
  );
  check("harness conversion keeps the skill ids in order", convertedUnit.skills.map((entry) => entry.skillId), ["Area Attack Ⅰ", "Critical UP"].map((name) => battleSkillIdForName(name)));
  checkTruthy("harness provenance marks the player inputs and the research-only inputs", loadoutConversion.provenance.some((entry) => entry.origin === "PLAYER_LOADOUT") && loadoutConversion.provenance.some((entry) => entry.origin === "RESEARCH_SYNTHETIC"));

  const harnessReimport = importBattleSetup(serializeBattleSetup(loadoutConversion.setup!));
  check("harness setup re-imports with no ERROR issues", harnessReimport.issues.filter((issue) => issue.category === "ERROR"), []);
  // Serialization sorts object keys; compare every value while retaining array order.
  const canonicalJson = (value: unknown) => JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
      : entry);
  check("harness re-import keeps parameters", canonicalJson(harnessReimport.setup!.playerTeam[0].parameters), canonicalJson(convertedUnit.parameters));
  check("harness re-import keeps equipment", canonicalJson(harnessReimport.setup!.playerTeam[0].equipmentSlots), canonicalJson(convertedUnit.equipmentSlots));
  check("harness re-import keeps skills", JSON.stringify(harnessReimport.setup!.playerTeam[0].skills), JSON.stringify(convertedUnit.skills));

  const harnessScenario = battleSetupToCombatScenario(loadoutConversion.setup!).scenario;
  const expectedEquipmentIds = (["weapon", "shield", "head", "body", "accessory"] as const)
    .map((slot) => convertedUnit.equipmentSlots[slot])
    .filter((selection): selection is { id: number; level: number; affinity: number } => Boolean(selection))
    .map((selection) => selection.id);
  check("harness adapter keeps the equipment ids", harnessScenario.ownUnits[0].equipment.map((row) => row.id), expectedEquipmentIds);

  const errorCodesOf = (result: ReturnType<typeof battleSetupFromLoadouts>) =>
    result.issues.filter((issue) => issue.category === "ERROR").map((issue) => issue.code);
  const forbiddenWeapon = siteEquipment.find(
    (name) =>
      sharedLoadoutData.slotAssignments?.[name] === "Weapon" &&
      sharedLoadoutData.weaponTypes?.[name] === "Bow" &&
      resolveCombatEquipmentId(name) !== null,
  );
  checkTruthy(
    "harness rejects a job-forbidden weapon",
    errorCodesOf(battleSetupFromLoadouts([
      { jobName: "Researcher", rank: "D", statLevels: { hp: 5 }, equipment: forbiddenWeapon ? [{ name: forbiddenWeapon, level: 3 }] : [], skills: [] },
    ], sharedLoadoutData)).includes("JOB_EQUIPMENT_NOT_ALLOWED"),
  );
  checkTruthy(
    "harness rejects an unknown skill",
    errorCodesOf(battleSetupFromLoadouts([{ jobName: "Knight", rank: "S", equipment: [], skills: ["Made Up Skill"] }], sharedLoadoutData)).includes("SKILL_NAME_UNRESOLVED"),
  );
  checkTruthy(
    "harness rejects an unknown equipment name",
    errorCodesOf(battleSetupFromLoadouts([{ jobName: "Knight", rank: "S", equipment: [{ name: "F/ Made Up Sword", level: 1 }], skills: [] }], sharedLoadoutData)).includes("EQUIPMENT_NAME_UNRESOLVED"),
  );
  checkTruthy(
    "harness rejects an invalid stat level",
    errorCodesOf(battleSetupFromLoadouts([{ jobName: "Knight", rank: "S", statLevels: { hp: 0 }, equipment: [], skills: [] }], sharedLoadoutData)).includes("LOADOUT_STAT_LEVEL_INVALID"),
  );
  const monarchConversion = battleSetupFromLoadouts([{ jobName: "Monarch", rank: "D", equipment: [], skills: [] }], sharedLoadoutData);
  check("harness blocks a job missing from the combat catalog", monarchConversion.setup, null);
  checkTruthy("harness names the missing combat-catalog job", errorCodesOf(monarchConversion).includes("JOB_NOT_IN_COMBAT_CATALOG"));
  check(
    "harness surfaces the exact native rejection text",
    describeNativeRunnerRejection(500, JSON.stringify({ error: "ScenarioError: Unknown skill or invocation setting" })),
    "ScenarioError: Unknown skill or invocation setting (runner HTTP 500)",
  );
  writeLoadoutHandoff(["harness-knight", "harness-second"]);
  const handoff = readLoadoutHandoff();
  check("harness handoff round-trips the selected loadout ids", handoff.payload?.loadoutIds, ["harness-knight", "harness-second"]);
  check("harness handoff is cleared after reading", readLoadoutHandoff().payload, null);

  /* DOM: the import card on a freshly mounted page with the fixture loadout saved. */
  try {
    localStorage.setItem("ka_loadouts", JSON.stringify([knightLoadout]));
  } catch {
    /* storage unavailable */
  }
  const loadoutContainer = document.createElement("div");
  document.body.appendChild(loadoutContainer);
  createRoot(loadoutContainer).render(<BattleSetupPage />);
  await sleep(900);
  const loadoutOption = loadoutContainer.querySelector("[data-loadout-option]") as HTMLElement | null;
  checkTruthy("DOM loadout option rendered", loadoutOption);
  loadoutOption?.click();
  await sleep(300);
  checkTruthy("DOM conversion panel rendered", loadoutContainer.querySelector("[data-loadout-conversion]"));
  const applyButton = loadoutContainer.querySelector('[data-action="apply-loadouts"]') as HTMLButtonElement | null;
  check("DOM apply button is enabled for a legal loadout", applyButton ? !applyButton.disabled : null, true);
  applyButton?.click();
  await sleep(300);
  const jobSelect = loadoutContainer.querySelector('[data-field="job-select"]');
  checkTruthy("DOM applied team shows the saved job", (jobSelect?.textContent ?? "").includes("Knight"));
  check(
    "DOM applied setup has no ERROR issues",
    Number((loadoutContainer.querySelector('[data-validation-summary]')?.textContent ?? "").match(/ERROR (\d+)/)?.[1] ?? -1),
    0,
  );
  loadoutContainer.remove();

  const failed = checks.filter((entry) => !entry.passed);
  (window as unknown as { __battleSetupCheck: unknown }).__battleSetupCheck = {
    checks,
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((entry) => entry.name),
    bridge,
    httpTransport,
    adapter: {
      note:
        "Adapter fixtures produced by battleSetupToCombatScenario; each `scenario` is verified " +
        "against the authoritative Python loader by tools/battle-setup-check/verify_adapter.py.",
      fixtureIds: fixtureList.map((fixture) => fixture.id),
      fixtures: adapterFixtures,
    },
  };
}

main().catch((error) => {
  (window as unknown as { __battleSetupCheck: unknown }).__battleSetupCheck = {
    checks,
    passed: 0,
    total: checks.length,
    failed: [`harness: ${String(error)}`],
  };
});
