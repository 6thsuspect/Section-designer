import { cadPathPoints, sameCadPoint } from './cadPath';
import { inStretchArea, validateStretchPolygon, type CadStretchArea } from './cadStretchArea';
import { CAD_EXTENDED_COMMANDS } from './cadExtendedCatalog';
import type { Point, SectionComponent, SectionProject, LengthUnit } from './types';
import { computeComponentProps, segmentsIntersect, pointInRect } from './geometry';
import { componentRegion, keyholeAll, signedArea } from './combine';

export interface DrawingEntity {
  id: string;
  kind: 'line' | 'polyline' | 'arc' | 'point' | 'dimension' | 'text' | 'xline' | 'ray';
  closed?: boolean;
  text?: string;
  textHeight?: number;
  textRotation?: number;
  dimensionStyle?: 'linear' | 'aligned';
  dimensionAxis?: Point;
  points: Point[];
}
export interface CadCommand {
  name: string;
  aliases: string[];
  help: string;
  prompts: string[];
  types: ('point' | 'positive' | 'number' | 'integer' | 'count' | 'text')[];
}
const command = (
  name: string,
  aliases: string,
  help: string,
  prompts: string[],
  types: CadCommand['types'],
): CadCommand => ({
  name,
  aliases: aliases.split(' ').filter(Boolean),
  help,
  prompts,
  types,
});
export const CAD_COMMANDS: CadCommand[] = [
  ...CAD_EXTENDED_COMMANDS,
  command(
    'LINE',
    'L',
    'Connected line segments; Enter finishes, Close closes, Undo removes last point.',
    ['Specify first point:', 'Specify next point or [Undo/Close] (Enter finishes):'],
    ['point', 'point'],
  ),
  command(
    'PLINE',
    'PL POLYLINE',
    'Single polyline; first-point snap or Close sets closed=true. BOUNDARY converts it to a section.',
    ['Specify first point:', 'Specify next point or [Undo/Close] (Enter finishes):'],
    ['point', 'point'],
  ),
  command(
    'RECTANGLE',
    'REC RECTANG',
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
    'A',
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
    'STRETCH',
    'S',
    'Crossing window or CP crossing polygon selects vertices; specify base and destination. Partial stretch supports solid polygonal components and draft paths; fully enclosed objects move.',
    [
      'First crossing-window corner or [CPolygon]:',
      'Opposite crossing-window corner:',
      'Base point:',
      'Destination point:',
    ],
    ['point', 'point', 'point', 'point'],
  ),
  command(
    'DIM',
    'DIMLINEAR DLI',
    'Linear dimension: two extension origins, then location (horizontal or vertical selected by location).',
    ['First extension origin:', 'Second extension origin:', 'Dimension line location:'],
    ['point', 'point', 'point'],
  ),
  command(
    'DIMALIGNED',
    'DAL',
    'Aligned dimension: two extension origins, then dimension line location.',
    ['First extension origin:', 'Second extension origin:', 'Dimension line location:'],
    ['point', 'point', 'point'],
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
  command(
    'CANCEL',
    'ESC',
    'Cancel incomplete input without changing completed geometry.',
    [],
    [],
  ),
];
export const findCadCommand = (text: string) =>
  CAD_COMMANDS.find(
    (c) => c.name === text.toUpperCase() || c.aliases.includes(text.toUpperCase()),
  );
const mm: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4,
  ft: 304.8,
};
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
  const input = relative ? text.slice(1) : text.replace(/^#/, '');
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
  stretchPolygon?: boolean;
  stretchArea?: CadStretchArea;
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
    type !== 'count' &&
      c.name !== 'ARRAYPOLAR' &&
      !(['TEXT', 'MTEXT'].includes(c.name) && values.length === 2) &&
      (!['ROTATE', 'SCALE', 'POLYGON'].includes(c.name) ||
        (c.name === 'POLYGON' && values.length > 0)),
  );
  if (type === 'count' && (!Number.isInteger(n) || n < 1 || n > 1000))
    throw new Error('Use a whole count from 1 to 1000.');
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
  if (name === 'DIM' || name === 'DIMALIGNED') {
    draft = makeCadDimension(name, a, b, v[2] as Point, id());
  } else if (name === 'RECTANGLE') {
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
    comp = {
      ...base,
      type: 'circle',
      position: a,
      geometry: { radius: v[1] as number },
    };
  else if (name === 'ELLIPSE')
    comp = {
      ...base,
      type: 'ellipse',
      position: a,
      geometry: {
        majorAxis: (v[1] as number) * 2,
        minorAxis: (v[2] as number) * 2,
      },
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
        return (
          s +
          (p.x - points[0].x) * (q.y - points[0].y) -
          (q.x - points[0].x) * (p.y - points[0].y)
        );
      }, 0);
      if (Math.abs(area) < 1e-9) throw new Error('A closed section must have non-zero area.');
      draft = { id: id(), kind: 'polyline', points, closed: true };
    } else
      draft = {
        id: id(),
        kind: name === 'LINE' ? 'line' : 'polyline',
        points: close ? [...points, points[0]] : points,
        ...(name === 'PLINE' ? { closed: false } : {}),
      };
  }
  return {
    ...project,
    components: comp ? [...project.components, comp] : project.components,
    drawingEntities: draft
      ? [...(project.drawingEntities ?? []), draft]
      : project.drawingEntities,
  };
}
/** Explicit engineering conversion: validate a path, then create one structural boundary. */
export function cadSectionBoundary(project: SectionProject, points: Point[]): SectionProject {
  const path = cadCreate(
    { ...project, components: [], drawingEntities: [] },
    'PLINE',
    points,
    true,
  ).drawingEntities![0];
  return {
    ...project,
    components: [...project.components, sectionShape(project, 'BOUNDARY', path.points)],
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
    ...(e.kind === 'text'
      ? {
          textHeight: e.textHeight! * (name === 'SCALE' ? (values[1] as number) : 1),
          textRotation: (() => {
            const radians = ((e.textRotation ?? 0) * Math.PI) / 180;
            const axis = mappedAxis({ x: Math.cos(radians), y: Math.sin(radians) }, a, map);
            return (Math.atan2(axis.y, axis.x) * 180) / Math.PI;
          })(),
        }
      : {}),
    ...(e.dimensionAxis ? { dimensionAxis: mappedAxis(e.dimensionAxis, a, map) } : {}),
  }));
  if (
    drafts.some(
      (e) =>
        e.kind === 'text' &&
        (!Number.isFinite(e.textHeight) ||
          e.textHeight! <= 0 ||
          e.textHeight! > 1e12 ||
          !Number.isFinite(e.textRotation)),
    )
  )
    throw new Error('Transformation would invalidate text size or orientation.');
  if (
    drafts.some(
      (e) =>
        e.kind === 'dimension' &&
        (!Number.isFinite(dimensionGeometry(e).measurement) ||
          dimensionGeometry(e).measurement < 1e-10),
    )
  )
    throw new Error('Transformation would collapse a dimension.');
  const finite = (p: Point) =>
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) <= 1e12 &&
    Math.abs(p.y) <= 1e12;
  if (
    changed.some(
      (c) =>
        !finite(c.position) ||
        Object.values(c.geometry).some(
          (v) => typeof v === 'number' && (!Number.isFinite(v) || Math.abs(v) > 1e12),
        ) ||
        (c.geometry.points ?? []).some((p) => !finite(p)),
    ) ||
    drafts.some((e) => drawingEntityPoints(e).some((p) => !finite(p)))
  )
    throw new Error('Transformation exceeds the supported coordinate range (±1e12).');
  return {
    ...project,
    components: [
      ...project.components.filter((c) => copy || !selected.includes(c)),
      ...changed,
    ],
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
    ...project.components
      .filter((c) => c.visible)
      .flatMap((c) => computeComponentProps(c).outline),
    ...(project.drawingEntities ?? []).flatMap(drawingEntityPoints),
  ];
}

/** Window/crossing tests use actual open segments, never an invented closing edge. */
export function draftInRect(
  entity: DrawingEntity,
  rect: { x0: number; y0: number; x1: number; y1: number },
  crossing = false,
): boolean {
  if (entity.kind === 'xline' || entity.kind === 'ray')
    return crossing && clipCadConstruction(entity, rect) !== null;
  if (entity.kind === 'text') {
    const points = drawingEntityPoints(entity);
    return crossing
      ? points.some((p) => pointInRect(p, rect.x0, rect.y0, rect.x1, rect.y1))
      : points.every((p) => pointInRect(p, rect.x0, rect.y0, rect.x1, rect.y1));
  }
  if (entity.kind === 'dimension') {
    const segments = dimensionGeometry(entity).segments;
    return crossing
      ? segments.some((points) =>
          draftInRect({ id: entity.id, kind: 'line', points }, rect, true),
        )
      : segments.flat().every((p) => pointInRect(p, rect.x0, rect.y0, rect.x1, rect.y1));
  }
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
  const path = cadPathPoints(entity);
  return path.some(
    (p, i) =>
      i > 0 &&
      corners.some((a, j) => segmentsIntersect(path[i - 1], p, a, corners[(j + 1) % 4])),
  );
}

function mappedAxis(axis: Point, origin: Point, map: (p: Point) => Point): Point {
  const a = map(origin),
    b = map({ x: origin.x + axis.x, y: origin.y + axis.y });
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

/** Non-associative dimension geometry, shared by canvas and DXF export. */
export function dimensionGeometry(entity: DrawingEntity, tick = 3) {
  const [a, b, location] = entity.points;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const axis =
    entity.dimensionStyle === 'linear'
      ? (entity.dimensionAxis ?? { x: 1, y: 0 })
      : { x: (b.x - a.x) / (length || 1), y: (b.y - a.y) / (length || 1) };
  const normal = { x: -axis.y, y: axis.x };
  const project = (p: Point) => {
    const distance = (location.x - p.x) * normal.x + (location.y - p.y) * normal.y;
    return { x: p.x + normal.x * distance, y: p.y + normal.y * distance };
  };
  const start = project(a),
    end = project(b);
  const segments: [Point, Point][] = [
    [a, start],
    [b, end],
    [start, end],
  ];
  for (const p of [start, end])
    segments.push([
      {
        x: p.x - (axis.x + normal.x) * tick,
        y: p.y - (axis.y + normal.y) * tick,
      },
      {
        x: p.x + (axis.x + normal.x) * tick,
        y: p.y + (axis.y + normal.y) * tick,
      },
    ]);
  const measurement = Math.abs((b.x - a.x) * axis.x + (b.y - a.y) * axis.y);
  return {
    segments,
    measurement,
    angle: (Math.atan2(axis.y, axis.x) * 180) / Math.PI,
    label: String(Number(measurement.toPrecision(10))),
    text: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
  };
}

export function stretchCad(
  project: SectionProject,
  values: CadValue[],
  area?: CadStretchArea,
): SectionProject {
  const [a, b] = values as Point[];
  const [base, destination] = (area ? values : values.slice(2)) as Point[];
  const region: CadStretchArea = area ?? { kind: 'window', a, b };
  if (region.kind === 'polygon') validateStretchPolygon(region.points);
  if (
    region.kind === 'window' &&
    (Math.abs(region.a.x - region.b.x) < 1e-8 || Math.abs(region.a.y - region.b.y) < 1e-8)
  )
    throw new Error('Crossing window must enclose an area.');
  const inside = (p: Point) => inStretchArea(p, region);
  const dx = destination.x - base.x,
    dy = destination.y - base.y;
  if (!dx && !dy) throw new Error('Stretch displacement must be non-zero.');
  const move = (p: Point) => ({ x: p.x + dx, y: p.y + dy });
  let count = 0;
  const components = project.components.map((c) => {
    if (!c.visible || c.locked) return c;
    const rings = componentWorldRings(c),
      points = rings.flat();
    if (!points.some(inside)) return c;
    if (c.combinedFrom || c.parentId || c.geometry.boltDeductions)
      throw new Error('Use existing tools for associated or combined components.');
    count++;
    if (points.every(inside)) return { ...c, position: move(c.position) };
    if (
      !['rectangle', 'triangle', 'polygon', 'custom-shape'].includes(c.type) ||
      rings.length !== 1
    )
      throw new Error(
        'Partial STRETCH supports solid polygonal components only; enclose curved/hollow objects fully to move them.',
      );
    const stretched = rings[0].map((p) => (inside(p) ? move(p) : p));
    const validated = cadSectionBoundary(
      { ...project, components: [], drawingEntities: [] },
      stretched,
    ).components[0];
    return {
      ...validated,
      id: c.id,
      name: c.name,
      operation: c.operation,
      materialId: c.materialId,
    };
  });
  const drawingEntities = project.drawingEntities?.map((entity) => {
    if (!entity.points.some(inside)) return entity;
    if (['arc', 'xline', 'ray'].includes(entity.kind) && !entity.points.every(inside))
      throw new Error(
        'Partially stretching an arc is not supported; enclose it fully to move.',
      );
    count++;
    const points = entity.points.map((p) => (inside(p) ? move(p) : p));
    if (
      points.some(
        (p, i) => i > 0 && Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) < 1e-8,
      )
    )
      throw new Error('Stretch would collapse a segment.');
    if (entity.closed && sameCadPoint(points[0], points.at(-1)!))
      throw new Error('Stretch would collapse the closing segment.');
    if (entity.closed)
      cadCreate({ ...project, components: [], drawingEntities: [] }, 'PLINE', points, true);
    return { ...entity, points };
  });
  if (
    drawingEntities?.some(
      (e) => e.kind === 'dimension' && dimensionGeometry(e).measurement < 1e-10,
    )
  )
    throw new Error('Stretch would collapse a dimension.');
  if (!count) throw new Error('No unlocked vertices inside the crossing window.');
  if (
    components.some(
      (c) =>
        !Number.isFinite(c.position.x) ||
        !Number.isFinite(c.position.y) ||
        computeComponentProps(c).outline.some(
          (p) =>
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            Math.abs(p.x) > 1e12 ||
            Math.abs(p.y) > 1e12,
        ),
    ) ||
    drawingEntities?.some((e) =>
      e.points.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          Math.abs(p.x) > 1e12 ||
          Math.abs(p.y) > 1e12,
      ),
    )
  )
    throw new Error('Stretch exceeds the supported coordinate range.');
  return { ...project, components, drawingEntities };
}

export function makeCadDimension(
  name: string,
  a: Point,
  b: Point,
  location: Point,
  entityId = 'preview',
): DrawingEntity {
  if (a.x === b.x && a.y === b.y) throw new Error('Dimension origins must be distinct.');
  const horizontal =
    Math.abs(location.y - (a.y + b.y) / 2) >= Math.abs(location.x - (a.x + b.x) / 2);
  const entity: DrawingEntity = {
    id: entityId,
    kind: 'dimension',
    points: [a, b, location],
    dimensionStyle: name === 'DIM' ? 'linear' : 'aligned',
    ...(name === 'DIM' ? { dimensionAxis: horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 } } : {}),
  };
  if (dimensionGeometry(entity).measurement < 1e-10)
    throw new Error(
      'The selected linear direction has zero length; choose another location or use DAL.',
    );
  return entity;
}

export function drawingEntityPoints(entity: DrawingEntity): Point[] {
  if (entity.kind === 'text') {
    const lines = (entity.text ?? '').split('\n'),
      height = entity.textHeight ?? 10;
    const width = Math.max(...lines.map((line) => line.length), 1) * height * 0.7;
    const radians = ((entity.textRotation ?? 0) * Math.PI) / 180,
      origin = entity.points[0];
    return [
      { x: 0, y: height },
      { x: width, y: height },
      { x: width, y: -(lines.length - 1) * height * 1.2 },
      { x: 0, y: -(lines.length - 1) * height * 1.2 },
    ].map((p) => ({
      x: origin.x + p.x * Math.cos(radians) - p.y * Math.sin(radians),
      y: origin.y + p.x * Math.sin(radians) + p.y * Math.cos(radians),
    }));
  }
  return entity.kind === 'dimension'
    ? dimensionGeometry(entity).segments.flat()
    : cadPathPoints(entity);
}

/** Clip infinite construction geometry only for display/hit-testing, never its stored anchors. */
export function clipCadConstruction(
  entity: DrawingEntity,
  bounds: { x0: number; y0: number; x1: number; y1: number },
): Point[] | null {
  const [a, b] = entity.points,
    dx = b.x - a.x,
    dy = b.y - a.y;
  let lo = entity.kind === 'ray' ? 0 : -Infinity,
    hi = Infinity;
  for (const [origin, direction, min, max] of [
    [a.x, dx, Math.min(bounds.x0, bounds.x1), Math.max(bounds.x0, bounds.x1)],
    [a.y, dy, Math.min(bounds.y0, bounds.y1), Math.max(bounds.y0, bounds.y1)],
  ]) {
    if (Math.abs(direction) < 1e-15) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const t1 = (min - origin) / direction,
      t2 = (max - origin) / direction;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
    if (lo > hi) return null;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return [
    { x: a.x + dx * lo, y: a.y + dy * lo },
    { x: a.x + dx * hi, y: a.y + dy * hi },
  ];
}
