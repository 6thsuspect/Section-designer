import type { Point, SectionComponent } from './types';
import { computeComponentProps } from './geometry';

/**
 * AutoCAD-style object snap (OSNAP) for dragging section components.
 *
 * While an object is dragged, characteristic points on the moving object
 * (endpoints, midpoints, centre, quadrants) are compared with characteristic
 * points and edges of every other visible object. The closest candidate within
 * the snap aperture wins, with AutoCAD-like priority: precise points
 * (endpoint/intersection-like nodes) beat edge ("nearest") snaps.
 */
export type SnapKind = 'endpoint' | 'midpoint' | 'center' | 'quadrant' | 'node' | 'edge';

export interface SnapFeature {
  kind: Exclude<SnapKind, 'edge'>;
  point: Point;
}

export interface SnapSegment {
  a: Point;
  b: Point;
}

export interface ObjectFeatures {
  points: SnapFeature[];
  segments: SnapSegment[];
}

export interface SnapResult {
  kind: SnapKind;
  /** Snapped component position. */
  position: Point;
  /** Target point the moving object snapped onto (indicator location). */
  target: Point;
  /** Point of the moving object that coincides with the target. */
  source: Point;
  /** Distance (world units) between the unsnapped and snapped geometry. */
  distance: number;
  targetComponentId?: string;
}

/** Smaller value wins when two candidates are similarly close. */
const PRIORITY: Record<SnapKind, number> = {
  endpoint: 0,
  node: 0,
  center: 1,
  midpoint: 2,
  quadrant: 2,
  edge: 4,
};

export const SNAP_LABELS: Record<SnapKind, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  center: 'Center',
  quadrant: 'Quadrant',
  node: 'Node',
  edge: 'Nearest (edge)',
};

/** OSNAP dimension / label text colour (dark red). */
export const OSNAP_LABEL_COLOR = '#8b0000';

const CURVED = new Set<SectionComponent['type']>(['circle', 'hollow-circle', 'ellipse']);

function translate(p: Point, d: Point): Point {
  return { x: p.x + d.x, y: p.y + d.y };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-24) return { ...a };
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return { x: a.x + t * vx, y: a.y + t * vy };
}

function dedupe(points: SnapFeature[]): SnapFeature[] {
  const out: SnapFeature[] = [];
  for (const feature of points) {
    if (!out.some(existing => existing.kind === feature.kind && dist(existing.point, feature.point) < 1e-9)) {
      out.push(feature);
    }
  }
  return out;
}

/** Characteristic snap points and edges of a single component. */
export function componentSnapFeatures(comp: SectionComponent): ObjectFeatures {
  const outline = computeComponentProps(comp).outline;
  const segments: SnapSegment[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    if (dist(a, b) > 1e-12) segments.push({ a, b });
  }

  const points: SnapFeature[] = [{ kind: 'center', point: { ...comp.position } }];
  if (CURVED.has(comp.type)) {
    // Curves are polygonised for rendering; their vertices are not real
    // endpoints. Offer centre + the four quadrant points instead.
    const g = comp.geometry;
    const rx = comp.type === 'ellipse' ? (g.majorAxis ?? 200) / 2
      : comp.type === 'hollow-circle' ? (g.outerRadius ?? 0) : (g.radius ?? 0);
    const ry = comp.type === 'ellipse' ? (g.minorAxis ?? 100) / 2 : rx;
    const angle = comp.type === 'ellipse' ? comp.rotation * Math.PI / 180 : 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (const [lx, ly] of [[rx, 0], [0, ry], [-rx, 0], [0, -ry]]) {
      if (rx <= 0 && ry <= 0) break;
      points.push({ kind: 'quadrant', point: { x: comp.position.x + lx * c - ly * s, y: comp.position.y + lx * s + ly * c } });
    }
  } else {
    for (const vertex of outline) points.push({ kind: 'endpoint', point: vertex });
    for (const { a, b } of segments) points.push({ kind: 'midpoint', point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
  }
  return { points: dedupe(points), segments };
}

export interface SnapOptions {
  /** Snap aperture in world units (screen pixels ÷ zoom scale). */
  tolerance: number;
  /** Ids excluded from targets (the dragged object and its linked parts). */
  excludeIds?: Set<string>;
  /** Extra global nodes, e.g. the coordinate origin. */
  nodes?: Point[];
}

/**
 * Find the best snap for `moving` when its position would be `rawPosition`.
 * Returns null when nothing lies inside the aperture (free movement).
 */
export function findObjectSnap(
  moving: SectionComponent,
  rawPosition: Point,
  components: SectionComponent[],
  options: SnapOptions,
): SnapResult | null {
  const { tolerance } = options;
  if (!(tolerance > 0)) return null;
  const exclude = options.excludeIds ?? new Set([moving.id]);
  const delta = { x: rawPosition.x - moving.position.x, y: rawPosition.y - moving.position.y };
  const own = componentSnapFeatures(moving);
  const movingPoints = own.points.map(feature => ({ ...feature, point: translate(feature.point, delta) }));
  const movingSegments = own.segments.map(({ a, b }) => ({ a: translate(a, delta), b: translate(b, delta) }));

  let best: (SnapResult & { score: number }) | null = null;
  const consider = (kind: SnapKind, source: Point, target: Point, targetComponentId?: string) => {
    const d = dist(source, target);
    if (d > tolerance) return;
    // Priority bias: a precise point within the aperture beats an edge snap
    // unless the edge is substantially closer.
    const score = d / tolerance + PRIORITY[kind] * 0.25;
    if (best && score >= best.score) return;
    best = {
      kind,
      score,
      source,
      target,
      distance: d,
      targetComponentId,
      position: { x: rawPosition.x + target.x - source.x, y: rawPosition.y + target.y - source.y },
    };
  };

  const targets = components.filter(component => component.visible && !exclude.has(component.id));
  for (const target of targets) {
    const features = componentSnapFeatures(target);
    // Point ↔ point snaps (endpoint to endpoint, midpoint to midpoint, …).
    for (const tp of features.points) {
      for (const mp of movingPoints) {
        // A target feature defines the snap kind shown to the user.
        consider(tp.kind, mp.point, tp.point, target.id);
      }
    }
    // Moving points onto target edges ("nearest" / face contact).
    for (const seg of features.segments) {
      for (const mp of movingPoints) {
        if (mp.kind === 'center') continue;
        consider('edge', mp.point, closestPointOnSegment(mp.point, seg.a, seg.b), target.id);
      }
    }
    // Target points onto moving edges (a corner touching the dragged face).
    for (const tp of features.points) {
      if (tp.kind === 'center') continue;
      for (const seg of movingSegments) {
        consider('edge', closestPointOnSegment(tp.point, seg.a, seg.b), tp.point, target.id);
      }
    }
  }

  for (const node of options.nodes ?? []) {
    for (const mp of movingPoints) consider('node', mp.point, node);
  }

  if (!best) return null;
  const { score: _score, ...result } = best as SnapResult & { score: number };
  void _score;
  return result;
}

/** Ids that move with `id` while dragging (grouped bolt deductions). */
export function linkedIds(id: string, components: SectionComponent[]): Set<string> {
  const ids = new Set([id]);
  for (const component of components) {
    if (component.parentId === id && component.managedByParent) ids.add(component.id);
  }
  return ids;
}
