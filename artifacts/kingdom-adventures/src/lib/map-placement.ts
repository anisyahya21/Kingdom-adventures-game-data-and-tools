/** Invert the map's tile-center projection, then snap the footprint origin.
 * Do not clamp to the map edge: off-map previews must remain invalid.
 */
export function placementAtViewportCenter(
  camera: {offsetX:number;offsetY:number;zoom:number},
  viewport: {width:number;height:number},
  footprint: {width:number;height:number},
) {
  const isoX=(viewport.width/2-camera.offsetX)/(24*camera.zoom);
  const isoY=(viewport.height/2-camera.offsetY)/(12*camera.zoom);
  return {
    x:Math.round((isoX+isoY)/2-(footprint.width-1)/2),
    y:Math.round((isoY-isoX)/2-(footprint.height-1)/2),
  };
}
