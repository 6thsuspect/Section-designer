import type { DrawingEntity } from './cad';
import type { Point, SectionProject } from './types';
import { segmentsIntersect } from './geometry';
import { isClosedCadPath, uniqueCadVertices } from './cadPath';

export interface CadRegion {
  fill: 'solid';
  area: number;
}

/** A translated shoelace sum avoids cancellation far from the world origin. */
export function polygonRegionArea(points: Point[]): number {
  const origin = points[0];
  if (!origin) return 0;
  return (
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + (p.x - origin.x) * (q.y - origin.y) - (q.x - origin.x) * (p.y - origin.y);
      }, 0),
    ) / 2
  );
}

/** Validate the material boundary, including adjacent backtracking edges. */
export function validateCadRegion(points: Point[]): number {
  if (
    points.length < 3 ||
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        Math.abs(p.x) > 1e12 ||
        Math.abs(p.y) > 1e12,
    )
  )
    throw new Error('A closed region needs at least three finite vertices.');
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      previous = points[(i + points.length - 1) % points.length];
    const u = { x: a.x - previous.x, y: a.y - previous.y },
      v = { x: b.x - a.x, y: b.y - a.y };
    if (Math.hypot(v.x, v.y) <= 1e-8)
      throw new Error(
        'A closed region must not contain duplicate vertices or zero-length edges.',
      );
    if (
      Math.abs(u.x * v.y - u.y * v.x) <= 1e-10 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y) &&
      u.x * v.x + u.y * v.y < 0
    )
      throw new Error('A closed boundary must not overlap itself.');
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (segmentsIntersect(a, b, points[j], points[(j + 1) % points.length]))
        throw new Error('A closed boundary must not cross or touch itself.');
    }
  }
  const area = polygonRegionArea(points);
  if (area < 1e-9) throw new Error('A closed region must have non-zero area.');
  return area;
}

/** Geometry, not imported/cached area metadata, decides whether a region exists. */
export function cadRegion(entity: DrawingEntity): CadRegion | null {
  if (!isClosedCadPath(entity)) return null;
  try {
    return { fill: 'solid', area: validateCadRegion(uniqueCadVertices(entity.points)) };
  } catch {
    return null;
  }
}

export function synchronizeCadRegion(entity: DrawingEntity): DrawingEntity {
  const region = cadRegion(entity);
  if (!region) {
    if (!entity.region) return entity;
    const next = { ...entity };
    delete next.region;
    return next;
  }
  const points = uniqueCadVertices(entity.points);
  if (
    entity.kind === 'polyline' &&
    entity.closed === true &&
    points === entity.points &&
    entity.region?.fill === 'solid' &&
    entity.region.area === region.area
  )
    return entity;
  return { ...entity, kind: 'polyline', closed: true, points, region };
}

/** One canonical cache refresh shared by commands, direct canvas edits and persistence. */
export function synchronizeCadRegions(project: SectionProject): SectionProject {
  const entities = project.drawingEntities;
  if (!entities) return project;
  const next = entities.map(synchronizeCadRegion);
  return next.every((entity, i) => entity === entities[i])
    ? project
    : { ...project, drawingEntities: next };
}

/** Ear clipping for R12 SOLID export. SVG renders the original polygon directly. */
export function triangulateCadRegion(vertices: Point[]): [Point, Point, Point][] {
  validateCadRegion(vertices);
  const points = [...vertices];
  const turn = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const side = (a: Point, b: Point, c: Point) => {
    const value = turn(a, b, c);
    const error =
      Number.EPSILON *
      16 *
      (Math.abs((b.x - a.x) * (c.y - a.y)) + Math.abs((b.y - a.y) * (c.x - a.x)));
    return Math.abs(value) <= error ? 0 : Math.sign(value);
  };
  // Collinear junctions remain in the boundary, but need no degenerate fill triangles.
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      if (
        side(
          points[(i + points.length - 1) % points.length],
          points[i],
          points[(i + 1) % points.length],
        ) === 0
      ) {
        points.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  const origin = points[0];
  const signed = points.reduce((s, p, i) => {
    const q = points[(i + 1) % points.length];
    return s + (p.x - origin.x) * (q.y - origin.y) - (q.x - origin.x) * (p.y - origin.y);
  }, 0);
  if (signed < 0) points.reverse();
  const triangles: [Point, Point, Point][] = [];
  while (points.length > 3) {
    let found = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length];
      if (side(a, b, c) <= 0) continue;
      if (
        points.some(
          (p) =>
            p !== a &&
            p !== b &&
            p !== c &&
            side(a, b, p) >= 0 &&
            side(b, c, p) >= 0 &&
            side(c, a, p) >= 0,
        )
      )
        continue;
      triangles.push([a, b, c]);
      points.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw new Error('Unable to triangulate the closed region safely.');
  }
  triangles.push(points as [Point, Point, Point]);
  return triangles;
}
