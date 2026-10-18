import { EncounterCards } from "@/components/ka/encounter-cards";
import { useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, FlaskConical, Heart, Package, Settings2, Users, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocalFeature } from "@/hooks/sync/use-local-feature";
import { usePlayerProfile } from "@/lib/player-profile";
import { ENCOUNTER_BY_ID } from "@/lib/battle-setup";
import type { SavedRoster } from "@/lib/account-rosters";
import { DEFAULT_FARMING_SETTINGS, FARMING_PLANNER_KEY, normalizeFarmingSettings, type FarmingPlannerSettings } from "@/lib/farming-planner";
import { ResearchStrategyBank } from "@/components/ka/research-strategy-bank";

const selectClass = "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Permission({ label, checked, onChange, icon: Icon }: { label: string; checked: boolean; onChange: (checked: boolean) => void; icon: typeof Users }) {
  return <label className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 transition-colors ${checked ? "border-primary/30 bg-primary/5" : "border-input bg-background"}`}>
    <span className="flex items-center gap-2 min-w-0 text-xs sm:text-sm"><Icon className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />{label}</span>
    <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} /></span>
  </label>;
}

export function FarmingPlannerSetup({ onSearch, onSettingsChange, children }: { onSearch: (settings: FarmingPlannerSettings) => void; onSettingsChange: () => void; children?: React.ReactNode }) {
  const [rawSettings, setRawSettings] = useLocalFeature<unknown>(FARMING_PLANNER_KEY, DEFAULT_FARMING_SETTINGS);
  const settings = normalizeFarmingSettings(rawSettings);
  const [profile] = usePlayerProfile();
  const [rawRosters] = useLocalFeature<unknown>("ka_battle_rosters", []);
  const rosters = Array.isArray(rawRosters) ? rawRosters.filter((row): row is SavedRoster => Boolean(row && typeof row === "object" && typeof row.id === "string" && typeof row.name === "string" && Array.isArray(row.characters))) : [];
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterTab, setRosterTab] = useState<"characters" | "equipment">("characters");
  const [filter, setFilter] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState("");
  const selected = ENCOUNTER_BY_ID.get(settings.encounterId)!;
  const [encountersOpen, setEncountersOpen] = useState(false);
  const eligibleCount = profile.characters.filter((row) => !settings.excludedCharacters.includes(row.id)).length;
  const inventoryCount = Object.keys(profile.equipment).filter((name) => !settings.reservedEquipment.includes(name)).length;
  const currentRoster = rosters.find((row) => row.id === settings.startingTeamId);

  function update(patch: Partial<FarmingPlannerSettings>) {
    setRawSettings((previous: unknown) => ({ ...normalizeFarmingSettings(previous), ...patch }));
    onSettingsChange(); setError("");
  }
  function toggleList(key: "excludedCharacters" | "reservedEquipment", value: string) {
    const list = settings[key]; update({ [key]: list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value] });
  }
  function requestSearch() {
    if (settings.levelUpGear && (!/^\d+$/.test(settings.maxGearLevel) || Number(settings.maxGearLevel) < 1 || Number(settings.maxGearLevel) > 99)) { setError("Choose a maximum equipment level from 1 to 99."); setMoreOpen(true); return; }

    setError(""); onSearch({ ...settings, useProfile: true, trainCharacters: false });
  }
  return <div className="space-y-5">
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-2"><p className="text-xs font-medium">Encounter</p><button type="button" aria-expanded={encountersOpen} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm hover:bg-muted/40" onClick={() => setEncountersOpen(!encountersOpen)}><span>{selected.familyName} · {selected.difficultyName}</span><span className="shrink-0 text-xs text-primary">{encountersOpen ? "Close" : "Change"}</span></button></div>
          <label className="space-y-2 text-xs font-medium"><span className="block">Goal</span><select aria-label="Goal" className={selectClass} value={settings.goal} onChange={(event) => update({ goal: event.target.value as FarmingPlannerSettings["goal"] })}><option value="rewards">Farm rewards</option><option value="clear">Clear encounter</option></select></label>
        </div>
        {encountersOpen && <EncounterCards encounterId={settings.encounterId} onSelect={(encounterId) => { update({ encounterId }); setEncountersOpen(false); }} />}
        <div className="grid grid-cols-2 gap-3 border-t pt-5 sm:grid-cols-2">
          <div className="space-y-2"><p className="text-xs font-medium">Build using</p><div className="flex h-11 items-center rounded-lg border px-3 text-sm">My profile</div></div>
          <div className="space-y-2"><p className="text-xs font-medium">Equipment</p><Permission label="Level up gear" checked={settings.levelUpGear} onChange={(levelUpGear) => update({ levelUpGear })} icon={Package} /></div>


        </div>
        <div className="rounded-lg border bg-muted/10 p-3">
          <p className="mb-2 text-xs font-medium">Improve survivability</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">{(["hp", "mp", "def"] as const).map((stat) => <label key={stat} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={settings.maximizeStats.includes(stat)} onChange={(event) => update({ maximizeStats: event.target.checked ? [...settings.maximizeStats, stat] : settings.maximizeStats.filter((value) => value !== stat) })} />Maximize {stat.toUpperCase()}</label>)}</div>
          <p className="mt-1 text-xs text-muted-foreground">Improve these stats at the same largest stat deviation. Different combinations can produce different rewards.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/15 px-3 text-sm"><span className="flex items-center gap-2"><Heart className="h-4 w-4 shrink-0 text-muted-foreground" /><span>Use placeholder healer & fodders</span></span><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={settings.placeholderSupports} onChange={(event) => update({ placeholderSupports: event.target.checked })} /></label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/15 px-3 text-sm"><span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" />Allow consumables</span><input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={settings.allowConsumables} onChange={(event) => update({ allowConsumables: event.target.checked })} /></label>
        </div>
        {settings.allowConsumables && <div className="rounded-lg border bg-muted/10 p-3">
          <p className="mb-3 text-xs font-medium">Maximum uses per encounter</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-xs"><span>Holy Herbs</span><Input aria-label="Holy Herbs per encounter" type="number" min={0} max={999} value={settings.holyHerbLimit} onChange={(event) => update({ holyHerbLimit: Math.max(0, Math.min(999, Math.trunc(Number(event.target.value) || 0))) })} /></label>
            <label className="space-y-2 text-xs"><span>Recovery Potions (L)</span><Input aria-label="Recovery Potions (L) per encounter" type="number" min={0} max={999} value={settings.recoveryPotionLimit} onChange={(event) => update({ recoveryPotionLimit: Math.max(0, Math.min(999, Math.trunc(Number(event.target.value) || 0))) })} /></label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">0 means none. A longer fight can run out; it cannot exceed these limits.</p>
        </div>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 space-y-2 text-xs font-medium"><span className="block">Starting team</span><select aria-label="Starting team" className={selectClass} value={currentRoster?.id ?? ""} onChange={(event) => update({ startingTeamId: event.target.value })}><option value="">Find automatically</option>{rosters.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><Button variant="outline" className="min-h-11 gap-2" onClick={() => setRosterOpen(true)}><Users className="h-4 w-4" />Exclude characters & gear{settings.excludedCharacters.length + settings.reservedEquipment.length > 0 && <Badge variant="secondary">{settings.excludedCharacters.length + settings.reservedEquipment.length}</Badge>}</Button></div>
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{settings.useProfile ? <><span className="inline-flex items-center gap-1.5 font-medium text-foreground"><span className={`h-1.5 w-1.5 rounded-full ${eligibleCount ? "bg-primary" : "bg-muted-foreground"}`} />{eligibleCount ? "Profile loaded" : "Profile needs characters"}</span><span>{eligibleCount} characters · {inventoryCount} gear types</span><Link href="/player-profile" className="inline-flex min-h-9 items-center text-primary hover:underline">Edit profile</Link></> : <><Badge variant="secondary">Theoretical builds</Badge><span>Ownership restrictions off</span></>}</div>
          <Button className="min-h-11 gap-2 px-6" onClick={requestSearch}><WandSparkles className="h-4 w-4" />Find DPS</Button>
        </div>
      </CardContent>
    </Card>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"><p>{settings.levelUpGear ? `Gear up to Lv${settings.maxGearLevel || "—"}` : "Current gear levels"} · Current training · Weak & full strength</p><Button variant="ghost" className="min-h-11 gap-2 text-xs" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}><Settings2 className="h-4 w-4" />More settings<ChevronDown className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`} /></Button></div>
    <ResearchStrategyBank encounter={settings.encounterId} />
    {moreOpen && <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5"><label className="space-y-2 text-xs font-medium">Maximum equipment level<Input aria-label="Maximum equipment level" className="h-11" inputMode="numeric" type="number" min="1" max="99" disabled={!settings.levelUpGear} value={settings.maxGearLevel} onChange={(event) => update({ maxGearLevel: event.target.value })} /></label><label className="space-y-2 text-xs font-medium">Target matching<select aria-label="Target matching" className={selectClass} value={settings.targetMatching} onChange={(event) => update({ targetMatching: event.target.value as FarmingPlannerSettings["targetMatching"] })}><option value="nearby">Closest available builds</option><option value="exact">Exact targets only</option></select></label></CardContent></Card>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {children}
    <details className="text-xs text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3">Support & consumable assumptions</summary><div className="space-y-2 pb-4 leading-6"><p>{settings.placeholderSupports ? "Only DPS candidates need to come from your profile. Royal and Scholar placeholders are intended to use the selected strategy’s support stats and skills." : "Select a saved six-character starting team. Simulation replaces its first character with the selected DPS and keeps the other five."}</p><p>Optimizer HP, MP, and DEF are not automatically imposed as DPS requirements. Herb dependence needs a simulation; low MP alone does not exclude a character.</p><p>Legal equipment weakness and weakness-removal skill variants remain search choices. Skill ownership is not recorded in the profile, so required skills must be checked.</p></div></details>
    <Dialog open={rosterOpen} onOpenChange={setRosterOpen}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Exclude characters & gear</DialogTitle><DialogDescription>Keep characters or gear out of this search.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2">{["characters", "equipment"].map((tab) => <Button key={tab} variant={rosterTab === tab ? "default" : "outline"} className="min-h-11" onClick={() => { setRosterTab(tab as typeof rosterTab); setFilter(""); }}>{tab === "characters" ? "Characters" : "Equipment"}</Button>)}</div><Input aria-label="Filter roster" placeholder={rosterTab === "characters" ? "Search characters…" : "Search equipment…"} value={filter} onChange={(event) => setFilter(event.target.value)} /><div className="max-h-80 space-y-2 overflow-y-auto pr-1">{rosterTab === "characters" ? profile.characters.length ? profile.characters.filter((row) => `${row.jobName} ${row.rank} ${row.id}`.toLowerCase().includes(filter.toLowerCase())).map((row) => <label key={row.id} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm">{row.jobName} · {row.rank}<span className="ml-2 text-xs text-muted-foreground">#{row.id}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">Exclude<input type="checkbox" className="h-4 w-4 accent-primary" checked={settings.excludedCharacters.includes(row.id)} onChange={() => toggleList("excludedCharacters", row.id)} /></span></label>) : <p className="py-8 text-center text-sm text-muted-foreground">No profile characters yet.</p> : Object.keys(profile.equipment).length ? Object.entries(profile.equipment).filter(([name]) => name.toLowerCase().includes(filter.toLowerCase())).map(([name, level]) => <label key={name} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3"><span className="text-sm">{name}<span className="ml-2 text-xs text-muted-foreground">Lv{level}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">Exclude<input type="checkbox" className="h-4 w-4 accent-primary" checked={settings.reservedEquipment.includes(name)} onChange={() => toggleList("reservedEquipment", name)} /></span></label>) : <p className="py-8 text-center text-sm text-muted-foreground">No profile equipment yet.</p>}</div><Button className="min-h-11" onClick={() => setRosterOpen(false)}><Check className="mr-2 h-4 w-4" />Done</Button></DialogContent></Dialog>
  </div>;
}
