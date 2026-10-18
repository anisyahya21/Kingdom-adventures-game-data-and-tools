import assert from 'node:assert/strict';
import { fitChaosSetup } from '../src/lib/chaos-planner-view.ts';

let checks = 0;
for (const width of [320, 390, 768, 1200]) {
  for (const height of [360, 464, 600]) {
    for (const size of [1, 4, 12, 20]) {
      const cells = Array.from({length:size}, (_,x) => Array.from({length:8}, (_,y) => ({x:x+30,y:y+40}))).flat();
      const fit = fitChaosSetup(cells, {width,height});
      assert(fit);
      for (const cell of cells) {
        const px = width/2 + ((cell.x-cell.y)-(fit.x-fit.y))*24*fit.zoom;
        const py = height/2 + ((cell.x+cell.y)-(fit.x+fit.y))*12*fit.zoom;
        assert(px-32*fit.zoom >= 15 && px+32*fit.zoom <= width-15);
        assert(py-112*fit.zoom >= 15 && py+32*fit.zoom <= height-15);
        checks += 2;
      }
      assert.deepEqual(fit, fitChaosSetup(cells, {width,height}));
    }
  }
}
assert.equal(fitChaosSetup([], {width:390,height:464}), null);
assert.equal(fitChaosSetup([{x:1,y:1}], {width:0,height:464}), null);
console.log(JSON.stringify({status:'pass',checks,viewports:12,layoutsPerViewport:4}));
