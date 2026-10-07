/**
 * Dynamic object-snap guide lines (AutoCAD object-snap *tracking* style).
 *
 * Two kinds of guide are produced between a "source" (the dragged object, or
 * the point of the selected object under the cursor) and the reference
 * geometry of every other visible object:
 *
 *  - Alignment guides: a source point lies on the same X (vertical guide) or
 *    the same Y (horizontal guide) as a reference point. While dragging, the
 *    object is pulled onto the alignment when it is inside the aperture.
 *  - Perpendicular guides: the shortest perpendicular from a source point to
 *    a reference edge/face (or from a reference point to a source edge), with
 *    the gap distance — the "nearest face" helper.
 *
 * Pure geometry only: callers convert screen-pixel apertures to world units.
 */
import type { Point, SectionComponent } from './types';
import { componentSnapFeatures, type SnapSegment } from './osnap';
import { componentRenderRings } from './combine';

export type GuideKind = 'align-x' | 'align-y' | 'perp';

export interface Guide {
  kind: GuideKind;
  /** Point on the source (moving / selected) geometry. */
  from: Point;
  /** Point on the reference geometry. */
  to: Point;
  /** Length of the guide (world units). */
  distance: number;
  /** What the guide ends on. */
  ref: 'point' | 'edge';
  targetId?: string;
}

export interface GuideFeatures {
  points: Point[];
  segments: SnapSegment[];
}

export interface RefFeatures extends GuideFeatures {
  id: string;
}

const EPS = 1e-9;

function dedupePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) if (!out.some(q => Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9)) out.push(p);
  return out;
}

/**
 * Reference points (vertices, midpoints, centre, quadrants) and edges of a
 * component. Combined sections use their true outer/void rings so the
 * zero-width keyhole bridge never produces a phantom edge.
 */
export function guideFeatures(comp: SectionComponent): GuideFeatures {
  const f = componentSnapFeatures(comp);
  const rings = componentRenderRings(comp);
  let segments = f.segments;
  let points = f.points.map(p => p.point);
  if (rings) {
    segments = [];
    points = [{ ...comp.position }];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-12) continue;
        segments.push({ a, b });
        points.push(a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
    }
  }
  return { points: dedupePoints(points), segments };
}

export function translateFeatures(f: GuideFeatures, d: Point): GuideFeatures {
  const t = (p: Point) => ({ x: p.x + d.x, y: p.y + d.y });
  return { points: f.points.map(t), segments: f.segments.map(s => ({ a: t(s.a), b: t(s.b) })) };
}

/** Features of all visible components except `exclude` (reference geometry). */
export function referenceFeatures(components: SectionComponent[], exclude: Set<string>): RefFeatures[] {
  return components
    .filter(c => c.visible && !exclude.has(c.id))
    .map(c => ({ id: c.id, ...guideFeatures(c) }));
}

/** Foot of the perpendicular from p onto segment ab, or null if it falls outside the segment. */
export function perpendicularFoot(p: Point, a: Point, b: Point): Point | null {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-24) return null;
  const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  return { x: a.x + t * vx, y: a.y + t * vy };
}

export interface AlignmentResult {
  /** Correction to apply along X / Y (null when nothing is inside the aperture). */
  dx: number | null;
  dy: number | null;
}

/**
 * Best X and Y alignment corrections that bring a moving point exactly onto
 * the X / Y of a reference point within `tolerance`. Ties prefer the
 * reference nearest along the guide.
 */
export function findAlignment(moving: Point[], refs: RefFeatures[], tolerance: number): AlignmentResult {
  let bx: { d: number; along: number } | null = null;
  let by: { d: number; along: number } | null = null;
  for (const r of refs) {
    for (const rp of r.points) {
      for (const m of moving) {
        const dx = rp.x - m.x;
        const dy = rp.y - m.y;
        if (Math.abs(dx) <= tolerance) {
          const along = Math.abs(dy);
          if (!bx || Math.abs(dx) < Math.abs(bx.d) - EPS || (Math.abs(Math.abs(dx) - Math.abs(bx.d)) <= EPS && along < bx.along)) bx = { d: dx, along };
        }
        if (Math.abs(dy) <= tolerance) {
          const along = Math.abs(dx);
          if (!by || Math.abs(dy) < Math.abs(by.d) - EPS || (Math.abs(Math.abs(dy) - Math.abs(by.d)) <= EPS && along < by.along)) by = { d: dy, along };
        }
      }
    }
  }
  return { dx: bx ? bx.d : null, dy: by ? by.d : null };
}

export interface GuideOptions {
  /** Alignment aperture (world units): how close X/Y must be to show a guide. */
  alignTolerance: number;
  /** Max length of a perpendicular guide (world units). */
  perpRadius: number;
  /** Max perpendicular guides (nearest first, one per reference object). */
  maxPerpendicular?: number;
  /** Max length of an alignment guide (world units); omit for unlimited. */
  alignRadius?: number;
}

/**
 * Guides from `source` geometry to the reference geometry.
 * At most one vertical and one horizontal alignment guide (the closest).
 */
export function computeGuides(source: GuideFeatures, refs: RefFeatures[], opts: GuideOptions): Guide[] {
  const guides: Guide[] = [];
  const tol = opts.alignTolerance;
  const alignMax = opts.alignRadius ?? Infinity;

  // Alignment: pick the pair with the smallest misalignment, then shortest guide.
  let ax: Guide & { off: number } | null = null;
  let ay: Guide & { off: number } | null = null;
  for (const r of refs) {
    for (const rp of r.points) {
      for (const m of source.points) {
        const offX = Math.abs(rp.x - m.x);
        const offY = Math.abs(rp.y - m.y);
        // Vertical guide (same X); skip coincident points (distance 0).
        if (offX <= tol && offY > tol && offY <= alignMax) {
          if (!ax || offX < ax.off - EPS || (Math.abs(offX - ax.off) <= EPS && offY < ax.distance)) {
            ax = { kind: 'align-x', from: m, to: rp, distance: offY, ref: 'point', targetId: r.id, off: offX };
          }
        }
        if (offY <= tol && offX > tol && offX <= alignMax) {
          if (!ay || offY < ay.off - EPS || (Math.abs(offY - ay.off) <= EPS && offX < ay.distance)) {
            ay = { kind: 'align-y', from: m, to: rp, distance: offX, ref: 'point', targetId: r.id, off: offY };
          }
        }
      }
    }
  }
  for (const g of [ax, ay]) {
    if (!g) continue;
    const { off: _off, ...guide } = g;
    void _off;
    guides.push(guide);
  }

  // Perpendicular: nearest face per reference object.
  const perp: Guide[] = [];
  for (const r of refs) {
    let best: Guide | null = null;
    const consider = (from: Point, to: Point, ref: Guide['ref']) => {
      const d = Math.hypot(to.x - from.x, to.y - from.y);
      if (d <= Math.max(tol * 0.05, 1e-9) || d > opts.perpRadius) return; // touching or too far
      if (!best || d < best.distance) best = { kind: 'perp', from, to, distance: d, ref, targetId: r.id };
    };
    // Source point → reference face.
    for (const m of source.points) {
      for (const s of r.segments) {
        const foot = perpendicularFoot(m, s.a, s.b);
        if (foot) consider(m, foot, 'edge');
      }
    }
    // Reference point → source face (corner facing the selected object's edge).
    for (const rp of r.points) {
      for (const s of source.segments) {
        const foot = perpendicularFoot(rp, s.a, s.b);
        if (foot) consider(foot, rp, 'point');
      }
    }
    if (best) perp.push(best);
  }
  perp.sort((a, b) => a.distance - b.distance);
  guides.push(...perp.slice(0, opts.maxPerpendicular ?? 3));
  return guides;
}

/**
 * The point of the selected geometry nearest to the cursor (a feature point
 * if one is inside the aperture, otherwise the nearest point on an edge), or
 * null when the cursor is not near the selected object.
 */
export function hoverSource(selected: GuideFeatures, cursor: Point, aperture: number): Point | null {
  let best: { p: Point; d: number } | null = null;
  for (const p of selected.points) {
    const d = Math.hypot(p.x - cursor.x, p.y - cursor.y);
    if (d <= aperture && (!best || d < best.d)) best = { p, d };
  }
  if (best) return best.p;
  for (const s of selected.segments) {
    const vx = s.b.x - s.a.x;
    const vy = s.b.y - s.a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-24) continue;
    const t = Math.max(0, Math.min(1, ((cursor.x - s.a.x) * vx + (cursor.y - s.a.y) * vy) / len2));
    const p = { x: s.a.x + t * vx, y: s.a.y + t * vy };
    const d = Math.hypot(p.x - cursor.x, p.y - cursor.y);
    if (d <= aperture && (!best || d < best.d)) best = { p, d };
  }
  return best?.p ?? null;
}
