import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Heart, Sword, Trash2, Moon, Sun, ExternalLink, Skull, Briefcase, BookOpen, Package, Code, Copy, Check, GitFork, Egg, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { localSharedData } from "@/lib/local-shared-data";
import { SHOP_RECORDS } from "@/lib/shop-utils";

import srcHome from "./home.tsx?raw";
import srcEquipment from "./equipment.tsx?raw";
import srcJobs from "./jobs.tsx?raw";
import srcMatcher from "./marriage-matcher.tsx?raw";
import srcMonsters from "./monsters.tsx?raw";
import srcSkills from "./skills.tsx?raw";
import srcLoadout from "./loadout.tsx?raw";
import srcShops from "./shops.tsx?raw";
import srcApp from "../App.tsx?raw";
import srcSourceViewer from "../components/source-viewer.tsx?raw";

const SOURCE_FILES: Array<{ label: string; path: string; content: string }> = [
  { label: "App.tsx",                path: "src/App.tsx",                          content: srcApp },
  { label: "home.tsx",               path: "src/pages/home.tsx",                   content: srcHome },
  { label: "equipment.tsx",          path: "src/pages/equipment.tsx",              content: srcEquipment },
  { label: "jobs.tsx",               path: "src/pages/jobs.tsx",                   content: srcJobs },
  { label: "marriage-matcher.tsx",   path: "src/pages/marriage-matcher.tsx",       content: srcMatcher },
  { label: "monsters.tsx",           path: "src/pages/monsters.tsx",               content: srcMonsters },
  { label: "skills.tsx",             path: "src/pages/skills.tsx",                 content: srcSkills },
  { label: "loadout.tsx",            path: "src/pages/loadout.tsx",                content: srcLoadout },
  { label: "shops.tsx",              path: "src/pages/shops.tsx",                  content: srcShops },
  { label: "source-viewer.tsx",      path: "src/components/source-viewer.tsx",     content: srcSourceViewer },
];

const CREDIT_SOURCES = [
  {
    label: "KA GameData Sheet",
    description: "Primary raw game-data sheet used to pull translated website data for jobs, equipment, monsters, conquest, items, and more.",
    href: "https://docs.google.com/spreadsheets/d/1e5t0CMBgw2MOv1NRE-vNk3229p7dYg6yJAQ8YbhYnWk/edit",
  },
  {
    label: "Kingdom Adventures EN Sheet",
    description: "Reference and translation sheet used to understand systems like pets, eggs, and other player-facing game mechanics.",
    href: "https://docs.google.com/spreadsheets/d/1pNx7SjpgjuKFI9Hgr21y3ammRlZjKNTTdvfLYQL7l7A/edit",
  },
  {
    label: "Kairosoft Fandom",
    description: "General Kingdom Adventurers reference used to cross-check mechanics and player-facing data.",
    href: "https://kairosoft.fandom.com/wiki/Category:Kingdom_Adventurers",
  },
  {
    label: "Kairosoft Wiki.gg",
    description: "General Kingdom Adventurers reference used alongside the data sheets for validation and understanding.",
    href: "https://kairosoft.wiki.gg/wiki/Kingdom_Adventurers",
  },
] as const;

function SourceViewerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState<"file" | "all" | null>(null);

  const copyFile = async () => {
    await navigator.clipboard.writeText(SOURCE_FILES[selected].content);
    setCopied("file");
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = async () => {
    const all = SOURCE_FILES.map(f =>
      `// ${"=".repeat(60)}\n// FILE: ${f.path}\n// ${"=".repeat(60)}\n\n${f.content}`
    ).join("\n\n");
    await navigator.clipboard.writeText(all);
    setCopied("all");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-sm font-semibold">Project Source Code — {SOURCE_FILES.length} files</DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyFile} className="gap-1.5 h-7 text-xs">
                {copied === "file" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                {copied === "file" ? "Copied!" : "Copy file"}
              </Button>
              <Button variant="outline" size="sm" onClick={copyAll} className="gap-1.5 h-7 text-xs">
                {copied === "all" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                {copied === "all" ? "Copied all!" : "Copy all files"}
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/30 overflow-y-auto">
            <p className="px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">Frontend</p>
            {SOURCE_FILES.map((f, i) => (
              <button
                key={f.path}
                onClick={() => setSelected(i)}
                className={`px-3 py-1.5 text-left text-xs truncate transition-colors ${
                  selected === i
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {f.label}
              </button>
            ))}
            <p className="px-3 py-2 mt-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-t border-border shrink-0">Backend (API Server)</p>
            <p className="px-3 py-1.5 text-xs text-muted-foreground/60 italic">See artifacts/api-server/src/</p>
            <p className="px-3 pb-3 text-[10px] text-muted-foreground/60">app.ts · routes/ka.ts</p>
          </div>
          <div className="flex-1 overflow-auto bg-muted/20">
            <div className="px-3 py-2 border-b border-border bg-muted/40 sticky top-0 z-10">
              <span className="text-[10px] font-mono text-muted-foreground">{SOURCE_FILES[selected].path}</span>
            </div>
            <pre className="p-4 text-[11px] font-mono leading-relaxed whitespace-pre text-foreground">
              {SOURCE_FILES[selected].content}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreditsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Credits</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            These sheets and reference sites helped us pull, understand, and cross-check Kingdom Adventures data for the website.
          </p>
          <div className="space-y-3">
            {CREDIT_SOURCES.map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border p-3 hover:border-primary/40 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <BookOpen className="w-4 h-4 text-primary" />
                  {source.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {source.description}
                </p>
              </a>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CustomProject {
  id: string;
  title: string;
  description: string;
  url: string;
}

const BUILT_IN_TOOLS = [
  {
    slug: "/match-finder",
    title: "Match Finder",
    description: "Find optimal job pairings using bipartite matching. Add jobs to ranks, define compatible pairs, and let the algorithm calculate the best matches.",
    icon: <Heart className="w-6 h-6 text-rose-500" />,
    badge: "Matching",
    badgeColor: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300",
  },
  {
    slug: "/equipment",
    title: "Equipment Stats",
    description: "Browse and compare equipment stats at any level. Build your character loadout and see total stats — data pulled live from Google Sheets.",
    icon: <Sword className="w-6 h-6 text-amber-500" />,
    badge: "Stats",
    badgeColor: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    slug: "/monsters",
    title: "Monsters & Weekly Conquest",
    description: "Community monster database with spawn locations. See this week's 5 conquest targets, where to find them, and what rewards are up for grabs.",
    icon: <Skull className="w-6 h-6 text-violet-500" />,
    badge: "Monsters",
    badgeColor: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300",
  },
  {
    slug: "/jobs",
    title: "Job Database",
    description: "Explore all jobs with their stats, ranks, and equipment restrictions. Click any job to see full details, skills, equipment loadouts, and marriage compatibility.",
    icon: <Briefcase className="w-6 h-6 text-sky-500" />,
    badge: "Jobs",
    badgeColor: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300",
  },
  {
    slug: "/skills",
    title: "Skills Database",
    description: "Community-editable list of all skills with studio level, crafting intelligence, buy price, and sell price.",
    icon: <BookOpen className="w-6 h-6 text-emerald-500" />,
    badge: "Skills",
    badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  },
  {
    slug: "/loadout",
    title: "Loadout Builder",
    description: "Build character loadouts combining jobs, equipment, and skills. Calculate total stats at any level and export a screenshot to share.",
    icon: <Package className="w-6 h-6 text-orange-500" />,
    badge: "Builder",
    badgeColor: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300",
  },
  {
    slug: "/eggs",
    title: "Eggs & Pets",
    description: "Plan egg hatches from either direction: target a monster outcome first or start from the egg you already have.",
    icon: <Egg className="w-6 h-6 text-yellow-500" />,
    badge: "Planner",
    badgeColor: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300",
  },
  {
    slug: "/shops",
    title: "Shops",
    description: "Browse shop systems by type and start drilling into weapon, armor, accessory, item, furniture, restaurant, and skill shops.",
    icon: <Store className="w-6 h-6 text-indigo-500" />,
    badge: "Shops",
    badgeColor: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300",
  },
];

function generateId() { return Math.random().toString(36).slice(2, 9); }

export default function Home() {
  const [, navigate] = useLocation();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" ||
        (!localStorage.getItem("theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });

  const [srcOpen, setSrcOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) { root.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { root.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  }, [darkMode]);

  const [customProjects, setCustomProjects] = useState<CustomProject[]>(() => {
    try { return JSON.parse(localStorage.getItem("ka_custom_projects") ?? "[]"); }
    catch { return []; }
  });

  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const saveProjects = (projects: CustomProject[]) => {
    setCustomProjects(projects);
    localStorage.setItem("ka_custom_projects", JSON.stringify(projects));
  };

  const addProject = () => {
    if (!newTitle.trim()) return;
    saveProjects([
      ...customProjects,
      { id: generateId(), title: newTitle.trim(), description: newDesc.trim(), url: newUrl.trim() },
    ]);
    setNewTitle(""); setNewDesc(""); setNewUrl(""); setAdding(false);
  };

  const removeProject = (id: string) => saveProjects(customProjects.filter((p) => p.id !== id));

  return (
    <div className="min-h-screen bg-background transition-colors">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="flex items-start justify-between mb-10 gap-4">
          <div className="min-w-0">
            <h1 className="text-4xl font-bold text-foreground tracking-tight">Kingdom Adventures</h1>
            <p className="mt-2 text-muted-foreground">Tools &amp; resources for Kingdom Adventures players.</p>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <Button variant="outline" size="icon" onClick={() => setDarkMode((d) => !d)} className="h-9 w-9">
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {BUILT_IN_TOOLS.map((tool) => (
            <Link key={tool.slug} href={tool.slug}>
              <Card className="shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                      {tool.icon}
                    </div>
                    <Badge variant="outline" className={`text-xs px-2 border ${tool.badgeColor} shrink-0`}>
                      {tool.badge}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{tool.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed">{tool.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {customProjects.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Community Projects</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {customProjects.map((p) => (
                <Card key={p.id} className="shadow-sm hover:shadow-md transition-all group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{p.title}</CardTitle>
                      <button
                        onClick={(e) => { e.preventDefault(); removeProject(p.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {p.description && <CardDescription className="text-xs">{p.description}</CardDescription>}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" /> Open project
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {adding ? (
          <Card className="shadow-sm border-dashed border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Add a project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Project title *" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Short description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="h-8 text-sm" />
              <Input placeholder="Link (URL)" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="h-8 text-sm" />
              <div className="flex gap-2">
                <Button size="sm" onClick={addProject} className="h-8">Add</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewTitle(""); setNewDesc(""); setNewUrl(""); }} className="h-8">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors py-5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-4 h-4" /> Add a project
          </button>
        )}

        <div className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground flex items-center justify-between gap-4 flex-wrap">
          <span>Kingdom Adventures — open source tools</span>
          <div className="flex items-center gap-4">
            <button onClick={() => setCreditsOpen(true)} className="flex items-center gap-1 hover:text-foreground transition-colors">
              <BookOpen className="w-3 h-3" /> Credits
            </button>
            <button onClick={() => setSrcOpen(true)} className="flex items-center gap-1 hover:text-foreground transition-colors">
              <Code className="w-3 h-3" /> View source code
            </button>
            <a href="https://replit.com" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition-colors">
              <GitFork className="w-3 h-3" /> Fork on Replit
            </a>
          </div>
        </div>
      </div>

      <CreditsDialog open={creditsOpen} onClose={() => setCreditsOpen(false)} />
      <SourceViewerDialog open={srcOpen} onClose={() => setSrcOpen(false)} />
    </div>
  );
}
