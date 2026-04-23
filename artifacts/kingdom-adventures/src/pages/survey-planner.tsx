import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PLAYTHROUGH_GUIDE_LOCAL_URL } from "@/lib/playthrough-guide";
import { parseCsv } from "@/lib/monster-truth";
import { SearchableSelect } from "@/components/searchable-select";
import { fetchSharedWithFallback, localSharedData } from "@/lib/local-shared-data";
import { apiUrl } from "@/lib/api";
import surveyCsv from "../../../../data/Sheet csv/KA GameData - Survey.csv?raw";
import jobCsv from "../../../../data/Sheet csv/KA GameData - Job.csv?raw";
import jobGroupCsv from "../../../../data/Sheet csv/KA GameData - JobGroup.csv?raw";
import { Sword, Gem, ChevronDown, ChevronUp } from "lucide-react";

function statAtLevel(base: number, inc: number, level: number) {
  return Math.round(base + (level - 1) * inc);
}

type Survey = {
  id: number;
  name: string;
  nameArg?: string;
  maxEarnableRewardCount: number;
  terrain: number;
  minAreaLevel: number;
  minHearts: number;
  maxHearts: number;
  minSuccessRate: number;
  maxSuccessRate: number;
  jobGroupId?: number;
};

type JobVariant = {
  id: number;
  name: string;
  group: number;
  rankLabel: string;
  rankNumber: number;
  heart: number;
  baseName?: string;
};

type JobFamily = {
  group: number;
  name: string;
  variants: JobVariant[];
};

type SharedJobStatEntry = { base?: number; inc?: number; maxLevel?: number };
type SharedJobRank = { stats?: Record<string, SharedJobStatEntry> };
type SharedJob = { ranks?: Record<string, SharedJobRank> };
type SharedEquipStats = Record<string, { base?: number; inc?: number }>;
type SharedData = {
  jobs?: Record<string, SharedJob>;
  overrides?: Record<string, SharedEquipStats>;
  slotAssignments?: Record<string, string>;
};

type Equip = { id: string; name: string; slot: "Weapon" | "Accessory"; baseHeart: number; incPerLevel: number };

function parseCsvLines(raw: string) {
  return parseCsv(raw)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ""));
}

function parseSurveyCsv(raw: string): Survey[] {
  const rows = parseCsvLines(raw);
  if (rows.length < 2) return [];

  const header = rows[0].map((value) => value.trim());
  const idIndex = header.indexOf("id");
  const nameIndex = header.indexOf("nameText");
  const nameArgIndex = header.indexOf("nameArg");
  const maxEarnableRewardCountIndex = header.indexOf("maxEarnableRewardCount");
  const terrainIndex = header.indexOf("terrain");
  const minAreaLevelIndex = header.indexOf("minAreaLevel");
  const minHeartsIndex = header.indexOf("minHearts");
  const maxHeartsIndex = header.indexOf("maxHearts");
  const minSuccessRateIndex = header.indexOf("minSuccessRate");
  const maxSuccessRateIndex = header.indexOf("maxSuccessRate");
  const jobGroupIdIndex = header.indexOf("jobGroupId");

  const statusIndex = 1;
  return rows
    .slice(1)
    .filter((cols) => {
      const status = (cols[statusIndex] ?? "").trim();
      if (status !== "Not used") return true;
      const rawName = (cols[nameIndex] ?? "").toLowerCase();
      return rawName.includes("dragon taming") || rawName.includes("master instructor") || rawName.includes("cash register");
    })
    .map((cols) => {
      const maxEarnableRaw = Number(cols[maxEarnableRewardCountIndex] ?? "");
      const name = cols[nameIndex] ?? "Unknown Survey";
      return {
        id: Number(cols[idIndex] ?? "") || 0,
        name,
        nameArg: cols[nameArgIndex] ?? "",
        maxEarnableRewardCount: Number.isNaN(maxEarnableRaw) ? 0 : maxEarnableRaw,
        terrain: Number(cols[terrainIndex] ?? "") || 0,
        minAreaLevel: Number(cols[minAreaLevelIndex] ?? "") || 0,
        minHearts: Number(cols[minHeartsIndex] ?? "") || 0,
        maxHearts: Number(cols[maxHeartsIndex] ?? "") || 0,
        minSuccessRate: Number(cols[minSuccessRateIndex] ?? "") || 0,
        maxSuccessRate: Number(cols[maxSuccessRateIndex] ?? "") || 0,
        jobGroupId: Number(cols[jobGroupIdIndex] ?? "") >= 0 ? Number(cols[jobGroupIdIndex] ?? "") : undefined,
      };
    })
    .filter((survey) => !survey.name.toLowerCase().includes("unused"));
}

const SURVEY_NAME_ARG_LABELS: Record<string, string> = {
  grass: "Grass",
  wood: "Wood",
  food: "Food",
  iron: "Ore",
  magic: "Mystic Ore",
  stamina: "Energy",
};

function decodeSurveyNameArg(rawArg: string) {
  const picMatch = rawArg.match(/<pic=([^>]+)>/i);
  if (picMatch) {
    const key = picMatch[1].toLowerCase();
    return SURVEY_NAME_ARG_LABELS[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
  }
  return rawArg;
}

function normalizeSurveyDisplayName(displayName: string) {
  return displayName
    .replace(/\s+/g, " ")
    .trim();
}

function formatSurveyName(survey: Survey) {
  return normalizeSurveyDisplayName(
    survey.name.replace(/<([0-9]+)>/g, (_, index) => {
      if (!survey.nameArg) return `<${index}>`;
      const arg = survey.nameArg;
      return decodeSurveyNameArg(arg);
    }),
  );
}

function normalizeJobName(name: string) {
  return name === "Porter" ? "Mover" : name;
}

function parseJobGroupCsv(raw: string): Record<number, string> {
  const rows = parseCsvLines(raw);
  if (rows.length < 2) return {};

  const header = rows[1].map((value) => value.trim());
  let idIndex = header.indexOf("id");
  let nameIndex = header.indexOf("name");
  if (idIndex < 0) idIndex = 0;
  if (nameIndex < 0) nameIndex = 1;

  return rows.slice(2).reduce((map, cols) => {
    const id = Number(cols[idIndex] ?? "");
    const name = normalizeJobName(cols[nameIndex] ?? "");
    if (!Number.isNaN(id)) {
      map[id] = name;
    }
    return map;
  }, {} as Record<number, string>);
}

function parseJobCsv(raw: string): JobVariant[] {
  const rows = parseCsvLines(raw);
  if (rows.length < 2) return [];

  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => cell.trim().toLowerCase() === "id") &&
    row.some((cell) => cell.trim().toLowerCase() === "name")
  );
  if (headerRowIndex < 0) return [];

  const header = rows[headerRowIndex].map((value) => value.trim());
  const idIndex = header.indexOf("id");
  const nameIndex = header.indexOf("name");
  const groupIndex = header.indexOf("group");
  const jobRankIndex = header.indexOf("jobRank");
  const heartIndex = header.indexOf("Heart");

  const splitJobName = (rawName: string) => {
    const gradeMatch = rawName.match(/^(S|A\+?|B\+?|C\+?|D\+?) Grade\s+(.+)$/);
    if (gradeMatch) {
      const rankLabel = gradeMatch[1];
      return { baseName: gradeMatch[2], rankLabel, rankNumber: { D: 2, C: 3, B: 4, A: 5, S: 6, "B+": 5, "A+": 6, "C+": 4, "D+": 3 }[rankLabel] ?? 0 };
    }
    const rankPrefixMatch = rawName.match(/^([A-Z]\+?)\s+Rank\s+(.+)$/);
    if (rankPrefixMatch) {
      const rankLabel = rankPrefixMatch[1];
      return { baseName: rankPrefixMatch[2], rankLabel, rankNumber: { D: 2, C: 3, B: 4, A: 5, S: 6, "B+": 5, "A+": 6, "C+": 4, "D+": 3 }[rankLabel] ?? 0 };
    }
    const rankMatch = rawName.match(/^Rank\s+([A-Z]\+?)(?:\s+(.+))?$/);
    if (rankMatch) {
      const rankLabel = rankMatch[1];
      return { baseName: rankMatch[2] ?? rankLabel, rankLabel, rankNumber: { D: 2, C: 3, B: 4, A: 5, S: 6, "B+": 5, "A+": 6, "C+": 4, "D+": 3 }[rankLabel] ?? 0 };
    }
    return { baseName: rawName, rankLabel: rawName, rankNumber: 0 };
  };

  return rows.slice(headerRowIndex + 1).map((cols) => {
    const id = Number(cols[idIndex] ?? "") || 0;
    const rawName = cols[nameIndex] ?? "Unknown";
    const group = Number(cols[groupIndex] ?? "") || 0;
    const heart = Number(cols[heartIndex] ?? "") || 0;
    const jobRankNumber = Number(cols[jobRankIndex] ?? "") || 0;
    const { baseName, rankLabel, rankNumber } = splitJobName(rawName);

    return {
      id,
      name: rawName,
      group,
      rankLabel,
      rankNumber: rankNumber || jobRankNumber,
      heart,
      baseName,
    } as JobVariant;
  });
}

function buildJobFamilies(jobVariants: JobVariant[]): JobFamily[] {
  const groups: Record<number, JobFamily> = {};
  for (const variant of jobVariants) {
    if (!groups[variant.group]) {
      groups[variant.group] = {
        group: variant.group,
        name: variant.baseName ?? variant.name,
        variants: [],
      };
    }
    groups[variant.group].variants.push(variant);
  }

  return Object.values(groups).map((family) => ({
    ...family,
    variants: [...family.variants].sort((a, b) => a.rankNumber - b.rankNumber),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

const SURVEY_CAPABLE_JOB_BASE_NAMES = new Set(["Carpenter", "Farmer", "Merchant", "Mover", "Rancher"]);

// Restore Cash Register surveys: allow them through the filter
const SURVEYS: Survey[] = parseSurveyCsv(surveyCsv).filter((survey) => {
  if (!survey.name || survey.name === "" || survey.id < 0) return false;
  // Allow Cash Register surveys
  if (survey.name.toLowerCase().includes("cash register")) return true;
  // Default filter
  return true;
});
const JOB_GROUPS: Record<number, string> = parseJobGroupCsv(jobGroupCsv);
const JOB_VARIANTS = parseJobCsv(jobCsv);
const JOB_FAMILIES = buildJobFamilies(JOB_VARIANTS);
const SURVEY_CAPABLE_JOB_FAMILIES = JOB_FAMILIES.filter((family) =>
  SURVEY_CAPABLE_JOB_BASE_NAMES.has(family.name) && family.variants.some((variant) => variant.rankNumber >= 4),
);

type SurveyGroup = {
  name: string;
  surveys: Survey[];
  totalMax: number;
};

function isOtherSurveyName(displayName: string) {
  const key = displayName.toLowerCase();
  return /materials xl|materials \(grass\)|materials \(wood\)|materials \(food\)|materials \(ore\)|materials \(mystic ore\)|fruit|medicine|vegetables|seafood|tools|equipment materials|copper coins|kairo series|skill manuals/.test(key);
}

function getSurveyGroupSortKey(group: SurveyGroup & { order: number }) {
  if (group.name.startsWith("Survey: High Grade Storehouse")) {
    return [0, group.order];
  }
  if (group.name === "Survey: Master Instructor") {
    return [1, 0];
  }
  if (group.name === "Survey: Dragon Taming") {
    return [2, 0];
  }
  if (group.name === "Other") {
    return [4, 0];
  }
  return [3, group.order];
}

const GROUPED_SURVEYS: SurveyGroup[] = Object.values(
  SURVEYS.reduce((map, survey, index) => {
    const displayName = formatSurveyName(survey).trim();
    const isOther = isOtherSurveyName(displayName);
    const groupKey = isOther ? "__OTHER__" : `name:${displayName}`;
    const existing = map[groupKey];
    if (!existing) {
      map[groupKey] = {
        name: isOther ? "Other" : displayName,
        surveys: [survey],
        totalMax: survey.maxEarnableRewardCount,
        order: isOther ? Number.MAX_SAFE_INTEGER : index,
      } as SurveyGroup & { order: number };
      return map;
    }

    existing.surveys.push(survey);
    if (existing.totalMax !== -1) {
      existing.totalMax = survey.maxEarnableRewardCount === -1 ? -1 : existing.totalMax + survey.maxEarnableRewardCount;
    }
    return map;
  }, {} as Record<string, SurveyGroup & { order: number }>),
)
  .sort((a, b) => {
    const [aRank, aOrder] = getSurveyGroupSortKey(a);
    const [bRank, bOrder] = getSurveyGroupSortKey(b);
    if (aRank !== bRank) return aRank - bRank;
    return aOrder - bOrder;
  })
  .map(({ order, ...group }) => group);

const ORDERED_SURVEYS: Survey[] = GROUPED_SURVEYS.flatMap((group) => group.surveys);

function getSurveyMaxLabel(max: number) {
  return max === -1 ? "Unlimited" : String(max);
}

function getSurveyTerrainLabel(survey: Survey) {
  const iconMatch = survey.name.match(/<pic=([^>]+)>/i);
  if (iconMatch) {
    return SURVEY_TERRAIN_LABELS[iconMatch[1]] ?? iconMatch[1].replace(/_/g, " ");
  }
  return TERRAIN_LABELS[survey.terrain] ?? `Terrain ${survey.terrain}`;
}

type GuideSection = {
  id: string;
  title: string;
  level: 1 | 2;
  lines: string[];
};

type ParsedGuide = {
  imageMap: Record<string, string>;
  sections: GuideSection[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseGuide(markdown: string): ParsedGuide {
  const normalized = markdown.replace(/\r/g, "");
  const imageMap: Record<string, string> = {};

  for (const match of normalized.matchAll(/^\[image(?<id>\d+)\]:\s*<data:image\/(?<ext>[a-zA-Z0-9.+-]+);base64,[^>]+>/gm)) {
    const id = match.groups?.id;
    const rawExt = match.groups?.ext;
    if (!id || !rawExt) continue;
    const ext = rawExt === "jpeg" ? "jpg" : rawExt;
    imageMap[`image${id}`] = `/guides/images/image${id}.${ext}`;
  }

  const cleaned = normalized.replace(/^\[image\d+\]:\s*<data:image\/[^\n]+$/gm, "");
  const lines = cleaned.split("\n");
  const sections: GuideSection[] = [];
  let current: GuideSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\\!/g, "!").replace(/\\#/g, "#");
    const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2;
      const title = headingMatch[2].trim();
      current = {
        id: slugify(title),
        title,
        level,
        lines: [],
      };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = {
        id: "overview",
        title: "Overview",
        level: 1,
        lines: [],
      };
      sections.push(current);
    }

    current.lines.push(line);
  }

  return {
    imageMap,
    sections: sections.filter((section) => section.lines.join("").trim() || section.title),
  };
}

function renderInlineContent(text: string) {
  const markdownLinks = Array.from(text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)).map((match) => ({
    label: match[1],
    url: match[2],
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));

  if (markdownLinks.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const mdLink of markdownLinks) {
    if (mdLink.start > lastIndex) {
      parts.push(text.slice(lastIndex, mdLink.start));
    }
    parts.push(
      <a
        key={`${mdLink.label}-${mdLink.start}`}
        href={mdLink.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-4"
      >
        {mdLink.label}
      </a>,
    );
    lastIndex = mdLink.end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderLine(line: string, index: number, imageMap: Record<string, string>) {
  const trimmed = line.trim();

  if (!trimmed) {
    return <div key={index} className="h-2" />;
  }

  const imageRefs = Array.from(trimmed.matchAll(/!\[\]\[(image\d+)\]/g)).map((match) => match[1]);
  if (imageRefs.length > 0) {
    return (
      <div key={index} className="flex flex-wrap gap-3 py-2">
        {imageRefs.map((imageId) => {
          const src = imageMap[imageId];
          if (!src) return null;
          return (
            <a
              key={imageId}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm"
            >
              <img
                src={src}
                alt={imageId}
                className="max-h-80 w-auto max-w-full object-contain"
                loading="lazy"
              />
            </a>
          );
        })}
      </div>
    );
  }

  if (/^[-*]\s+/.test(trimmed)) {
    return (
      <li key={index} className="ml-5 list-disc text-sm leading-7 text-foreground/95">
        {renderInlineContent(trimmed.replace(/^[-*]\s+/, ""))}
      </li>
    );
  }

  if (/^\d+\)\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
    return (
      <li key={index} className="ml-5 list-decimal text-sm leading-7 text-foreground/95">
        {renderInlineContent(trimmed.replace(/^\d+[.)]\s+/, ""))}
      </li>
    );
  }

  return (
    <p key={index} className="text-sm leading-7 text-foreground/95 whitespace-pre-wrap">
      {renderInlineContent(trimmed)}
    </p>
  );
}

// --- App constants and CSV-driven derived data ---
const TERRAIN_LABELS: Record<number, string> = {
  0: "Plains",
  1: "Forest",
  2: "Desert",
  3: "Mountains",
  4: "Sand",
  5: "Volcano",
  6: "Snow",
  7: "Swamp",
  15: "Ground",
};

const SURVEY_TERRAIN_LABELS: Record<string, string> = {
  grass: "Plains",
  wood: "Forest",
  food: "Farmland",
  iron: "Mountains",
  magic: "Magic",
  stamina: "Stamina",
  snow: "Snow",
  swamp: "Swamp",
  desert: "Desert",
  rock: "Rock",
};

const JOB_BONUS_HINT: Record<number, string> = {
  10: "+10% success when using Explorer jobs",
  12: "+15% success on desert surveys with Guide jobs",
};

const EQUIP_SLOTS = [
  { key: "weapon", label: "Weapon", icon: Sword, slotType: "Weapon" as const },
  { key: "accessory", label: "Accessory", icon: Gem, slotType: "Accessory" as const },
] as const;

type EquipSlotKey = typeof EQUIP_SLOTS[number]["key"];

type SlotEquipSelection = Record<EquipSlotKey, string | null>;

export default function SurveyPlanner() {
  const [sharedData, setSharedData] = useState<SharedData | null>(localSharedData as SharedData);
  const [equipmentLevels, setEquipmentLevels] = useState<Record<string, number>>({});
  const [selectedSurveyId, setSelectedSurveyId] = useState<number | null>(SURVEYS[0]?.id ?? null);
  const [selectedJobGroupId, setSelectedJobGroupId] = useState<number | null>(SURVEY_CAPABLE_JOB_FAMILIES[0]?.group ?? null);
  const [selectedJobRank, setSelectedJobRank] = useState<string | null>(SURVEY_CAPABLE_JOB_FAMILIES[0]?.variants.find((variant) => variant.rankNumber >= 4)?.rankLabel ?? null);
  const [jobHeartLevel, setJobHeartLevel] = useState<number | "">(1);
  const [manualJobHeartValue, setManualJobHeartValue] = useState<number | "">("");
  const [manualEquipmentHeartValue, setManualEquipmentHeartValue] = useState<number | "">("");
  const [manualCombinedHeartValue, setManualCombinedHeartValue] = useState<number | "">("");
  const [slotEquipment, setSlotEquipment] = useState<SlotEquipSelection>({ weapon: null, accessory: null });
  const [accessoryId, setAccessoryId] = useState<string | null>(null);
  const [overrideValues, setOverrideValues] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideMarkdown, setGuideMarkdown] = useState("");
  const [guideLoading, setGuideLoading] = useState(true);
  const [surveyListExpanded, setSurveyListExpanded] = useState(false);
  const [isMobileSurveyList, setIsMobileSurveyList] = useState(false);
  // New: Track expanded/collapsed state for each group
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => ({}));

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const updateMobile = (event: MediaQueryListEvent | MediaQueryList) => setIsMobileSurveyList(event.matches);
    updateMobile(mediaQuery);
    mediaQuery.addEventListener?.("change", updateMobile);
    return () => mediaQuery.removeEventListener?.("change", updateMobile);
  }, []);
  const [guideError, setGuideError] = useState<string | null>(null);

  const survey = SURVEYS.find((s) => s.id === selectedSurveyId) ?? SURVEYS[0];
  const selectedJobFamily = JOB_FAMILIES.find((family) => family.group === selectedJobGroupId) ?? JOB_FAMILIES[0];
  const job = selectedJobFamily?.variants.find((variant) => variant.rankLabel === selectedJobRank) ?? selectedJobFamily?.variants[0] ?? { id: 0, name: "Unknown", group: 0, rankLabel: "", rankNumber: 0, heart: 0, baseName: "Unknown" };

  const equipmentList = useMemo(() => {
    const overrides = sharedData?.overrides ?? {};
    const slotAssignments = sharedData?.slotAssignments ?? {};

    const items: Equip[] = [];
    for (const [name, stats] of Object.entries(overrides)) {
      const slot = slotAssignments[name];
      if (slot !== "Weapon" && slot !== "Accessory") continue;

      const heartEntry = Object.entries(stats).find(([key]) => key.toLowerCase() === "heart")?.[1];
      if (!heartEntry) continue;

      const baseHeart = Number(heartEntry.base ?? 0);
      const incPerLevel = Number(heartEntry.inc ?? 0);
      if (baseHeart <= 0 && incPerLevel <= 0) continue;

      items.push({
        id: `${slot}:${name}`,
        name,
        slot,
        baseHeart,
        incPerLevel,
      });
    }

    return items.sort((a, b) => a.slot.localeCompare(b.slot) || a.name.localeCompare(b.name));
  }, [sharedData]);

  const weapon = equipmentList.find((e) => e.id === slotEquipment.weapon && e.slot === "Weapon") ?? null;
  const accessory = equipmentList.find((e) => e.id === accessoryId && e.slot === "Accessory") ?? null;

  const equipHeart = useMemo(() => {
    let sum = 0;
    if (weapon) {
      const lv = equipmentLevels[weapon.id] ?? 1;
      sum += statAtLevel(weapon.baseHeart, weapon.incPerLevel, lv);
    }
    if (accessory) {
      const lv = equipmentLevels[accessory.id] ?? 1;
      sum += statAtLevel(accessory.baseHeart, accessory.incPerLevel, lv);
    }
    return sum;
  }, [weapon, accessory, equipmentLevels]);

  const surveyBonus = survey.jobGroupId ? JOB_BONUS_HINT[survey.jobGroupId] : undefined;
  const jobIsBonusForSurvey = survey.jobGroupId && job.group === survey.jobGroupId;
  const currentJobRank = selectedJobRank ?? job.rankLabel ?? "";

  const jobHeartLevelValue = typeof jobHeartLevel === "number" && !Number.isNaN(jobHeartLevel) ? Math.max(1, jobHeartLevel) : 1;
  const sharedJob = sharedData?.jobs?.[selectedJobFamily?.name ?? ""];
  const sharedRank = sharedJob?.ranks?.[currentJobRank];
  const sharedHeart = sharedRank?.stats?.Heart;
  const calculatedJobHeartValue = sharedHeart
    ? statAtLevel(sharedHeart.base ?? 0, sharedHeart.inc ?? 0, jobHeartLevelValue)
    : statAtLevel(job.heart, 1, jobHeartLevelValue);
  const displayJobHeartValue = !overrideValues
    ? calculatedJobHeartValue
    : (typeof manualJobHeartValue === "number" && !Number.isNaN(manualJobHeartValue) ? manualJobHeartValue : calculatedJobHeartValue);
  const displayEquipmentHeartValue = !overrideValues
    ? equipHeart
    : (typeof manualEquipmentHeartValue === "number" && !Number.isNaN(manualEquipmentHeartValue) ? manualEquipmentHeartValue : equipHeart);
  const overrideCombinedHeart = overrideValues && typeof manualCombinedHeartValue === "number" && !Number.isNaN(manualCombinedHeartValue)
    ? manualCombinedHeartValue
    : null;
  const totalHeart = overrideCombinedHeart !== null ? overrideCombinedHeart : displayJobHeartValue + displayEquipmentHeartValue;

  useEffect(() => {
    setSelectedJobRank(selectedJobFamily?.variants.find((variant) => variant.rankNumber >= 4)?.rankLabel ?? null);
    setJobHeartLevel(1);
    setManualJobHeartValue("");
    setManualEquipmentHeartValue("");
    setManualCombinedHeartValue("");
  }, [selectedJobGroupId, selectedJobFamily?.variants]);

  useEffect(() => {
    let cancelled = false;

    async function loadGuide() {
      setGuideLoading(true);
      setGuideError(null);
      try {
        const response = await fetch(PLAYTHROUGH_GUIDE_LOCAL_URL);
        if (!response.ok) {
          throw new Error(`Guide request failed with ${response.status}`);
        }
        const text = await response.text();
        if (!cancelled) {
          setGuideMarkdown(text);
        }
      } catch (error) {
        if (!cancelled) {
          setGuideError(error instanceof Error ? error.message : "Failed to load guide");
        }
      } finally {
        if (!cancelled) {
          setGuideLoading(false);
        }
      }
    }

    loadGuide();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadShared() {
      try {
        const data = await fetchSharedWithFallback<SharedData>(apiUrl("/shared"));
        if (!cancelled) setSharedData(data);
      } catch {
        if (!cancelled) setSharedData(null);
      }
    }

    loadShared();
    return () => {
      cancelled = true;
    };
  }, []);

  function interpSuccess(s: Survey, hearts: number) {
    let base = 0;
    if (hearts <= s.minHearts) base = s.minSuccessRate;
    else if (hearts >= s.maxHearts) base = s.maxSuccessRate;
    else {
      const t = (hearts - s.minHearts) / (s.maxHearts - s.minHearts);
      base = s.minSuccessRate + t * (s.maxSuccessRate - s.minSuccessRate);
    }
    if (jobIsBonusForSurvey && survey.jobGroupId) {
      const hint = JOB_BONUS_HINT[survey.jobGroupId] ?? "";
      const m = hint.match(/\+([0-9]+)%/);
      if (m) base = Math.min(100, base + Number(m[1]));
    }
    return Math.round(base * 10) / 10;
  }

  const success = interpSuccess(survey, totalHeart);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Survey</h1>

      <div className="mb-4 rounded-lg border border-border/70 bg-muted/50 p-4 text-sm leading-relaxed">
        Survey database and tool, check out survey section in <button type="button" onClick={() => setIsGuideOpen(true)} className="font-semibold underline underline-offset-2 hover:text-primary">Playthrough Guide by Jaza</button>.
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Jobs — Survey Capable</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground mb-3">Note: only jobs that can build Survey Corps HQ are listed below.</div>
          <div className="space-y-3 text-sm">
            {SURVEY_CAPABLE_JOB_FAMILIES.map((family) => {
              const lowestSurveyRank = family.variants.find((variant) => variant.rankNumber >= 4);
              return (
                <div key={family.group} className="rounded-md border border-border/50 bg-muted/10 p-3">
                  <div className="font-medium">{family.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Rank {lowestSurveyRank?.rankLabel ?? "B"}+
                  </div>
                </div>
              );
            })}
          </div>
          {SURVEY_CAPABLE_JOB_FAMILIES.length === 0 && (
            <div className="text-muted-foreground">No survey-capable jobs available.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between gap-3">
              <CardTitle>Survey List</CardTitle>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm text-primary xl:hidden"
                onClick={() => setSurveyListExpanded((prev) => !prev)}
              >
                {surveyListExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {surveyListExpanded ? "Collapse" : "Show more"}
              </button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[1fr_80px_140px_80px_1fr] gap-3 text-sm font-semibold mb-2">
                <div>Name</div>
                <div className="text-center">Max</div>
                <div className="text-center">Biome</div>
                <div className="text-center">Min Lv</div>
                <div>Bonus Job</div>
              </div>
              <div className="space-y-2">
                {(isMobileSurveyList && !surveyListExpanded ? GROUPED_SURVEYS.slice(0, 3) : GROUPED_SURVEYS).map((group) => {
                  const groupKey = `${group.name}-${group.surveys[0]?.id ?? "none"}`;
                  const expanded = !!expandedGroups[groupKey];
                  return (
                    <div key={groupKey} className="space-y-1 rounded-lg border border-border/20 p-1">
                      <div className="grid grid-cols-[1fr_80px_140px_80px_1fr] gap-3 items-center rounded bg-muted/50 px-2 py-2 text-sm font-semibold cursor-pointer"
                        onClick={() => setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))}>
                        <div className="font-medium flex items-center gap-1">
                          {group.surveys.length > 1 ? (
                            expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          ) : null}
                          {group.name}
                        </div>
                        <div className="text-center">{getSurveyMaxLabel(group.totalMax)}{group.surveys.length > 1 ? " total" : ""}</div>
                        <div className="text-center">—</div>
                        <div className="text-center">—</div>
                        <div className="text-right text-xs text-muted-foreground">
                          {group.surveys.length > 1 ? null : "Single survey"}
                        </div>
                      </div>
                      {expanded && group.surveys.map((s) => (
                        <div key={s.id} className={`grid grid-cols-[1fr_80px_140px_80px_1fr] gap-3 items-center p-2 rounded ${s.id === selectedSurveyId ? "bg-muted/40" : ""}`}>
                          <div>
                            <Button variant="link" onClick={() => setSelectedSurveyId(s.id)}>{formatSurveyName(s)}</Button>
                          </div>
                          <div className="text-center">{getSurveyMaxLabel(s.maxEarnableRewardCount)}</div>
                          <div className="text-center">{getSurveyTerrainLabel(s)}</div>
                          <div className="text-center">{s.minAreaLevel}</div>
                          <div>
                            {s.jobGroupId ? (
                              <div className="text-sm">
                                <div className="font-medium">{JOB_GROUPS[s.jobGroupId] ?? `Group ${s.jobGroupId}`}</div>
                                <div className="text-muted-foreground text-xs">{JOB_BONUS_HINT[s.jobGroupId]}</div>
                              </div>
                            ) : (
                              <div className="text-muted-foreground">— none —</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              {isMobileSurveyList && SURVEYS.length > 3 && (
                <div className="mt-3 text-right xl:hidden">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-sm text-primary"
                    onClick={() => setSurveyListExpanded((prev) => !prev)}
                  >
                    {surveyListExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {surveyListExpanded ? "Show fewer" : `Show ${SURVEYS.length - 3} more`}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Survey Calculator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Desired Survey</p>
                  <SearchableSelect
                    value={selectedSurveyId !== null ? String(selectedSurveyId) : ""}
                    onChange={(value) => setSelectedSurveyId(value ? Number(value) : null)}
                    options={ORDERED_SURVEYS.map((s) => ({
                      value: String(s.id),
                      label: `${formatSurveyName(s)} (${getSurveyTerrainLabel(s)})`,
                    }))}
                    placeholder="Choose a survey..."
                    className="w-full"
                    triggerClassName="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    searchThreshold={8}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</p>
                  <select value={selectedJobGroupId ?? undefined} onChange={(e) => setSelectedJobGroupId(Number(e.target.value))} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    {SURVEY_CAPABLE_JOB_FAMILIES.map((family) => {
                      const isBonusGroup = survey.jobGroupId && family.group === survey.jobGroupId;
                      return (
                        <option
                          key={family.group}
                          value={family.group}
                          style={isBonusGroup ? { color: "#10b981", fontWeight: 700 } : undefined}
                        >
                          {JOB_GROUPS[family.group] ?? family.name}
                        </option>
                      );
                    })}
                  </select>
                  <div className="grid grid-cols-1 gap-2">
                    <select value={selectedJobRank ?? job.rankLabel ?? ""} onChange={(e) => setSelectedJobRank(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                      {selectedJobFamily.variants.filter((variant) => variant.rankNumber >= 4).map((variant) => (
                        <option key={variant.rankLabel} value={variant.rankLabel}>{variant.rankLabel}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Heart Level</span>
                      <Input
                        type="number"
                        min={1}
                        value={jobHeartLevel}
                        onChange={(e: any) => setJobHeartLevel(e.target.value === "" ? "" : Number(e.target.value))}
                        className="h-10 w-24"
                        disabled={overrideValues}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {EQUIP_SLOTS.map(({ key, label, icon: Icon, slotType }) => {
                    const equipId = key === "weapon" ? slotEquipment.weapon : accessoryId;
                    const equip = equipmentList.find((e) => e.id === equipId && e.slot === slotType) ?? null;
                    const options = equipmentList.filter((e) => e.slot === slotType);
                    return (
                      <div key={key} className={`flex flex-col rounded-lg border-2 ${equip ? "border-primary/30 bg-primary/5" : "border-dashed border-border/60 bg-muted/20"}`}>
                        <div className="flex items-center justify-between px-2 pt-2 pb-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{label}</span>
                          {equip && (
                            <button
                              type="button"
                              onClick={() => {
                                if (key === "weapon") setSlotEquipment((cur) => ({ ...cur, weapon: null }));
                                else setAccessoryId(null);
                              }}
                              className="text-xs text-destructive hover:text-destructive/80"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-center py-4 px-2">
                          <Icon className="w-7 h-7 text-muted-foreground" />
                        </div>
                        <div className="px-2 pb-3 space-y-2">
                          {equip ? (
                            <>
                              <p className="text-[11px] font-medium text-center text-foreground/80 leading-tight line-clamp-2 min-h-[32px]">{equip.name}</p>
                              <div className="flex items-center justify-center gap-2">
                                <span className="text-xs text-muted-foreground">Lv</span>
                                <Input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={equipmentLevels[equip.id] ?? 1}
                                  onChange={(ev: any) => {
                                    const v = Math.max(1, Math.min(99, Number(ev.target.value || 1)));
                                    setEquipmentLevels((cur) => ({ ...cur, [equip.id]: v }));
                                  }}
                                  className="h-8 text-xs text-center w-16"
                                />
                              </div>
                            </>
                          ) : (
                            <div className="space-y-2">
                              <select
                                value=""
                                onChange={(e) => {
                                  const id = e.target.value || null;
                                  if (key === "weapon") setSlotEquipment((cur) => ({ ...cur, weapon: id }));
                                  else setAccessoryId(id);
                                }}
                                className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                              >
                                <option value="">Select…</option>
                                {options.map((e) => (
                                  <option key={e.id} value={e.id}>{e.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Job heart value</div>
                    <div className="mt-2 text-2xl font-semibold">{displayJobHeartValue}</div>
                    {overrideValues && (
                      <Input
                        type="number"
                        min={0}
                        value={manualJobHeartValue}
                        onChange={(e: any) => setManualJobHeartValue(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Override value"
                        className="mt-3 h-10 w-full"
                      />
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      {!overrideValues ? "Calculated from selected job level." : "Manual override job heart value."}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Equipment heart value</div>
                    <div className="mt-2 text-2xl font-semibold">{displayEquipmentHeartValue}</div>
                    {overrideValues && (
                      <Input
                        type="number"
                        min={0}
                        value={manualEquipmentHeartValue}
                        onChange={(e: any) => setManualEquipmentHeartValue(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Override value"
                        className="mt-3 h-10 w-full"
                      />
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      {!overrideValues ? "Calculated from equipment levels." : "Manual override equipment heart value."}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total heart value</div>
                    <div className="mt-2 text-2xl font-semibold">{totalHeart}</div>
                    {overrideValues && (
                      <Input
                        type="number"
                        min={0}
                        value={manualCombinedHeartValue}
                        onChange={(e: any) => setManualCombinedHeartValue(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Override total"
                        className="mt-3 h-10 w-full"
                      />
                    )}
                    <div className="text-xs text-muted-foreground mt-2">
                      {!overrideValues ? "Auto-calculated total." : "Manual override total heart value."}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={overrideValues} onChange={(e) => setOverrideValues(e.target.checked)} />
                  <span className="text-sm">Override Values</span>
                </div>

                <div className="text-xs text-muted-foreground">{!overrideValues ? "Using calculated job and equipment heart values." : "Manual input enabled; leave total blank to add job + equipment values."}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Planner Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Survey</div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="font-medium">{formatSurveyName(survey)}</div>
                    <div className="text-xs text-muted-foreground">{getSurveyTerrainLabel(survey)} • Min Lv {survey.minAreaLevel}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Job</div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="font-medium">{job.name}</div>
                    <div className="text-xs text-muted-foreground">Rank {currentJobRank}</div>
                    {surveyBonus && <div className="text-xs mt-1">Survey Bonus: {surveyBonus}</div>}
                    {jobIsBonusForSurvey && <div className="text-success text-xs">Selected job grants bonus for this survey</div>}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Min / Max Hearts</div>
                      <div className="mt-2 text-base font-semibold">{survey.minHearts} — {survey.maxHearts}</div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Success Range</div>
                      <div className="mt-2 text-base font-semibold">{survey.minSuccessRate}% — {survey.maxSuccessRate}%</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Equipment heart</span>
                    <strong>{displayEquipmentHeartValue}</strong>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Job heart</span>
                    <strong>{displayJobHeartValue}</strong>
                  </div>
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Total heart</span>
                    <strong>{totalHeart}</strong>
                  </div>
                  <div className="flex items-center justify-between text-base font-semibold">
                    <span>Estimated success</span>
                    <strong>{success}%</strong>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      <div className="mt-3 text-sm text-muted-foreground"><em>Prototype uses placeholder names/numbers. I can wire CSV data next.</em></div>

      <Dialog open={isGuideOpen} onOpenChange={(open) => setIsGuideOpen(open)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <DialogTitle>Survey section — Playthrough Guide by Jaza</DialogTitle>
              <div className="flex items-center gap-2">
                <a href="/playthrough-guide" className="rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-muted hover:text-foreground">Go to Full playthrough Guide by Jaza</a>
                <button type="button" onClick={() => setIsGuideOpen(false)} className="rounded-md border border-border px-3 py-2 text-sm font-medium transition hover:bg-destructive hover:text-destructive-foreground">Close</button>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[82vh] space-y-4 text-sm leading-relaxed text-muted-foreground">
            {guideLoading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading full survey section...</div>
            ) : guideError ? (
              <div className="py-10 text-center text-sm text-destructive">{guideError}</div>
            ) : (
              (() => {
                const parsedGuide = parseGuide(guideMarkdown);
                const surveySection = parsedGuide.sections.find((section) => section.title.toLowerCase() === "survey");
                if (!surveySection) {
                  return <div className="py-10 text-center text-sm text-muted-foreground">Could not locate the full survey section in the guide.</div>;
                }
                return (
                  <div className="space-y-4">
                    <div className="text-sm text-foreground font-semibold">Survey</div>
                    <div className="space-y-4">
                      {surveySection.lines.map((line, index) => renderLine(line, index, parsedGuide.imageMap))}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
