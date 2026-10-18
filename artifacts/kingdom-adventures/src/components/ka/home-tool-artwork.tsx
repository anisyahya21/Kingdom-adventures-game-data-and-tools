import { lazy, Suspense, useId } from "react";
import atlasMetadata from "./home-artwork-atlases.json";
import specialtyAtlas from "./tool-specialty-atlas.json";
import correctionAtlas from "./tool-correction-atlas.json";

export type HomeArtworkStyle = "game" | "refined" | "generated" | "generated-familiar" | "mixed";
export type HomeCombatArtwork = "cyan" | "gold";

const Monarch = lazy(() => import("@/components/character-preview-canvas").then((module) => ({ default: module.CharacterPreviewCanvas })));

// Alpha bounds are measured offline; transparent space and source-sheet labels
// never become a rectangular backdrop on the card. UI illustrations, not game data.
type ArtworkAtlas = { source: string; width: number; height: number; regions: Record<string, number[]> };
const GENERATED_ATLASES: Record<string, ArtworkAtlas> = {
  generated: atlasMetadata.original,
  "generated-familiar": atlasMetadata.familiar,
  "mixed-egg-pet": atlasMetadata.mixedEggPet,
};

export const MIXED_HOME_SELECTIONS = [
  { tool: "/jobs-marriage", label: "Jobs", source: "generated", choice: "Generated Monarch" },
  { tool: "/equipment", label: "Equipment", source: "generated", choice: "Generated sword and shield" },
  { tool: "/skills", label: "Skills", source: "generated", choice: "Generated skill book" },
  { tool: "/eggs-pets-monsters", label: "Eggs, Pets & Monsters", source: "mixed-egg-pet", choice: "Generated pet + familiar rainbow egg" },
  { tool: "/combat", label: "Combat Hub", source: "generated-familiar", choice: "Familiar crossed swords" },
  { tool: "/chaos-setup-lab", label: "Chaos Setup", source: "generated-familiar", choice: "Familiar grey stone" },
] as const;
const MIXED_SOURCES: Record<string, string> = Object.fromEntries(MIXED_HOME_SELECTIONS.map((selection) => [selection.tool, selection.source]));

export function HomeToolArtwork({ style = "game", source, toolKey, size = 40, combatArtwork = "cyan" }: {
  style?: HomeArtworkStyle;
  source: string;
  toolKey: string;
  size?: number;
  combatArtwork?: HomeCombatArtwork;
}) {
  const clipId = useId();
  const rendering = style === "refined" ? "auto" : "pixelated";
  const selectedStyle = style === "mixed" ? MIXED_SOURCES[toolKey] ?? "generated-familiar" : style;
  const corrections: ArtworkAtlas = correctionAtlas;
  const specialtyRegions: ArtworkAtlas = corrections.regions[toolKey] ? corrections : specialtyAtlas;
  const isSpecialty = style !== "game" && style !== "refined" && !!specialtyRegions.regions[toolKey];
  const atlas = isSpecialty ? specialtyRegions : GENERATED_ATLASES[selectedStyle];
  if (atlas?.regions[toolKey]) {
    const [x, y, width, height] = atlas.regions[toolKey];
    return (
      <svg width={size} height={size} viewBox={`${x} ${y} ${width} ${height}`} aria-hidden="true" data-artwork-variant={isSpecialty ? "tool-specialty" : selectedStyle} data-artwork-key={toolKey} className="shrink-0 overflow-hidden" style={{ width: size, height: size }}>
        <defs><clipPath id={clipId}><rect x={x} y={y} width={width} height={height} /></clipPath></defs>
        <image href={atlas.source} width={atlas.width} height={atlas.height} clipPath={`url(#${clipId})`} />
      </svg>
    );
  }
  if (toolKey === "/eggs-pets-monsters") {
    return (
      <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <img src="/website_icons/eggs/egg_7.png" alt="" data-artwork-subject="Rainbow egg" className="absolute bottom-0 left-0 object-contain" style={{ width: size * 0.7, height: size * 0.9, imageRendering: rendering }} />
        <img src="/monster-sprites/9.png" alt="" data-artwork-subject="Earth Dragon" className="absolute bottom-0 right-0 object-contain" style={{ width: size * 0.7, height: size * 0.8, imageRendering: rendering }} />
      </span>
    );
  }
  if (toolKey === "/combat") {
    return <img src={combatArtwork === "gold" ? "/website_icons/skills/skill_icon_05.png" : "/website_icons/requested/conquest_member_icon.png"} alt="" data-artwork-subject={`${combatArtwork} crossed swords`} width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size, imageRendering: rendering }} />;
  }
  if (toolKey === "/jobs-marriage") {
    return (
      <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <Suspense fallback={<span className="h-full w-full" />}>
          <Monarch jobName="Monarch" rank="S" variant={1} equipState="right" scale={4} poseFrame={0} label="Monarch" style={{ width: size, height: size, objectFit: "contain", imageRendering: rendering }} />
        </Suspense>
      </span>
    );
  }
  return <img src={source} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size, imageRendering: rendering }} />;
}
