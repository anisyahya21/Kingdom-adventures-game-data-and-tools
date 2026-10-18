import { isSkillCraftable } from "@/lib/skill-crafting";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Loader2, BookOpen, Search, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ka/page-header";
import { ToneBadge } from "@/components/ka/badges";
import { loadSharedReferenceData } from "@/lib/local-shared-data";
import { getSkillIcon } from "@/lib/skill-icons";
import { getNativeSkillDescription, getSkillDescription, getSkillDescriptionEvidence } from "@/lib/skill-descriptions";


type Skill = {
  name: string;
  studioLevel?: number;
  craftingIntelligence?: number;
  buyPrice?: number;
  sellPrice?: number;
  description?: string;
  weaponResistance?: string;
  flags?: number;
};


function getSkillTypeLabel(skill: Skill) {
  if (typeof skill.flags === "number") {
    if (skill.flags & 512) return "Attack";
    if (skill.flags & 1024) return "Attack Magic";
    if (skill.flags & 2048) return "Recovery magic";
  }
  return getSkillTypeLabelByName(skill.name);
}

type SharedData = { skills?: Record<string, Skill> };

function getSkillTypeLabelByName(skillName: string) {
  const normalized = skillName.trim();
  const exact = SKILL_TYPE_BY_NAME.get(normalized);
  if (exact) return exact;

  const patterns: Array<[RegExp, "Attack" | "Attack Magic" | "Recovery magic"]> = [
    [/^\d+-Hit Attack$/i, "Attack"],
    [/^Area Attack\s+.+$/i, "Attack"],
    [/^Armor Breaker\s+.+$/i, "Attack"],
    [/^Direct Attack\s+.+$/i, "Attack"],
    [/^Sandman\s+.+$/i, "Attack"],
    [/^Fire Magic\s+.+$/i, "Attack Magic"],
    [/^Ice Magic\s+.+$/i, "Attack Magic"],
    [/^Lightning Magic\s+.+$/i, "Attack Magic"],
    [/^Heal\s+.+$/i, "Recovery magic"],
    [/^Revive\s+\d+%$/i, "Recovery magic"],
  ];

  for (const [pattern, type] of patterns) {
    if (pattern.test(normalized)) return type;
  }

  return undefined;
}

const SKILL_TYPE_BY_NAME = new Map<string, "Attack" | "Attack Magic" | "Recovery magic">([
  ["<0>-Hit Attack", "Attack"],
  ["Area Attack <0>", "Attack"],
  ["Armor Breaker <0>", "Attack"],
  ["Arrow Rain", "Attack"],
  ["Counter", "Attack"],
  ["Critical UP", "Attack"],
  ["Critical UP+", "Attack"],
  ["Direct Attack <0>", "Attack"],
  ["Dodge UP", "Attack"],
  ["Full Reflect", "Attack"],
  ["Half Reflect", "Attack"],
  ["Myriad Arrows", "Attack"],
  ["Parry", "Attack"],
  ["Perfect Dodge", "Attack"],
  ["Sandman <0>", "Attack"],
  ["Fire Magic <0>", "Attack Magic"],
  ["Ice Magic <0>", "Attack Magic"],
  ["Lightning Magic <0>", "Attack Magic"],
  ["Heal <0>", "Recovery magic"],
  ["Revive <0>%", "Recovery magic"],
]);

const EXCLUDED_SKILL_NAMES = new Set(["normal attack", "gun attack", "critical hit"]);
function useSharedData() {
  return useQuery({
    queryKey: ["ka-reference"],
    queryFn: () => loadSharedReferenceData<SharedData>(),
    staleTime: Infinity,
  });
}

function numCell(val: number | null | undefined, prefix = "") {
  return val != null
    ? <span className="tabular-nums">{prefix}{val.toLocaleString()}</span>
    : <span className="text-muted-foreground/40">—</span>;
}

export default function SkillsPage() {
  const [includeBasicAttacks, setIncludeBasicAttacks] = useState(false);
  const { data, isLoading } = useSharedData();
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("search") ?? "";
  });
  const [sortKey, setSortKey] = useState<"name" | "studioLevel" | "craftingIntelligence" | "buyPrice" | "sellPrice" | "type" | "craftable">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const skills: Record<string, Skill> = data?.skills ?? {};

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sorted = Object.values(skills)
    .filter((skill) => includeBasicAttacks || !EXCLUDED_SKILL_NAMES.has(skill.name.trim().toLowerCase()))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      if (sortKey === "type") {
        const aType = getSkillTypeLabel(a) ?? "";
        const bType = getSkillTypeLabel(b) ?? "";
        return dir * aType.localeCompare(bType);
      }
      if (sortKey === "craftable") {
        const aCraft = isSkillCraftable(a) ? 1 : 0;
        const bCraft = isSkillCraftable(b) ? 1 : 0;
        return dir * (aCraft - bCraft);
      }
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return dir * ((av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0);
    });
  const filtered = search.trim()
    ? sorted.filter((s) => `${s.name} ${getSkillDescription(s.name) ?? ""} ${getNativeSkillDescription(s.name) ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    : sorted;


  return (
    <div className="min-h-screen bg-background transition-colors">

      <div className="max-w-5xl mx-auto px-4 py-6">
        <PageHeader
          icon={<BookOpen className="w-5 h-5 text-emerald-500" />}
          title="Skills Database"
          className="mb-4"

        />

        {/* Toolbar */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…" className="h-8 text-sm pl-8" />
          </div>
          <label className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeBasicAttacks} onChange={e => setIncludeBasicAttacks(e.target.checked)} />
            Include basic attacks
          </label>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Skills</CardTitle>
            <CardDescription className="text-xs">
              Every named skill has an explanation. Some effects still need deeper investigation; unconfirmed effects are marked. Tips / Notes are community context.
              {" "}<Link href="/guides/stat-effects" className="text-primary hover:underline">Stats outside combat guide</Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {([
                        { key: "name", label: "Skill Name", align: "left", cls: "w-[200px]" },
                        { key: "studioLevel", label: "Studio Level", align: "center", cls: "w-[100px]" },
                        { key: "craftingIntelligence", label: null, align: "center", cls: "w-[130px]" },
                        { key: "buyPrice", label: "Buy Price", align: "center", cls: "w-[100px]" },
                        { key: "sellPrice", label: "Sell Price", align: "center", cls: "w-[100px]" },
                        { key: "type", label: "Type", align: "center", cls: "w-[110px]" },
                        { key: "craftable", label: "Craftable", align: "center", cls: "w-[100px]" },
                      ] as const).map(({ key, label, align, cls }) => (
                        <th key={key} className={`px-3 py-2 text-xs font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors ${cls} text-${align}`}
                          onClick={() => toggleSort(key as typeof sortKey)}>
                          <span className="inline-flex items-center gap-1">
                            {key === "craftingIntelligence"
                              ? <><Zap className="w-3 h-3 text-yellow-500" />Crafting Intel</>
                              : label}
                            {sortKey === key
                              ? (sortDir === "asc" ? " ↑" : " ↓")
                              : <span className="text-muted-foreground/30"> ↕</span>}
                          </span>
                        </th>
                      ))}
                      <th className="hidden md:table-cell text-left px-3 py-2 text-xs font-medium text-muted-foreground">Description</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Tips / Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">

                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-12 text-sm text-muted-foreground">
                        {search ? "No skills match your search." : "No skills found."}
                      </td></tr>
                    )}

                    {filtered.map((skill) => {
                      const skillIcon = getSkillIcon(skill.name);
                      const craftable = isSkillCraftable(skill);
                      return (
                        <tr key={skill.name} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 font-medium">
                            <div className="flex items-center gap-2">
                              {skillIcon ? (
                                <img
                                  src={skillIcon}
                                  alt=""
                                  className="h-10 w-10 shrink-0 object-contain"
                                  style={{ imageRendering: "pixelated" }}
                                />
                              ) : null}
                              <span>{skill.name}</span>
                            </div>
                            <p className="mt-2 w-[250px] max-w-[65vw] whitespace-normal text-xs font-normal leading-relaxed text-muted-foreground md:hidden">
                              {getSkillDescription(skill.name) ?? "Effect still needs investigation."}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.studioLevel)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.craftingIntelligence)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.buyPrice, "$")}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.sellPrice, "$")}
                          </td>
                          <td className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                            {getSkillTypeLabel(skill) ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={craftable ? "text-emerald-600 font-semibold" : "text-destructive font-semibold"}>
                              {craftable ? "Y" : "N"}
                            </span>
                          </td>
                          <td className="hidden md:table-cell px-3 py-2 min-w-[220px] max-w-sm text-xs text-muted-foreground">
                            <span data-description-source={getSkillDescriptionEvidence(skill.name)} title={`${getSkillDescriptionEvidence(skill.name) === "code" ? "Clarified from game code. " : ""}${getNativeSkillDescription(skill.name) ? `Original in-game wording: ${getNativeSkillDescription(skill.name)}` : "Original game text marks this entry unused."}`}>
                              {getSkillDescription(skill.name) ?? <span className="text-muted-foreground/50">Not documented in game</span>}
                            </span>
                          </td>
                          <td className="px-3 py-2 min-w-[200px]">
                            <div className="space-y-0.5">
                              {skill.weaponResistance && (
                                <ToneBadge category="shop" className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold">
                                  {skill.weaponResistance} Resistance
                                </ToneBadge>
                              )}
                              {skill.description
                                ? <span className="block text-xs text-muted-foreground line-clamp-2">{skill.description}</span>
                                : !skill.weaponResistance && <span className="text-muted-foreground/30 text-xs">—</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground mt-3 text-center">
          {Object.keys(skills).length} skill{Object.keys(skills).length !== 1 ? "s" : ""} in database · Descriptions use game code and in-game text; notes are community context
        </p>
      </div>
    </div>
  );
}


