import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, Trash2, Moon, Sun, Loader2, Pencil, Check, X,
  RefreshCw, BookOpen, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = (path: string) => `${BASE}/ka-api/ka${path}`;

type Skill = {
  name: string;
  studioLevel?: number;
  craftingIntelligence?: number;
  buyPrice?: number;
  sellPrice?: number;
};

type SharedData = { skills?: Record<string, Skill> };

function useSharedData() {
  return useQuery({
    queryKey: ["ka-shared"],
    queryFn: async () => {
      const r = await fetch(API("/shared"));
      return r.json() as Promise<SharedData>;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
}

async function persistSkills(skills: Record<string, Skill>, userName: string, desc: string) {
  await fetch(API("/skills"), {
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

function NamePrompt({ onSave }: { onSave: (n: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <Dialog open>
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

const EMPTY_SKILL: Omit<Skill, "name"> = {
  studioLevel: undefined,
  craftingIntelligence: undefined,
  buyPrice: undefined,
  sellPrice: undefined,
};

function numCell(val: number | undefined, onChange: (v: number | undefined) => void, editing: boolean, prefix?: string) {
  if (!editing) {
    return val !== undefined
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
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useSharedData();
  const [search, setSearch] = useState("");

  const skills: Record<string, Skill> = data?.skills ?? {};
  const sorted = Object.values(skills).sort((a, b) => a.name.localeCompare(b.name));
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

  const saveSkills = useCallback((updated: Record<string, Skill>, desc: string) => {
    withName(() => {
      qc.setQueryData(["ka-shared"], (old: SharedData | undefined) => old ? { ...old, skills: updated } : old);
      persistSkills(updated, userName, desc).then(() => qc.invalidateQueries({ queryKey: ["ka-shared"] }));
    });
  }, [qc, userName, withName]);

  // ── Adding a new skill ──
  const [addingSkill, setAddingSkill] = useState(false);
  const [draft, setDraft] = useState<Skill>({ name: "", ...EMPTY_SKILL });

  const commitAdd = () => {
    const trimmed = draft.name.trim();
    if (!trimmed) return;
    const key = trimmed;
    withName(() => {
      const updated = { ...skills, [key]: { ...draft, name: trimmed } };
      saveSkills(updated, `Added skill: ${trimmed}`);
      setDraft({ name: "", ...EMPTY_SKILL });
      setAddingSkill(false);
    });
  };

  const deleteSkill = (name: string) => {
    withName(() => {
      const updated = { ...skills };
      delete updated[name];
      saveSkills(updated, `Deleted skill: ${name}`);
    });
  };

  // ── Inline editing ──
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Skill | null>(null);

  const startEdit = (skill: Skill) => { setEditingName(skill.name); setEditDraft({ ...skill }); };
  const cancelEdit = () => { setEditingName(null); setEditDraft(null); };
  const commitEdit = () => {
    if (!editDraft || !editingName) return;
    withName(() => {
      const updated = { ...skills };
      delete updated[editingName];
      const newKey = editDraft.name.trim() || editingName;
      updated[newKey] = { ...editDraft, name: newKey };
      saveSkills(updated, `Updated skill: ${newKey}`);
      setEditingName(null);
      setEditDraft(null);
    });
  };

  return (
    <div className="min-h-screen bg-background transition-colors">
      {promptName && <NamePrompt onSave={onNameSaved} />}

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
        {/* Toolbar */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…" className="h-8 text-sm pl-8" />
          </div>
          <Button size="sm" onClick={() => { setAddingSkill(true); setDraft({ name: "", ...EMPTY_SKILL }); }} className="h-8 gap-1.5">
            <Plus className="w-3.5 h-3.5" />Add Skill
          </Button>
        </div>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Skills</CardTitle>
            <CardDescription className="text-xs">
              Community-editable skill database. Fields are optional — fill in what you know.
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
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-[220px]">Skill Name</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-[110px]">Studio Level</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-[140px]">Crafting Intel</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-[110px]">Buy Price</th>
                      <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground w-[110px]">Sell Price</th>
                      <th className="w-16" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* Add row */}
                    {addingSkill && (
                      <tr className="bg-emerald-50 dark:bg-emerald-950/20">
                        <td className="px-4 py-2">
                          <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                            placeholder="Skill name *" className="h-7 text-sm px-2"
                            onKeyDown={(e) => { if (e.key === "Enter") commitAdd(); if (e.key === "Escape") setAddingSkill(false); }}
                            autoFocus />
                        </td>
                        <td className="px-3 py-2">{numCell(draft.studioLevel, (v) => setDraft((d) => ({ ...d, studioLevel: v })), true)}</td>
                        <td className="px-3 py-2">{numCell(draft.craftingIntelligence, (v) => setDraft((d) => ({ ...d, craftingIntelligence: v })), true)}</td>
                        <td className="px-3 py-2">{numCell(draft.buyPrice, (v) => setDraft((d) => ({ ...d, buyPrice: v })), true, "💰")}</td>
                        <td className="px-3 py-2">{numCell(draft.sellPrice, (v) => setDraft((d) => ({ ...d, sellPrice: v })), true, "💰")}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 justify-end">
                            <button onClick={commitAdd} className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setAddingSkill(false)} className="text-muted-foreground hover:text-destructive p-0.5"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {filtered.length === 0 && !addingSkill && (
                      <tr><td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                        {search ? "No skills match your search." : "No skills added yet. Click \"Add Skill\" to start."}
                      </td></tr>
                    )}

                    {filtered.map((skill) => {
                      const isEditing = editingName === skill.name;
                      const d = isEditing ? editDraft! : skill;
                      return (
                        <tr key={skill.name} className={`hover:bg-muted/30 transition-colors ${isEditing ? "bg-sky-50 dark:bg-sky-950/20" : ""}`}>
                          <td className="px-4 py-2 font-medium">
                            {isEditing
                              ? <Input value={d.name} onChange={(e) => setEditDraft((x) => x ? { ...x, name: e.target.value } : x)}
                                  className="h-7 text-sm px-2" onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }} />
                              : skill.name}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(d.studioLevel, (v) => setEditDraft((x) => x ? { ...x, studioLevel: v } : x), isEditing)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(d.craftingIntelligence, (v) => setEditDraft((x) => x ? { ...x, craftingIntelligence: v } : x), isEditing)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(d.buyPrice, (v) => setEditDraft((x) => x ? { ...x, buyPrice: v } : x), isEditing, "💰")}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {numCell(d.sellPrice, (v) => setEditDraft((x) => x ? { ...x, sellPrice: v } : x), isEditing, "💰")}
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
                                  <button onClick={() => deleteSkill(skill.name)} className="text-muted-foreground hover:text-destructive p-0.5 transition-colors"><Trash2 className="w-3 h-3" /></button>
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
          {Object.keys(skills).length} skill{Object.keys(skills).length !== 1 ? "s" : ""} in database · Community data shared across all users
        </p>
      </div>
    </div>
  );
}
