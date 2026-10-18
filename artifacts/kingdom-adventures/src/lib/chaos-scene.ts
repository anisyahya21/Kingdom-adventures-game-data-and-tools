import { loadHumanPartRules } from "@/lib/character-renderer";
import {
  humanIdleResolution,
  type HumanIdleCharacter,
} from "@/lib/human-battle-idle";
import { HUMAN_CLIPS, humanLineRecordsAt } from "@/lib/human-battle-animation";
import { nativeDepth, type Cell } from "@/lib/world-builder";
import { drawBuilder, type BuilderDraw } from "@/lib/world-builder-render";
import type { MapSceneDraw } from "@/components/ka/map-scene-layer";

export type HumanSceneFrames = {
  frames: HTMLCanvasElement[];
  offset: number;
  maxFrame: number;
};
const humanFrames = new Map<string, Promise<HumanSceneFrames>>();
const images = new Map<string, Promise<HTMLImageElement>>();
export function loadSceneImage(url: string): Promise<HTMLImageElement> {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(Error(`Cannot load scene art: ${url}`));
      image.src = url;
    });
    images.set(url, pending);
  }
  return pending;
}
/** Bake the shared native SEB/OPT resolver once; animation never reloads or decodes art. */
export function loadHumanSceneFrames(
  character: HumanIdleCharacter,
): Promise<HumanSceneFrames> {
  let pending = humanFrames.get(character.id);
  if (!pending) {
    pending = (async () => {
      const rules = await loadHumanPartRules();
      const clip = HUMAN_CLIPS.equipWaitRight;
      const resolved = Array.from(
        { length: clip.maxFrame },
        (_, frame) =>
          humanIdleResolution(character, rules, humanLineRecordsAt(clip, frame))
            .draws,
      );
      await Promise.all(
        [
          ...new Set(
            resolved.flatMap((frame) => frame.map((draw) => draw.png)),
          ),
        ].map(loadSceneImage),
      );
      const offset = 128,
        size = 256;
      const frames = await Promise.all(
        resolved.map(async (draws) => {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw Error("Canvas unavailable");
          ctx.imageSmoothingEnabled = false;
          for (const draw of draws) {
            const image = await loadSceneImage(draw.png);
            ctx.save();
            ctx.translate(offset + draw.transX, offset + draw.transY);
            // CSS native line renderer flips around the logical cell center.
            if (draw.reversU || draw.reversV) {
              ctx.translate(draw.cellW / 2, draw.cellH / 2);
              ctx.scale(draw.reversU ? -1 : 1, draw.reversV ? -1 : 1);
              ctx.translate(-draw.cellW / 2, -draw.cellH / 2);
            }
            ctx.drawImage(
              image,
              draw.src.x,
              draw.src.y,
              draw.src.w,
              draw.src.h,
              draw.dest.x,
              draw.dest.y,
              draw.src.w,
              draw.src.h,
            );
            ctx.restore();
          }
          return canvas;
        }),
      );
      return { frames, offset, maxFrame: clip.maxFrame };
    })();
    humanFrames.set(character.id, pending);
  }
  return pending;
}

type Actor = { cell: Cell; kind: "unit" | "monster"; preview?: boolean };
export function makeChaosScene(input: {
  structures: BuilderDraw[];
  images: Map<string, HTMLImageElement>;
  actors: Actor[];
  human: HumanSceneFrames | null;
  monster: HTMLImageElement | null;
  opacity: number;
  animate: boolean;
}): MapSceneDraw {
  const queue = [
    ...input.structures.map((draw) => ({
      depth: draw.depth,
      draw,
      actor: null as Actor | null,
    })),
    ...input.actors.map((actor) => ({
      depth: nativeDepth(actor.cell),
      draw: null,
      actor,
    })),
  ].sort((a, b) => a.depth - b.depth);
  return (ctx, camera, width, height, time) => {
    for (const entry of queue) {
      if (entry.draw) {
        // A single sorted scene keeps people behind the structures in front of them.
        drawBuilder(
          ctx,
          camera,
          width,
          height,
          [{ ...entry.draw, opacity: entry.draw.opacity * input.opacity }],
          input.images,
        );
        continue;
      }
      const actor = entry.actor!;
      const x =
        camera.offsetX + (actor.cell.x - actor.cell.y) * 24 * camera.zoom;
      const y =
        camera.offsetY + (actor.cell.x + actor.cell.y) * 12 * camera.zoom;
      ctx.save();
      ctx.globalAlpha = actor.preview ? 0.6 : 1;
      ctx.imageSmoothingEnabled = false;
      if (actor.kind === "unit" && input.human) {
        const index = input.animate
          ? Math.floor(time / 50) % input.human.maxFrame
          : 0;
        const frame = input.human.frames[index];
        ctx.drawImage(
          frame,
          x - input.human.offset * camera.zoom,
          y - input.human.offset * camera.zoom,
          frame.width * camera.zoom,
          frame.height * camera.zoom,
        );
      } else if (actor.kind === "monster" && input.monster) {
        ctx.fillStyle = "rgba(0,0,0,0.24)";
        ctx.beginPath();
        ctx.ellipse(
          x,
          y + 2 * camera.zoom,
          9 * camera.zoom,
          4 * camera.zoom,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.drawImage(
          input.monster,
          x - (input.monster.naturalWidth * camera.zoom) / 2,
          y - (input.monster.naturalHeight - 3) * camera.zoom,
          input.monster.naturalWidth * camera.zoom,
          input.monster.naturalHeight * camera.zoom,
        );
      }
      ctx.restore();
    }
  };
}
