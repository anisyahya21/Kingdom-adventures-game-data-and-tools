import { createServer } from 'vite';
import assert from 'node:assert/strict';
process.env.PORT='5173';process.env.BASE_PATH='/';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const lookup=await server.ssrLoadModule('/src/lib/treasure-lookup.ts');
  const sources=await server.ssrLoadModule('/src/lib/item-sources.ts');
  const loot=await server.ssrLoadModule('/src/lib/monster-loot.ts');
  assert.equal(lookup.TREASURE_BOXES.length,1295);
  assert(lookup.gatheringPool(100,100).some(b=>b.id===0));
  assert(!lookup.gatheringPool(100,101).some(b=>b.id===0));
  const cloth=sources.getItemSource('Pretty Cloth');
  assert(cloth.sources.some(s=>s.kind==='Terrain' && s.terrainType===3 && s.minLevel===50 && s.treasureId===57));
  assert(cloth.sources.some(s=>s.kind==='Monster' && s.monsterName==='Falcone' && s.rate===70));
  assert(!cloth.sources.some(s=>s.title==='Dungeon #' || s.title.startsWith('Crafting facility (')));
  assert(sources.getItemSource('Sturdy Board').sources.some(s=>s.quantity==='1-3'));
  assert.deepEqual(sources.searchTreasureBoxes('Tuesday Extreme').map(b=>b.id),[710,711]);
  assert(sources.searchTreasureBoxes('kairo box').some(b=>b.id===710));
  for (const id of [710,711]) {
    const origins=sources.getTreasureSources(id);
    assert.equal(origins.length,1); // Contents must not multiply the same source.
    assert.equal(origins[0].day,'Tuesday');assert.equal(origins[0].difficulty,'Extreme');
    assert.equal(origins[0].boxRate,50);assert.equal(origins[0].monsterName,'Kairobot Mage');
    assert(!('rate' in origins[0]));assert(!('quantity' in origins[0]));
  }
  assert.equal(lookup.chanceLabel(5),'5% · 1 in 20');
  assert.equal(sources.getTreasureSources(221).find(s=>s.monsterName==='Falcone').boxRate,5);
  for(const boss of lookup.TREASURE_SPECIAL_BOSSES) {
    const pool=lookup.TREASURE_BOXES.filter(b=>b.group===boss.rewardGroup);
    for(const box of pool) assert(sources.getTreasureSources(box.id).some(s=>s.title===boss.title && Math.abs(s.boxRate-100/pool.length)<1e-9));
  }
  for(const target of sources.ITEM_SOURCE_TARGETS) {
    assert.equal(new Set(target.sources.map(s=>s.key)).size,target.sources.length);
    for(const s of target.sources) if(s.treasureId!==undefined) assert(lookup.TREASURE_BY_ID.has(s.treasureId));
  }
  const item=loot.LOOT_ITEMS.find(i=>i.name==='Pretty Cloth');assert(item);
  const result=loot.getLootResult('Snow',45,item.id);
  assert(Math.abs(result.monsters.find(m=>m.name==='Falcone').itemChance-0.035)<1e-12);
  // A direct reference stays valid past the treasure row's gathering-selector bounds.
  assert(loot.getLootResult('Snow',1500,item.id).monsters.some(m=>m.name==='Falcone' && m.itemChance>0));
  console.log('PASS: shared source joins, quantity ranges, selection boundaries, monster direct lookup, 3.5% Falcone base reward.');
} finally {await server.close();}
