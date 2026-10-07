import { v4 as uuid } from 'uuid';
import type { LengthUnit, Point, SectionComponent, SectionProject } from './types';

/** Result returned by the browser-side ASCII DXF importer. */
export interface DXFImportResult {
  success: boolean;
  project?: SectionProject;
  error?: string;
  warnings?: string[];
  stats?: {
    entitiesRead: number;
    contoursImported: number;
    cutouts: number;
    skippedEntities: number;
  };
  detectedUnit?: LengthUnit;
}

interface Pair { code: number; value: string }
interface RecordEntry { type: string; pairs: Pair[] }
interface Vertex extends Point { bulge?: number }
interface Contour {
  name: string;
  layer: string;
  points: Point[];
  kind: 'polygon' | 'circle' | 'ellipse';
  center?: Point;
  radius?: number;
  majorAxis?: number;
  minorAxis?: number;
  rotation?: number;
  area: number;
}

const UNIT_CODES: Partial<Record<number, LengthUnit>> = {
  1: 'inch',
  2: 'ft',
  4: 'mm',
  5: 'cm',
  6: 'm',
};

const DEFAULT_MATERIALS = [
  { id: 'steel-default', name: 'Structural Steel', E: 200000, density: 7850, grade: 'Fe 410', color: '#60a5fa' },
  { id: 'concrete-default', name: 'Concrete', E: 30000, density: 2500, grade: 'M30', color: '#94a3b8' },
];

function parsePairs(text: string): Pair[] | null {
  // Binary DXF starts with this literal header and cannot be decoded as text.
  if (/^AutoCAD Binary DXF/i.test(text.slice(0, 32))) return null;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

function value(record: RecordEntry, code: number, fallback = 0): number {
  const pair = record.pairs.find(p => p.code === code);
  if (!pair) return fallback;
  const parsed = Number(pair.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(record: RecordEntry, code: number, fallback: string): string {
  return record.pairs.find(p => p.code === code)?.value || fallback;
}

function entityRecords(pairs: Pair[]): RecordEntry[] {
  const records: RecordEntry[] = [];
  let inEntities = false;
  let pendingSection = false;
  let current: RecordEntry | null = null;

  for (const pair of pairs) {
    if (pair.code === 0 && pair.value.toUpperCase() === 'SECTION') {
      pendingSection = true;
      continue;
    }
    if (pendingSection && pair.code === 2) {
      inEntities = pair.value.toUpperCase() === 'ENTITIES';
      pendingSection = false;
      continue;
    }
    if (inEntities && pair.code === 0 && pair.value.toUpperCase() === 'ENDSEC') {
      if (current) records.push(current);
      current = null;
      inEntities = false;
      continue;
    }
    if (!inEntities) continue;
    if (pair.code === 0) {
      if (current) records.push(current);
      current = { type: pair.value.toUpperCase(), pairs: [] };
    } else if (current) {
      current.pairs.push(pair);
    }
  }
  if (current) records.push(current);
  return records;
}

function detectUnits(pairs: Pair[]): LengthUnit | undefined {
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code === 9 && pairs[i].value.toUpperCase() === '$INSUNITS') {
      for (let j = i + 1; j < Math.min(i + 5, pairs.length); j++) {
        if (pairs[j].code === 70) return UNIT_CODES[Number(pairs[j].value)];
        if (pairs[j].code === 9 || pairs[j].code === 0) break;
      }
    }
  }
  return undefined;
}

function closeEnough(a: Point, b: Point, tolerance: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

/** Expand AutoCAD bulge arcs into straight chords (10 degree maximum angle). */
function expandBulges(vertices: Vertex[], closed: boolean): Point[] {
  const result: Point[] = [];
  const segmentCount = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    result.push({ x: start.x, y: start.y });
    const bulge = start.bulge ?? 0;
    if (Math.abs(bulge) < 1e-12) continue;
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    if (chord < 1e-12) continue;
    const theta = 4 * Math.atan(bulge);
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const nx = -(end.y - start.y) / chord;
    const ny = (end.x - start.x) / chord;
    const offset = chord / (2 * Math.tan(theta / 2));
    const center = { x: mid.x + nx * offset, y: mid.y + ny * offset };
    const radius = Math.hypot(start.x - center.x, start.y - center.y);
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const pieces = Math.max(2, Math.ceil(Math.abs(theta) / (Math.PI / 18)));
    for (let k = 1; k < pieces; k++) {
      const angle = startAngle + theta * k / pieces;
      result.push({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
    }
  }
  if (!closed && vertices.length) {
    const last = vertices[vertices.length - 1];
    result.push({ x: last.x, y: last.y });
  }
  return result;
}

function lwPolylineVertices(record: RecordEntry): Vertex[] {
  const vertices: Vertex[] = [];
  let current: Vertex | null = null;
  for (const pair of record.pairs) {
    if (pair.code === 10) {
      if (current) vertices.push(current);
      current = { x: Number(pair.value), y: 0 };
    } else if (current && pair.code === 20) {
      current.y = Number(pair.value);
    } else if (current && pair.code === 42) {
      current.bulge = Number(pair.value);
    }
  }
  if (current) vertices.push(current);
  return vertices.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function signedPolygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    area += points[i].x * next.y - next.x * points[i].y;
  }
  return area / 2;
}

function polygonArea(points: Point[]): number {
  return Math.abs(signedPolygonArea(points));
}

function ellipsePoints(center: Point, a: number, b: number, rotation: number, count = 72): Point[] {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return Array.from({ length: count }, (_, i) => {
    const angle = 2 * Math.PI * i / count;
    const x = a * Math.cos(angle), y = b * Math.sin(angle);
    return { x: center.x + x * c - y * s, y: center.y + x * s + y * c };
  });
}

function circlePoints(center: Point, radius: number, count = 72): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x: center.x + radius * Math.cos(2 * Math.PI * i / count),
    y: center.y + radius * Math.sin(2 * Math.PI * i / count),
  }));
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (((a.y > point.y) !== (b.y > point.y)) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function isCutoutLayer(layer: string): boolean {
  return /(^|[-_\s])(cutout|cut|hole|void|opening)s?($|[-_\s])/i.test(layer);
}

function safeName(fileName: string): string {
  return fileName.replace(/\.dxf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported DXF';
}

function makeComponent(contour: Contour, operation: 'add' | 'subtract', index: number): SectionComponent {
  const common = {
    id: uuid(),
    name: `${operation === 'subtract' ? 'Cutout' : 'DXF contour'} ${index + 1} (${contour.layer})`,
    operation,
    materialId: 'steel-default',
    visible: true,
    locked: false,
  } as const;
  if (contour.kind === 'circle') {
    return { ...common, type: 'circle', geometry: { radius: contour.radius }, position: contour.center!, rotation: 0 };
  }
  if (contour.kind === 'ellipse') {
    return {
      ...common,
      type: 'ellipse',
      geometry: { majorAxis: contour.majorAxis, minorAxis: contour.minorAxis },
      position: contour.center!,
      rotation: contour.rotation ?? 0,
    };
  }
  // The polygon engine expects a counter-clockwise winding for a correctly
  // signed product of inertia. DXF permits either winding, so normalize it.
  // Imported points otherwise remain in their original world coordinates.
  const points = signedPolygonArea(contour.points) < 0 ? [...contour.points].reverse() : contour.points;
  return { ...common, type: 'custom-shape', geometry: { points }, position: { x: 0, y: 0 }, rotation: 0 };
}

/**
 * Parse an ASCII DXF into Section Designer components. Closed LWPOLYLINE,
 * POLYLINE, CIRCLE, full ELLIPSE, and closed chains of LINE/ARC entities are
 * supported. Nested contours alternate add/subtract to model openings.
 */
export function importDXF(text: string, fileName = 'Imported.dxf', unitOverride?: LengthUnit): DXFImportResult {
  const pairs = parsePairs(text);
  if (!pairs) return { success: false, error: 'Binary DXF files are not supported. Save the drawing as an ASCII DXF and try again.' };
  if (!pairs.some(p => p.code === 0 && p.value.toUpperCase() === 'SECTION')) {
    return { success: false, error: 'This does not appear to be a valid ASCII DXF file.' };
  }

  const records = entityRecords(pairs);
  if (records.length === 0) return { success: false, error: 'No entities were found in the DXF ENTITIES section.' };

  const contours: Contour[] = [];
  const edgePaths: { points: Point[]; layer: string }[] = [];
  const unsupported = new Map<string, number>();
  let openEntities = 0;
  let curvedPolylines = false;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const layer = textValue(record, 8, '0');

    if (record.type === 'LWPOLYLINE') {
      const vertices = lwPolylineVertices(record);
      const explicitlyClosed = (value(record, 70) & 1) === 1;
      const closed = explicitlyClosed || (vertices.length > 2 && closeEnough(vertices[0], vertices[vertices.length - 1], 1e-8));
      if (!closed || vertices.length < 3) { openEntities++; continue; }
      if (!explicitlyClosed && closeEnough(vertices[0], vertices[vertices.length - 1], 1e-8)) vertices.pop();
      if (vertices.some(vertex => Math.abs(vertex.bulge ?? 0) > 1e-12)) curvedPolylines = true;
      const points = expandBulges(vertices, true);
      contours.push({ name: 'LWPOLYLINE', layer, points, kind: 'polygon', area: polygonArea(points) });
      continue;
    }

    if (record.type === 'POLYLINE') {
      const vertices: Vertex[] = [];
      const closedFlag = (value(record, 70) & 1) === 1;
      while (i + 1 < records.length && records[i + 1].type === 'VERTEX') {
        const vertex = records[++i];
        vertices.push({ x: value(vertex, 10), y: value(vertex, 20), bulge: value(vertex, 42) });
      }
      if (i + 1 < records.length && records[i + 1].type === 'SEQEND') i++;
      const closed = closedFlag || (vertices.length > 2 && closeEnough(vertices[0], vertices[vertices.length - 1], 1e-8));
      if (!closed || vertices.length < 3) { openEntities++; continue; }
      if (!closedFlag && closeEnough(vertices[0], vertices[vertices.length - 1], 1e-8)) vertices.pop();
      if (vertices.some(vertex => Math.abs(vertex.bulge ?? 0) > 1e-12)) curvedPolylines = true;
      const points = expandBulges(vertices, true);
      contours.push({ name: 'POLYLINE', layer, points, kind: 'polygon', area: polygonArea(points) });
      continue;
    }

    if (record.type === 'CIRCLE') {
      const center = { x: value(record, 10), y: value(record, 20) };
      const radius = Math.abs(value(record, 40));
      if (radius <= 0) { openEntities++; continue; }
      contours.push({ name: 'CIRCLE', layer, points: circlePoints(center, radius), kind: 'circle', center, radius, area: Math.PI * radius ** 2 });
      continue;
    }

    if (record.type === 'ELLIPSE') {
      const start = value(record, 41, 0), end = value(record, 42, 2 * Math.PI);
      const span = ((end - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const full = Math.abs(span) < 1e-7 || Math.abs(span - 2 * Math.PI) < 1e-7;
      if (!full) { openEntities++; continue; }
      const center = { x: value(record, 10), y: value(record, 20) };
      const majorVector = { x: value(record, 11), y: value(record, 21) };
      const a = Math.hypot(majorVector.x, majorVector.y);
      const b = a * Math.abs(value(record, 40, 1));
      if (a <= 0 || b <= 0) { openEntities++; continue; }
      const rotationRadians = Math.atan2(majorVector.y, majorVector.x);
      const points = ellipsePoints(center, a, b, rotationRadians);
      contours.push({
        name: 'ELLIPSE', layer, points, kind: 'ellipse', center,
        majorAxis: 2 * a, minorAxis: 2 * b, rotation: rotationRadians * 180 / Math.PI,
        area: Math.PI * a * b,
      });
      continue;
    }

    if (record.type === 'LINE') {
      edgePaths.push({
        points: [
          { x: value(record, 10), y: value(record, 20) },
          { x: value(record, 11), y: value(record, 21) },
        ],
        layer,
      });
      continue;
    }

    if (record.type === 'ARC') {
      const center = { x: value(record, 10), y: value(record, 20) };
      const radius = Math.abs(value(record, 40));
      const start = value(record, 50) * Math.PI / 180;
      let sweep = (value(record, 51) - value(record, 50)) * Math.PI / 180;
      while (sweep <= 0) sweep += 2 * Math.PI;
      const pieces = Math.max(2, Math.ceil(sweep / (Math.PI / 18)));
      if (radius > 0) {
        edgePaths.push({
          layer,
          points: Array.from({ length: pieces + 1 }, (_, pointIndex) => {
            const angle = start + sweep * pointIndex / pieces;
            return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
          }),
        });
        curvedPolylines = true;
      } else {
        openEntities++;
      }
      continue;
    }

    // VERTEX and SEQEND are consumed with their POLYLINE above.
    if (record.type !== 'VERTEX' && record.type !== 'SEQEND') {
      unsupported.set(record.type, (unsupported.get(record.type) ?? 0) + 1);
    }
  }

  // Join separate LINE and ARC entities into closed loops, independently per layer.
  const extent = edgePaths.reduce((max, path) => path.points.reduce(
    (innerMax, point) => Math.max(innerMax, Math.abs(point.x), Math.abs(point.y)), max,
  ), 1);
  const tolerance = Math.max(1e-8, extent * 1e-7);
  const remaining = [...edgePaths];
  while (remaining.length) {
    const first = remaining.shift()!;
    const chain = [...first.points];
    const layer = first.layer;
    let advanced = true;
    while (advanced && !closeEnough(chain[chain.length - 1], chain[0], tolerance)) {
      advanced = false;
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].layer !== layer) continue;
        const end = chain[chain.length - 1];
        const path = remaining[i].points;
        if (closeEnough(path[0], end, tolerance)) {
          chain.push(...path.slice(1)); remaining.splice(i, 1); advanced = true; break;
        }
        if (closeEnough(path[path.length - 1], end, tolerance)) {
          chain.push(...[...path].reverse().slice(1)); remaining.splice(i, 1); advanced = true; break;
        }
      }
    }
    if (chain.length >= 4 && closeEnough(chain[chain.length - 1], chain[0], tolerance)) {
      chain.pop();
      contours.push({ name: 'edge loop', layer, points: chain, kind: 'polygon', area: polygonArea(chain) });
    } else {
      openEntities++;
    }
  }

  const validContours = contours.filter(c => c.points.length >= 3 && c.area > 1e-12);
  if (validContours.length === 0) {
    return {
      success: false,
      error: 'No closed section boundaries were found. Use closed polylines, circles, ellipses, or connected line loops.',
    };
  }

  // Smaller contours nested inside larger ones alternate between material and
  // void. A clearly named CUTOUT/HOLE/VOID layer always creates a subtraction.
  const operations = validContours.map((contour, index): 'add' | 'subtract' => {
    if (isCutoutLayer(contour.layer)) return 'subtract';
    const probe = contour.center ?? contour.points[0];
    const depth = validContours.reduce((count, outer, outerIndex) => {
      if (outerIndex === index || outer.area <= contour.area) return count;
      return count + (pointInPolygon(probe, outer.points) ? 1 : 0);
    }, 0);
    return depth % 2 === 1 ? 'subtract' : 'add';
  });

  const components = validContours.map((contour, index) => makeComponent(contour, operations[index], index));
  const cutouts = operations.filter(op => op === 'subtract').length;
  const detectedUnit = detectUnits(pairs);
  const units = unitOverride ?? detectedUnit ?? 'mm';
  const warnings: string[] = [];
  if (!detectedUnit && !unitOverride) warnings.push('The DXF does not declare drawing units; coordinates were assumed to be millimetres.');
  if (openEntities > 0) warnings.push(`${openEntities} open or partial entit${openEntities === 1 ? 'y was' : 'ies were'} skipped because section boundaries must be closed.`);
  if (unsupported.size > 0) {
    warnings.push(`Unsupported entities were skipped: ${[...unsupported.entries()].map(([type, count]) => `${type} (${count})`).join(', ')}.`);
  }
  if (!components.some(c => c.operation === 'add')) warnings.push('All imported contours are cutouts; at least one additive outer boundary is required for valid properties.');
  if (curvedPolylines) warnings.push('Curved DXF segments were discretized at a maximum 10° increment for property calculations.');

  const now = new Date().toISOString();
  const project: SectionProject = {
    id: uuid(),
    name: safeName(fileName),
    description: `Imported from ${fileName}`,
    units,
    components,
    materials: DEFAULT_MATERIALS,
    loads: { P: 0, Mx: 0, My: 0 },
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };

  return {
    success: true,
    project,
    warnings,
    detectedUnit,
    stats: {
      entitiesRead: records.filter(r => r.type !== 'VERTEX' && r.type !== 'SEQEND').length,
      contoursImported: components.length,
      cutouts,
      skippedEntities: openEntities + [...unsupported.values()].reduce((a, b) => a + b, 0),
    },
  };
}
