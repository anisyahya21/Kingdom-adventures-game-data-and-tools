import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { renderCharacterPreview, type CharacterRenderParams } from "@/lib/character-renderer";

type Props = CharacterRenderParams & {
  className?: string;
  style?: CSSProperties;
  label?: string;
};

export function CharacterPreviewCanvas({ className, style, label = "character", ...params }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [available, setAvailable] = useState(true);
  const renderKey = useMemo(() => JSON.stringify(params), [params]);
  const canvasClassName = ["ka-pixel-art", className].filter(Boolean).join(" ");

  useEffect(() => {
    let cancelled = false;
    const canvas = ref.current;
    if (!canvas) return;
    setAvailable(true);
    renderCharacterPreview(canvas, params)
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [renderKey]);

  return (
    <canvas
      ref={ref}
      aria-label={label}
      role="img"
      className={canvasClassName}
      style={{ imageRendering: "pixelated", display: available ? undefined : "none", ...style }}
    />
  );
}
