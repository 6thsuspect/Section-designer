/**
 * Dimensions from the section centroid (CG) to the extreme edges of the
 * section — shown when hovering the CG marker on the canvas.
 *
 * Extremes are taken from the material (visible, additive components; for
 * combined sections their true outer rings). Subtracted shapes/voids cannot
 * extend the section envelope, so they are ignored.
 */
import type { Point, SectionComponent } from './types';
import { computeComponentProps } from './geometry';
import { componentRenderRings } from './combine';

export type CgSide = 'left' | 'right' | 'top' | 'bottom';

export interface CgExtreme {
  side: CgSide;
  /** Extreme coordinate (x for left/right, y for top/bottom), world units. */
  coord: number;
  /** Distance from the CG to that extreme edge (≥ 0). */
  distance: number;
  /**
   * Point on the section that defines the extreme, chosen nearest to the CG's
   * horizontal (left/right) or vertical (top/bottom) line — the extension
   * line is drawn from here to the dimension line.
   */
  point: Point;
}

export interface CgDimensions {
  cg: Point;
  left: CgExtreme;
  right: CgExtreme;
  top: CgExtreme;
  bottom: CgExtreme;
  /** Overall width / height of the section envelope. */
  width: number;
  height: number;
}

function materialRings(components: SectionComponent[]): Point[][] {
  const rings: Point[][] = [];
  for (const c of components) {
    if (!c.visible || c.operation === 'subtract') continue;
    const r = componentRenderRings(c);
    if (r) rings.push(...r);
    else rings.push(computeComponentProps(c).outline);
  }
  return rings.map(r => r.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))).filter(r => r.length > 0);
}

/** CG → extreme-edge dimensions, or null when the section has no material. */
export function computeCgDimensions(components: SectionComponent[], cg: Point): CgDimensions | null {
  const rings = materialRings(components);
  const pts = rings.flat();
  if (pts.length === 0) return null;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of pts) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const span = Math.max(xMax - xMin, yMax - yMin, 1e-12);
  const eps = span * 1e-9;

  /**
   * Extension-line origin on an extreme line: if a straight edge lying on
   * that line spans the CG's coordinate, use the point level with the CG;
   * otherwise the extreme vertex nearest to the CG's line.
   */
  const extremePoint = (axis: 'x' | 'y', value: number, cgAlong: number): Point => {
    const other = axis === 'x' ? 'y' : 'x';
    const on = (p: Point) => Math.abs(p[axis] - value) <= eps;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if (!on(a) || !on(b)) continue;
        const lo = Math.min(a[other], b[other]), hi = Math.max(a[other], b[other]);
        if (cgAlong >= lo - eps && cgAlong <= hi + eps) {
          return axis === 'x' ? { x: value, y: cgAlong } : { x: cgAlong, y: value };
        }
      }
    }
    let best = pts[0], bestD = Infinity;
    for (const p of pts) {
      if (!on(p)) continue;
      const d = Math.abs(p[other] - cgAlong);
      if (d < bestD) { bestD = d; best = p; }
    }
    return { ...best };
  };

  return {
    cg: { ...cg },
    left: { side: 'left', coord: xMin, distance: Math.max(0, cg.x - xMin), point: extremePoint('x', xMin, cg.y) },
    right: { side: 'right', coord: xMax, distance: Math.max(0, xMax - cg.x), point: extremePoint('x', xMax, cg.y) },
    top: { side: 'top', coord: yMax, distance: Math.max(0, yMax - cg.y), point: extremePoint('y', yMax, cg.x) },
    bottom: { side: 'bottom', coord: yMin, distance: Math.max(0, cg.y - yMin), point: extremePoint('y', yMin, cg.x) },
    width: xMax - xMin,
    height: yMax - yMin,
  };
}

/** True when `cursor` is within `aperture` (world units) of the CG. */
export function isNearCg(cursor: Point, cg: Point, aperture: number): boolean {
  return Math.hypot(cursor.x - cg.x, cursor.y - cg.y) <= aperture;
}
