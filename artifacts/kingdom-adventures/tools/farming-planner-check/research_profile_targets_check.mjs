import assert from 'node:assert/strict';
import {compatibleResearchTargets} from '../../src/lib/research-profile-targets.ts';
const input={inventory:[],characters:[{id:'c',name:'c',available:true,eligible:true,input:{baseStats:{atk:300,spd:500,lck:300,dex:13},goals:{},slots:[{slot:'Armor',items:['A']}]},contributions:{'A|1':{atk:-50,hp:100}}}]};
const point=(id,n,mean,stats)=>({id,encounter:3,stats,n,mean,highest:100,median:10,low:0,defeats:0,meanDpsMp:1,meanHealerMp:1,profileId:'fixed',cohortId:id,formationId:'fixed',finishPolicy:'on-verdict',rewardMeasurementMethod:'queued',provenanceHash:'a'.repeat(64)});
const found=compatibleResearchTargets(input,[point('small-high',20,90,[250,500,300,13]),point('large-low',200,10,[250,500,300,13]),point('impossible',200,50,[1000,1500,300,13]),point('tiny',1,100,[300,500,300,13]),point('dex-too-low',200,50,[250,500,300,2])]);
assert.equal(found.length,1);assert.equal(found[0].id,'research:large-low');assert.equal(found[0].atk,250,'negative gear contributions must be considered');
console.log('PASS: owned-gear bounds, negative contributions, DEX reachability, sample floor and cohort selection.');
