/**
 * Isolated mount of the *production* monster body renderer.
 *
 * Section 6 of the battle-visual handoff validates the OPT reconstruction (source cropping,
 * dest placement, cell separation, Wairo-Tank regions, shadows) without touching pose
 * selection, the temporary -40/-60 positioning or anything else. This page therefore mounts
 * the real `NativeMonsterBody` exported from src/pages/battle-replay.tsx - the exact function
 * the replay stage renders - once per (encounter monster x pose column x side) on a flat
 * magenta page, and exposes the production data tables for an independent cross-check.
 *
 * It renders nothing else: no stage, no arena, no overlays. Whatever appears inside a
 * component's w x h clip viewport is what the production component paints.
 */
import { createRoot } from "react-dom/client";
import "@/index.css";
import { NativeMonsterBody } from "@/pages/battle-replay";
import {
  MONSTER_DATA_ENCOUNTERS,
  MONSTER_EXTRA_OPT_SHEETS,
  MONSTER_IMG_SHEETS,
  MONSTER_OPT_SHEETS,
  MONSTER_SEB_FAMILIES,
  MONSTER_SHADOW_BY_SIZE,
  monsterFamily,
  monsterSheetFor,
  shadowSheetFor,
} from "@/lib/native-body";
import {
  BATTLE_DIRECTIONS,
  MONSTER_CLIPS,
  MONSTER_DIRECTION_VARIANTS,
  monsterClipForDirection,
  monsterSpriteById,
} from "@/lib/battle-replay";

const PITCH = { x: 170, y: 110 };
const ORIGIN = { x: 120, y: 90 };
const COLUMNS = 4;

type CaseId = string;

type CaseSpec = {
  id: CaseId;
  monsterId: number;
  /** numeric SEB frame handed to the production component (the SEB record picks the cell) */
  frame: number;
  /** the side drives the native direction model: ally = UP, enemy = DOWN */
  side: "ally" | "enemy";
  anchor: { x: number; y: number };
  expected: {
    bodySheet: string | null;
    shadowSheet: string | null;
    family: "small" | "xl";
  };
};

const cases: CaseSpec[] = [];
for (const monsterId of Object.keys(MONSTER_DATA_ENCOUNTERS)
  .map(Number)
  .sort((a, b) => a - b)) {
  const data = MONSTER_DATA_ENCOUNTERS[monsterId];
  const sprite = monsterSpriteById(monsterId);
  /**
   * Production configuration coverage: allies face UP (the *_up wait clip, no mirror) and enemies
   * face DOWN (the *_right wait clip with the `,u` mirror). In the wait clip key 0 selects u=0 and
   * key 10 selects u=80, and the right clip puts the same keys on row v=60, so these four cases per
   * monster exercise all four logical cells of the 2x2 sheet through the SEB record.
   */
  for (const frame of [0, 10] as const) {
    for (const side of ["ally", "enemy"] as const) {
      const index = cases.length;
      cases.push({
        id: `${monsterId}-f${frame}-${side}`,
        monsterId,
        frame,
        side,
        anchor: {
          x: ORIGIN.x + (index % COLUMNS) * PITCH.x,
          y: ORIGIN.y + Math.floor(index / COLUMNS) * PITCH.y,
        },
        expected: {
          bodySheet: monsterSheetFor(data.img, data.size)?.name ?? null,
          shadowSheet: shadowSheetFor(data.size)?.name ?? null,
          family: sprite ? monsterFamily(sprite) : "small",
        },
      });
    }
  }
}

function Probe() {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0 }}>
      {cases.map((entry) => {
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
              clip={monsterClipForDirection("wait", BATTLE_DIRECTIONS[entry.side])}
              frame={entry.frame}
              mirror={MONSTER_DIRECTION_VARIANTS[BATTLE_DIRECTIONS[entry.side]].mirror}
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

/**
 * The production tables are the values the component itself reads; they are dumped so the
 * check can compare them against an independent OPT/PNG decode instead of trusting them.
 */
const probe = {
  cases,
  encounters: MONSTER_DATA_ENCOUNTERS,
  imgSheets: MONSTER_IMG_SHEETS,
  shadowBySize: MONSTER_SHADOW_BY_SIZE,
  extraSheets: MONSTER_EXTRA_OPT_SHEETS,
  baseSheets: MONSTER_OPT_SHEETS,
  sebFamilies: MONSTER_SEB_FAMILIES,
};

(window as unknown as { __OPT_PROBE__: unknown }).__OPT_PROBE__ = probe;

createRoot(document.getElementById("root")!).render(<Probe />);
