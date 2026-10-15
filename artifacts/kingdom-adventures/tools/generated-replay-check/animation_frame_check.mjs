import assert from "node:assert/strict";
import { buildGeneratedFrames, generatedFrameClipId, generatedHumanLinesForFrame, generatedMonsterClip } from "@/lib/generated-battle-view";
import { HUMAN_CLIPS, HUMAN_REACTIONS, humanLineRecordsAt, humanReactionLinesAt, humanWalkLinesAt } from "@/lib/human-battle-animation";

const units = [
  {
    unitId: "ally:0", side: "ally", rosterIndex: 0, entityId: 1, name: "Hero", kind: "human",
    human: true, monsterId: null, weaponId: 93, skillIds: [], invocationLevels: [], grid: 0,
    column: 0, row: 0, cell: [0, 6], startHp: 500, startMp: 50, parameters: {},
  },
  {
    unitId: "enemy:0", side: "enemy", rosterIndex: 0, entityId: 2, name: "Slime", kind: "monster",
    human: false, monsterId: 116, weaponId: 0, skillIds: [], invocationLevels: [], grid: 0,
    column: 1, row: 5, cell: [1, 5], startHp: 500, startMp: 0, parameters: {},
  },
];
const events = [
  { seq: 0, tick: 0, phase: "battle", kind: "animation_request", targetUnitId: "ally:0", behavior: 3, clip: 12 },
  { seq: 1, tick: 0, phase: "battle", kind: "animation_frame", targetUnitId: "ally:0", frame: 4, rate: 4, clip: 12 },
  { seq: 2, tick: 0, phase: "battle", kind: "animation_request", targetUnitId: "enemy:0", behavior: 3, clip: 17 },
  { seq: 3, tick: 0, phase: "battle", kind: "animation_frame", targetUnitId: "enemy:0", frame: 5, rate: 1, clip: 17 },
  { seq: 4, tick: 5, phase: "battle", kind: "animation_request", targetUnitId: "ally:0", behavior: 3, clip: 12 },
  { seq: 5, tick: 5, phase: "battle", kind: "animation_frame", targetUnitId: "ally:0", frame: 0, rate: 4, clip: 12 },
  { seq: 6, tick: 5, phase: "battle", kind: "animation_request", targetUnitId: "enemy:0", behavior: 3, clip: 15 },
  { seq: 7, tick: 5, phase: "battle", kind: "animation_frame", targetUnitId: "enemy:0", frame: 0, rate: 1, clip: 15 },
  { seq: 8, tick: 6, phase: "battle", kind: "animation_frame", targetUnitId: "enemy:0", frame: 6, rate: 1, clip: 15 },
  { seq: 9, tick: 7, phase: "battle", kind: "animation_request", targetUnitId: "ally:0", behavior: 999, clip: 999 },
];
const replay = {
  schema: "ka-battle-replay-1",
  source: { exporter: "test", runner: "test", scenarioSchema: "", note: "" },
  setupSummary: { encounterId: 1, defeatCount: 0, mathSeed: 1, libSeed: 1, tickLimit: 6, holyHerbStock: 0, inputs: [], ownUnitCount: 1, enemyUnitCount: 1, prePlacement: [] },
  encounter: { encounterId: 1, title: null, level: 1, defeatCount: 0, followerSelectionDraws: 0, formationOrder: [], ownFormationOrder: [], enemyMonsterIds: [116] },
  units,
  ticks: 7,
  events,
  finalState: {
    verdict: null, battleState: 1, battleFrame: 7, ticks: 7, stopReason: "test", censored: false,
    prizeCallbacks: 0, mathDraws: 0, libDraws: 0, rngFinalState: null, retainedRewards: null,
    initializationMode: "test", cellsDerivedFrom: "test",
    units: units.map((unit) => ({ unitId: unit.unitId, entityId: unit.entityId, side: unit.side, rosterIndex: unit.rosterIndex, hp: unit.startHp, mp: unit.startMp, state: 1, stateName: "waiting", commands: 0, cell: unit.cell })),
  },
  catalog: { stateNames: {}, skills: {}, equipment: {} }, metrics: {}, holyHerbRemaining: 0,
  receipts: null, runnerLimits: [], notes: [], missing: [],
};

const frames = buildGeneratedFrames(replay);
const heroAtStart = frames[0].units["ally:0"];
const heroAfterRetrigger = frames.find((frame) => frame.tick === 5).units["ally:0"];
assert.equal(heroAtStart.clipFrame, 4, "human playback uses the recorded component frame");
assert.equal(heroAtStart.animationRate, 4, "human rate is preserved from the component snapshot");
assert.equal(heroAfterRetrigger.clipFrame, 0, "same-clip animation_request retriggers at frame zero");
assert.equal(frames.find((frame) => frame.tick === 7).units["ally:0"].clipFrame, 0, "unresolved request restarts the retained human fallback");
const skillAttackFrame = { ...heroAtStart, visual: "attacking", animationFrame: 4, animationClip: 49 };
assert.equal(
  generatedFrameClipId({ human: true, weaponMotion: 4 }, skillAttackFrame),
  "attackMagicRight",
  "a decoded native skill clip takes precedence over the equipped weapon attack clip",
);
assert.equal(
  generatedFrameClipId({ human: true, weaponMotion: 4 }, { ...skillAttackFrame, animationClip: 999 }),
  "attackSwordUp",
  "unsupported native skill snapshots retain the decoded weapon fallback",
);
assert.equal(
  generatedFrameClipId({ human: true, weaponMotion: 16 }, { ...skillAttackFrame, animationClip: 98 }),
  "attackScoopDown",
  "the recovered shovel/scoop motion maps to its exact native direction clip",
);
assert.equal(generatedFrameClipId({ human: true, weaponMotion: 4 }, { ...skillAttackFrame, animationClip: 18 }), "attackSwordDown");
const magicRight = humanLineRecordsAt(HUMAN_CLIPS.attackMagicRight, 0);
const magicDown = humanLineRecordsAt(HUMAN_CLIPS.attackMagicDown, 0);
assert.equal(magicRight.length, magicDown.length, "certified mirrored direction variant keeps line count");
for (let i = 0; i < magicRight.length; i += 1) {
  assert.equal(magicDown[i].reversU, magicRight[i].reversU ^ 1, "down variant mirrors right-asset U coordinates");
}
const walkingFrame = { ...heroAfterRetrigger, visual: "walking", animationFrame: 4, animationRate: 2, animationClip: 10, stateFrame: 8 };
assert.deepEqual(
  generatedHumanLinesForFrame(walkingFrame, 0),
  humanWalkLinesAt(2, 4),
  "native walking frame is used once and its SEB direction comes from the snapshot",
);
const knockdownFrame = {
  ...heroAfterRetrigger,
  visual: "knocking_down",
  stateFrame: 20,
  clipFrame: 4,
  animationFrame: 4,
  animationClip: HUMAN_REACTIONS.knockDownSit.humanBase + 3,
};
assert.deepEqual(
  generatedHumanLinesForFrame(knockdownFrame, 0),
  humanReactionLinesAt("knockDownDown", 0, 0),
  "knockdown phase uses state elapsed time even when the native SEB frame differs",
);

const monsterAtStart = generatedMonsterClip(frames[0].units["enemy:0"], 0, "down");
const monsterAfterRetrigger = generatedMonsterClip(frames.find((frame) => frame.tick === 5).units["enemy:0"], 5, "down");
const monsterNext = generatedMonsterClip(frames.find((frame) => frame.tick === 6).units["enemy:0"], 6, "down");
assert.equal(monsterAtStart.clip.id, "monsterAttackLeft", "monster SEB base and direction select attack/right asset");
assert.equal(monsterAtStart.update, 5, "monster uses the recorded component frame");
assert.equal(monsterAfterRetrigger.clip.id, "monsterWait", "new requested base and direction select wait/up variant");
assert.equal(monsterAfterRetrigger.update, 0, "monster request resets playback even without a state transition");
assert.equal(monsterNext.update, 6, "monster advances from the later recorded component frame");
const largeMonsterWait = generatedMonsterClip({
  ...frames[0].units["enemy:0"], animationClip: 5, animationFrame: 7,
}, 0, "down");
assert.equal(largeMonsterWait.clip.id, "monsterWaitXLRight", "native size-three wait base selects XL records and direction");
assert.equal(largeMonsterWait.update, 7, "XL wait uses the actual component frame");
const largeMonsterAttack = generatedMonsterClip({
  ...frames[0].units["enemy:0"], animationClip: 22, animationFrame: 3, visual: "attacking",
}, 0, "down");
assert.equal(largeMonsterAttack.clip.id, "monsterAttackXLRight", "native size-three attack base selects XL records");
assert.equal(largeMonsterAttack.update, 3, "XL attack uses the actual component frame");
assert.deepEqual(largeMonsterWait.mirror, {u:false,v:false}, "recorded right direction overrides the team's down mirror");
assert.deepEqual(largeMonsterAttack.mirror, {u:true,v:false}, "recorded down direction carries the mirrored right asset");
assert.equal(generatedMonsterClip({...frames[0].units["enemy:0"],visual:"attacking",animationClip:0},0,"down").clip.id,"monsterWait", "native wait snapshot takes precedence over fighter state");
assert.equal(generatedMonsterClip({...frames[0].units["enemy:0"],visual:"attacking",animationClip:4},0,"down").clip.id,"monsterWaitXL", "native XL wait snapshot takes precedence over fighter state");
assert.equal(
  generatedMonsterClip({ ...frames[0].units["enemy:0"], animationClip: null, animationFrame: null, stateTick: 3 }, 6, "down").update,
  3,
  "legacy monster fallback starts at the stored state tick",
);

console.log("generated replay animation frame checks passed");
