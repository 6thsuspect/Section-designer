import type { Point, SectionComponent } from './types';
import { computeComponentProps, pointInRect, segmentsIntersect } from './geometry';
import { componentRenderRings } from './combine';

/**
 * AutoCAD-style canvas selection.
 *
 *  - Window (drag left → right): objects completely inside the rectangle.
 *  - Crossing (drag right → left): objects completely inside OR partially
 *    intersecting the rectangle — including when the rectangle lies wholly
 *    inside an object's filled material.
 *  - Pick (click): the object under the cursor, or the nearest object edge
 *    within a small pick-box tolerance (so thin plates and nodes are easy to
 *    hit at any zoom).
 *
 * Combined sections are tested against their exact material rings (outer
 * boundaries + voids) instead of the keyholed coordinate loop, so zero-width
 * bridges never cause false crossings.
 */
export type SelectionMode = 'window' | 'crossing';

export interface WorldRect { x0: number; y0: number; x1: number; y1: number }

/** Components that can be picked/window-selected on the canvas. */
export function isSelectable(comp: SectionComponent, includeLocked = false): boolean {
  if (!comp.visible || comp.managedByParent) return false;
  return includeLocked || !comp.locked;
}

/** Material rings used for hit-testing (world coordinates). */
export function hitRings(comp: SectionComponent): Point[][] {
  const rings = componentRenderRings(comp);
  if (rings) return rings.filter(ring => ring.length >= 2);
  const outline = computeComponentProps(comp).outline;
  return outline.length >= 2 ? [outline] : [];
}

function insideRings(point: Point, rings: Point[][]): boolean {
  // Even-odd over all rings: inside an outer boundary and not inside a void.
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i];
      const b = ring[j];
      if ((a.y > point.y) !== (b.y > point.y)
        && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

export function componentInWindow(comp: SectionComponent, rect: WorldRect): boolean {
  const rings = hitRings(comp);
  if (rings.length === 0) return false;
  return rings.every(ring => ring.every(p => pointInRect(p, rect.x0, rect.y0, rect.x1, rect.y1)));
}

export function componentCrossesRect(comp: SectionComponent, rect: WorldRect): boolean {
  const rings = hitRings(comp);
  if (rings.length === 0) return false;
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      if (pointInRect(a, x0, y0, x1, y1)) return true;
      const b = ring[(i + 1) % ring.length];
      for (let c = 0; c < 4; c++) {
        if (segmentsIntersect(a, b, corners[c], corners[(c + 1) % 4])) return true;
      }
    }
  }
  // Rectangle entirely within the filled material.
  return insideRings(corners[0], rings);
}

/** Ids selected by a window/crossing rectangle, in drawing order. */
export function selectByRect(components: SectionComponent[], rect: WorldRect, mode: SelectionMode): string[] {
  return components
    .filter(comp => isSelectable(comp))
    .filter(comp => (mode === 'window' ? componentInWindow(comp, rect) : componentCrossesRect(comp, rect)))
    .map(comp => comp.id);
}

/**
 * Pick the object at `point`: topmost object whose material contains the
 * point, otherwise the object with the nearest edge within `tolerance`.
 */
export function pickComponent(
  components: SectionComponent[],
  point: Point,
  tolerance: number,
  includeLocked = true,
): SectionComponent | null {
  let nearest: { comp: SectionComponent; d: number } | null = null;
  for (let index = components.length - 1; index >= 0; index--) {
    const comp = components[index];
    if (!isSelectable(comp, includeLocked)) continue;
    const rings = hitRings(comp);
    if (rings.length === 0) continue;
    if (rings[0].length >= 3 && insideRings(point, rings)) return comp;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const d = distanceToSegment(point, ring[i], ring[(i + 1) % ring.length]);
        if (d <= tolerance && (!nearest || d < nearest.d)) nearest = { comp, d };
      }
    }
  }
  return nearest?.comp ?? null;
}
