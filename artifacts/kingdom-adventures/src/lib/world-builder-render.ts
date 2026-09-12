import { BUILDER_ASSETS, dimensions, containingPlot, supportHeight, template, type BuilderItem, type BuilderState, type Cell } from './world-builder';
import { PLOT_TILES } from '@/game-data/buildings';

export type BuilderDraw = {sprite:string;x:number;y:number;elevation:number;depth:number;opacity:number;itemId:string};
export function builderDraws(state:BuilderState, ghost?:BuilderItem|null):BuilderDraw[] {
  const draws:BuilderDraw[]=[];
  const items=[...state.items.filter(item=>item.id!==ghost?.id),...(ghost?[ghost]:[])];
  const barriers=new Set(items.filter(item=>item.kind==='facility'&&BUILDER_ASSETS.facilities[String(item.facilityId)]?.barrierFrames).map(item=>`${item.x},${item.y}`));
  // Direction.OFFSETS 0x145f4c4; FencePlaceSystem passes 1<<direction directly
  // to barrier_00.seb. Gate/plot fences are different native types and do not join.
  const offsets=[[0,-1],[1,0],[0,1],[-1,0]];
  for(const item of items) {
    // Original map renderer owns the fixed port and cave assemblies.
    if(item.fixed&&!item.parentId) continue;
    const opacity=item===ghost?0.6:1;
    if(item.kind==='plot') {
      const [w,h]=PLOT_TILES[item.size!].split('×').map(Number);
      const shell=item.houseId===undefined?BUILDER_ASSETS.emptyPlots[item.size!][item.direction]:template(item).rotations[item.direction];
      for(const d of shell) {
        const c=d;
        draws.push({...d,x:item.x+c.x,y:item.y+c.y,depth:d.depth<0?-100000+item.x+item.y+c.x+c.y:d.depth+100*(item.x+item.y),opacity,itemId:item.id});
      }
    } else {
      const a=item.kind==='dungeon'?BUILDER_ASSETS.dungeons[String(item.dungeonChipId)]:BUILDER_ASSETS.facilities[item.kind==='road'?(item.facilityId===3?'3':'road'):String(item.facilityId)];
      if(!a) continue;
      const parent=item===ghost?containingPlot(item,state):state.items.find(p=>p.id===item.parentId);
      const direction=item.facing??item.direction;
      if(a.rotationDraws) {
        for(const d of a.rotationDraws[direction])draws.push({...d,x:item.x+d.x,y:item.y+d.y,depth:d.depth+(d.depth<0?item.x+item.y:100*(item.x+item.y)),opacity,itemId:item.id});
        continue;
      }
      const mask=a.barrierFrames?offsets.reduce((mask,[dx,dy],dir)=>mask|(barriers.has(`${item.x+dx},${item.y+dy}`)?1<<dir:0),0):0;
      const sprite=a.barrierFrames?a.barrierFrames[mask]:a.states.length?a.states[item.fullness]:a.variants[direction];
      const [w,h]=dimensions(item);
      const x=item.x+(item.direction%2?a.anchorY:a.anchorX),y=item.y+(item.direction%2?a.anchorX:a.anchorY);
      draws.push({sprite,x,y,elevation:supportHeight(parent),depth:item.kind==='road'?-100000+x+y:100*(item.x+item.y+Math.floor(w/2)+Math.floor(h/2))+(a.barrierFrames?5:parent?([0,3].includes(direction)?5:20):0),opacity,itemId:item.id});
      if(item.petId!==undefined)draws.push({sprite:`pet-${item.petId}`,x:item.x+(w-1)/2,y:item.y+(h-1)/2,elevation:supportHeight(parent),depth:100*(item.x+item.y+Math.floor(w/2)+Math.floor(h/2))+30,opacity,itemId:item.id});
    }
  }
  return draws.sort((a,b)=>a.depth-b.depth);
}
export function hitBuilder(point:Cell,camera:{offsetX:number;offsetY:number;zoom:number},draws:BuilderDraw[],alpha:Map<string,Uint8ClampedArray>) {
  for(let i=draws.length-1;i>=0;i--) {
    const d=draws[i],s=BUILDER_ASSETS.sprites[d.sprite],pixels=alpha.get(d.sprite);if(!s||!pixels)continue;
    const x=Math.floor((point.x-camera.offsetX)/camera.zoom-24*(d.x-d.y)-s.dx);
    const y=Math.floor((point.y-camera.offsetY)/camera.zoom-12*(d.x+d.y)-s.dy+d.elevation);
    if(x>=0&&y>=0&&x<s.width&&y<s.height&&pixels[(y*s.width+x)*4+3]>30)return d.itemId;
  }
  return undefined;
}
export function drawBuilder(context:CanvasRenderingContext2D,camera:{offsetX:number;offsetY:number;zoom:number},width:number,height:number,draws:BuilderDraw[],images:Map<string,HTMLImageElement>) {
  const z=camera.zoom;
  context.save();context.imageSmoothingEnabled=false;
  for(const d of draws) {
    const s=BUILDER_ASSETS.sprites[d.sprite],image=images.get(d.sprite);if(!s||!image) continue;
    const x=camera.offsetX+(24*(d.x-d.y)+s.dx)*z,y=camera.offsetY+(12*(d.x+d.y)+s.dy-d.elevation)*z;
    if(x+s.width*z<0||y+s.height*z<0||x>width||y>height)continue;
    context.globalAlpha=d.opacity;
    context.drawImage(image,x,y,s.width*z,s.height*z);
  }
  context.restore();
}
export function diamond(context:CanvasRenderingContext2D,c:Cell,camera:{offsetX:number;offsetY:number;zoom:number},fill:string,stroke?:string,elevation=0) {
  const z=camera.zoom,x=camera.offsetX+24*(c.x-c.y)*z,y=camera.offsetY+(12*(c.x+c.y)-elevation)*z;
  context.beginPath();context.moveTo(x,y-12*z);context.lineTo(x+24*z,y);context.lineTo(x,y+12*z);context.lineTo(x-24*z,y);context.closePath();
  context.fillStyle=fill;context.fill();if(stroke){context.strokeStyle=stroke;context.lineWidth=1;context.stroke();}
}
