import type { Point, SectionComponent } from './types';
import { segmentsIntersect } from './geometry';
import { inStretchArea } from './cadStretchArea';
import {
  combinedMembersInWorld,
  rebuildCombinedComponent as rebuild,
  componentRegion,
  groupRings,
  keyholeAll,
  sameComponentMaterial,
  signedArea,
} from './combine';

const EPS = 1e-8;
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const polygonal = (c: SectionComponent) =>
  ['rectangle', 'triangle', 'polygon', 'custom-shape'].includes(c.type);

type Node = { component: SectionComponent; rings: Point[][]; members?: Node[]; fixed: boolean };
type Edge = { node: Node; ring: number; index: number; a: Point; b: Point; points: Point[] };

/** Real source vertices (including junctions internal to a combined outline). */
export function stretchComponentVertices(components: SectionComponent[]): Point[] {
  return components
    .filter((c) => c.visible && !c.locked)
    .flatMap((c) => {
      try {
        return c.combinedFrom
          ? stretchComponentVertices(combinedMembersInWorld(c))
          : componentRegion(c).flat(2);
      } catch {
        return componentRegion(c).flat(2);
      } // Preview errors are reported by the command, not by rendering.
    });
}

function validateRing(points: Point[]): void {
  if (points.length < 3) throw new Error('Stretch would collapse a plate boundary.');
  let area = 0;
  const origin = points[0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (![a.x, a.y].every(Number.isFinite) || Math.abs(a.x) > 1e12 || Math.abs(a.y) > 1e12)
      throw new Error('Stretch exceeds the supported coordinate range.');
    if (same(a, b)) throw new Error('Stretch would collapse a plate edge.');
    area += cross(sub(a, origin), sub(b, origin));
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length]))
        throw new Error('Stretch would make a plate boundary cross or touch itself.');
    }
  }
  if (Math.abs(area) < 1e-9) throw new Error('Stretch would collapse a plate area.');
}

function validateRings(before: Point[][], after: Point[][]): void {
  after.forEach((ring, i) => {
    validateRing(ring);
    if (signedArea(ring) > 0 !== signedArea(before[i]) > 0)
      throw new Error('Stretch would invert a plate boundary.');
  });
  for (let i = 0; i < after.length; i++)
    for (let j = i + 1; j < after.length; j++) {
      for (let p = 0; p < after[i].length; p++)
        for (let q = 0; q < after[j].length; q++) {
          if (
            segmentsIntersect(
              after[i][p],
              after[i][(p + 1) % after[i].length],
              after[j][q],
              after[j][(q + 1) % after[j].length],
            )
          )
            throw new Error('Stretch would intersect plate boundaries or a cutout.');
        }
    }
  for (let i = 0; i < after.length; i++)
    for (let j = i + 1; j < after.length; j++) {
      if (
        signedArea(after[i]) > 0 === signedArea(after[j]) > 0 &&
        (inStretchArea(after[i][0], { kind: 'polygon', points: after[j] }) ||
          inStretchArea(after[j][0], { kind: 'polygon', points: after[i] }))
      )
        throw new Error('Stretch would overlap plate regions or cutouts.');
    }
  const polygons = groupRings(after);
  if (polygons.flat().length !== after.length || polygons.length !== groupRings(before).length)
    throw new Error('Stretch would move a cutout outside its plate.');
}

/**
 * Insert common boundary nodes before applying one world-coordinate vertex mask.
 * In particular, web endpoints on the interior of a flange edge must participate
 * in BOTH plates. These are real polygon vertices, not a second geometry model.
 */
export function stretchPlateComponents(
  components: SectionComponent[],
  inside: (p: Point) => boolean,
  move: (p: Point) => Point,
): { components: SectionComponent[]; count: number } {
  const leaves: Node[] = [];
  const prepare = (component: SectionComponent, fixed = false): Node => {
    const node: Node = {
      component,
      rings: componentRegion(component).flat(),
      fixed: fixed || component.locked || !component.visible,
    };
    if (component.combinedFrom && !node.fixed) {
      const sources = combinedMembersInWorld(component);
      node.members = sources.map((c) => prepare(c));
    } else leaves.push(node);
    return node;
  };
  const roots = components.map((c) => prepare(c));
  const edges: Edge[] = [];
  for (const node of leaves) {
    if (!polygonal(node.component) || node.component.combinedFrom || !node.component.visible)
      continue;
    node.rings.forEach((ring, r) =>
      ring.forEach((a, i) =>
        edges.push({ node, ring: r, index: i, a, b: ring[(i + 1) % ring.length], points: [a] }),
      ),
    );
  }
  const onEdge = (p: Point, e: Edge) => {
    const d = sub(e.b, e.a),
      v = sub(p, e.a),
      length = Math.hypot(d.x, d.y);
    return (
      length > EPS &&
      Math.abs(cross(d, v)) <= EPS * length &&
      v.x * d.x + v.y * d.y >= -EPS * length &&
      v.x * d.x + v.y * d.y <= length * length + EPS * length
    );
  };
  const contacts: { a: Node; b: Node; p: Point }[] = [];
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const e = edges[i],
        f = edges[j];
      if (e.node === f.node) continue;
      if (
        Math.max(e.a.x, e.b.x) + EPS < Math.min(f.a.x, f.b.x) ||
        Math.max(f.a.x, f.b.x) + EPS < Math.min(e.a.x, e.b.x) ||
        Math.max(e.a.y, e.b.y) + EPS < Math.min(f.a.y, f.b.y) ||
        Math.max(f.a.y, f.b.y) + EPS < Math.min(e.a.y, e.b.y)
      )
        continue;
      const points = [e.a, e.b, f.a, f.b].filter((p) => onEdge(p, e) && onEdge(p, f));
      const u = sub(e.b, e.a),
        v = sub(f.b, f.a),
        denominator = cross(u, v);
      if (Math.abs(denominator) > 1e-12 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) {
        const t = cross(sub(f.a, e.a), v) / denominator;
        const p = { x: e.a.x + t * u.x, y: e.a.y + t * u.y };
        if (onEdge(p, e) && onEdge(p, f)) points.push(p);
      }
      for (const p of points) {
        if (!e.points.some((q) => same(p, q))) e.points.push(p);
        if (!f.points.some((q) => same(p, q))) f.points.push(p);
        contacts.push({ a: e.node, b: f.node, p });
      }
    }
  // Sort along each original edge and omit its final point (the next edge owns it).
  for (const e of edges) {
    const d = sub(e.b, e.a);
    e.points = e.points
      .filter((p) => !same(p, e.b))
      .sort((p, q) => (p.x - q.x) * d.x + (p.y - q.y) * d.y);
  }
  const noded = new Map<Node, Point[][]>();
  for (const node of leaves) {
    if (edges.some((e) => e.node === node))
      noded.set(
        node,
        node.rings.map((_, r) =>
          edges.filter((e) => e.node === node && e.ring === r).flatMap((e) => e.points),
        ),
      );
  }
  for (const contact of contacts) {
    if (inside(contact.p) && contact.a.fixed !== contact.b.fixed)
      throw new Error(
        'Stretch would detach a connected locked or hidden plate; unlock/show it first.',
      );
  }
  // Keep junction vertices on every connected plate, including an unchanged
  // bottom flange. Otherwise a later rotation can turn a T-junction into a
  // numerically non-coincident edge even though the current union looks correct.
  const active = new Set(
    leaves.filter((node) => !node.fixed && (noded.get(node) ?? node.rings).flat().some(inside)),
  );
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const { a, b } of contacts) {
      if (a.fixed || b.fixed || (!active.has(a) && !active.has(b))) continue;
      if (!active.has(a) || !active.has(b)) {
        active.add(a);
        active.add(b);
        expanded = true;
      }
    }
  }
  const baseline = (node: Node): SectionComponent => {
    if (node.members) return rebuild(node.component, node.members.map(baseline));
    const rings = noded.get(node);
    if (!rings) return node.component;
    return {
      ...node.component,
      type: 'custom-shape',
      position: { x: 0, y: 0 },
      rotation: 0,
      geometry: { ...node.component.geometry, points: keyholeAll(rings), rings },
    };
  };
  let count = 0;
  const update = (node: Node): SectionComponent => {
    const c = node.component;
    if (node.fixed) return c;
    if (node.members) {
      const members = node.members.map(update);
      if (members.every((member, i) => member === node.members![i].component)) return c;
      // Do not silently restore voids/edits that were made only on the parent outline.
      const original = rebuild(c, node.members.map(baseline));
      if (!sameComponentMaterial(c, original))
        throw new Error(
          'Combined boundary has independent edits; uncombine its source plates before stretching.',
        );
      return rebuild(c, members);
    }
    const rings = noded.get(node) ?? node.rings,
      points = rings.flat();
    const selected = points.some(inside);
    const addedJunctions = rings.some((ring, i) => ring.length !== node.rings[i].length);
    if (!selected && (!addedJunctions || !active.has(node))) return c;
    if (c.parentId || c.geometry.boltDeductions)
      throw new Error('Use existing tools for associated bolt deductions.');
    if (selected) count++;
    if (points.every(inside) && !addedJunctions) return { ...c, position: move(c.position) };
    if (!polygonal(c))
      throw new Error(
        'Partial STRETCH supports polygonal plates; enclose curved/hollow primitives fully to move them.',
      );
    const stretched = rings.map((r) => r.map((p) => (inside(p) ? move(p) : p)));
    validateRings(rings, stretched);
    return {
      ...c,
      type: 'custom-shape',
      position: { x: 0, y: 0 },
      rotation: 0,
      geometry: { points: keyholeAll(stretched), rings: stretched },
    };
  };
  return { components: roots.map(update), count };
}
