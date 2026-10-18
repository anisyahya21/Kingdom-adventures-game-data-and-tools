/** Fit the canvas renderer's 48 x 24 isometric tiles, including tall stone sprites. */
export function fitChaosSetup(
  cells: readonly { x: number; y: number }[],
  viewport: { width: number; height: number },
) {
  if (cells.length === 0 || viewport.width <= 0 || viewport.height <= 0)
    return null;
  const xs = cells.map((cell) => (cell.x - cell.y) * 24);
  const ys = cells.map((cell) => (cell.x + cell.y) * 12);
  const minX = Math.min(...xs) - 32;
  const maxX = Math.max(...xs) + 32;
  const minY = Math.min(...ys) - 112;
  const maxY = Math.max(...ys) + 32;
  const zoom = Math.max(
    0.14,
    Math.min(
      2.8,
      (viewport.width - 32) / (maxX - minX),
      (viewport.height - 32) / (maxY - minY),
    ),
  );
  const isoX = (minX + maxX) / 48;
  const isoY = (minY + maxY) / 24;
  return { zoom, x: (isoX + isoY) / 2, y: (isoY - isoX) / 2 };
}
