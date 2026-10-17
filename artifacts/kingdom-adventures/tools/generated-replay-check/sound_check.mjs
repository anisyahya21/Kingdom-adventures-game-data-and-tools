import assert from "node:assert/strict";
import { combatSoundRequests, CombatSoundPlayer, COMBAT_SOUND_DEFAULT_VOLUME, combatSoundGain, combatSoundOnscreen } from "@/lib/combat-sounds";
import rules from "@/game-data/combat-sound-rules.json";
let started = 0, stopped = 0, closed = 0, requests = 0;
let lastVolume = null;
globalThis.fetch = async () => ({ok:true,arrayBuffer:async () => new ArrayBuffer(4)});
globalThis.AudioContext = class {
  currentTime = 0;
  state = "running"; destination = {};
  async resume() {}
  async decodeAudioData() { return {}; }
  createBufferSource() {
    return {connect(){return this;},disconnect(){},start(){started++;},stop(){stopped++;}};
  }
  createGain() { return {gain:{set value(value){lastVolume=value;}},connect(){return this;},disconnect(){}}; }
  async close() { closed++; }
};
const events = [
  {kind:"sound_request",seq:1,tick:1,sound:27},
  {kind:"sound_request",seq:2,tick:6,sound:27},
  {kind:"sound_request",seq:3,tick:11,sound:27},
  {kind:"state_sound",seq:4,tick:11,sound:18,passed:false},
  {kind:"state_sound",seq:5,tick:12,sound:18,passed:true},
];
assert.deepEqual(combatSoundRequests(events,0,1),[27]); requests++;
assert.deepEqual(combatSoundRequests(events,1,11),[27,27]); requests++;
assert.deepEqual(combatSoundRequests(events,11,12),[18]); requests++;
assert.deepEqual(combatSoundRequests(events,12,12),[]); requests++;
assert.deepEqual(combatSoundRequests(events,12,1),[]); requests++;
assert.deepEqual(combatSoundRequests([{kind:"release",seq:8,tick:1,used:true,index:0,skillId:8}],0,1),[]); requests++;
const player = new CombatSoundPlayer();
await player.prepare();
player.play(combatSoundRequests(events,0,1));
assert.ok(Math.abs(lastVolume-127/255)<1e-7); assert.equal(lastVolume,COMBAT_SOUND_DEFAULT_VOLUME); requests++;
for (const platform of ["android","steam"]) for (let volume=0;volume<256;volume++) {
  assert.ok(Math.abs(combatSoundGain(volume,{platform})-rules.gains[platform][volume])<1e-7); requests++;
  assert.equal(combatSoundGain(volume,{platform,muted:true}),0); requests++;
  assert.equal(combatSoundGain(volume,{platform,master:false}),0); requests++;
}
player.setVolume(0); assert.equal(lastVolume,0); requests++;
player.setVolume(255); assert.equal(lastVolume,1); requests++;
player.setVolume(64); assert.equal(lastVolume,combatSoundGain(64)); requests++;
assert.equal(combatSoundGain(-1),0); assert.equal(combatSoundGain(300),1); requests+=2;
for (const [humanClip,record] of Object.entries(rules.humanBounds)) {
  for (const u of [false,true]) for (const v of [false,true]) {
    const [left,top,width,height]=record.rect;
    const x=(record.flip!==u) ? -2*Math.trunc(width/2)-left : left;
    const y=v ? -2*Math.trunc(height/2)-top : top;
    const input={humanClip:Number(humanClip),mirror:{u,v},width:240,height:192};
    assert.equal(combatSoundOnscreen({...input,x:-x-width,y:-y}),true); requests++;
    assert.equal(combatSoundOnscreen({...input,x:-x-width-1,y:-y}),false); requests++;
    assert.equal(combatSoundOnscreen({...input,x:240-x,y:192-y}),true); requests++;
    assert.equal(combatSoundOnscreen({...input,x:241-x,y:192-y}),false); requests++;
  }
}
assert.equal(combatSoundOnscreen({humanClip:9999,x:0,y:0,width:240,height:192}),false); requests++;
player.context.currentTime = 0.25;
player.play(combatSoundRequests(events,1,6));
player.context.currentTime = 0.5;
player.play(combatSoundRequests(events,6,11));
assert.equal(started,1); requests++;
player.play([27]); assert.equal(started,1); requests++;
player.context.currentTime = 0.65;
player.play([27]); assert.equal(started,1); requests++;
assert.deepEqual(combatSoundRequests([{kind:"sound_request",seq:1,tick:1,sound:27},{kind:"sound_request",seq:2,tick:1,sound:28},{kind:"sound_request",seq:3,tick:1,sound:27}],0,1),[28,27]); requests++;
player.active.get(27).onended();
player.context.currentTime = 0.8;
player.play([27]); assert.equal(started,2); requests++;
player.stop(); assert.equal(stopped,1); requests++;
player.play([18]); assert.equal(started,3); requests++;
player.close(); assert.equal(stopped,2); assert.equal(closed,1); requests += 2;
const capped=new CombatSoundPlayer(); await capped.prepare();
capped.play([24,25,26,27,28]); assert.equal(started,7); requests++;
capped.close();
const guard = [{kind:"sound_request",seq:1,tick:1,sound:30,passed:true,requiresScreen:true,targetUnitId:"enemy:0"}];
assert.deepEqual(combatSoundRequests(guard,0,1),[]); requests++;
assert.deepEqual(combatSoundRequests(guard,0,1,()=>false),[]); requests++;
assert.deepEqual(combatSoundRequests(guard,0,1,()=>true),[30]); requests++;
console.log(JSON.stringify({passed:requests,failed:0}));
