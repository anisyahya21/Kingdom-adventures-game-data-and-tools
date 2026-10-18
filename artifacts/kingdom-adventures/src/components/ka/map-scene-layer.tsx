import { useEffect, useRef } from "react";

export type MapCamera = { offsetX: number; offsetY: number; zoom: number };
export type MapSceneDraw = (
  context: CanvasRenderingContext2D,
  camera: MapCamera,
  width: number,
  height: number,
  time: number,
) => void;

/** Animated editor art is independent of the expensive, mostly static terrain pass. */
export function MapSceneLayer({
  camera,
  draw,
  animate = false,
}: {
  camera: MapCamera;
  draw: MapSceneDraw;
  animate?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !parent || !context) return;
    let request = 0;
    let last = -Infinity;
    const paint = (time: number) => {
      if (!document.hidden && time - last >= 50) {
        const width = parent.clientWidth,
          height = parent.clientHeight;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = false;
        draw(context, camera, width, height, time);
        last = time;
      }
      if (animate) request = requestAnimationFrame(paint);
    };
    const repaint = () => {
      last = -Infinity;
      if (!animate) paint(performance.now());
    };
    const observer = new ResizeObserver(repaint);
    observer.observe(parent);
    document.addEventListener("visibilitychange", repaint);
    paint(performance.now());
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      document.removeEventListener("visibilitychange", repaint);
    };
  }, [camera, draw, animate]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-map-scene
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
