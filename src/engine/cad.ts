import type { Point, SectionComponent, SectionProject, LengthUnit } from './types';
import { computeComponentProps, segmentsIntersect, pointInRect } from './geometry';
import { componentRegion, keyholeAll, signedArea } from './combine';

export interface DrawingEntity {
  id: string;
  kind: 'line' | 'polyline' | 'arc' | 'point';
  points: Point[];
}
export interface CadCommand {
  name: string;
  aliases: string[];
  help: string;
  prompts: string[];
  types: ('point' | 'positive' | 'number' | 'integer' | 'text')[];
}
const command = (
  name: string,
  aliases: string,
  help: string,
  prompts: string[],
  types: CadCommand['types'],
): CadCommand => ({ name, aliases: aliases.split(' ').filter(Boolean), help, prompts, types });
export const CAD_COMMANDS: CadCommand[] = [
  command(
    'LINE',
    'L',
    'Connected line segments; Enter finishes, Close closes, Undo removes last point.',
    ['Specify first point:', 'Specify next point or [Undo/Close] (Enter finishes):'],
    ['point', 'point'],
  ),
  command(
    'PLINE',
    'PL',
    'Connected polyline; Close creates a section boundary.',
    ['Specify first point:', 'Specify next point or [Undo/Close] (Enter finishes):'],
    ['point', 'point'],
  ),
  command(
    'RECTANGLE',
    'REC',
    'Section rectangle from opposite corners.',
    ['Specify first corner:', 'Specify opposite corner:'],
    ['point', 'point'],
  ),
  command(
    'CIRCLE',
    'C',
    'Section circle from center and radius.',
    ['Specify center:', 'Specify radius:'],
    ['point', 'positive'],
  ),
  command(
    'ELLIPSE',
    'EL',
    'Axis-aligned section ellipse: center, horizontal and vertical semi-axes.',
    ['Specify center:', 'Horizontal semi-axis:', 'Vertical semi-axis:'],
    ['point', 'positive', 'positive'],
  ),
  command(
    'POLYGON',
    'POL',
    'Regular section polygon, inscribed in a circle; first vertex at +X.',
    ['Number of sides (3–1024):', 'Specify center:', 'Circumradius:'],
    ['integer', 'point', 'positive'],
  ),
  command(
    'ARC',
    '',
    'Draft arc through start, intermediate and end points.',
    ['Start point:', 'Point on arc:', 'End point:'],
    ['point', 'point', 'point'],
  ),
  command(
    'POINT',
    'PO',
    'Draft point (not included in section properties).',
    ['Specify point:'],
    ['point'],
  ),
  command(
    'MOVE',
    'M',
    'Move unlocked selected geometry by base and destination points.',
    ['Base point:', 'Destination point:'],
    ['point', 'point'],
  ),
  command(
    'COPY',
    'CO',
    'Copy unlocked selected geometry by base and destination points.',
    ['Base point:', 'Destination point:'],
    ['point', 'point'],
  ),
  command(
    'ROTATE',
    'RO',
    'Rotate unlocked selection about a base point, CCW degrees.',
    ['Base point:', 'Angle in degrees:'],
    ['point', 'number'],
  ),
  command(
    'SCALE',
    'SC',
    'Uniformly scale unlocked selection about a base point.',
    ['Base point:', 'Positive scale factor:'],
    ['point', 'positive'],
  ),
  command(
    'MIRROR',
    'MI',
    'Reflect selected geometry; retain originals. Mirrored curves become 256-segment polygons.',
    ['First axis point:', 'Second axis point:'],
    ['point', 'point'],
  ),
  command(
    'DIST',
    '',
    'Measure distance between points.',
    ['First point:', 'Second point:'],
    ['point', 'point'],
  ),
  command('ID', '', 'Report coordinates.', ['Specify point:'], ['point']),
  command(
    'SELECT',
    '',
    'ALL, NONE, an object ID, or WINDOW then two corners.',
    ['ALL / NONE / object ID / WINDOW:'],
    ['text'],
  ),
  command('AREA', '', 'Area and perimeter of selected section components.', [], []),
  command('LIST', '', 'List selected object IDs, geometry and locations.', [], []),
  command('ERASE', 'E', 'Delete unlocked selected geometry.', [], []),
  command(
    'BOUNDARY',
    'BO',
    'Convert one selected closed draft polyline into a section boundary.',
    [],
    [],
  ),
  command('UNDO', 'U', 'Undo one project operation.', [], []),
  command('REDO', '', 'Redo one project operation.', [], []),
  command('ZOOM', 'Z', 'Extents, In, Out or Reset.', ['Extents / In / Out / Reset:'], ['text']),
  command(
    'PAN',
    '',
    'Translate the viewport by a drawing-space displacement.',
    ['Displacement x,y:'],
    ['point'],
  ),
  ...['GRID', 'OSNAP', 'ORTHO', 'SNAP', 'POLAR'].map((name) =>
    command(
      name,
      '',
      `${name}: ON, OFF or toggle. SNAP uses GRID spacing; POLAR tracks 45° increments.`,
      ['ON / OFF / Toggle:'],
      ['text'],
    ),
  ),
  command(
    'GRIDSPACING',
    '',
    'Set CAD grid and grid-snap spacing in drawing units.',
    ['Positive grid spacing:'],
    ['positive'],
  ),
  command(
    'UNITS',
    '',
    'Set unit label without rescaling existing geometry.',
    ['mm / cm / m / inch / ft:'],
    ['text'],
  ),
  command('REGEN', '', 'Recompute section properties.', [], []),
  command('SAVE', '', 'Open the existing save dialog.', [], []),
  command('OPEN', '', 'Open the existing load dialog.', [], []),
  command('HELP', '', 'List supported commands and aliases.', [], []),
  command('CANCEL', 'ESC', 'Cancel incomplete input without changing completed geometry.', [], []),
];
export const findCadCommand = (text: string) =>
  CAD_COMMANDS.find((c) => c.name === text.toUpperCase() || c.aliases.includes(text.toUpperCase()));
const mm: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4, ft: 304.8 };
export function cadNumber(text: string, unit: LengthUnit, dimensional = true): number {
  const match = text
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|m|inch|in|ft)?$/i);
  if (!match)
    throw new Error('Expected a finite number, optionally followed by mm, cm, m, inch or ft.');
  if (match[2] && !dimensional)
    throw new Error('Angles, counts and scale factors must not have length units.');
  const suffix = match[2]?.toLowerCase();
  const n =
    Number(match[1]) *
    (suffix ? mm[(suffix === 'in' ? 'inch' : suffix) as LengthUnit] / mm[unit] : 1);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12)
    throw new Error('Number exceeds the supported precision range (±1e12).');
  return n;
}
export function cadPoint(text: string, previous: Point | undefined, unit: LengthUnit): Point {
  const relative = text.startsWith('@');
  const input = relative ? text.slice(1) : text;
  if (relative && !previous) throw new Error('Relative input requires a previous point.');
  let p: Point;
  if (input.includes('<')) {
    if (!relative) throw new Error('Polar coordinates must start with @.');
    const parts = input.split('<');
    if (parts.length !== 2) throw new Error('Use @distance<angle.');
    const distance = cadNumber(parts[0], unit),
      angle = (cadNumber(parts[1], unit, false) * Math.PI) / 180;
    p = { x: distance * Math.cos(angle), y: distance * Math.sin(angle) };
  } else {
    const parts = input.split(',');
    if (parts.length < 2 || parts.length > 3)
      throw new Error('Use x,y, x,y,0, @dx,dy or @distance<angle.');
    if (parts.length === 3 && cadNumber(parts[2], unit) !== 0)
      throw new Error('This is a 2D drawing: Z must be zero.');
    p = { x: cadNumber(parts[0], unit), y: cadNumber(parts[1], unit) };
  }
  return relative ? { x: previous!.x + p.x, y: previous!.y + p.y } : p;
}
export type CadValue = Point | number | string;
export interface CadSession {
  command: CadCommand;
  values: CadValue[];
}
export function cadPrompt(session: CadSession): string {
  return session.command.prompts[
    Math.min(session.values.length, session.command.prompts.length - 1)
  ];
}
export function parseCadValue(session: CadSession, input: string, unit: LengthUnit): CadValue {
  const { command: c, values } = session;
  const type = c.types[Math.min(values.length, c.types.length - 1)];
  if (type === 'text') return input.trim();
  if (type === 'point')
    return cadPoint(
      input.trim(),
      [...values].reverse().find((v) => typeof v === 'object') as Point | undefined,
      unit,
    );
  const n = cadNumber(
    input,
    unit,
    !['ROTATE', 'SCALE', 'POLYGON'].includes(c.name) || (c.name === 'POLYGON' && values.length > 0),
  );
  if ((type === 'positive' || type === 'integer') && n <= 0)
    throw new Error('Value must be greater than zero.');
  if (type === 'integer' && (!Number.isInteger(n) || n < 3 || n > 1024))
    throw new Error('Use an integer from 3 to 1024.');
  return n;
}
export function arcPoints(a: Point, b: Point, c: Point): Point[] {
  // Translate first to avoid cancellation for geometry far from the origin.
  const bx = b.x - a.x,
    by = b.y - a.y,
    cx = c.x - a.x,
    cy = c.y - a.y;
  const d = 2 * (bx * cy - by * cx);
  if (Math.abs(d) < 1e-10) throw new Error('Arc points must be distinct and non-collinear.');
  const ux = (cy * (bx * bx + by * by) - by * (cx * cx + cy * cy)) / d;
  const uy = (bx * (cx * cx + cy * cy) - cx * (bx * bx + by * by)) / d;
  const center = { x: a.x + ux, y: a.y + uy },
    r = Math.hypot(ux, uy);
  const angle = (p: Point) => Math.atan2(p.y - center.y, p.x - center.x);
  const tau = Math.PI * 2,
    norm = (n: number) => ((n % tau) + tau) % tau;
  const start = angle(a),
    end = norm(angle(c) - start),
    middle = norm(angle(b) - start);
  const sweep = middle < end ? end : end - tau;
  const count = Math.max(8, Math.ceil((Math.abs(sweep) / tau) * 256));
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: center.x + r * Math.cos(start + (sweep * i) / count),
    y: center.y + r * Math.sin(start + (sweep * i) / count),
  }));
}
const id = () => globalThis.crypto.randomUUID();
export function sectionShape(
  project: SectionProject,
  name: string,
  points: Point[],
): SectionComponent {
  return {
    id: id(),
    name,
    type: 'custom-shape',
    geometry: { points },
    position: { x: 0, y: 0 },
    rotation: 0,
    operation: 'add',
    materialId: project.materials[0]?.id ?? 'steel-default',
    visible: true,
    locked: false,
  };
}
export function cadCreate(
  project: SectionProject,
  name: string,
  v: CadValue[],
  close = false,
): SectionProject {
  const a = v[0] as Point,
    b = v[1] as Point;
  let comp: SectionComponent | undefined, draft: DrawingEntity | undefined;
  const base = sectionShape(project, name, []);
  if (name === 'RECTANGLE') {
    const w = Math.abs(b.x - a.x),
      h = Math.abs(b.y - a.y);
    if (!w || !h) throw new Error('Rectangle width and height must be non-zero.');
    comp = {
      ...base,
      type: 'rectangle',
      position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      geometry: { width: w, height: h },
    };
  } else if (name === 'CIRCLE')
    comp = { ...base, type: 'circle', position: a, geometry: { radius: v[1] as number } };
  else if (name === 'ELLIPSE')
    comp = {
      ...base,
      type: 'ellipse',
      position: a,
      geometry: { majorAxis: (v[1] as number) * 2, minorAxis: (v[2] as number) * 2 },
    };
  else if (name === 'POLYGON') {
    const n = v[0] as number,
      center = v[1] as Point,
      r = v[2] as number;
    comp = sectionShape(
      project,
      name,
      Array.from({ length: n }, (_, i) => ({
        x: center.x + r * Math.cos((i * 2 * Math.PI) / n),
        y: center.y + r * Math.sin((i * 2 * Math.PI) / n),
      })),
    );
  } else if (name === 'POINT') draft = { id: id(), kind: 'point', points: [a] };
  else if (name === 'ARC')
    draft = { id: id(), kind: 'arc', points: arcPoints(a, b, v[2] as Point) };
  else {
    let points = v as Point[];
    if (
      close &&
      points.length > 2 &&
      points[0].x === points.at(-1)!.x &&
      points[0].y === points.at(-1)!.y
    )
      points = points.slice(0, -1);
    if (points.length < (close ? 3 : 2))
      throw new Error(
        close
          ? 'At least three points are required to close.'
          : 'At least two points are required.',
      );
    if (points.some((p, i) => i > 0 && p.x === points[i - 1].x && p.y === points[i - 1].y))
      throw new Error('Consecutive points must be different.');
    if (close && name === 'PLINE') {
      for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++) {
          if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
          if (
            segmentsIntersect(
              points[i],
              points[(i + 1) % points.length],
              points[j],
              points[(j + 1) % points.length],
            )
          )
            throw new Error('A section boundary must not cross or touch itself.');
        }
      const area = points.reduce((s, p, i) => {
        const q = points[(i + 1) % points.length];
        return s + p.x * q.y - q.x * p.y;
      }, 0);
      if (Math.abs(area) < 1e-9) throw new Error('A closed section must have non-zero area.');
      comp = sectionShape(project, name, points);
    } else
      draft = {
        id: id(),
        kind: name === 'LINE' ? 'line' : 'polyline',
        points: close ? [...points, points[0]] : points,
      };
  }
  return {
    ...project,
    components: comp ? [...project.components, comp] : project.components,
    drawingEntities: draft ? [...(project.drawingEntities ?? []), draft] : project.drawingEntities,
  };
}
export function transformCadSelection(
  project: SectionProject,
  ids: string[],
  name: string,
  values: CadValue[],
): SectionProject {
  const a = values[0] as Point,
    b = values[1] as Point;
  if (name === 'SCALE' && (!(Number(values[1]) > 0) || !Number.isFinite(Number(values[1]))))
    throw new Error('Scale factor must be finite and positive.');
  const copy = name === 'COPY' || name === 'MIRROR';
  const theta =
    name === 'ROTATE'
      ? ((values[1] as number) * Math.PI) / 180
      : name === 'MIRROR'
        ? Math.atan2(b.y - a.y, b.x - a.x)
        : 0;
  if (name === 'MIRROR' && a.x === b.x && a.y === b.y)
    throw new Error('Mirror axis points must be distinct.');
  const map = (p: Point): Point => {
    if (name === 'MOVE' || name === 'COPY') return { x: p.x + b.x - a.x, y: p.y + b.y - a.y };
    if (name === 'SCALE')
      return {
        x: a.x + (p.x - a.x) * (values[1] as number),
        y: a.y + (p.y - a.y) * (values[1] as number),
      };
    const angle =
      name === 'MIRROR'
        ? 2 * theta - Math.atan2(p.y - a.y, p.x - a.x)
        : Math.atan2(p.y - a.y, p.x - a.x) + theta;
    const r = Math.hypot(p.x - a.x, p.y - a.y);
    return { x: a.x + r * Math.cos(angle), y: a.y + r * Math.sin(angle) };
  };
  const selected = project.components.filter((c) => ids.includes(c.id) && !c.locked);
  if (selected.some((c) => c.combinedFrom || c.parentId || c.geometry.boltDeductions))
    throw new Error(
      'Associated/combined components must be uncombined or edited with the existing component tools first.',
    );
  const selectedDrafts = (project.drawingEntities ?? []).filter((c) => ids.includes(c.id));
  if (!selected.length && !selectedDrafts.length)
    throw new Error('Select unlocked objects first (click, window or SELECT).');
  // Preserve analytic primitives for movement/rotation. Mirroring uses
  // polygon rings (curves tessellated), preserving holes and cutout operation.
  const changed = selected.map((c) => {
    if (name === 'MOVE' || name === 'COPY' || name === 'ROTATE')
      return {
        ...c,
        id: copy ? id() : c.id,
        position: map(c.position),
        rotation: c.rotation + (name === 'ROTATE' ? (values[1] as number) : 0),
      };
    if (name === 'SCALE') {
      const factor = values[1] as number;
      const scalePoint = (p: Point) => ({ x: p.x * factor, y: p.y * factor });
      const geometry = { ...c.geometry };
      for (const key of Object.keys(geometry) as (keyof typeof geometry)[]) {
        if (typeof geometry[key] === 'number')
          (geometry as Record<string, unknown>)[key] = (geometry[key] as number) * factor;
      }
      if (geometry.points) geometry.points = geometry.points.map(scalePoint);
      if (geometry.vertices)
        geometry.vertices = geometry.vertices.map(scalePoint) as [Point, Point, Point];
      if (geometry.rings) geometry.rings = geometry.rings.map((r) => r.map(scalePoint));
      return { ...c, position: map(c.position), geometry };
    }
    const rings = componentWorldRings(c).map((r) => {
      const transformed = r.map(map);
      return signedArea(transformed) > 0 === signedArea(r) > 0
        ? transformed
        : transformed.reverse();
    });
    return {
      ...sectionShape(project, c.name, rings[0]),
      id: copy ? id() : c.id,
      operation: c.operation,
      materialId: c.materialId,
      visible: c.visible,
      geometry: { points: keyholeAll(rings), rings },
    };
  });
  const drafts = selectedDrafts.map((e) => ({
    ...e,
    id: copy ? id() : e.id,
    points: e.points.map(map),
  }));
  const finite = (p: Point) =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e12 && Math.abs(p.y) <= 1e12;
  if (
    changed.some(
      (c) =>
        !finite(c.position) ||
        Object.values(c.geometry).some(
          (v) => typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 1e12),
        ) ||
        (c.geometry.points ?? []).some((p) => !finite(p)),
    ) ||
    drafts.some((e) => e.points.some((p) => !finite(p)))
  )
    throw new Error('Transformation exceeds the supported coordinate range (±1e12).');
  return {
    ...project,
    components: [...project.components.filter((c) => copy || !selected.includes(c)), ...changed],
    drawingEntities: [
      ...(project.drawingEntities ?? []).filter((e) => copy || !selectedDrafts.includes(e)),
      ...drafts,
    ],
  };
}
// Reuse true outer/inner ring geometry rather than keyhole bridge outlines.
export const componentWorldRings = (c: SectionComponent) => componentRegion(c).flat();
export function cadAllPoints(project: SectionProject): Point[] {
  return [
    ...project.components.filter((c) => c.visible).flatMap((c) => computeComponentProps(c).outline),
    ...(project.drawingEntities ?? []).flatMap((e) => e.points),
  ];
}

/** Window/crossing tests use actual open segments, never an invented closing edge. */
export function draftInRect(
  entity: DrawingEntity,
  rect: { x0: number; y0: number; x1: number; y1: number },
  crossing = false,
): boolean {
  const { x0, y0, x1, y1 } = rect;
  const inside = (p: Point) => pointInRect(p, x0, y0, x1, y1);
  if (!crossing) return entity.points.every(inside);
  if (entity.points.some(inside)) return true;
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return entity.points.some(
    (p, i) =>
      i > 0 &&
      corners.some((a, j) => segmentsIntersect(entity.points[i - 1], p, a, corners[(j + 1) % 4])),
  );
}
