import * as polygonClippingModule from 'polygon-clipping';
import type { MultiPolygon, Pair, Polygon } from 'polygon-clipping';
import type { Point, SectionComponent } from './types';
import { computeComponentProps } from './geometry';

/**
 * Combine Shapes / Uncombine.
 *
 * Combining merges the material regions of several connected/overlapping
 * components into one `custom-shape` whose `points` form a single continuous
 * closed coordinate boundary:
 *   - additive regions are boolean-unioned, so overlaps are counted once;
 *   - interior voids (e.g. a box built from four plates) are joined to the
 *     outer boundary by a zero-width "keyhole" bridge, so the coordinate list
 *     is still one closed loop and the shoelace/Green's-theorem properties
 *     equal outer − void exactly;
 *   - subtractive members (bolt-hole deductions, cut-outs) are kept as
 *     subtractive cut-outs locked to the combined section, so net-section
 *     deductions remain exact without splitting the boundary.
 *
 * A deep snapshot of every original member is stored on the combined shape,
 * so Uncombine restores the last uncombined state exactly.
 */

type ClipApi = {
  union: (geom: Polygon | MultiPolygon, ...geoms: (Polygon | MultiPolygon)[]) => MultiPolygon;
};
const clipModule = polygonClippingModule as unknown as ClipApi & { default?: ClipApi };
const clip: ClipApi = clipModule.default ?? clipModule;

/** Segments used to represent true curves (circle/ellipse) when combining. */
export const CURVE_SEGMENTS = 256;
const DEG = Math.PI / 180;

function rotateAbout(p: Point, degrees: number, origin: Point): Point {
  if (!degrees) return p;
  const c = Math.cos(degrees * DEG);
  const s = Math.sin(degrees * DEG);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

function rectRing(w: number, h: number, pos: Point, rot: number): Point[] {
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: pos.x - hw, y: pos.y - hh },
    { x: pos.x + hw, y: pos.y - hh },
    { x: pos.x + hw, y: pos.y + hh },
    { x: pos.x - hw, y: pos.y + hh },
  ].map(p => rotateAbout(p, rot, pos));
}

function ellipseRing(a: number, b: number, pos: Point, rot: number): Point[] {
  const ring: Point[] = [];
  for (let i = 0; i < CURVE_SEGMENTS; i++) {
    const t = (2 * Math.PI * i) / CURVE_SEGMENTS;
    ring.push(rotateAbout({ x: pos.x + a * Math.cos(t), y: pos.y + b * Math.sin(t) }, rot, pos));
  }
  return ring;
}

export function signedArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function oriented(ring: Point[], ccw: boolean): Point[] {
  return (signedArea(ring) > 0) === ccw ? ring : [...ring].reverse();
}

/** Material region of a component as [outer, ...holes] rings (world coords). */
export function componentRegion(comp: SectionComponent): Point[][] {
  const g = comp.geometry;
  const pos = comp.position;
  const rot = comp.rotation;
  let rings: Point[][];
  switch (comp.type) {
    case 'circle':
      rings = [ellipseRing(g.radius ?? 0, g.radius ?? 0, pos, 0)];
      break;
    case 'hollow-circle':
      rings = [ellipseRing(g.outerRadius ?? 0, g.outerRadius ?? 0, pos, 0)];
      if ((g.innerRadius ?? 0) > 0) rings.push(ellipseRing(g.innerRadius ?? 0, g.innerRadius ?? 0, pos, 0));
      break;
    case 'ellipse':
      rings = [ellipseRing((g.majorAxis ?? 200) / 2, (g.minorAxis ?? 100) / 2, pos, rot)];
      break;
    case 'box': {
      const w = g.width ?? 200;
      const h = g.height ?? 300;
      const t = g.wallThickness ?? 10;
      rings = [rectRing(w, h, pos, rot)];
      if (w - 2 * t > 0 && h - 2 * t > 0) rings.push(rectRing(w - 2 * t, h - 2 * t, pos, rot));
      break;
    }
    case 'hollow-rectangle': {
      rings = [rectRing(g.width ?? 200, g.height ?? 300, pos, rot)];
      const iw = g.innerWidth ?? 180;
      const ih = g.innerHeight ?? 280;
      if (iw > 0 && ih > 0) rings.push(rectRing(iw, ih, pos, rot));
      break;
    }
    default: {
      // Previously combined shapes carry exact rings (outer + voids).
      const stored = componentRenderRings(comp);
      rings = stored ?? [computeComponentProps(comp).outline];
    }
  }
  return rings.filter(r => r.length >= 3).map((r, i) => oriented(r, i === 0));
}

function toClip(rings: Point[][]): Polygon {
  return rings.map(ring => {
    const pairs: Pair[] = ring.map(p => [p.x, p.y]);
    pairs.push([ring[0].x, ring[0].y]);
    return pairs;
  });
}

function fromClipRing(ring: Pair[]): Point[] {
  const pts = ring.map(([x, y]) => ({ x, y }));
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12) pts.pop();
  }
  return removeCollinear(pts);
}

function removeCollinear(ring: Point[]): Point[] {
  let pts = ring;
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    const out: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      const scale = Math.hypot(b.x - a.x, b.y - a.y) * Math.hypot(c.x - b.x, c.y - b.y);
      const duplicate = Math.hypot(b.x - a.x, b.y - a.y) < 1e-12;
      if (duplicate || Math.abs(cross) <= 1e-12 * Math.max(scale, 1e-30)) {
        changed = true;
        continue;
      }
      out.push(b);
    }
    pts = out;
  }
  return pts;
}

function segmentsCross(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function bridgeIsClear(a: Point, b: Point, rings: Point[][]): boolean {
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      if (segmentsCross(a, b, p, q)) return false;
    }
  }
  return true;
}

/**
 * Join voids to the outer boundary with zero-width bridges, producing one
 * continuous closed coordinate loop. Outer must be CCW, holes CW.
 */
export function keyholeRings(outer: Point[], holes: Point[][]): Point[] {
  let merged = [...outer];
  const remaining = holes.map(h => [...h]);
  while (remaining.length > 0) {
    let best: { hi: number; hj: number; oi: number; d: number } | null = null;
    for (let hi = 0; hi < remaining.length; hi++) {
      const hole = remaining[hi];
      for (let hj = 0; hj < hole.length; hj++) {
        for (let oi = 0; oi < merged.length; oi++) {
          const d = Math.hypot(hole[hj].x - merged[oi].x, hole[hj].y - merged[oi].y);
          if (best && d >= best.d) continue;
          if (bridgeIsClear(merged[oi], hole[hj], [merged, ...remaining])) best = { hi, hj, oi, d };
        }
      }
    }
    if (!best) break; // should not happen for valid polygon-with-holes
    const hole = remaining[best.hi];
    const loop = [...hole.slice(best.hj), ...hole.slice(0, best.hj), hole[best.hj]];
    merged = [
      ...merged.slice(0, best.oi + 1),
      ...loop,
      merged[best.oi],
      ...merged.slice(best.oi + 1),
    ];
    remaining.splice(best.hi, 1);
  }
  return merged;
}

/** Exact rings (outer + voids) of a combined shape in world coordinates. */
export function componentRenderRings(comp: SectionComponent): Point[][] | null {
  const rings = comp.geometry.rings;
  if (!rings || rings.length === 0) return null;
  return rings.map(ring => ring.map(p => rotateAbout(
    { x: p.x + comp.position.x, y: p.y + comp.position.y },
    comp.rotation,
    comp.position,
  )));
}

function regionCentroid(rings: Point[][]): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      const cross = p.x * q.y - q.x * p.y;
      a += cross;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
  }
  a /= 2;
  return Math.abs(a) < 1e-18 ? rings[0][0] : { x: cx / (6 * a), y: cy / (6 * a) };
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** All components that belong to a selection (plates bring their deductions). */
export function combineMembers(components: SectionComponent[], selectedIds: string[]): SectionComponent[] {
  const ids = new Set(selectedIds);
  for (const component of components) {
    if (component.parentId && ids.has(component.parentId)
      && (component.associationKind === 'bolt-deduction' || component.associationKind === 'combined-cutout')) {
      ids.add(component.id);
    }
  }
  return components.filter(component => ids.has(component.id));
}

export type CombineOutcome =
  | { ok: true; components: SectionComponent[]; combinedId: string }
  | { ok: false; error: string };

export function combineComponents(
  components: SectionComponent[],
  selectedIds: string[],
  combinedId: string,
  name?: string,
): CombineOutcome {
  const members = combineMembers(components, selectedIds);
  const additive = members.filter(member => member.operation === 'add');
  const subtractive = members.filter(member => member.operation === 'subtract');
  if (members.length < 2 || additive.length === 0) {
    return { ok: false, error: 'Select at least two shapes (including at least one additive shape) to combine.' };
  }
  if (members.some(member => !member.visible)) {
    return { ok: false, error: 'Hidden shapes cannot be combined. Show them first or remove them from the selection.' };
  }
  const materials = new Set(additive.map(member => member.materialId));
  if (materials.size > 1) {
    return { ok: false, error: 'Shapes with different materials cannot be combined into one section.' };
  }

  const regions = additive.map(componentRegion).filter(region => region.length > 0).map(toClip);
  if (regions.length === 0) return { ok: false, error: 'The selected shapes have no area to combine.' };
  let union: MultiPolygon;
  try {
    union = clip.union(regions[0], ...regions.slice(1));
  } catch {
    return { ok: false, error: 'The boolean union failed for the selected geometry.' };
  }
  if (union.length === 0) return { ok: false, error: 'The selected shapes have no area to combine.' };
  if (union.length > 1) {
    return {
      ok: false,
      error: `The selected additive shapes form ${union.length} separate pieces. Shapes must be connected — overlapping or sharing an edge — to form one closed section (OSNAP helps place them exactly).`,
    };
  }

  const [outerPairs, ...holePairs] = union[0];
  const outer = oriented(fromClipRing(outerPairs), true);
  const holes = holePairs.map(ring => oriented(fromClipRing(ring), false)).filter(ring => ring.length >= 3);
  const center = regionCentroid([outer, ...holes]);
  const boundary = keyholeRings(outer, holes);
  const relative = (p: Point) => ({ x: p.x - center.x, y: p.y - center.y });

  const firstIndex = components.findIndex(component => members.includes(component));
  const memberIds = new Set(members.map(member => member.id));
  const combinedCount = components.filter(component => component.combinedFrom).length + 1;

  const combined: SectionComponent = {
    id: combinedId,
    name: name ?? `Combined Section ${combinedCount}`,
    type: 'custom-shape',
    geometry: {
      points: boundary.map(relative),
      rings: [outer, ...holes].map(ring => ring.map(relative)),
    },
    position: center,
    rotation: 0,
    operation: 'add',
    materialId: additive[0].materialId,
    visible: true,
    locked: false,
    combinedFrom: clone(members),
  };

  const cutouts: SectionComponent[] = subtractive.map((member, index) => {
    const { boltDeductions: _bolt, ...geometry } = member.geometry;
    void _bolt;
    return {
      ...clone(member),
      id: `${combinedId}:cutout:${index + 1}`,
      name: `${combined.name} — Cut-out ${index + 1} (${member.name})`,
      geometry,
      locked: true,
      parentId: combinedId,
      associationKind: 'combined-cutout',
      managedByParent: true,
      generatedIndex: index,
      combinedOffset: relative(member.position),
      combinedBaseRotation: member.rotation,
      combinedFrom: undefined,
    };
  });

  const result: SectionComponent[] = [];
  components.forEach((component, index) => {
    if (index === firstIndex) result.push(combined, ...cutouts);
    if (!memberIds.has(component.id)) result.push(component);
  });
  return { ok: true, components: result, combinedId };
}

export type UncombineOutcome =
  | { ok: true; components: SectionComponent[]; restoredIds: string[] }
  | { ok: false; error: string };

/** Restore the exact last uncombined state of a combined section. */
export function uncombineComponent(components: SectionComponent[], combinedId: string): UncombineOutcome {
  const combined = components.find(component => component.id === combinedId);
  if (!combined?.combinedFrom?.length) return { ok: false, error: 'This shape is not a combined section.' };
  const restored = clone(combined.combinedFrom);
  const restoredIds = new Set(restored.map(component => component.id));
  const result: SectionComponent[] = [];
  for (const component of components) {
    if (component.id === combinedId) {
      result.push(...restored);
      continue;
    }
    if (component.parentId === combinedId && component.associationKind === 'combined-cutout') continue;
    if (restoredIds.has(component.id)) continue; // defensive: never duplicate ids
    result.push(component);
  }
  return { ok: true, components: result, restoredIds: restored.map(component => component.id) };
}

/** Keep cut-outs locked to their combined section's position and rotation. */
export function synchronizeCombinedCutouts(components: SectionComponent[]): SectionComponent[] {
  const parents = new Map(components.filter(component => component.combinedFrom).map(component => [component.id, component]));
  let changed = false;
  const result: SectionComponent[] = [];
  for (const component of components) {
    if (component.associationKind !== 'combined-cutout' || !component.parentId || !component.managedByParent) {
      result.push(component);
      continue;
    }
    const parent = parents.get(component.parentId);
    if (!parent) {
      changed = true; // combined section deleted → its cut-outs go with it
      continue;
    }
    const offset = component.combinedOffset ?? { x: 0, y: 0 };
    const position = rotateAbout(
      { x: parent.position.x + offset.x, y: parent.position.y + offset.y },
      parent.rotation,
      parent.position,
    );
    const rotation = (component.combinedBaseRotation ?? 0) + parent.rotation;
    const visible = parent.visible;
    if (
      Math.abs(position.x - component.position.x) > 1e-12
      || Math.abs(position.y - component.position.y) > 1e-12
      || rotation !== component.rotation
      || visible !== component.visible
    ) {
      changed = true;
      result.push({ ...component, position, rotation, visible });
    } else {
      result.push(component);
    }
  }
  return changed ? result : components;
}
