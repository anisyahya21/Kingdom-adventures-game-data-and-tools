import { useEffect, useState } from "react";

const EQUIPMENT_SPRITE_TRIM_CACHE = new Map<string, string>();

type EquipmentSpriteProps = {
  src: string;
  alt: string;
  className?: string;
};

/** Alpha-trim transparent sprite padding so pixel art fills its display box. */
export function EquipmentSprite({
  src,
  alt,
  className = "h-20 w-20 shrink-0 object-contain",
}: EquipmentSpriteProps) {
  const [trimmedSrc, setTrimmedSrc] = useState(src);

  useEffect(() => {
    setTrimmedSrc(src);
    if (!src) return;

    const cached = EQUIPMENT_SPRITE_TRIM_CACHE.get(src);
    if (cached) {
      setTrimmedSrc(cached);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      if (cancelled) return;
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) return;

      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;

        let minX = width;
        let minY = height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (pixels[(y * width + x) * 4 + 3] === 0) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        if (maxX < minX || maxY < minY) {
          EQUIPMENT_SPRITE_TRIM_CACHE.set(src, src);
          return;
        }

        const padding = 1;
        const left = Math.max(0, minX - padding);
        const top = Math.max(0, minY - padding);
        const right = Math.min(width - 1, maxX + padding);
        const bottom = Math.min(height - 1, maxY + padding);
        const trimmedWidth = right - left + 1;
        const trimmedHeight = bottom - top + 1;
        const output = document.createElement("canvas");
        output.width = trimmedWidth;
        output.height = trimmedHeight;
        const outputContext = output.getContext("2d");
        if (!outputContext) return;
        outputContext.drawImage(
          image,
          left,
          top,
          trimmedWidth,
          trimmedHeight,
          0,
          0,
          trimmedWidth,
          trimmedHeight,
        );
        const trimmedUrl = output.toDataURL("image/png");
        EQUIPMENT_SPRITE_TRIM_CACHE.set(src, trimmedUrl);
        if (!cancelled) setTrimmedSrc(trimmedUrl);
      } catch {
        // Keep the original sprite when canvas access is blocked or unsupported.
        EQUIPMENT_SPRITE_TRIM_CACHE.set(src, src);
      }
    };

    image.onerror = () => {
      if (!cancelled) setTrimmedSrc(src);
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <img
      src={trimmedSrc}
      alt={alt}
      className={className}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
