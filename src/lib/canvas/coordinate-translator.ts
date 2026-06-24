import { Point } from '../parsers/kicad/pcbParser';

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Transforms native EDA coordinates to HTML5 Canvas screen space pixels.
 */
export function toScreen(x: number, y: number, transform: ViewportTransform): Point {
  return {
    x: x * transform.scale + transform.offsetX,
    y: y * transform.scale + transform.offsetY
  };
}

/**
 * Transforms screen space pixels back to native EDA coordinates.
 * Used for coordinate pinning (hovering, adding annotations).
 */
export function toNative(screenX: number, screenY: number, transform: ViewportTransform): Point {
  return {
    x: (screenX - transform.offsetX) / transform.scale,
    y: (screenY - transform.offsetY) / transform.scale
  };
}

/**
 * Calculates scale and offsets to center and fit native bounds inside viewport dimensions.
 */
export function fitBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  paddingPercent = 0.1
): ViewportTransform {
  const boardWidth = bounds.maxX - bounds.minX;
  const boardHeight = bounds.maxY - bounds.minY;

  const paddedWidth = viewportWidth * (1 - paddingPercent);
  const paddedHeight = viewportHeight * (1 - paddingPercent);

  // Determine standard scale
  let scale = 1;
  if (boardWidth > 0 && boardHeight > 0) {
    scale = Math.min(paddedWidth / boardWidth, paddedHeight / boardHeight);
  }

  // Cap scaling to reasonable limits
  scale = Math.max(0.01, Math.min(scale, 100));

  // Compute offset to center the board
  const boardCenterX = bounds.minX + boardWidth / 2;
  const boardCenterY = bounds.minY + boardHeight / 2;

  const offsetX = viewportWidth / 2 - boardCenterX * scale;
  const offsetY = viewportHeight / 2 - boardCenterY * scale;

  return { scale, offsetX, offsetY };
}
