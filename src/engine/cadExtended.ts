import { cadPathPoints, isClosedCadPath, uniqueCadVertices } from './cadPath';
import { validateStretchPolygon } from './cadStretchArea';
import { computeComponentProps } from './geometry';
import type { Point, SectionProject } from './types';
import {
  arcPoints,
  drawingEntityPoints,
  cadCreate,
  transformCadSelection,
  type CadValue,
  type DrawingEntity,
} from './cad';
import { CAD_EXTENDED_COMMANDS } from './cadExtendedCatalog';

const EPS = 1e-8;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: Point, b: Point) => distance(a, b) <= EPS;
const unit = (a: Point) => {
  const length = Math.hypot(a.x, a.y);
  if (length < EPS) throw new Error('A non-zero direction is required.');
  return mul(a, 1 / length);
};
const draft = (points: Point[], kind: DrawingEntity['kind'] = 'line'): DrawingEntity => ({
  id: crypto.randomUUID(),
  kind,
  points,
});

/** Infinite-line intersection with parameters on both input lines. */
export function intersectCadLines(a: Point, b: Point, c: Point, d: Point) {
  const u = sub(b, a),
    v = sub(d, c),
    denominator = cross(u, v);
  if (Math.hypot(u.x, u.y) < EPS || Math.hypot(v.x, v.y) < EPS)
    throw new Error('Line endpoints must be distinct.');
  if (Math.abs(denominator) < EPS * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))
    throw new Error('Lines are parallel or collinear.');
  const t = cross(sub(c, a), v) / denominator;
  return { point: add(a, mul(u, t)), t, s: cross(sub(c, a), u) / denominator };
}

export function fitCadSpline(points: Point[], closed = false): Point[] {
  if (points.length < 2) throw new Error('At least two distinct fit points are required.');
  if (points.some((p, i) => i > 0 && near(p, points[i - 1])))
    throw new Error('Consecutive fit points must differ.');
  const pts = closed && near(points[0], points.at(-1)!) ? points.slice(0, -1) : points;
  if (closed && pts.length < 3)
    throw new Error('A closed spline needs at least three fit points.');
  const result: Point[] = [];
  const at = (i: number) =>
    closed ? pts[(i + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))];
  const count = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let step = 0; step < 24; step++) {
      const t = step / 24,
        t2 = t * t,
        t3 = t2 * t;
      const coordinate = (key: 'x' | 'y') =>
        0.5 *
        (2 * p1[key] +
          (-p0[key] + p2[key]) * t +
          (2 * p0[key] - 5 * p1[key] + 4 * p2[key] - p3[key]) * t2 +
          (-p0[key] + 3 * p1[key] - 3 * p2[key] + p3[key]) * t3);
      result.push({ x: coordinate('x'), y: coordinate('y') });
    }
  }
  result.push(closed ? { ...pts[0] } : { ...pts.at(-1)! });
  return result;
}

function selectedDrafts(
  project: SectionProject,
  ids: string[],
  count?: number,
  straight = false,
): DrawingEntity[] {
  const entities = ids.map((id) => project.drawingEntities?.find((e) => e.id === id));
  if (
    !ids.length ||
    entities.some((e) => !e) ||
    (count !== undefined && ids.length !== count) ||
    entities.some(
      (e) =>
        e?.kind === 'dimension' ||
        e?.kind === 'point' ||
        e?.kind === 'text' ||
        e?.kind === 'xline' ||
        e?.kind === 'ray' ||
        (straight && (e?.kind !== 'line' || e.points.length !== 2)),
    )
  )
    throw new Error(
      `Select ${count === undefined ? 'compatible' : 'exactly ' + count} ${straight ? 'two-point draft lines' : 'draft paths'} first. Section components are not supported by this operation.`,
    );
  return entities as DrawingEntity[];
}
function replaceDrafts(
  project: SectionProject,
  removed: DrawingEntity[],
  added: DrawingEntity[],
): SectionProject {
  const ids = new Set(removed.map((e) => e.id));
  return {
    ...project,
    drawingEntities: [
      ...(project.drawingEntities ?? []).filter((e) => !ids.has(e.id)),
      ...added,
    ],
  };
}
function lineParameter(a: Point, b: Point, p: Point): number {
  const v = sub(b, a),
    length2 = dot(v, v);
  if (!length2) throw new Error('Line must have non-zero length.');
  const t = dot(sub(p, a), v) / length2;
  if (distance(add(a, mul(v, t)), p) > EPS * Math.max(1, Math.sqrt(length2)))
    throw new Error('Break points must lie on the target line.');
  return t;
}

function offset(
  project: SectionProject,
  ids: string[],
  amount: number,
  side: Point,
): SectionProject {
  if (ids.length !== 1) throw new Error('Select exactly one object to offset.');
  const component = project.components.find((c) => c.id === ids[0]);
  if (component) {
    if (
      component.locked ||
      !component.visible ||
      component.combinedFrom ||
      component.parentId ||
      component.geometry.boltDeductions
    )
      throw new Error('Select an unlocked, unassociated circle or rectangle.');
    if (!['circle', 'rectangle'].includes(component.type))
      throw new Error('Section OFFSET currently supports circles and rectangles.');
    const p = sub(side, component.position),
      radians = (-component.rotation * Math.PI) / 180;
    const local = {
      x: p.x * Math.cos(radians) - p.y * Math.sin(radians),
      y: p.x * Math.sin(radians) + p.y * Math.cos(radians),
    };
    let geometry = { ...component.geometry };
    if (component.type === 'circle') {
      const r = geometry.radius!;
      const sign = Math.hypot(p.x, p.y) >= r ? 1 : -1;
      geometry = { radius: r + sign * amount };
      if (geometry.radius! <= EPS) throw new Error('Offset would collapse the circle.');
    } else {
      const sign =
        Math.abs(local.x) >= geometry.width! / 2 || Math.abs(local.y) >= geometry.height! / 2
          ? 1
          : -1;
      geometry.width = geometry.width! + sign * amount * 2;
      geometry.height = geometry.height! + sign * amount * 2;
      if (geometry.width <= EPS || geometry.height <= EPS)
        throw new Error('Offset would collapse the rectangle.');
    }
    return {
      ...project,
      components: [
        ...project.components,
        {
          ...component,
          id: crypto.randomUUID(),
          name: component.name + ' offset',
          geometry,
        },
      ],
    };
  }
  const path = selectedDrafts(project, ids, 1)[0];
  if (path.kind === 'polyline') return offsetPath(project, path, amount, side);
  const [line] = selectedDrafts(project, ids, 1, true),
    [a, b] = line.points,
    direction = unit(sub(b, a));
  const normal = { x: -direction.y, y: direction.x },
    projection = dot(sub(side, a), normal);
  if (Math.abs(projection) < EPS) throw new Error('Choose a point off the target line.');
  const delta = mul(normal, Math.sign(projection) * amount);
  return {
    ...project,
    drawingEntities: [
      ...(project.drawingEntities ?? []),
      draft([add(a, delta), add(b, delta)]),
    ],
  };
}

/** Mitered straight-edge polyline offset; vertices are intersections of parallel edges. */
function offsetPath(
  project: SectionProject,
  entity: DrawingEntity,
  amount: number,
  side: Point,
): SectionProject {
  const closed = isClosedCadPath(entity),
    pts = closed ? uniqueCadVertices(entity.points) : entity.points;
  const edges = pts.slice(0, closed ? pts.length : -1).map((a, i) => {
    const b = pts[(i + 1) % pts.length],
      d = unit(sub(b, a));
    const t = Math.max(0, Math.min(distance(a, b), dot(sub(side, a), d)));
    return {
      a,
      b,
      n: { x: -d.y, y: d.x },
      distance: distance(side, add(a, mul(d, t))),
    };
  });
  const nearest = edges.reduce((a, b) => (a.distance <= b.distance ? a : b));
  const signed = dot(sub(side, nearest.a), nearest.n);
  if (Math.abs(signed) < EPS) throw new Error('Choose a point off the polyline.');
  const shift = Math.sign(signed) * amount;
  const shifted = edges.map((e) => ({
    a: add(e.a, mul(e.n, shift)),
    b: add(e.b, mul(e.n, shift)),
  }));
  const points = pts.map((p, i) => {
    if (!closed && i === 0) return shifted[0].a;
    if (!closed && i === pts.length - 1) return shifted.at(-1)!.b;
    const before = shifted[(i + shifted.length - 1) % shifted.length],
      after = shifted[i];
    const u = unit(sub(before.b, before.a)),
      v = unit(sub(after.b, after.a));
    if (Math.abs(cross(u, v)) < EPS && dot(u, v) > 0) return after.a;
    return intersectCadLines(before.a, before.b, after.a, after.b).point;
  });
  if (closed) validateStretchPolygon(points);
  // Reject offsets past an edge's collapse rather than returning an inverted polygon.
  if (
    edges.some(
      (e, i) => dot(sub(points[(i + 1) % points.length], points[i]), sub(e.b, e.a)) <= EPS,
    )
  )
    throw new Error('Offset would collapse or reverse a segment.');
  return {
    ...project,
    drawingEntities: [
      ...(project.drawingEntities ?? []),
      { ...entity, id: crypto.randomUUID(), points, closed },
    ],
  };
}

/** Trim a connected path against an infinite cutting line without inventing a closing edge. */
function trimPath(
  project: SectionProject,
  entity: DrawingEntity,
  a: Point,
  b: Point,
  pick: Point,
): SectionProject {
  const direction = unit(sub(b, a)),
    signed = (p: Point) => cross(direction, sub(p, a));
  const remove = signed(pick);
  if (Math.abs(remove) < EPS)
    throw new Error('Pick the side to remove, off the cutting boundary.');
  const points = cadPathPoints(entity),
    chains: Point[][] = [];
  let chain: Point[] = [];
  const flush = () => {
    if (chain.length >= 2) chains.push(chain);
    chain = [];
  };
  let crossings = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1],
      q = points[i],
      sp = signed(p),
      sq = signed(q);
    const kp = sp * Math.sign(remove) <= EPS,
      kq = sq * Math.sign(remove) <= EPS;
    if (kp && !chain.length) chain.push(p);
    if (kp !== kq) {
      const hit = add(p, mul(sub(q, p), sp / (sp - sq)));
      crossings++;
      if (kp) {
        if (!near(chain.at(-1)!, hit)) chain.push(hit);
        flush();
      } else chain = [hit];
    }
    if (kq && (!chain.length || !near(chain.at(-1)!, q))) chain.push(q);
    if (!kq) flush();
  }
  flush();
  if (
    isClosedCadPath(entity) &&
    chains.length > 1 &&
    near(chains.at(-1)!.at(-1)!, chains[0][0])
  ) {
    const last = chains.pop()!;
    chains[0] = [...last, ...chains[0].slice(1)];
  }
  if (!crossings || chains.length !== 1)
    throw new Error('Cut must leave one connected polyline; split complex paths first.');
  return replaceDrafts(project, [entity], [{ ...entity, points: chains[0], closed: false }]);
}

function roundCorner(
  project: SectionProject,
  ids: string[],
  values: CadValue[],
  chamfer: boolean,
): SectionProject {
  const [first, second] = selectedDrafts(project, ids, 2, true);
  const intersection = intersectCadLines(
    first.points[0],
    first.points[1],
    second.points[0],
    second.points[1],
  ).point;
  const picks = chamfer
    ? ([values[2], values[3]] as Point[])
    : ([values[1], values[2]] as Point[]);
  const kept = [first, second].map((line, i) => {
    if (near(picks[i], intersection))
      throw new Error('Pick the side to keep, away from the intersection.');
    const [a, b] = line.points;
    return dot(sub(a, intersection), sub(picks[i], intersection)) >
      dot(sub(b, intersection), sub(picks[i], intersection))
      ? a
      : b;
  });
  const [u, v] = kept.map((p) => unit(sub(p, intersection)));
  const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / 2;
  if (Math.sin(halfAngle) < EPS || Math.cos(halfAngle) < EPS)
    throw new Error('Cannot round parallel or collinear lines.');
  const radius = values[0] as number;
  const d1 = chamfer ? radius : radius / Math.tan(halfAngle),
    d2 = chamfer ? (values[1] as number) : d1;
  if (
    d1 >= distance(kept[0], intersection) - EPS ||
    d2 >= distance(kept[1], intersection) - EPS
  )
    throw new Error(
      'Radius or chamfer distance would consume a kept line. Choose a smaller value or farther kept endpoints.',
    );
  const t1 = add(intersection, mul(u, d1)),
    t2 = add(intersection, mul(v, d2));
  let extra: DrawingEntity;
  if (chamfer) extra = draft([t1, t2]);
  else {
    const center = add(intersection, mul(unit(add(u, v)), radius / Math.sin(halfAngle)));
    const middle = add(center, mul(unit(sub(intersection, center)), radius));
    extra = draft(arcPoints(t1, middle, t2), 'arc');
  }
  return replaceDrafts(
    project,
    [first, second],
    [{ ...first, points: [kept[0], t1] }, { ...second, points: [kept[1], t2] }, extra],
  );
}

function join(project: SectionProject, ids: string[]): SectionProject {
  const selected = selectedDrafts(project, ids);
  if (selected.length < 2) throw new Error('Select at least two connected draft paths.');
  if (selected.some(isClosedCadPath))
    throw new Error(
      'Closed polylines already form complete paths; EXPLODE first to join segments.',
    );
  const remaining = selected.slice(1),
    points = [...selected[0].points];
  while (remaining.length) {
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const path = remaining[i].points,
        first = points[0],
        last = points.at(-1)!;
      if (near(last, path[0])) points.push(...path.slice(1));
      else if (near(last, path.at(-1)!)) points.push(...path.slice(0, -1).reverse());
      else if (near(first, path.at(-1)!)) points.unshift(...path.slice(0, -1));
      else if (near(first, path[0])) points.unshift(...path.slice(1).reverse());
      else continue;
      remaining.splice(i, 1);
      found = true;
      break;
    }
    if (!found)
      throw new Error('Paths must form one connected chain; gaps and branches are not joined.');
  }
  // A vertex touched by more than two path endpoints is a branch, not a chain.
  const endpoints = selected.flatMap((e) => [e.points[0], e.points.at(-1)!]);
  if (endpoints.some((p) => endpoints.filter((q) => near(p, q)).length > 2))
    throw new Error('Branching paths cannot be joined.');
  const closed = points.length > 2 && near(points[0], points.at(-1)!);
  return replaceDrafts(project, selected, [
    { ...draft(closed ? points.slice(0, -1) : points, 'polyline'), closed },
  ]);
}

function array(
  project: SectionProject,
  ids: string[],
  values: CadValue[],
  polar: boolean,
): SectionProject {
  if (!ids.length) throw new Error('Select objects before ARRAY.');
  const count = values[0] as number,
    columns = polar ? 1 : (values[1] as number),
    total = count * columns;
  if (total < 2)
    throw new Error('Array must contain at least two items including the original.');
  if (total * ids.length > 1000)
    throw new Error('Array is limited to 1000 resulting selected objects.');
  if (polar && (!(Math.abs(values[2] as number) > 0) || Math.abs(values[2] as number) > 360))
    throw new Error('Polar sweep must be non-zero and at most ±360 degrees.');
  if (!polar && ((columns > 1 && values[2] === 0) || (count > 1 && values[3] === 0)))
    throw new Error('Repeated rows/columns need non-zero spacing.');
  let next = project;
  for (let index = 1; index < total; index++) {
    const delta = polar
      ? { x: 0, y: 0 }
      : {
          x: (index % columns) * (values[2] as number),
          y: Math.floor(index / columns) * (values[3] as number),
        };
    const previousIds = new Set(
      [...next.components, ...(next.drawingEntities ?? [])].map((e) => e.id),
    );
    next = transformCadSelection(next, ids, 'COPY', [{ x: 0, y: 0 }, delta]);
    if (polar) {
      const newIds = [...next.components, ...(next.drawingEntities ?? [])]
        .filter((e) => !previousIds.has(e.id))
        .map((e) => e.id);
      const sweep = values[2] as number,
        divisor = Math.abs(sweep) === 360 ? count : count - 1;
      next = transformCadSelection(next, newIds, 'ROTATE', [
        values[1],
        (sweep * index) / divisor,
      ]);
    }
  }
  return next;
}

/** All operations are pure project transforms, committed once by the shared store adapter. */
export function executeCadExtended(
  project: SectionProject,
  ids: string[],
  name: string,
  values: CadValue[],
  close = false,
): SectionProject {
  const spec = CAD_EXTENDED_COMMANDS.find((c) => c.name === name);
  if (!spec) throw new Error('Unknown extended command.');
  if (name !== 'SPLINE' && values.length !== spec.types.length)
    throw new Error('Missing command parameters.');
  values.forEach((value, i) => {
    const type = spec.types[Math.min(i, spec.types.length - 1)];
    if (
      type === 'point' &&
      (typeof value !== 'object' || !Number.isFinite(value.x) || !Number.isFinite(value.y))
    )
      throw new Error('Expected finite 2D coordinates.');
    if (
      ['positive', 'number', 'count'].includes(type) &&
      (typeof value !== 'number' || !Number.isFinite(value))
    )
      throw new Error('Expected a finite number.');
    if (type === 'positive' && (value as number) <= 0)
      throw new Error('Value must be positive.');
    if (
      type === 'count' &&
      (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1000)
    )
      throw new Error('Use an integer count from 1 to 1000.');
  });
  let next: SectionProject;
  if (name === 'XLINE' || name === 'RAY') {
    if (near(values[0] as Point, values[1] as Point))
      throw new Error('Construction points must differ.');
    next = {
      ...project,
      drawingEntities: [
        ...(project.drawingEntities ?? []),
        draft(values as Point[], name === 'XLINE' ? 'xline' : 'ray'),
      ],
    };
  } else if (name === 'CIRCLED')
    next = cadCreate(project, 'CIRCLE', [values[0], (values[1] as number) / 2]);
  else if (name === 'CIRCLE2P' || name === 'CIRCLE3P') {
    const a = values[0] as Point,
      b = values[1] as Point;
    let center = mul(add(a, b), 0.5),
      radius = distance(a, b) / 2;
    if (name === 'CIRCLE3P') {
      const c = values[2] as Point,
        u = sub(b, a),
        v = sub(c, a),
        denominator = 2 * cross(u, v);
      if (near(a, b) || near(a, c) || near(b, c))
        throw new Error('Three circle points must be distinct and non-collinear.');
      if (Math.abs(denominator) < EPS * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))
        throw new Error('Three circle points must be distinct and non-collinear.');
      center = add(a, {
        x: (v.y * dot(u, u) - u.y * dot(v, v)) / denominator,
        y: (u.x * dot(v, v) - v.x * dot(u, u)) / denominator,
      });
      radius = distance(center, a);
    }
    if (!(radius > EPS)) throw new Error('Circle points must be distinct.');
    next = cadCreate(project, 'CIRCLE', [center, radius]);
  } else if (name === 'SPLINE')
    next = {
      ...project,
      drawingEntities: [
        ...(project.drawingEntities ?? []),
        draft(fitCadSpline(values as Point[], close), 'polyline'),
      ],
    };
  else if (name === 'TEXT' || name === 'MTEXT') {
    const text = String(values[3])
      .replace(/^"([\s\S]*)"$/, '$1')
      .replace(/\\n/g, '\n')
      .replace(/\r/g, '');
    if (!text.trim() || text.length > 10000 || /[\x00-\x08\x0B-\x1F]/.test(text))
      throw new Error('Text must contain 1–10000 characters.');
    next = {
      ...project,
      drawingEntities: [
        ...(project.drawingEntities ?? []),
        {
          ...draft([values[0] as Point], 'text'),
          text,
          textHeight: values[1] as number,
          textRotation: values[2] as number,
        },
      ],
    };
  } else if (name === 'DONUT') {
    const inner = values[0] as number,
      outer = values[1] as number;
    if (inner < 0 || inner >= outer)
      throw new Error('Require 0 ≤ inner diameter < outer diameter.');
    next = cadCreate(project, 'CIRCLE', [values[2], outer / 2]);
    const circle = next.components.at(-1)!;
    next = {
      ...next,
      components: [
        ...next.components.slice(0, -1),
        inner === 0
          ? circle
          : {
              ...circle,
              name: 'Donut',
              type: 'hollow-circle',
              geometry: { outerRadius: outer / 2, innerRadius: inner / 2 },
            },
      ],
    };
  } else if (name === 'OFFSET')
    next = offset(project, ids, values[0] as number, values[1] as Point);
  else if (name === 'FILLET' || name === 'CHAMFER')
    next = roundCorner(project, ids, values, name === 'CHAMFER');
  else if (name === 'JOIN') next = join(project, ids);
  else if (name === 'ARRAY' || name === 'ARRAYPOLAR')
    next = array(project, ids, values, name === 'ARRAYPOLAR');
  else if (name === 'EXPLODE') {
    const paths = selectedDrafts(project, ids);
    if (paths.some((e) => e.points.length < 3))
      throw new Error('Select compound draft paths with at least three vertices.');
    const segments = paths.flatMap((e) => {
      const points = cadPathPoints(e);
      return points.slice(1).map((p, i) => draft([points[i], p]));
    });
    if (segments.length > 5000)
      throw new Error('Explode is limited to 5000 segments per operation.');
    next = replaceDrafts(project, paths, segments);
  } else if (name === 'OVERKILL') {
    const paths = selectedDrafts(project, ids),
      kept: DrawingEntity[] = [],
      removed: DrawingEntity[] = [];
    const same = (a: DrawingEntity, b: DrawingEntity) =>
      a.kind === b.kind &&
      isClosedCadPath(a) === isClosedCadPath(b) &&
      a.points.length === b.points.length &&
      (a.points.every((p, i) => p.x === b.points[i].x && p.y === b.points[i].y) ||
        a.points.every(
          (p, i) => p.x === b.points.at(-1 - i)!.x && p.y === b.points.at(-1 - i)!.y,
        ));
    for (const entity of paths) {
      if (kept.some((e) => same(e, entity))) removed.push(entity);
      else kept.push(entity);
    }
    if (!removed.length) throw new Error('No exact duplicate draft paths found.');
    next = replaceDrafts(project, removed, []);
  } else if (name === 'TRIM' && selectedDrafts(project, ids, 1)[0].kind === 'polyline') {
    next = trimPath(
      project,
      selectedDrafts(project, ids, 1)[0],
      values[0] as Point,
      values[1] as Point,
      values[2] as Point,
    );
  } else {
    const [line] = selectedDrafts(project, ids, 1, true),
      [a, b] = line.points;
    if (name === 'TRIM' || name === 'EXTEND') {
      const cut = intersectCadLines(a, b, values[0] as Point, values[1] as Point),
        pick = values[2] as Point;
      if (name === 'TRIM') {
        if (cut.t <= EPS || cut.t >= 1 - EPS)
          throw new Error('Cutting boundary must cross the interior of the target.');
        const side = dot(sub(pick, cut.point), sub(b, a));
        if (Math.abs(side) < EPS)
          throw new Error('Pick the part to remove, not the intersection.');
        next = replaceDrafts(
          project,
          [line],
          [{ ...line, points: side < 0 ? [cut.point, b] : [a, cut.point] }],
        );
      } else {
        const first = distance(pick, a) <= distance(pick, b);
        if ((first && cut.t >= -EPS) || (!first && cut.t <= 1 + EPS))
          throw new Error('Boundary must lie beyond the picked endpoint; use TRIM to shorten.');
        next = replaceDrafts(
          project,
          [line],
          [{ ...line, points: first ? [cut.point, b] : [a, cut.point] }],
        );
      }
    } else if (name === 'LENGTHEN') {
      const length = values[0] as number,
        pick = values[1] as Point,
        first = distance(pick, a) <= distance(pick, b),
        direction = unit(sub(b, a));
      next = replaceDrafts(
        project,
        [line],
        [
          {
            ...line,
            points: first
              ? [add(b, mul(direction, -length)), b]
              : [a, add(a, mul(direction, length))],
          },
        ],
      );
    } else if (name === 'BREAK') {
      const ts = [
        lineParameter(a, b, values[0] as Point),
        lineParameter(a, b, values[1] as Point),
      ].sort((a, b) => a - b);
      if (ts[0] < -EPS || ts[1] > 1 + EPS || ts[1] - ts[0] < EPS)
        throw new Error('Specify two different points within the target segment.');
      const direction = sub(b, a),
        parts: DrawingEntity[] = [];
      if (ts[0] > EPS) parts.push(draft([a, add(a, mul(direction, ts[0]))]));
      if (ts[1] < 1 - EPS) parts.push(draft([add(a, mul(direction, ts[1])), b]));
      next = replaceDrafts(project, [line], parts);
    } else throw new Error('Unknown extended command.');
  }
  const points = [
    ...next.components.flatMap((c) => [c.position, ...computeComponentProps(c).outline]),
    ...(next.drawingEntities ?? []).flatMap(drawingEntityPoints),
  ];
  if (
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        Math.abs(p.x) > 1e12 ||
        Math.abs(p.y) > 1e12,
    )
  )
    throw new Error('Operation exceeds the supported coordinate range (±1e12).');
  return next;
}
export const isExtendedCadCommand = (name: string) =>
  CAD_EXTENDED_COMMANDS.some((c) => c.name === name);
