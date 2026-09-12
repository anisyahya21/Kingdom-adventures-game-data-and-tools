const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ts=require('typescript');
const root=path.resolve(__dirname,'../src');
const cache=new Map();
function load(filename){
  const full=path.resolve(filename);if(cache.has(full))return cache.get(full);
  if(full.endsWith('.json')){const v={default:JSON.parse(fs.readFileSync(full,'utf8'))};cache.set(full,v);return v;}
  const box={exports:{},crypto,console,Set,Map,Array,Number,Math,JSON};cache.set(full,box.exports);
  box.require=id=>{let p=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(full),id);return load(path.extname(p)?p:p+'.ts');};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,box,{filename:full});return box.exports;
}
const b=load(path.join(root,'lib/world-builder.ts'));
const render=load(path.join(root,'lib/world-builder-render.ts'));
const {BUILDINGS,PLOT_SIZES}=load(path.join(root,'game-data/buildings.ts'));
let checks=0;function check(condition,message){assert.ok(condition,message);checks++;}
const land=new Set(Array.from({length:25600},(_,i)=>`${i%160},${Math.floor(i/160)}`));
const item=(fid,x,y)=>({...b.makeItem('facility',fid),x,y});
const hall=item(17,50,50);const state={version:1,items:[hall],reclaimed:[]};
const index=b.placementIndex(state,land);
check(!!b.validatePlacement(item(29,50,50),state,index).error,'outdoor collision includes town hall');
check(!!b.validatePlacement({...b.makeItem('plot',undefined,'S'),x:49,y:49},state,index).error,'plots cannot overlap a hall');
check(b.townRadius(9)===15&&b.townRadius(10)===17&&b.townRadius(20)===19,'rank thresholds');
// Each individual footprint cell is necessary, including the last corner.
for(const size of PLOT_SIZES){
  const p={...b.makeItem('plot',undefined,size),x:40,y:40};
  check(!b.validatePlacement(p,state,index).error,'valid full plot');
  for(const c of b.cells(p)){
    const covered=new Set(index.covered);covered.delete(b.key(c));
    check(!!b.validatePlacement(p,state,{...index,covered}).error,`${size}: missing coverage at ${b.key(c)}`);
    const partialLand=new Set(index.land);partialLand.delete(b.key(c));
    check(!!b.validatePlacement(p,state,{...index,land:partialLand}).error,`${size}: water at ${b.key(c)}`);
  }
}
const torch=item(29,67,52),nextTorch=item(29,74,52);
check(!b.validatePlacement(torch,state,index).error,'torch wholly inside town');
const expanded={...state,items:[hall,torch,nextTorch]};
check(b.territory(expanded.items).has('81,52'),'connected expansion chain');
check(!b.territory([torch,nextTorch]).has('74,52'),'disconnected expansions cannot self-support');
check(!b.territory([hall,nextTorch]).has('81,52'),'removing bridge expansion revokes extension');
check(!b.territory([hall,item(68,67,52)]).has('74,52'),'Info Board range is not territory expansion');
check(index.covered.has('36,36')&&index.covered.has('67,67')&&!index.covered.has('68,67'),'hall range expands the native 2x2 core');
const second=item(17,90,90);const anyTown={...state,items:[hall,second]};
check(!b.validatePlacement(item(29,100,100),anyTown,b.placementIndex(anyTown,land)).error,'second town allowed without choosing owner');
const five={...state,items:Array.from({length:5},(_,i)=>item(17,10+i*20,10))};
check(!!b.validatePlacement(item(17,100,100),five,b.placementIndex(five,land)).error,'five-town limit');
const native=b.initialWorld();
check(b.decodeWorld(JSON.stringify(native)).items.length===native.items.length,'initial save roundtrip');
for(const fixed of native.items.filter(i=>i.fixed))check(!!b.removeItem(native,fixed.id).error,'fixed landmark protected');
const movable=native.items.find(i=>!i.fixed);check(!!b.removeItem(native,movable.id).error,'original landmarks cannot be removed');
check(b.rotateItem(movable).direction===movable.direction,'original landmarks cannot rotate');
check(b.decodeWorld(JSON.stringify({...native,items:native.items.filter(i=>i.id!==movable.id)})).items.some(i=>i.id===movable.id),'deleted original landmark restored on load');

for(const house of BUILDINGS)for(const size of PLOT_SIZES){
  let plot={...b.makeItem('plot',undefined,size),x:40,y:40,houseId:house.id};
  let children=b.initialFurniture(plot);
  for(let rotation=0;rotation<4;rotation++){
    const occupied=new Set();const [w,h]=b.dimensions(plot);
    for(const f of children)for(const c of b.cells(f)){
      check(c.x>plot.x&&c.y>plot.y&&c.x<plot.x+w-1&&c.y<plot.y+h-1,`${house.name} ${size} rotated fixture inside`);
      check(!occupied.has(b.key(c)),`${house.name} ${size} fixtures do not overlap`);occupied.add(b.key(c));
    }
    const withPlot={...state,items:[hall,plot,...children]};
    for(const child of children){
      check(!!b.removeItem(withPlot,child.id).error===!!child.fixed,'only shelves removable among initial fixtures');
      const overlap={...item(129,child.x,child.y)};
      check(!!b.validatePlacement(overlap,withPlot,b.placementIndex(withPlot,land)).error,'carpet cannot overlap fixture');
    }
    const draws=render.builderDraws(withPlot);check(draws.every(d=>b.BUILDER_ASSETS.sprites[d.sprite]),'all draw parts resolved');
    children=b.rotateContents(plot,children);plot=b.rotateItem(plot);
  }
}
const plot={...b.makeItem('plot',undefined,'XL'),x:40,y:40,houseId:6};
const furniture=b.initialFurniture(plot);const shelf=furniture.find(f=>f.role==='shelves');
const full={...state,items:[hall,plot,...furniture,...Array.from({length:8},()=>({...shelf,id:crypto.randomUUID(),fixed:false}))]};
check(!!b.indoorLimit({...shelf,id:'extra'},plot,full.items),'shelf limit counts initial shelf');
check(!!b.indoorLimit(item(103,42,42),plot,full.items),'wrong shop shelf rejected');
const sPlot={...plot,size:'S'};check(!!b.indoorLimit(item(99,42,42),sPlot,[]),'zero-extra-bed shop restriction');
check(!!b.validatePlacement(item(129,80,80),state,index).error,'indoors cannot be placed outside a plot');
const wet={x:52,y:60},dryIndex={...index,land:new Set(index.land)};dryIndex.land.delete(b.key(wet));
check(!b.reclaimError(wet,state,dryIndex),'water in town reclaimable');
check(!!b.reclaimError({x:40,y:40},state,index,true),'default land protected');
const reclaimed={...state,reclaimed:[wet]};check(!b.reclaimError(wet,reclaimed,index,true),'empty reclaimed land reversible');
const occupied={...reclaimed,items:[hall,{...b.makeItem('road'),...wet}]};check(!!b.reclaimError(wet,occupied,b.placementIndex(occupied,land),true),'occupied reclaimed land protected');
check(b.decodeWorld(JSON.stringify({...state,items:[...native.items,hall,plot,...furniture],reclaimed:[wet]})).reclaimed.length===1,'furnished save reload');
for(const sprite of Object.values(b.BUILDER_ASSETS.sprites))check(fs.existsSync(path.resolve(root,'../public',sprite.url.slice(1))),'sprite file exists');
console.log(`${checks} builder assertions passed: every footprint cell, coverage/expansions, 100 plots × 4 rotations, fixtures, collisions, limits, reclamation, persistence and sprite paths.`);

for(const fid of [33,34,35,36,37,38,39,40,194,42,43,44]) {
 const storage=item(fid,40,40);
 check(b.cells(storage).length===4,`facility ${fid} reserves four cells`);
 for(const c of b.cells(storage)) {
  const covered=new Set(index.covered);covered.delete(b.key(c));
  check(!!b.validatePlacement(storage,state,{...index,covered}).error,'every assembly cell needs coverage');
  const occupied=new Map(index.occupied);occupied.set(b.key(c),hall);
  check(!!b.validatePlacement(storage,state,{...index,occupied}).error,'every assembly cell blocks overlap');
 }
}
const {BuilderSpriteCache}=load(path.join(root,'lib/builder-sprite-cache.ts'));
const requested=[];
const spriteCache=new BuilderSpriteCache(()=>{const image={};requested.push(image);return image;},()=>new Uint8ClampedArray(4));
let updates=0;
const unsubscribe=spriteCache.subscribe(()=>updates++);
spriteCache.load('hall','hall.png');spriteCache.load('hall','hall.png');
check(requested.length===1,'hover renders deduplicate in-flight loads');
unsubscribe();spriteCache.subscribe(()=>updates++);
requested[0].onload();
check(updates===1&&spriteCache.images.has('hall'),'in-flight completion notifies current render after old render unsubscribes');
spriteCache.load('storage','storage.png');requested[1].onerror();
check(spriteCache.errors.has('storage'),'failed sprite is surfaced');
spriteCache.retry();spriteCache.load('storage','storage.png');requested[2].onload();
check(spriteCache.images.has('storage')&&!spriteCache.errors.size,'failed sprite can be retried');
console.log(`${checks} total assertions including assembly footprints and asynchronous sprite loading.`);

check(b.townRadius(100)===35&&b.townRadius(1000)===35,'town radius capped at level 100');
const oldRank={...native,items:[...native.items,{...hall,level:250}]};
check(b.decodeWorld(JSON.stringify(oldRank)).items.find(i=>i.id===hall.id).level===100,'old saved town ranks capped');
for(const end of [{x:45,y:40},{x:40,y:45},{x:45,y:43},{x:35,y:37},{x:40,y:40}]) {
 const line=b.buildLine({x:40,y:40},end);
 check(b.key(line.at(-1))===b.key(end),'line reaches endpoint');
 check(new Set(line.map(b.key)).size===line.length,'line cells unique');
 check(line.every((c,i)=>!i||Math.abs(c.x-line[i-1].x)+Math.abs(c.y-line[i-1].y)===1),'line is edge connected');
}
const road=b.makeItem('road');
const stroke=b.placeLine(state,land,road,{x:40,y:40},{x:45,y:40});
check(stroke.added===6&&stroke.state.items.length===state.items.length+6,'stroke fills full line');
check(state.items.length===1,'stroke does not mutate history');
const duplicate=b.placeLine(stroke.state,land,road,{x:40,y:40},{x:45,y:40});
check(duplicate.added===0&&duplicate.skipped===6,'occupied stroke cannot overlap');
const crossing=b.placeLine(state,land,item(23,0,0),{x:49,y:50},{x:55,y:50});
check(crossing.added===3&&crossing.skipped===4,'wall line skips whole hall footprint');
const boundary=b.placeLine(state,land,road,{x:65,y:40},{x:70,y:40});
check(boundary.added===3&&boundary.skipped===3,'line cannot bypass coverage');
check(render.builderDraws({version:1,items:[{...road,facilityId:3}],reclaimed:[]})[0].sprite===b.BUILDER_ASSETS.facilities['3'].variants[0],'gravel uses original MapChip33 sprite');
console.log(`${checks} total assertions including town-level cap and drag lines.`);

const cameraMath=load(path.join(root,'lib/map-camera.ts'));
const camera={offsetX:-710,offsetY:-1430,zoom:0.65};
for(const anchor of [{x:640,y:220},{x:123,y:345}]) {
 let current=camera;
 const wx=(anchor.x-camera.offsetX)/camera.zoom,wy=(anchor.y-camera.offsetY)/camera.zoom;
 for(const factor of [1.3,1/1.3,...Array(20).fill(cameraMath.wheelZoomFactor(-100,0)),...Array(20).fill(cameraMath.wheelZoomFactor(100,0))]) {
  const next=cameraMath.zoomAt(current,current.zoom*factor,anchor.x,anchor.y);
  check(Math.abs((anchor.x-next.offsetX)/next.zoom-wx)<1e-8&&Math.abs((anchor.y-next.offsetY)/next.zoom-wy)<1e-8,'zoom preserves world point under anchor');
  check(factor>1?next.zoom>=current.zoom:next.zoom<=current.zoom,'zoom direction never oscillates');
  current=next;
 }
}
check(cameraMath.wheelZoomFactor(0,0)===1,'zero wheel delta does not zoom');
console.log(`${checks} total assertions including cursor and viewport zoom anchors.`);

for(const house of BUILDINGS)for(const size of PLOT_SIZES) {
 const p={...b.makeItem('plot',undefined,size),houseId:house.id,x:40,y:40};
 const w={version:1,items:[p],reclaimed:[]};
 const draft=item(106,42,42);
 const preview=render.builderDraws(w,draft).find(d=>d.itemId===draft.id);
 const placed=render.builderDraws({...w,items:[p,{...draft,parentId:p.id}]}).find(d=>d.itemId===draft.id);
 check(preview.x===placed.x&&preview.y===placed.y&&preview.elevation===placed.elevation&&preview.depth===placed.depth,'indoor preview and placement use identical native anchor and depth');
 check(placed.elevation===(house.id===16?8:10),'floor support comes from original MapChip');
 const children=b.initialFurniture(p),rotated=b.rotateContents(p,children);
 check(rotated.every(c=>c.direction===1),'plot rotation turns fixed and movable fixtures together');
 for(const f of b.template(p).fixed.filter(f=>['workbench','register','storage'].includes(f.role)&&f.facilityId!==155))check(!b.isManualFacility(f.facilityId),'built-in room/service fixture excluded');
}
for(const id of [98,99,100,101,103,104,105,106,119,138,147,148,149,152])check(b.isManualFacility(id),'optional furniture remains available');
for(const f of Object.values(b.BUILDER_ASSETS.facilities))check(!!f.menuIcon&&fs.existsSync(path.resolve(root,'../public',f.menuIcon.slice(1))),'trimmed menu preview exists');
console.log(`${checks} total assertions including native indoor anchors, plot rotations and menu eligibility.`);

// Native type-22 barriers use the four-neighbor mask as the SEB frame.
const wallOffsets=[[0,-1],[1,0],[0,1],[-1,0]];
for(const fid of [23,24,25,26,27])for(let mask=0;mask<16;mask++) {
 const center=item(fid,60,60),neighbors=wallOffsets.flatMap(([dx,dy],dir)=>mask&(1<<dir)?[item(23+dir,60+dx,60+dy)]:[]);
 const wallState={...state,items:[center,...neighbors,item(26,61,61),item(28,63,60)]};
 const d=render.builderDraws(wallState).find(d=>d.itemId===center.id);
 check(d.sprite===b.BUILDER_ASSETS.facilities[fid].barrierFrames[mask],'all native masks, mixed materials and diagonal exclusion');
 check(d.x===60&&d.y===60&&d.elevation===0&&d.depth===12005,'native barrier anchor and child depth');
}
const wallCenter=item(26,60,60),wallEast=item(24,61,60);
const wallState={...state,items:[wallCenter,wallEast]};
const wallSprite=(s,g)=>render.builderDraws(s,g).find(d=>d.itemId===wallCenter.id).sprite;
const wallFrames=b.BUILDER_ASSETS.facilities[26].barrierFrames;
check(wallSprite(wallState)===wallFrames[2],'east joins');
check(wallSprite({...wallState,items:[wallCenter]})===wallFrames[0],'removal disconnects');
check(wallSprite(wallState,{...wallEast,x:70})===wallFrames[0],'move preview disconnects old position');
check(wallSprite({...wallState,items:[wallCenter]},wallEast)===wallFrames[2],'placement preview connects existing wall');
check(render.builderDraws(wallState,{...wallEast,x:70}).filter(d=>d.itemId===wallEast.id).length===1,'moving wall is rendered only at preview location');
check(wallSprite({...wallState,items:[wallCenter,item(28,61,60)]})===wallFrames[0],'gate is not a native barrier');
for(const f of Object.values(b.BUILDER_ASSETS.facilities))for(const key of f.barrierFrames??[])check(fs.existsSync(path.resolve(root,'../public',b.BUILDER_ASSETS.sprites[key].url.slice(1))),'every adjacency frame is exported');
console.log(`${checks} total assertions including native barrier adjacency.`);

const spacingHall={...item(17,90,30),level:100};
for(const [fid,r,w] of [[29,7,1],[30,8,1],[31,10,1],[32,12,2]]) {
 const existing=item(fid,80,45),s={...state,items:[spacingHall,existing]},idx=b.placementIndex(s,land);
 for(const candidateId of [29,30,31,32]) {
  const candidate=item(candidateId,80,45);
  for(const [dx,dy] of [[-r,0],[w+r-1,0],[0,-r],[0,w+r-1],[-r,-r],[w+r-1,w+r-1]])
   check(b.validatePlacement({...candidate,x:80+dx,y:45+dy},s,idx).error?.startsWith('Too close'),'existing expansion rectangle excludes edges and diagonal corners across types');
  check(!b.validatePlacement({...candidate,x:80+w+r,y:45},s,idx).error,'first square outside existing range is allowed');
 }
 const overlap=item(32,80-r-1,45);
 check(b.validatePlacement(overlap,s,idx).error?.startsWith('Too close'),'2x2 turret cannot straddle exclusion boundary');
 check(!b.validatePlacement({...overlap,x:80-r-2},s,idx).error,'2x2 turret fits wholly beyond exclusion boundary');
 check(!b.validatePlacement(existing,s,b.placementIndex(s,land,existing.id)).error,'moving expansion does not exclude itself');
 check(!b.validatePlacement(item(26,80+w,45),s,idx).error,'ordinary walls may stand next to expansions');
 check(!b.validatePlacement(item(29,80+w,45),{...s,items:[spacingHall]},b.placementIndex({...s,items:[spacingHall]},land)).error,'removal releases spacing exclusion');
}
console.log(`${checks} total assertions including expansion spacing.`);

for(let direction=0;direction<4;direction++) {
 const gate={...item(28,60,60),direction},parts=render.builderDraws({...state,items:[gate,item(26,61,61)]});
 const gateParts=parts.filter(d=>d.itemId===gate.id),floor=gateParts.filter(d=>d.depth<0),doors=gateParts.filter(d=>d.depth>=0);
 check(floor.length===2&&doors.length===2,'gate floor and door pieces remain independently sortable');
 check(doors.every(d=>d.depth===100*(d.x+d.y)+([1,2].includes(direction)?26:5)),'gate uses native per-cell facing depth');
 check(floor.every(d=>parts.indexOf(d)<parts.findIndex(p=>p.itemId!==gate.id)),'gate ground never paints over walls');
 check(doors.every(d=>b.cells(gate).some(c=>c.x===d.x&&c.y===d.y)),'gate sections anchored within rotated footprint');
}
console.log(`${checks} total assertions including gate wall ordering.`);

check(b.surroundCoverage(item(29,60,60)).length===48,'single-cell surround range is 7x7 minus source');
check(b.surroundCoverage(item(32,60,60)).length===60,'2x2 surround range is 8x8 minus source');
check(b.surroundCoverage(item(17,60,60)).length===60,'hall aura uses native 2x2 core, not reserved ring');
check(b.surroundCoverage(item(33,60,60)).length===0,'facility without effects has no overlay');
check(b.surroundCoverage(item(29,0,0)).every(b.inBounds),'surround overlay clips to map bounds');
for(const size of PLOT_SIZES) {
 const inn={...b.makeItem('plot',undefined,size),houseId:7,x:60,y:60};
 const initial=b.initialFurniture(inn),guests=initial.filter(i=>i.facilityId===155);
 check(guests.length===2&&guests.every(i=>!i.fixed),'both Inn guest beds are removable');
 let s={...state,items:[hall,inn,...initial]};
 for(const guest of guests){const removed=b.removeItem(s,guest.id);check(!removed.error,'remove Inn guest bed');s=removed.state;}
 for(const id of [101,154,155]) {
  check(b.isManualFacility(id),'replacement bed is selectable');
  check(!b.validatePlacement({...item(id,guests[0].x,guests[0].y),parentId:inn.id},s,b.placementIndex(s,land)).error,'replacement can be placed in removed guest bed square');
  check(!b.indoorLimit({...item(id,62,62),parentId:inn.id},inn,s.items),'Inn accepts friend, double and guest replacement beds');
  const cap=BUILDINGS.find(h=>h.id===7).beds[PLOT_SIZES.indexOf(size)];
  const filled=[...s.items,...Array.from({length:cap},()=>({...item(id,62,62),parentId:inn.id}))];
  check(!!b.indoorLimit({...item(id,62,62),parentId:inn.id},inn,filled),'replacement beds cannot bypass Inn capacity');
 }
 check(!!b.removeItem(s,initial.find(i=>i.role==='bed').id).error,'resident bed remains protected');
 const oldSave={...b.initialWorld(),items:[...b.initialWorld().items,inn,...initial.map(i=>i.facilityId===155?{...i,fixed:true}:i)]};
 check(b.decodeWorld(JSON.stringify(oldSave)).items.filter(i=>i.parentId===inn.id&&i.facilityId===155).every(i=>!i.fixed),'existing saved Inn guest beds become removable');
}
console.log(`${checks} total assertions including surround coverage and Inn replacements.`);

for(const fid of [157,162]) {
 const room=item(fid,60,60),s={...b.initialWorld(),items:[...b.initialWorld().items,room]};
 const first=b.assignPet(s,room.id,b.BUILDER_PETS[0].id),second=b.assignPet(first,room.id,b.BUILDER_PETS[1].id);
 check(first.items.find(i=>i.id===room.id).petId===b.BUILDER_PETS[0].id,'assign one occupant');
 check(second.items.length===s.items.length&&second.items.find(i=>i.id===room.id).petId===b.BUILDER_PETS[1].id,'replacement uses same single slot');
 check(b.decodeWorld(JSON.stringify(second)).items.find(i=>i.id===room.id).petId===b.BUILDER_PETS[1].id,'pet save roundtrip');
 check(b.assignPet(second,room.id).items.find(i=>i.id===room.id).petId===undefined,'remove assignment');
 check(b.removeItem(second,room.id).state.items.every(i=>i.id!==room.id),'room removal leaves no orphan pet');
 const occupant=second.items.find(i=>i.id===room.id),moved={...occupant,x:70,y:71};
 const marker=render.builderDraws({...s,items:[moved]}).find(d=>d.sprite.startsWith('pet-'));
 check(marker&&marker.itemId===room.id&&marker.x>=70&&marker.y>=71,'pet marker follows moved host');
}
assert.throws(()=>b.assignPet(state,hall.id,b.BUILDER_PETS[0].id));checks++;
for(const dungeon of Object.values(b.BUILDER_ASSETS.dungeons)) {
 const d={...b.makeItem('dungeon'),dungeonChipId:dungeon.chipId,x:110,y:110};
 check(!b.validatePlacement(d,state,index).error,'dungeon allowed on clear land outside town');
 check(b.dimensions(d).join(',')==='2,2','native dungeon footprint');
 const blocked={...index,land:new Set(index.land)};blocked.land.delete('111,111');
 check(!!b.validatePlacement(d,state,blocked).error,'dungeon full footprint cannot overlap water');
 check(!!b.validatePlacement({...d,x:50,y:50},state,index).error,'dungeon cannot overlap existing structure');
 const s={...b.initialWorld(),items:[...b.initialWorld().items,d]};
 check(b.decodeWorld(JSON.stringify(s)).items.some(i=>i.dungeonChipId===d.dungeonChipId),'dungeon save roundtrip');
 check(!b.removeItem(s,d.id).error,'user placed dungeon is removable');
 check(render.builderDraws(s).some(draw=>draw.itemId===d.id&&b.BUILDER_ASSETS.sprites[draw.sprite]),'dungeon has rendered native sprite');
 check(fs.existsSync(path.resolve(root,'../public',dungeon.menuIcon.slice(1))),'dungeon menu art exists');
}
console.log(`${checks} total assertions including pet assignments and dungeons.`);
