export interface ViewportBounds { x: number; y: number; w: number; h: number }

/** Visible SVG user-space bounds for xMidYMid meet, including letterboxed space. */
export function visibleViewportBounds(view: ViewportBounds, width: number, height: number): ViewportBounds {
  if (width <= 0 || height <= 0) return view;
  const scale = Math.min(width / view.w, height / view.h);
  const w = width / scale;
  const h = height / scale;
  return { x: view.x - (w - view.w) / 2, y: view.y - (h - view.h) / 2, w, h };
}
