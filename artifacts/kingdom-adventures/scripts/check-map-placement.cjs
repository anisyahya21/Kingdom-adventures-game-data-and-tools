const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const assert=require('node:assert/strict');
const path=require('node:path');
const filename=path.resolve(__dirname,'../src/lib/map-placement.ts');
const box={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,box);
const {placementAtViewportCenter:pick}=box.exports;
let checks=0;
for(const zoom of [.65,.8,1,1.3,2,3.5])for(const [width,height] of [[1,1],[2,2],[4,4],[1,2],[6,8],[8,10]])for(const viewport of [{width:390,height:360},{width:1250,height:600}])for(const [x,y] of [[0,0],[50,76],[158,158],[-8,170]]) {
  const cx=x+(width-1)/2,cy=y+(height-1)/2;
  const camera={zoom,offsetX:viewport.width/2-24*zoom*(cx-cy),offsetY:viewport.height/2-12*zoom*(cx+cy)};
  const anchor=pick(camera,viewport,{width,height});
  assert.ok(anchor.x===x);assert.ok(anchor.y===y);checks+=2;
  // A one-cell map pan changes the target oppositely, without changing the
  // viewport anchor. Covers both axes and off-map previews without edge clamp.
  for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
    const moved=pick({...camera,offsetX:camera.offsetX+24*zoom*(dx-dy),offsetY:camera.offsetY+12*zoom*(dx+dy)},viewport,{width,height});
    assert.ok(moved.x===x-dx);assert.ok(moved.y===y-dy);checks+=2;
  }
}
console.log(JSON.stringify({checks,outcome:'PASS',covers:['viewport resize','zoom','rectangular footprints','pan direction','off-map rejection coordinates']}));
