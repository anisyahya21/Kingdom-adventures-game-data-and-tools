/**
 * Focused check for `Seb.GetSprite(frame, line)` based monster pose selection.
 *
 * Part A dumps what the *production* helpers resolve for every clip, line and a frame set built
 * from the clip's own key list (keys -1/at/+1, frame 0, maxFrame-1, maxFrame, out of range), so an
 * independent decode of the intact SEB files can be compared frame by frame.
 *
 * Part B mounts the real `NativeMonsterBody` on a flat magenta page for all four native directions
 * (UP/RIGHT/DOWN/LEFT) at the frames that switch the u cell, so the painted cells can be compared
 * with the OPT crops of exactly those cells and with the native mirror state of each variant.
 */
import { createRoot } from "react-dom/client";
import "@/index.css";
import { NativeMonsterBody } from "@/pages/battle-replay";
import {
  BATTLE_DIRECTIONS,
  MONSTER_CLIPS,
  MONSTER_DIRECTION_VARIANTS,
  MONSTER_LINES,
  NATIVE_ANIMATION,
  NATIVE_FRAME_MS,
  clipFramePhase,
  monsterClipForDirection,
  nativeAnimationFrame,
  sebLineRecords,
  sebSpriteAt,
} from "@/lib/battle-replay";
import { MONSTER_DATA_ENCOUNTERS, monsterFamily, monsterSheetFor, shadowSheetFor } from "@/lib/native-body";
import { monsterSpriteById } from "@/lib/battle-replay";

type ClipKey = keyof typeof MONSTER_CLIPS;

const clipKeys = Object.keys(MONSTER_CLIPS) as ClipKey[];

/** Part A: frames worth checking for one clip - around every key of every line, plus the edges. */
function probeFrames(clipKey: ClipKey): number[] {
  const clip = MONSTER_CLIPS[clipKey];
  const frames = new Set<number>([-1, -3, 0, clip.maxFrame - 1, clip.maxFrame, clip.maxFrame + 2]);
  for (const line of [MONSTER_LINES.shadow, MONSTER_LINES.body]) {
    for (const record of sebLineRecords(clip, line)) {
      frames.add(record.frame - 1);
      frames.add(record.frame);
      frames.add(record.frame + 1);
    }
  }
  return [...frames].sort((a, b) => a - b);
}

const selectionProbe = clipKeys.flatMap((clipKey) =>
  [MONSTER_LINES.shadow, MONSTER_LINES.body].flatMap((line) =>
    probeFrames(clipKey).map((frame) => {
      const clip = MONSTER_CLIPS[clipKey];
      const record = sebSpriteAt(clip, frame, line);
      return {
        clip: clipKey,
        seb: clip.seb,
        maxFrame: clip.maxFrame,
        line,
        frame,
        phase: clipFramePhase(clip, frame),
        record,
      };
    }),
  ),
);

/** Part B: rendered cases, one per SEB-selected cell that the monsters actually use. */
type RenderCase = {
  id: string;
  monsterId: number;
  /** native entity direction: selects the asset and its `,u` mirror flag */
  direction: "up" | "right" | "down" | "left";
  state: "wait" | "attack";
  frame: number;
  anchor: { x: number; y: number };
  expectedBodyCell: [number, number];
};

const PITCH = { x: 170, y: 110 };
const ORIGIN = { x: 120, y: 90 };
const COLUMNS = 4;

/**
 * Literal expectation taken from the intact SEB dumps (not from the component): the *_up asset
 * keeps row v0, the *_right asset keeps row v60, and within a clip key 0/9 sit on u0, key 10 on u80
 * and the attack clip switches to u80 at key 4 and back to u0 at key 9.
 */
const EXPECTED_BODY_CELL: Record<string, [number, number]> = {
  "up|wait|0": [0, 0],
  "up|wait|10": [1, 0],
  "up|attack|0": [0, 0],
  "up|attack|1": [0, 0],
  "up|attack|4": [1, 0],
  "up|attack|6": [1, 0],
  "up|attack|9": [0, 0],
  "right|wait|0": [0, 1],
  "right|wait|10": [1, 1],
  "right|attack|4": [1, 1],
};

const renderCases: RenderCase[] = [
  // all four directions of the same monster: UP (no flag), RIGHT (no flag), DOWN (_right,u),
  // LEFT (_up,u); wait f0/f10 and the u switch at key 10
  { monsterId: 116, direction: "up", state: "wait", frame: 0 },
  { monsterId: 116, direction: "up", state: "wait", frame: 10 },
  { monsterId: 116, direction: "right", state: "wait", frame: 0 },
  { monsterId: 116, direction: "right", state: "wait", frame: 10 },
  { monsterId: 116, direction: "down", state: "wait", frame: 10 },
  { monsterId: 116, direction: "left", state: "wait", frame: 10 },
  // attack clip: per-frame translations (f1 tY-61, f6 tX-34 tY-62, f9 back to the key-0 values)
  { monsterId: 116, direction: "up", state: "attack", frame: 0 },
  { monsterId: 116, direction: "up", state: "attack", frame: 1 },
  { monsterId: 116, direction: "up", state: "attack", frame: 6 },
  { monsterId: 116, direction: "up", state: "attack", frame: 9 },
  // other sheets, same clip/frame: the SEB translation is identical, OPT dest/size differ
  { monsterId: 121, direction: "down", state: "wait", frame: 10 },
  { monsterId: 122, direction: "left", state: "attack", frame: 4 },
  { monsterId: 142, direction: "up", state: "wait", frame: 0 },
  { monsterId: 142, direction: "down", state: "wait", frame: 10 },
].map((entry, index) => ({
  ...entry,
  id: `${entry.monsterId}-${entry.direction}-${entry.state}-f${entry.frame}`,
  expectedBodyCell:
    EXPECTED_BODY_CELL[
      `${MONSTER_DIRECTION_VARIANTS[entry.direction].asset}|${entry.state}|${entry.frame}`
    ],
  anchor: {
    x: ORIGIN.x + (index % COLUMNS) * PITCH.x,
    y: ORIGIN.y + Math.floor(index / COLUMNS) * PITCH.y,
  },
}));

function Probe() {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>
      {renderCases.map((entry) => {
        const sprite = monsterSpriteById(entry.monsterId);
        if (!sprite) return null;
        return (
          <div
            key={entry.id}
            data-ka-case={entry.id}
            style={{
              position: "absolute",
              left: entry.anchor.x,
              top: entry.anchor.y,
              width: 0,
              height: 0,
            }}
          >
            <NativeMonsterBody
              sprite={sprite}
              family={monsterFamily(sprite)}
              monsterId={entry.monsterId}
              clip={monsterClipForDirection(entry.state, entry.direction)}
              frame={entry.frame}
              mirror={MONSTER_DIRECTION_VARIANTS[entry.direction].mirror}
            />
          </div>
        );
      })}
      <div
        data-ka-probe-ready="1"
        style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, opacity: 0 }}
      />
    </div>
  );
}

(window as unknown as { __SEB_PROBE__: unknown }).__SEB_PROBE__ = {
  selection: selectionProbe,
  directionModel: MONSTER_DIRECTION_VARIANTS,
  battleDirections: BATTLE_DIRECTIONS,
  /**
   * Timing model: the production constants plus the frame/sprite sequence the production helpers
   * produce for every tick, and a synthetic clip-change timeline proving the ChangeAnimation reset
   * rule (frame 0 on the update the clip changes). Both are computed with the production functions.
   */
  timing: {
    model: NATIVE_ANIMATION,
    frameMs: NATIVE_FRAME_MS,
    sequences: clipKeys.map((clipKey) => {
      const clip = MONSTER_CLIPS[clipKey];
      return {
        clip: clipKey,
        seb: clip.seb,
        maxFrame: clip.maxFrame,
        ticks: Array.from({ length: clip.maxFrame + 5 }, (_, tick) => {
          const frame = nativeAnimationFrame(clip, tick);
          const body = sebSpriteAt(clip, frame, MONSTER_LINES.body);
          const shadow = sebSpriteAt(clip, frame, MONSTER_LINES.shadow);
          return {
            tick,
            frame,
            body: body ? { u: body.u, v: body.v, transX: body.transX, transY: body.transY } : null,
            shadow: shadow ? { u: shadow.u, v: shadow.v, transX: shadow.transX, transY: shadow.transY } : null,
          };
        }),
      };
    }),
    timeline: (() => {
      // a unit that idles for 25 updates, attacks for 12, then idles again: the frame must restart
      // at 0 in the update each clip changes and advance one frame per update afterwards
      const wait = MONSTER_CLIPS.wait;
      const attack = MONSTER_CLIPS.attack;
      const steps: { tick: number; clip: string; sinceChange: number; frame: number }[] = [];
      let current = wait;
      let sinceChange = 0;
      for (let tick = 0; tick < 60; tick += 1) {
        const next = tick < 25 ? wait : tick < 37 ? attack : wait;
        if (next !== current) {
          current = next;
          sinceChange = 0;
        }
        steps.push({
          tick,
          clip: current.id,
          sinceChange,
          frame: nativeAnimationFrame(current, sinceChange),
        });
        sinceChange += 1;
      }
      return steps;
    })(),
    phaseIndependence: {
      // same clip, different animation-change ticks -> different phases
      early: [0, 5, 10].map((tick) => nativeAnimationFrame(MONSTER_CLIPS.wait, tick)),
      late: [0, 5, 10].map((tick) => nativeAnimationFrame(MONSTER_CLIPS.wait, tick + 3)),
    },
  },
  renderCases: renderCases.map((entry) => ({
    ...entry,
    bodySheet: (() => {
      const data = MONSTER_DATA_ENCOUNTERS[entry.monsterId];
      return monsterSheetFor(data.img, data.size)?.name ?? null;
    })(),
    shadowSheet: (() => {
      const data = MONSTER_DATA_ENCOUNTERS[entry.monsterId];
      return shadowSheetFor(data.size)?.name ?? null;
    })(),
  })),
  clips: clipKeys.map((clipKey) => ({
    key: clipKey,
    seb: MONSTER_CLIPS[clipKey].seb,
    maxFrame: MONSTER_CLIPS[clipKey].maxFrame,
    layers: MONSTER_CLIPS[clipKey].layers,
    lines: [MONSTER_LINES.shadow, MONSTER_LINES.body].map((line) => ({
      line,
      keys: sebLineRecords(MONSTER_CLIPS[clipKey], line).map((record) => record.frame),
      records: sebLineRecords(MONSTER_CLIPS[clipKey], line),
    })),
  })),
};

createRoot(document.getElementById("root")!).render(<Probe />);
