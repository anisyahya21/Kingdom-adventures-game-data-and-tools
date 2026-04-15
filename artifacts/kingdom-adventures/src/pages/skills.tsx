import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Moon, Sun, Loader2, Pencil, Check, X,
  RefreshCw, BookOpen, Search, Zap, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchSharedWithFallback } from "@/lib/local-shared-data";
import { apiUrl } from "@/lib/api";


type Skill = {
  name: string;
  studioLevel?: number;
  craftingIntelligence?: number;
  buyPrice?: number;
  sellPrice?: number;
  description?: string;
  weaponResistance?: string;
};

type SharedData = { skills?: Record<string, Skill> };

const EXCLUDED_SKILL_NAMES = new Set(["normal attack", "gun attack", "critical hit"]);
function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: () => fetchSharedWithFallback<SharedData>(apiUrl("/shared")),
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

async function persistSkills(skills: Record<string, Skill>, userName: string, desc: string) {
  await fetch(apiUrl("/skills"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: skills,
      history: { userName: userName || "anonymous", changeType: "skill", itemName: "skills", description: desc },
    }),
  });
}

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)
      : false
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, setDark };
}

function useUserName() {
  const [name, setName] = useState(() => localStorage.getItem("ka_username") ?? "");
  const save = (n: string) => { setName(n); localStorage.setItem("ka_username", n); };
  return { name, save };
}

function NamePrompt({ onSave, onCancel }: { onSave: (n: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState("");
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Enter your name</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">So the community knows who made changes.</p>
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Your name…" className="h-8 text-sm"
          onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) onSave(val.trim()); }} />
        <Button onClick={() => { if (val.trim()) onSave(val.trim()); }} className="h-8">Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function numCell(val: number | null | undefined, onChange: (v: number | undefined) => void, editing: boolean, prefix?: string) {
  if (!editing) {
    return val != null
      ? <span className="tabular-nums">{prefix}{val.toLocaleString()}</span>
      : <span className="text-muted-foreground/40">—</span>;
  }
  return (
    <Input
      type="number"
      min={0}
      value={val ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="h-7 text-sm px-2 w-full"
      placeholder="—"
    />
  );
}

export default function SkillsPage() {
  const { dark, setDark } = useDarkMode();
  const { name: userName, save: saveUserName } = useUserName();
  const [promptName, setPromptName] = useState(false);
  const [pendingFn, setPendingFn] = useState<(() => void) | null>(null);
  const [pageNote, setPageNote] = useState(() => localStorage.getItem("ka_note_skills") ?? "");
  const [showNote, setShowNote] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useSharedData();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "studioLevel" | "craftingIntelligence" | "buyPrice" | "sellPrice">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const skills: Record<string, Skill> = data?.skills ?? {};

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sorted = Object.values(skills)
    .filter((skill) => !EXCLUDED_SKILL_NAMES.has(skill.name.trim().toLowerCase()))
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return dir * a.name.localeCompare(b.name);
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return dir * ((av as number) < (bv as number) ? -1 : (av as number) > (bv as number) ? 1 : 0);
    });
  const filtered = search.trim()
    ? sorted.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : sorted;

  const withName = useCallback((fn: () => void) => {
    if (!userName) { setPendingFn(() => fn); setPromptName(true); }
    else fn();
  }, [userName]);

  const onNameSaved = (n: string) => {
    saveUserName(n); setPromptName(false);
    if (pendingFn) { pendingFn(); setPendingFn(null); }
  };
  const onNamePromptCancelled = () => {
    setPromptName(false);
    setPendingFn(null);
  };

  const saveSkills = useCallback((updated: Record<string, Skill>, desc: string) => {
    withName(() => {
      qc.setQueryData(["ka-shared"], (old: SharedData | undefined) => old ? { ...old, skills: updated } : old);
      persistSkills(updated, userName, desc).then(() => qc.invalidateQueries({ queryKey: ["ka-shared"] }));
    });
  }, [qc, userName, withName]);

  // ── Adding a new skill ──
  // ── Inline editing ──
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Skill | null>(null);

  const startEdit = (skill: Skill) => { setEditingName(skill.name); setEditDraft({ ...skill }); };
  const cancelEdit = () => { setEditingName(null); setEditDraft(null); };
  const commitEdit = () => {
    if (!editDraft || !editingName) return;
    const originalDescription = skills[editingName]?.description ?? "";
    const draftDescription = editDraft.description ?? "";
    if (originalDescription === draftDescription) {
      cancelEdit();
      return;
    }
    withName(() => {
      const updated = { ...skills };
      updated[editingName] = { ...skills[editingName], description: editDraft.description };
      saveSkills(updated, `Updated skill notes: ${editingName}`);
      setEditingName(null);
      setEditDraft(null);
    });
  };

  return (
    <div className="min-h-screen bg-background transition-colors">
      {promptName && <NamePrompt onSave={onNameSaved} onCancel={onNamePromptCancelled} />}

      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/">
              <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />Home
              </button>
            </Link>
            <span className="text-muted-foreground/30">/</span>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-500" />Skills Database
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setShowNote((v) => !v)} className="h-8 w-8 text-muted-foreground" title="Personal notes (private, stored on this device)">
              <Info className="w-3.5 h-3.5" />
            </Button>
            <button onClick={() => refetch()} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted">
              <RefreshCw className="w-4 h-4" />
            </button>
            <Button variant="outline" size="icon" onClick={() => setDark((d) => !d)} className="h-8 w-8">
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {showNote && (
          <div className="mb-4">
            <textarea
              value={pageNote}
              onChange={(e) => setPageNote(e.target.value)}
              onBlur={() => localStorage.setItem("ka_note_skills", pageNote)}
              placeholder="Personal notes for this page… (only visible to you, saved on this device)"
              className="w-full h-20 text-sm rounded-md border border-input bg-muted/20 px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
            />
          </div>
        )}
        {/* Toolbar */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…" className="h-8 text-sm pl-8" />
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Skills</CardTitle>
            <CardDescription className="text-xs">
              Sheet-derived skill data is read-only here. Only the Tips / Notes text is editable for community context.
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
                      ] as const).map(({ key, label, align, cls }) => (
                        <th key={key} className={`px-3 py-2 text-xs font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors ${cls} text-${align}`}
                          onClick={() => toggleSort(key)}>
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
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Tips / Notes</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">

                    {filtered.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                        {search ? "No skills match your search." : "No skills found."}
                      </td></tr>
                    )}

                    {filtered.map((skill) => {
                      const isEditing = editingName === skill.name;
                      const d = isEditing ? editDraft! : skill;
                      return (
                        <tr key={skill.name} className={`hover:bg-muted/30 transition-colors ${isEditing ? "bg-sky-50 dark:bg-sky-950/20" : ""}`}>
                          <td className="px-4 py-2 font-medium">
                            {skill.name}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.studioLevel, () => undefined, false)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.craftingIntelligence, () => undefined, false)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.buyPrice, () => undefined, false, "$")}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(skill.sellPrice, () => undefined, false, "$")}
                          </td>
                          <td className="px-3 py-2 min-w-[200px]">
                            {isEditing
                              ? <Input value={d.description ?? ""} onChange={(e) => setEditDraft((x) => x ? { ...x, description: e.target.value || undefined } : x)}
                                  placeholder="Tips or notes…" className="h-7 text-sm px-2" />
                              : <div className="space-y-0.5">
                                  {d.weaponResistance && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700">
                                      {d.weaponResistance} Resistance
                                    </span>
                                  )}
                                  {d.description
                                    ? <span className="block text-xs text-muted-foreground line-clamp-2">{d.description}</span>
                                    : !d.weaponResistance && <span className="text-muted-foreground/30 text-xs">—</span>}
                                </div>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              {isEditing ? (
                                <>
                                  <button onClick={commitEdit} className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                                  <button onClick={cancelEdit} className="text-muted-foreground hover:text-destructive p-0.5"><X className="w-3.5 h-3.5" /></button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => startEdit(skill)} className="text-muted-foreground hover:text-foreground p-0.5 transition-colors"><Pencil className="w-3 h-3" /></button>
                                </>
                              )}
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
          {Object.keys(skills).length} skill{Object.keys(skills).length !== 1 ? "s" : ""} in database � Base data is shared game data, notes are community-added context
        </p>
      </div>
    </div>
  );
}


