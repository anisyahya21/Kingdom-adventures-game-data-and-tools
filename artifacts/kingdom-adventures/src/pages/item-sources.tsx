import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Search, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ka/page-header";
import { getItemIcon, getEquipmentIcon, getFurnitureIcon } from "@/lib/equipment-icons";
import { getRankIcon } from "@/lib/rank-icons";
import { getSkillIcon } from "@/lib/skill-icons";
import { getMonsterSprite } from "@/lib/monster-sprites";
import { getItemSource, searchItemSources, getTreasureSources, getDailyRankSource, DAILY_RANK_SOURCE_IMAGE, treasureSourceLabel, searchTreasureBoxes, type ItemSource, type SourceTarget, type TreasureSource } from "@/lib/item-sources";
import { TREASURE_BOXES, TREASURE_BY_ID, chanceLabel, gatheringCheckRates, gatheringPool, levelLabel, treasureDisplayName, type TreasureBox } from "@/lib/treasure-lookup";

function TargetIcon({ target, large=false }: { target: Pick<SourceTarget,"type"|"name">; large?:boolean }) {
  const src = target.type === "skill" ? getSkillIcon(target.name) : target.type === "item" ? getItemIcon(target.name) : target.type === "equipment" ? getEquipmentIcon(undefined,target.name) : target.type === "furniture" ? getFurnitureIcon(target.name) : undefined;
  return src ? <img src={src} alt={treasureDisplayName(target.name)} className={`${large ? "h-28 w-28" : "h-16 w-16"} shrink-0 object-contain [image-rendering:pixelated]`} /> : <PackageSearch className="h-8 w-8 text-muted-foreground" />;
}
function BoxIcon({box}: {box:TreasureBox}) {
  return box.icon ? <img src={box.icon} alt={treasureDisplayName(box.name)} className="h-24 w-24 shrink-0 object-contain [image-rendering:pixelated]" /> : <PackageSearch className="h-10 w-10 text-muted-foreground" />;
}
function SourceCard({source,level}: {source:ItemSource | TreasureSource;level:number|null}) {
  const box=source.treasureId === undefined ? undefined : TREASURE_BY_ID.get(source.treasureId);
  const monsterSprite=getMonsterSprite(source.monsterName);
  const pool=box && level !== null && source.kind === "Terrain" ? gatheringPool(box.group,level) : [];
  const checks=box && source.kind === "Terrain" ? gatheringCheckRates(box.group,source.terrainType) : undefined;
  const traced=["Gacha","Arena","Dungeon","Terrain","Monster","Kairo Room","Wairo Dungeon","Daily Rank Reward","Area reward","Skill crafting"].includes(source.kind);
  return <article className="space-y-2 rounded-lg border bg-background p-3">
    <div className="flex items-center gap-3">
      {source.sourceImage && <img src={source.sourceImage} alt={source.location} className="h-28 w-28 shrink-0 object-contain [image-rendering:pixelated]" />}{monsterSprite && <img src={monsterSprite.src} alt={`${source.monsterName} game sprite`} className="h-28 w-28 shrink-0 object-contain [image-rendering:pixelated]" />}
      <div className="min-w-0 flex-1"><h4 className="font-semibold">{treasureDisplayName(source.title)}</h4><p className="text-sm text-muted-foreground">{source.location}{source.minLevel !== undefined && source.maxLevel !== undefined ? ` · Area level ${levelLabel(source.minLevel,source.maxLevel)}` : ""}</p></div>
    </div>
    <div className="flex flex-wrap gap-2"><Badge variant="outline">{source.kind}</Badge>{source.kind==="Area reward" && <Badge variant="secondary">One-time chest · 1 per area</Badge>}{source.day && source.difficulty && <Badge variant="secondary">{source.day} · {source.difficulty}</Badge>}{source.boxRate !== undefined && <Badge variant="secondary">Box selection: {chanceLabel(source.boxRate)}</Badge>}</div>
    {checks && <p className="text-sm">Treasure check per gathering completion: <strong>{levelLabel(checks.min,checks.max)}%</strong>. {level === null ? "Enter an area level to see this box's share of the selection pool." : <><strong>1 in {pool.length}</strong> selection entries at area level {level}, after a successful treasure check.</>}</p>}
    {source.kind==="Area reward" && <p className="text-sm">Defeat the area boss → clear the fog → send a unit to claim the chest.</p>}
    <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">{traced ? "How this source works" : "Table link · conditions still being researched"}</summary><p className="mt-2 leading-relaxed">{source.boxDetails ?? source.details}</p></details>
    {source.href && <Link href={source.href} className="inline-block text-sm underline underline-offset-4">Open {source.kind} schedule</Link>}
  </article>;
}
function BoxCard({box,onReward,target,level=null,kind="All"}: {box:TreasureBox;onReward:(name:string)=>void;target?:SourceTarget;level?:number|null;kind?:string}) {
  const origins=getTreasureSources(box.id);
  const sources=origins.filter(s=>(kind==="All" || s.kind===kind) && (level===null || s.minLevel===undefined || s.maxLevel===undefined || s.minLevel<=level && s.maxLevel>=level));
  const rewards=box.rewards.filter(r=>r.rate>0 && (!target || r.name===target.name && r.type===target.type));
  return <Card className="overflow-hidden"><CardHeader className="flex-row items-center gap-3 space-y-0"><BoxIcon box={box}/><div><CardTitle className="text-base">{treasureDisplayName(treasureSourceLabel(box.id,box.name))}</CardTitle><p className="text-xs text-muted-foreground">{treasureDisplayName(box.name)} · #{box.id} · {sources.length} linked {sources.length===1 ? "source" : "sources"}</p>{sources.length>0 && <p className="mt-1 text-sm font-medium">{[...new Set(sources.map(source=>source.location || source.title))].join(" � ")}</p>}</div></CardHeader>
    <CardContent className="space-y-4">
      <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{target ? "1 · Your item inside this box" : "Contents of this box"}</h3>{rewards.map((r,i)=><button key={`${r.type}-${r.id}-${i}`} onClick={()=>onReward(r.name)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2 text-left text-sm hover:bg-muted"><span className="flex items-center gap-2"><TargetIcon target={{name:r.name,type:r.type as SourceTarget["type"]}}/><span>{treasureDisplayName(r.name)}<span className="block text-xs text-muted-foreground">Receive {levelLabel(r.min,r.max)} when rolled</span></span></span><span className="shrink-0 text-right font-medium">{chanceLabel(r.rate)}<span className="block text-xs font-normal text-muted-foreground">in this box</span></span></button>)}</section>
      <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-semibold">{target ? "2 · Where to get this box" : "Where to get this box"}</h3>
        {sources.length ? <><div className="flex flex-wrap gap-1">{[...new Set(sources.map(s=>s.day ? `${s.kind} · ${s.day} · ${s.difficulty}` : s.kind))].map(label=><Badge key={label} variant="outline">{label}</Badge>)}</div><details open><summary className="cursor-pointer text-sm underline underline-offset-4">View {sources.length} {sources.length===1 ? "source" : "sources"} and box chances</summary><div className="mt-3 space-y-2">{sources.map(source=><SourceCard key={source.key} source={source} level={level}/>)}</div></details></> : <p className="text-sm text-muted-foreground">{origins.length ? "No source matches these filters." : "Contents are known; an acquisition source has not yet been identified."}</p>}
      </section>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Box variant & evidence</summary><p className="mt-2">Group {box.group} · Gathering level bounds {levelLabel(box.minLevel,box.maxLevel)} · HP {box.hp} · Rank {box.rank} · Week {box.week} · Flags {box.flag}</p><p className="mt-1">Identically named boxes can have different contents. Level bounds apply to terrain selection; direct monster references and the special-boss reward-group selector do not use them.</p></details>
    </CardContent></Card>;
}
function DailyRankGroup({boxes,target,onReward}: {boxes:TreasureBox[];target?:SourceTarget;onReward:(name:string)=>void}) {
  const entries=boxes.map(box=>({box,source:getDailyRankSource(box.id)!})).filter(e=>e.source);
  if (!entries.length) return null;
  const days=[...new Set(entries.map(e=>e.source.day!))];
  return <Card><CardHeader className="flex-row items-center gap-4 space-y-0"><img src={DAILY_RANK_SOURCE_IMAGE} alt="Ranking Board" className="h-24 w-24 shrink-0 object-contain [image-rendering:pixelated]"/><div><CardTitle>Daily Rank Bonus</CardTitle><p className="mt-1 text-sm text-muted-foreground">{target ? `Days and ranks that reward ${target.name}.` : "Rewards grouped by day and rank."}</p></div></CardHeader><CardContent className="space-y-4">
    {days.map(day=><section key={day} className="rounded-lg border p-3"><h3 className="mb-3 font-semibold">{day}</h3><div className={target ? "flex flex-wrap gap-2" : "space-y-2"}>{entries.filter(e=>e.source.day===day).sort((a,b)=>b.box.rank-a.box.rank).map(({box,source})=><div key={box.id} className={target ? "flex items-center gap-1 rounded-md bg-muted/40 p-1" : "flex flex-wrap items-start gap-3 border-t py-2 first:border-0"}><Badge variant="outline" className="gap-2">{getRankIcon(source.rankLabel) && <img src={getRankIcon(source.rankLabel)} alt="" className="h-5 w-auto [image-rendering:pixelated]"/>}Rank {source.rankLabel}</Badge><div className="flex flex-1 flex-wrap gap-2">{box.rewards.filter(r=>r.rate>0 && (!target || r.name===target.name && r.type===target.type)).map((reward,i)=><button key={i} onClick={()=>onReward(reward.name)} className="flex items-center gap-2 rounded-md bg-muted/40 p-2 text-left text-sm">{!target && <TargetIcon target={{name:reward.name,type:reward.type as SourceTarget["type"]}}/>}<span>{target ? `×${levelLabel(reward.min,reward.max)}` : `${treasureDisplayName(reward.name)} ×${levelLabel(reward.min,reward.max)}`}{reward.rate<100 && <span className="block text-xs text-muted-foreground">{chanceLabel(reward.rate)} reward roll</span>}</span></button>)}</div></div>)}</div></section>)}
    <Link href="/daily-rank-rewards" className="inline-block text-sm underline underline-offset-4">View all daily rank rewards</Link>
  </CardContent></Card>;
}
export default function ItemSourcesPage() {
  const [mode,setMode]=useState<"item"|"box">("item");
  const [query,setQuery]=useState(""); const [selected,setSelected]=useState<string|null>(null);
  const [areaLevel,setAreaLevel]=useState("");const [kind,setKind]=useState("All");
  const [boxQuery,setBoxQuery]=useState("");const [visible,setVisible]=useState(24);
  const level=areaLevel.trim() && Number.isInteger(Number(areaLevel)) && Number(areaLevel)>0 ? Number(areaLevel) : null;
  const matches=useMemo(()=>searchItemSources(query),[query]);
  const target=selected ? getItemSource(selected) : undefined;
  const routes=target?.sources.filter(s=>s.kind!=="Treasure table") ?? [];
  const kinds=[...new Set(routes.map(s=>s.kind))];
  const filtered=routes.filter(s=>(kind==="All" || kind===s.kind) && (level===null || s.minLevel===undefined || s.maxLevel===undefined || s.minLevel<=level && s.maxLevel>=level));
  const containingBoxes=target ? TREASURE_BOXES.filter(b=>b.rewards.some(r=>r.name===target.name && r.type===target.type && r.rate>0)).filter(b=>getTreasureSources(b.id).some(s=>(kind==="All" || s.kind===kind) && (level===null || s.minLevel===undefined || s.maxLevel===undefined || s.minLevel<=level && s.maxLevel>=level))) : [];
  const directSources=filtered.filter(s=>s.treasureId===undefined);
  const boxes=useMemo(()=>searchTreasureBoxes(boxQuery),[boxQuery]);
  const ordinaryBoxes=boxes.filter(box=>!getDailyRankSource(box.id));
  const select=(name:string)=>{setQuery(name);setSelected(name);setKind("All");setMode("item");};
  return <main className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
    <PageHeader icon={<Search className="h-5 w-5"/>} title="Item & Skill Sources"><p>Search for an item to see where to get it: gacha, monsters, digging, reward boxes and other known sources.</p></PageHeader>

    <div className="flex flex-wrap gap-2"><Button variant={mode==="item"?"default":"outline"} onClick={()=>setMode("item")}>Find an item or skill</Button><Button variant={mode==="box"?"default":"outline"} onClick={()=>setMode("box")}>Treasure data lookup</Button><Link href="/monster-loot" className="self-center px-2 text-sm underline underline-offset-4">Compare monster loot</Link></div>
    {mode==="item" ? <>
      <Card><CardContent className="space-y-4 pt-6"><label htmlFor="item-source-search" className="text-sm font-medium">Item or skill name</label><Input id="item-source-search" value={query} onChange={e=>{setQuery(e.target.value);setSelected(null);setKind("All");}} placeholder="Try Pretty Cloth, Sturdy Board, or Myriad Arrows" autoComplete="off"/>{!target && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(query ? matches : matches.slice(0,9)).map(match=><button key={`${match.type}-${match.name}`} onClick={()=>select(match.name)} className="flex items-center gap-3 rounded-md border p-3 text-left hover:bg-muted"><TargetIcon target={match}/><span><span className="block font-medium">{treasureDisplayName(match.name)}</span><span className="text-xs text-muted-foreground">{match.type}</span></span></button>)}{query && !matches.length && <p>No matching entry in the indexed sources.</p>}</div>}</CardContent></Card>
      {target && <><div className="flex items-center gap-3"><TargetIcon target={target} large/><div><h2 className="text-xl font-semibold">{treasureDisplayName(target.name)}</h2><p className="text-sm text-muted-foreground">{target.type} · {containingBoxes.length + directSources.length} known source entries match your filters.</p></div></div>
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><div><label htmlFor="source-kind" className="text-sm font-medium">Acquisition method</label><select id="source-kind" value={kind} onChange={e=>setKind(e.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3"><option>All</option>{kinds.map(k=><option key={k}>{k}</option>)}</select></div><div><label htmlFor="source-area-level" className="text-sm font-medium">Area level (optional)</label><Input id="source-area-level" type="number" min="1" step="1" value={areaLevel} onChange={e=>setAreaLevel(e.target.value)} placeholder="Show all levels" className="mt-2"/><p className="mt-1 text-xs text-muted-foreground">Filters terrain and monster ranges. Other reward links remain visible.</p></div></div>
        <DailyRankGroup boxes={containingBoxes.filter(box=>!!getDailyRankSource(box.id))} target={target} onReward={select}/>
        <div className="grid items-start gap-4 md:grid-cols-2">{containingBoxes.filter(box=>getTreasureSources(box.id).length>0 && !getDailyRankSource(box.id)).map(box=><BoxCard key={box.id} box={box} target={target} onReward={select} level={level} kind={kind}/>)}</div>
        {containingBoxes.some(box=>getTreasureSources(box.id).length===0) && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Other recorded boxes · source not yet identified</summary><p className="my-3 text-sm text-muted-foreground">These contents exist in the game table, but we have not established where you can obtain these box variants.</p><div className="grid items-start gap-4 md:grid-cols-2">{containingBoxes.filter(box=>getTreasureSources(box.id).length===0).map(box=><BoxCard key={box.id} box={box} target={target} onReward={select}/>)}</div></details>}
        {directSources.length>0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Other ways to get {target.name}</h2><div className="grid gap-3 md:grid-cols-2">{directSources.map(s=><SourceCard key={s.key} source={s} level={level}/>)}</div></section>}
        {!containingBoxes.length && !directSources.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">No linked source matches these filters. This does not prove the item is unobtainable.</p>}
      </>}
    </> : <><div className="space-y-2"><label htmlFor="box-search" className="text-sm font-medium">Box name, item, source, day or difficulty</label><Input id="box-search" value={boxQuery} onChange={e=>{setBoxQuery(e.target.value);setVisible(24);}} placeholder="Try Kairo box, Tuesday Extreme, or Pretty Cloth"/><p className="text-sm text-muted-foreground">{boxes.length} matching rows. Percentages below are per reward slot, conditional on receiving these contents. They are not chances per dig or per monster defeat.</p></div><DailyRankGroup boxes={boxes.filter(box=>!!getDailyRankSource(box.id))} onReward={select}/><div className="grid items-start gap-4 md:grid-cols-2">{ordinaryBoxes.slice(0,visible).map(box=><BoxCard key={box.id} box={box} onReward={select}/>)}</div>{visible<ordinaryBoxes.length && <Button variant="outline" onClick={()=>setVisible(n=>n+24)}>Show 24 more</Button>}</>}
    <details className="rounded-lg border p-4 text-sm text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">What is verified, and what still needs research?</summary><div className="mt-3 space-y-2"><p>All 1,295 treasure rows were compared against the original APK: every numeric field matched. Box images were reconstructed from the original assets.</p><p>Native code supports terrain group and area-level selection, ordinary monster drop references, separate analysis rolls, and inclusive quantity ranges. Terrain checks use a rate out of 1,000; monster and contents rolls use a rate out of 100.</p><p>Exact terrain state and nature overrides matter. Special-boss leader rewards select one box from the encounter reward group. Other battle rewards, dungeon internal treasure tables, survey limits, skill modifiers and other reward callers are not fully traced. Other acquisition links are table relationships, not a claim of complete gameplay coverage. Equipment, facility and item gacha eligibility is included from the recovered normal and event configurations; live event availability and individual draw odds are not shown.</p><p>These are static code and asset findings. They have not been validated by running an instrumented original game.</p></div></details>
  </main>;
}
