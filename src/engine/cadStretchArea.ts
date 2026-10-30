import type { Point } from './types';
import { segmentsIntersect } from './geometry';
export type CadStretchArea =
  { kind: 'window'; a: Point; b: Point } | { kind: 'polygon'; points: Point[] };
export function stretchAreaPoints(area: CadStretchArea): Point[] {
  return area.kind === 'polygon'
    ? area.points
    : [area.a, { x: area.b.x, y: area.a.y }, area.b, { x: area.a.x, y: area.b.y }];
}
/** Boundary-inclusive even/odd polygon test, also used for the preview vertex mask. */
export function inStretchArea(p: Point, area: CadStretchArea): boolean {
  const pts = stretchAreaPoints(area);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j],
      b = pts[i],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (
      length &&
      Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) <= 1e-8 * length &&
      (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y) <= 1e-8
    )
      return true;
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * dx) / dy) inside = !inside;
  }
  return inside;
}
export function validateStretchPolygon(points: Point[]): void {
  if (
    points.length < 3 ||
    points.length > 1024 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw new Error('Crossing polygon needs 3–1024 finite vertices.');
  const origin = points[0];
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-8)
      throw new Error('Polygon vertices must differ.');
    area += (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length]))
        throw new Error('Crossing polygon must not intersect itself.');
    }
  }
  if (Math.abs(area) < 1e-9) throw new Error('Crossing polygon must enclose an area.');
}
