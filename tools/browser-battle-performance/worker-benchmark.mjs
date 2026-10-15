import {spawn} from 'node:child_process';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const app=path.join(root,'artifacts/kingdom-adventures');
const base=process.argv[2]??'http://127.0.0.1:5184';
const scenario=JSON.parse(readFileSync(process.argv[3],'utf8'));
const out=process.argv[4];
const workerFile=readdirSync(path.join(app,'dist/public/assets')).find(n=>n.startsWith('browser-battle.worker-'));
const child=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9353',`--user-data-dir=${mkdtempSync(path.join(tmpdir(),'ka-worker-speed-'))}`,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let ws;let id=0;const pending=new Map();
try{
 let info;for(let n=0;n<40;n++){try{info=await(await fetch('http://127.0.0.1:9353/json/version')).json();break;}catch{await sleep(100);}}
 if(!info)throw Error('Chrome unavailable');
 ws=new WebSocket(info.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=event=>{const m=JSON.parse(event.data);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:base});
 const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 await sleep(1000);
 const expression=`(async()=>{
 const worker=new Worker(${JSON.stringify(base+'/assets/'+workerFile)},{type:'module'});
 let id=0;const pending=new Map();worker.onmessage=({data})=>{const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.replay);};
 worker.onerror=(event)=>{for(const p of pending.values())p.reject(Error(event.message));};
 const request=(action,fields={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});worker.postMessage({id:n,action,...fields});});
 const samples=[];
 try {for(let i=0;i<4;i++){const begin=performance.now();const payload=i===0?await request('start',{ticks:80,scenarioJson:${JSON.stringify(JSON.stringify(scenario))}}):await request('advance',{ticks:100});const replay=JSON.parse(payload);samples.push({action:i===0?'cold-start':'advance',milliseconds:performance.now()-begin,tick:replay.finalState.windowStopTick,events:replay.events.length,bytes:payload.length});}return samples;}
 finally{worker.terminate();}
 })()`;
 const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
 if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));
 if(process.argv[5]==='--playback') {
   const bootstrap=JSON.parse(readFileSync(process.argv[6],'utf8'));
   const evaluate=async expression=>{const reply=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(reply.exceptionDetails)throw Error(JSON.stringify(reply.exceptionDetails));return reply.result.value;};
   await send('Page.enable',{},sessionId);
   await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__battleWindows=[]; const NativeWorker=window.Worker; window.Worker=class extends NativeWorker { constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(!data.replay)return;try{const r=JSON.parse(data.replay);window.__battleWindows.push(r.finalState);}catch{}});}};`},sessionId);
   await evaluate(`sessionStorage.setItem('ka-generated-battle-1',${JSON.stringify(JSON.stringify({storeVersion:1,replay:bootstrap,scenarioJson:JSON.stringify(scenario),warnings:[]}))})`);
   await send('Page.navigate',{url:base+'/battle-replay?mode=generated'},sessionId);
   let ready=false;for(let n=0;n<150;n++){await sleep(200);if(await evaluate(`Number(document.querySelector('[data-generated-replay="loaded"]')?.dataset.generatedMaxTick)>=160`)){ready=true;break;}}
   if(!ready)throw Error('Live session did not initialize');
   const playback=await evaluate(`(async()=>{document.querySelector('[data-action="speed-4"]').click();await new Promise(r=>setTimeout(r,100));if(document.querySelector('[data-action="toggle-play"]').dataset.playing!=='true')document.querySelector('[data-action="toggle-play"]').click();const begin=performance.now();const samples=[];for(let n=0;n<80;n++){await new Promise(r=>setTimeout(r,100));const d=document.querySelector('[data-generated-replay="loaded"]').dataset;const last=window.__battleWindows.at(-1);const finalWindow=last && (!last.windowed || (typeof last.verdictTick==='number' && last.windowStopTick>=last.verdictTick+120));samples.push({ms:performance.now()-begin,tick:Number(d.generatedTick),edge:Number(d.generatedMaxTick),playing:d.generatedPlaying,finalWindow:Boolean(finalWindow)});}return samples;})()`);
   const stalls=playback.filter(s=>s.tick>=s.edge && !s.finalWindow && s.tick<scenario.tickLimit-1 && s.playing==='0');
   const windows=await evaluate(`window.__battleWindows.map(s=>({edge:s.windowStopTick,verdictTick:s.verdictTick,cut:s.endingCutTick,windowed:s.windowed}))`);
   const result={base,playback,windows,speed:4,bufferEdgeStops:stalls.length};writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({speed:4,first:playback[0],last:playback.at(-1),windows,bufferEdgeStops:stalls.length}));
   if(stalls.length)throw Error('4x playback exhausted its simulation buffer');
   process.exitCode=0;
 } else {
 const samples=response.result.value;const advances=samples.slice(1);const milliseconds=advances.reduce((a,b)=>a+b.milliseconds,0);
 const result={browser:info.Browser,base,samples,advanceTicksPerSecond:300000/milliseconds,playbackMultiple:300000/milliseconds/20};
 writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }
}finally{ws?.close();child.kill();}
