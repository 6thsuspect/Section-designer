// ─── Geometry Engine ───────────────────────────────────────────────────────
// Pure functions for computing section properties from geometric primitives.
// No UI dependency. Deterministic. Full floating-point precision internally.

import type { Point, SectionComponent, ComponentGeometry, CalcTrace, CalcStep } from './types';

const DEG = Math.PI / 180;

// ─── Primitive property calculators ───────────────────────────────────────

interface PrimitiveProps {
  area: number;
  Ix_local: number;  // about own centroid
  Iy_local: number;
  Ixy_local: number;
  cx: number;  // centroid x in global
  cy: number;  // centroid y in global
  outline: Point[]; // bounding polygon for rendering
}

function rotatePoint(p: Point, angle: number, origin: Point): Point {
  const rad = angle * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

function rotateInertia(Ix: number, Iy: number, Ixy: number, angle: number) {
  const rad = angle * DEG;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const c2 = c * c;
  const s2 = s * s;
  const cs = c * s;
  return {
    Ix: Ix * c2 + Iy * s2 - 2 * Ixy * cs,
    Iy: Ix * s2 + Iy * c2 + 2 * Ixy * cs,
    Ixy: (Ix - Iy) * cs + Ixy * (c2 - s2),
  };
}

export function rectangleOutline(w: number, h: number, pos: Point, rot: number): Point[] {
  const hw = w / 2, hh = h / 2;
  const pts: Point[] = [
    { x: pos.x - hw, y: pos.y - hh },
    { x: pos.x + hw, y: pos.y - hh },
    { x: pos.x + hw, y: pos.y + hh },
    { x: pos.x - hw, y: pos.y + hh },
  ];
  if (rot !== 0) return pts.map(p => rotatePoint(p, rot, pos));
  return pts;
}

export function circleOutline(r: number, pos: Point, segments = 48): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push({ x: pos.x + r * Math.cos(a), y: pos.y + r * Math.sin(a) });
  }
  return pts;
}

function rectangleProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const w = g.width ?? 0;
  const h = g.height ?? 0;
  const area = w * h;
  const Ix_local = (w * h * h * h) / 12;
  const Iy_local = (h * w * w * w) / 12;
  const inertia = rot !== 0 ? rotateInertia(Ix_local, Iy_local, 0, rot) : { Ix: Ix_local, Iy: Iy_local, Ixy: 0 };
  return {
    area,
    Ix_local: inertia.Ix,
    Iy_local: inertia.Iy,
    Ixy_local: inertia.Ixy,
    cx: pos.x,
    cy: pos.y,
    outline: rectangleOutline(w, h, pos, rot),
  };
}

function circleProps(g: ComponentGeometry, pos: Point): PrimitiveProps {
  const r = g.radius ?? 0;
  const area = Math.PI * r * r;
  const I = (Math.PI * r * r * r * r) / 4;
  return { area, Ix_local: I, Iy_local: I, Ixy_local: 0, cx: pos.x, cy: pos.y, outline: circleOutline(r, pos) };
}

function hollowCircleProps(g: ComponentGeometry, pos: Point): PrimitiveProps {
  const ro = g.outerRadius ?? 0;
  const ri = g.innerRadius ?? 0;
  const area = Math.PI * (ro * ro - ri * ri);
  const Ix = (Math.PI / 4) * (ro ** 4 - ri ** 4);
  return { area, Ix_local: Ix, Iy_local: Ix, Ixy_local: 0, cx: pos.x, cy: pos.y, outline: circleOutline(ro, pos) };
}

function triangleProps(g: ComponentGeometry, pos: Point): PrimitiveProps {
  const verts = g.vertices ?? [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }];
  const [p1, p2, p3] = verts.map(v => ({ x: v.x + pos.x, y: v.y + pos.y }));
  const area = Math.abs((p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2);
  const cx = (p1.x + p2.x + p3.x) / 3;
  const cy = (p1.y + p2.y + p3.y) / 3;
  // Ix and Iy about centroid using coordinate formula
  const Ix = (area / 18) * (p1.y * p1.y + p2.y * p2.y + p3.y * p3.y + p1.y * p2.y + p2.y * p3.y + p1.y * p3.y)
    - area * cy * cy;
  // Simplified: use coordinate geometry
  const pts = [p1, p2, p3];
  const Ix_c = polygonIx(pts) - area * cy * cy;
  const Iy_c = polygonIy(pts) - area * cx * cx;
  const Ixy_c = polygonIxy(pts) - area * cx * cy;
  return { area, Ix_local: Math.abs(Ix_c), Iy_local: Math.abs(Iy_c), Ixy_local: Ixy_c, cx, cy, outline: [p1, p2, p3] };
}

function polygonArea(pts: Point[]): number {
  let a = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

function polygonCentroid(pts: Point[], area: number): Point {
  let cx = 0, cy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

function polygonIx(pts: Point[]): number {
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    sum += cross * (pts[i].y * pts[i].y + pts[i].y * pts[j].y + pts[j].y * pts[j].y);
  }
  return sum / 12;
}

function polygonIy(pts: Point[]): number {
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    sum += cross * (pts[i].x * pts[i].x + pts[i].x * pts[j].x + pts[j].x * pts[j].x);
  }
  return sum / 12;
}

function polygonIxy(pts: Point[]): number {
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    sum += cross * (pts[i].x * pts[j].y + 2 * pts[i].x * pts[i].y + 2 * pts[j].x * pts[j].y + pts[j].x * pts[i].y);
  }
  return sum / 24;
}

function polygonProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  let pts = (g.points ?? []).map(p => ({ x: p.x + pos.x, y: p.y + pos.y }));
  if (rot !== 0) pts = pts.map(p => rotatePoint(p, rot, pos));

  // Guard: need at least 3 non-degenerate points for a polygon
  if (pts.length < 3) {
    const cx = pts.length > 0 ? pts.reduce((s, p) => s + p.x, 0) / pts.length : pos.x;
    const cy = pts.length > 0 ? pts.reduce((s, p) => s + p.y, 0) / pts.length : pos.y;
    return { area: 0, Ix_local: 0, Iy_local: 0, Ixy_local: 0, cx, cy, outline: pts };
  }

  const signedArea = polygonArea(pts);

  // Guard: degenerate polygon (collinear points, zero area)
  if (Math.abs(signedArea) < 1e-10) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { area: 0, Ix_local: 0, Iy_local: 0, Ixy_local: 0, cx, cy, outline: pts };
  }

  const area = Math.abs(signedArea);
  const centroid = polygonCentroid(pts, signedArea);
  const Ix_c = Math.abs(polygonIx(pts)) - area * centroid.y * centroid.y;
  const Iy_c = Math.abs(polygonIy(pts)) - area * centroid.x * centroid.x;
  const Ixy_raw = polygonIxy(pts);
  const Ixy_c = Ixy_raw - area * centroid.x * centroid.y;
  return { area, Ix_local: Math.abs(Ix_c), Iy_local: Math.abs(Iy_c), Ixy_local: Ixy_c, cx: centroid.x, cy: centroid.y, outline: pts };
}

// ─── Structural section builders ──────────────────────────────────────────
// These decompose into rectangles and compute composite properties
// but generate proper outlines for rendering

function iSectionOutline(pos: Point, fw: number, ft: number, wh: number, wt: number, bfw: number, bft: number, rot: number): Point[] {
  const totalH = bft + wh + ft;
  const bot = pos.y - totalH / 2;
  // CCW outline of I-shape
  let pts: Point[] = [
    { x: pos.x - bfw / 2, y: bot },
    { x: pos.x + bfw / 2, y: bot },
    { x: pos.x + bfw / 2, y: bot + bft },
    { x: pos.x + wt / 2, y: bot + bft },
    { x: pos.x + wt / 2, y: bot + bft + wh },
    { x: pos.x + fw / 2, y: bot + bft + wh },
    { x: pos.x + fw / 2, y: bot + totalH },
    { x: pos.x - fw / 2, y: bot + totalH },
    { x: pos.x - fw / 2, y: bot + bft + wh },
    { x: pos.x - wt / 2, y: bot + bft + wh },
    { x: pos.x - wt / 2, y: bot + bft },
    { x: pos.x - bfw / 2, y: bot + bft },
  ];
  if (rot !== 0) pts = pts.map(p => rotatePoint(p, rot, pos));
  return pts;
}

function iSectionProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const fw = g.flangeWidth ?? 200;
  const ft = g.flangeThickness ?? 15;
  const wh = g.webHeight ?? 300;
  const wt = g.webThickness ?? 10;
  const bfw = g.bottomFlangeWidth ?? fw;
  const bft = g.bottomFlangeThickness ?? ft;
  const totalH = bft + wh + ft;

  const parts = [
    { w: bfw, h: bft, cx: pos.x, cy: pos.y - totalH / 2 + bft / 2 },
    { w: wt, h: wh, cx: pos.x, cy: pos.y - totalH / 2 + bft + wh / 2 },
    { w: fw, h: ft, cx: pos.x, cy: pos.y - totalH / 2 + bft + wh + ft / 2 },
  ];

  const result = compositeRectangles(parts, pos, rot);
  result.outline = iSectionOutline(pos, fw, ft, wh, wt, bfw, bft, rot);
  return result;
}

function tSectionOutline(pos: Point, fw: number, ft: number, wh: number, wt: number, rot: number): Point[] {
  const totalH = wh + ft;
  const bot = pos.y - totalH / 2;
  let pts: Point[] = [
    { x: pos.x - wt / 2, y: bot },
    { x: pos.x + wt / 2, y: bot },
    { x: pos.x + wt / 2, y: bot + wh },
    { x: pos.x + fw / 2, y: bot + wh },
    { x: pos.x + fw / 2, y: bot + totalH },
    { x: pos.x - fw / 2, y: bot + totalH },
    { x: pos.x - fw / 2, y: bot + wh },
    { x: pos.x - wt / 2, y: bot + wh },
  ];
  if (rot !== 0) pts = pts.map(p => rotatePoint(p, rot, pos));
  return pts;
}

function tSectionProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const fw = g.flangeWidth ?? 200;
  const ft = g.flangeThickness ?? 15;
  const wh = g.webHeight ?? 300;
  const wt = g.webThickness ?? 10;
  const totalH = wh + ft;

  const parts = [
    { w: wt, h: wh, cx: pos.x, cy: pos.y - totalH / 2 + wh / 2 },
    { w: fw, h: ft, cx: pos.x, cy: pos.y - totalH / 2 + wh + ft / 2 },
  ];

  const result = compositeRectangles(parts, pos, rot);
  result.outline = tSectionOutline(pos, fw, ft, wh, wt, rot);
  return result;
}

function lSectionOutline(pos: Point, lw: number, lh: number, t: number, rot: number): Point[] {
  // L-section: vertical leg + horizontal leg
  const left = pos.x - lw / 2;
  const bot = pos.y - lh / 2;
  let pts: Point[] = [
    { x: left, y: bot },
    { x: left + lw, y: bot },
    { x: left + lw, y: bot + t },
    { x: left + t, y: bot + t },
    { x: left + t, y: bot + lh },
    { x: left, y: bot + lh },
  ];
  if (rot !== 0) pts = pts.map(p => rotatePoint(p, rot, pos));
  return pts;
}

function lSectionProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const lw = g.legWidth ?? 100;
  const lh = g.legHeight ?? 100;
  const t = g.thickness ?? 10;

  // Horizontal leg: width=lw, height=t, bottom-left corner
  // Vertical leg: width=t, height=lh, left side
  const left = pos.x - lw / 2;
  const bot = pos.y - lh / 2;
  const parts = [
    { w: lw, h: t, cx: left + lw / 2, cy: bot + t / 2 },
    { w: t, h: lh - t, cx: left + t / 2, cy: bot + t + (lh - t) / 2 },
  ];

  const result = compositeRectangles(parts, pos, rot);
  result.outline = lSectionOutline(pos, lw, lh, t, rot);
  return result;
}

function channelOutline(pos: Point, fw: number, ft: number, wh: number, wt: number, rot: number): Point[] {
  const totalH = ft + wh + ft;
  const bot = pos.y - totalH / 2;
  const left = pos.x - fw / 2;
  let pts: Point[] = [
    { x: left, y: bot },
    { x: left + fw, y: bot },
    { x: left + fw, y: bot + ft },
    { x: left + wt, y: bot + ft },
    { x: left + wt, y: bot + ft + wh },
    { x: left + fw, y: bot + ft + wh },
    { x: left + fw, y: bot + totalH },
    { x: left, y: bot + totalH },
  ];
  if (rot !== 0) pts = pts.map(p => rotatePoint(p, rot, pos));
  return pts;
}

function channelProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const fw = g.flangeWidth ?? 75;
  const ft = g.flangeThickness ?? 10;
  const wh = g.webHeight ?? 300;
  const wt = g.webThickness ?? 8;
  const totalH = ft + wh + ft;
  const left = pos.x - fw / 2;

  const parts = [
    { w: fw, h: ft, cx: left + fw / 2, cy: pos.y - totalH / 2 + ft / 2 },
    { w: wt, h: wh, cx: left + wt / 2, cy: pos.y },
    { w: fw, h: ft, cx: left + fw / 2, cy: pos.y + totalH / 2 - ft / 2 },
  ];

  const result = compositeRectangles(parts, pos, rot);
  result.outline = channelOutline(pos, fw, ft, wh, wt, rot);
  return result;
}

function boxProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const w = g.width ?? 200;
  const h = g.height ?? 300;
  const t = g.wallThickness ?? 10;
  const area = w * h - (w - 2 * t) * (h - 2 * t);
  const Ix_outer = (w * h * h * h) / 12;
  const Ix_inner = ((w - 2 * t) * (h - 2 * t) ** 3) / 12;
  const Iy_outer = (h * w * w * w) / 12;
  const Iy_inner = ((h - 2 * t) * (w - 2 * t) ** 3) / 12;
  const inertia = rot !== 0
    ? rotateInertia(Ix_outer - Ix_inner, Iy_outer - Iy_inner, 0, rot)
    : { Ix: Ix_outer - Ix_inner, Iy: Iy_outer - Iy_inner, Ixy: 0 };
  return {
    area,
    Ix_local: inertia.Ix,
    Iy_local: inertia.Iy,
    Ixy_local: inertia.Ixy,
    cx: pos.x,
    cy: pos.y,
    outline: rectangleOutline(w, h, pos, rot),
  };
}

function hollowRectProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const ow = g.width ?? 200;
  const oh = g.height ?? 300;
  const iw = g.innerWidth ?? 180;
  const ih = g.innerHeight ?? 280;
  const area = ow * oh - iw * ih;
  const Ix = (ow * oh ** 3 - iw * ih ** 3) / 12;
  const Iy = (oh * ow ** 3 - ih * iw ** 3) / 12;
  const inertia = rot !== 0 ? rotateInertia(Ix, Iy, 0, rot) : { Ix, Iy, Ixy: 0 };
  return { area, Ix_local: inertia.Ix, Iy_local: inertia.Iy, Ixy_local: inertia.Ixy, cx: pos.x, cy: pos.y, outline: rectangleOutline(ow, oh, pos, rot) };
}

function ellipseProps(g: ComponentGeometry, pos: Point, rot: number): PrimitiveProps {
  const a = (g.majorAxis ?? 200) / 2;
  const b = (g.minorAxis ?? 100) / 2;
  const area = Math.PI * a * b;
  const Ix = (Math.PI * a * b * b * b) / 4;
  const Iy = (Math.PI * b * a * a * a) / 4;
  const inertia = rot !== 0 ? rotateInertia(Ix, Iy, 0, rot) : { Ix, Iy, Ixy: 0 };
  const outline: Point[] = [];
  for (let i = 0; i < 48; i++) {
    const ang = (2 * Math.PI * i) / 48;
    const pt = { x: pos.x + a * Math.cos(ang), y: pos.y + b * Math.sin(ang) };
    outline.push(rot !== 0 ? rotatePoint(pt, rot, pos) : pt);
  }
  return { area, Ix_local: inertia.Ix, Iy_local: inertia.Iy, Ixy_local: inertia.Ixy, cx: pos.x, cy: pos.y, outline };
}

function compositeRectangles(parts: { w: number; h: number; cx: number; cy: number }[], pos: Point, rot: number): PrimitiveProps {
  let totalA = 0, sumAx = 0, sumAy = 0;
  const primitives = parts.map(p => {
    const a = p.w * p.h;
    totalA += a;
    sumAx += a * p.cx;
    sumAy += a * p.cy;
    return { ...p, area: a, Ix: (p.w * p.h ** 3) / 12, Iy: (p.h * p.w ** 3) / 12 };
  });
  const cx = sumAx / totalA;
  const cy = sumAy / totalA;
  let Ix = 0, Iy = 0, Ixy = 0;
  for (const p of primitives) {
    const dy = p.cy - cy;
    const dx = p.cx - cx;
    Ix += p.Ix + p.area * dy * dy;
    Iy += p.Iy + p.area * dx * dx;
    // Ixy for rectangles about own centroid = 0
    Ixy += p.area * dx * dy;
  }
  const inertia = rot !== 0 ? rotateInertia(Ix, Iy, Ixy, rot) : { Ix, Iy, Ixy };
  // Generate outline (simplified bounding)
  let allPts: Point[] = [];
  for (const p of parts) {
    allPts = allPts.concat(rectangleOutline(p.w, p.h, { x: p.cx, y: p.cy }, 0));
  }
  if (rot !== 0) allPts = allPts.map(p => rotatePoint(p, rot, pos));
  const finalCx = rot !== 0 ? rotatePoint({ x: cx, y: cy }, rot, pos).x : cx;
  const finalCy = rot !== 0 ? rotatePoint({ x: cx, y: cy }, rot, pos).y : cy;
  return { area: totalA, Ix_local: inertia.Ix, Iy_local: inertia.Iy, Ixy_local: inertia.Ixy, cx: finalCx, cy: finalCy, outline: allPts };
}

// ─── Component property dispatcher ───────────────────────────────────────

export function computeComponentProps(comp: SectionComponent): PrimitiveProps {
  const { type, geometry, position, rotation } = comp;
  switch (type) {
    case 'rectangle': return rectangleProps(geometry, position, rotation);
    case 'circle': return circleProps(geometry, position);
    case 'hollow-circle': return hollowCircleProps(geometry, position);
    case 'triangle': return triangleProps(geometry, position);
    case 'polygon':
    case 'custom-shape': return polygonProps(geometry, position, rotation);
    case 'i-section': return iSectionProps(geometry, position, rotation);
    case 't-section': return tSectionProps(geometry, position, rotation);
    case 'l-section': return lSectionProps(geometry, position, rotation);
    case 'channel': return channelProps(geometry, position, rotation);
    case 'box': return boxProps(geometry, position, rotation);
    case 'hollow-rectangle': return hollowRectProps(geometry, position, rotation);
    case 'ellipse': return ellipseProps(geometry, position, rotation);
    default: return { area: 0, Ix_local: 0, Iy_local: 0, Ixy_local: 0, cx: 0, cy: 0, outline: [] };
  }
}

// ─── Composite section properties ─────────────────────────────────────────

export function computeSectionProperties(components: SectionComponent[]): {
  props: import('./types').SectionProperties;
  componentProps: Map<string, PrimitiveProps>;
  trace: CalcTrace;
} {
  const visibleComps = components.filter(c => c.visible);
  const compProps = new Map<string, PrimitiveProps>();
  const traceSteps: CalcStep[] = [];
  const childTraces: CalcTrace[] = [];

  // Compute each component
  let totalArea = 0;
  let sumAx = 0, sumAy = 0;

  for (const comp of visibleComps) {
    const p = computeComponentProps(comp);
    compProps.set(comp.id, p);
    const sign = comp.operation === 'subtract' ? -1 : 1;
    totalArea += sign * p.area;
    sumAx += sign * p.area * p.cx;
    sumAy += sign * p.area * p.cy;

    childTraces.push({
      title: `${comp.name} (${comp.type})`,
      steps: [
        { label: 'Area', formula: 'A', substitution: `${fmt(p.area)}`, result: fmt(p.area), unit: 'mm²' },
        { label: 'Centroid X', formula: 'cx', substitution: `${fmt(p.cx)}`, result: fmt(p.cx), unit: 'mm' },
        { label: 'Centroid Y', formula: 'cy', substitution: `${fmt(p.cy)}`, result: fmt(p.cy), unit: 'mm' },
        { label: 'Ix (local)', formula: 'Ix', substitution: `${fmtSci(p.Ix_local)}`, result: fmtSci(p.Ix_local), unit: 'mm⁴' },
        { label: 'Iy (local)', formula: 'Iy', substitution: `${fmtSci(p.Iy_local)}`, result: fmtSci(p.Iy_local), unit: 'mm⁴' },
        { label: 'Operation', formula: '', substitution: comp.operation, result: comp.operation, unit: '' },
      ],
    });
  }

  if (totalArea === 0) {
    const emptyProps: import('./types').SectionProperties = {
      area: 0, centroidX: 0, centroidY: 0, Ix: 0, Iy: 0, Ixy: 0,
      rx: 0, ry: 0, Zx_top: 0, Zx_bottom: 0, Zy_left: 0, Zy_right: 0,
      Imax: 0, Imin: 0, principalAngle: 0, yMax: 0, yMin: 0, xMax: 0, xMin: 0,
    };
    return { props: emptyProps, componentProps: compProps, trace: { title: 'Section Properties', steps: [], children: [] } };
  }

  const cx = sumAx / totalArea;
  const cy = sumAy / totalArea;

  traceSteps.push(
    { label: 'Total Area', formula: 'A = ΣAi', substitution: '', result: fmt(totalArea), unit: 'mm²' },
    { label: 'Centroid X̄', formula: 'x̄ = ΣAi·xi / ΣAi', substitution: `${fmt(sumAx)} / ${fmt(totalArea)}`, result: fmt(cx), unit: 'mm' },
    { label: 'Centroid Ȳ', formula: 'ȳ = ΣAi·yi / ΣAi', substitution: `${fmt(sumAy)} / ${fmt(totalArea)}`, result: fmt(cy), unit: 'mm' },
  );

  // Parallel axis theorem
  let Ix = 0, Iy = 0, Ixy = 0;
  let xMin = 0, xMax = 0, yMin = 0, yMax = 0;
  let hasOutlinePts = false;

  for (const comp of visibleComps) {
    const p = compProps.get(comp.id)!;
    const sign = comp.operation === 'subtract' ? -1 : 1;
    const dx = p.cx - cx;
    const dy = p.cy - cy;
    Ix += sign * (p.Ix_local + p.area * dy * dy);
    Iy += sign * (p.Iy_local + p.area * dx * dx);
    Ixy += sign * (p.Ixy_local + p.area * dx * dy);

    for (const pt of p.outline) {
      const px = pt.x - cx;
      const py = pt.y - cy;
      if (!hasOutlinePts) {
        xMin = px; xMax = px; yMin = py; yMax = py;
        hasOutlinePts = true;
      } else {
        if (px < xMin) xMin = px;
        if (px > xMax) xMax = px;
        if (py < yMin) yMin = py;
        if (py > yMax) yMax = py;
      }
    }
  }

  const rx = Math.sqrt(Math.abs(Ix / totalArea));
  const ry = Math.sqrt(Math.abs(Iy / totalArea));

  const Zx_top = yMax !== 0 ? Math.abs(Ix / yMax) : 0;
  const Zx_bottom = yMin !== 0 ? Math.abs(Ix / yMin) : 0;
  const Zy_left = xMin !== 0 ? Math.abs(Iy / xMin) : 0;
  const Zy_right = xMax !== 0 ? Math.abs(Iy / xMax) : 0;

  // Principal axes
  const avg = (Ix + Iy) / 2;
  const diff = (Ix - Iy) / 2;
  const R = Math.sqrt(diff * diff + Ixy * Ixy);
  const Imax = avg + R;
  const Imin = avg - R;
  const principalAngle = Ixy !== 0 ? (Math.atan2(-Ixy, diff) / 2) / DEG : 0;

  traceSteps.push(
    { label: 'Ix', formula: 'Ix = Σ(Ici + Ai·di²)', substitution: '', result: fmtSci(Ix), unit: 'mm⁴' },
    { label: 'Iy', formula: 'Iy = Σ(Ici + Ai·di²)', substitution: '', result: fmtSci(Iy), unit: 'mm⁴' },
    { label: 'Ixy', formula: 'Ixy = Σ(Ixyi + Ai·dxi·dyi)', substitution: '', result: fmtSci(Ixy), unit: 'mm⁴' },
    { label: 'rx', formula: 'rx = √(Ix/A)', substitution: `√(${fmtSci(Ix)}/${fmt(totalArea)})`, result: fmt(rx), unit: 'mm' },
    { label: 'ry', formula: 'ry = √(Iy/A)', substitution: `√(${fmtSci(Iy)}/${fmt(totalArea)})`, result: fmt(ry), unit: 'mm' },
    { label: 'Zx (top)', formula: 'Zx = Ix/ymax', substitution: `${fmtSci(Ix)}/${fmt(Math.abs(yMax))}`, result: fmtSci(Zx_top), unit: 'mm³' },
    { label: 'Zx (bottom)', formula: 'Zx = Ix/ymin', substitution: `${fmtSci(Ix)}/${fmt(Math.abs(yMin))}`, result: fmtSci(Zx_bottom), unit: 'mm³' },
    { label: 'Imax', formula: '(Ix+Iy)/2 + √((Ix−Iy)/2)²+Ixy²)', substitution: '', result: fmtSci(Imax), unit: 'mm⁴' },
    { label: 'Imin', formula: '(Ix+Iy)/2 − √((Ix−Iy)/2)²+Ixy²)', substitution: '', result: fmtSci(Imin), unit: 'mm⁴' },
    { label: 'θp', formula: 'θ = ½·atan2(-2Ixy, Ix−Iy)', substitution: '', result: fmt(principalAngle), unit: '°' },
  );

  return {
    props: {
      area: totalArea,
      centroidX: cx,
      centroidY: cy,
      Ix, Iy, Ixy,
      rx, ry,
      Zx_top, Zx_bottom,
      Zy_left, Zy_right,
      Imax, Imin,
      principalAngle,
      yMax, yMin, xMax, xMin,
    },
    componentProps: compProps,
    trace: { title: 'Section Properties', steps: traceSteps, children: childTraces },
  };
}

// ─── Stress calculation ───────────────────────────────────────────────────

export function computeStress(
  props: import('./types').SectionProperties,
  loads: import('./types').StressInput,
): {
  maxCompression: number;
  maxTension: number;
  stressAt: (x: number, y: number) => number;
  neutralAxisAngle: number;
  trace: CalcTrace;
} {
  const { P, Mx, My } = loads;
  const { area, Ix, Iy, Ixy, xMin, xMax, yMin, yMax } = props;

  const stressAt = (x: number, y: number) => {
    if (area === 0) return 0;
    // For symmetric sections (Ixy ≈ 0), simplified formula
    if (Math.abs(Ixy) < 1e-6) {
      return (area > 0 ? P / area : 0) + (Ix !== 0 ? (Mx * y) / Ix : 0) + (Iy !== 0 ? (My * x) / Iy : 0);
    }
    // General formula for asymmetric sections
    const denom = Ix * Iy - Ixy * Ixy;
    if (Math.abs(denom) < 1e-10) return 0;
    return (area > 0 ? P / area : 0)
      + ((Mx * Iy - My * Ixy) * y + (My * Ix - Mx * Ixy) * x) / denom;
  };

  // Compute corner stresses
  const corners = [
    { x: xMin, y: yMin },
    { x: xMax, y: yMin },
    { x: xMin, y: yMax },
    { x: xMax, y: yMax },
  ];
  let maxC = 0, maxT = 0;
  for (const c of corners) {
    const s = stressAt(c.x, c.y);
    if (s < maxC) maxC = s;
    if (s > maxT) maxT = s;
  }

  const neutralAxisAngle = My !== 0 ? Math.atan(-Mx * Iy / (My * Ix)) / DEG : 90;

  const trace: CalcTrace = {
    title: 'Stress Analysis',
    steps: [
      { label: 'Axial Stress', formula: 'σa = P/A', substitution: `${fmt(P)} / ${fmt(area)}`, result: fmt(area > 0 ? P / area : 0), unit: 'MPa' },
      { label: 'Max Compression', formula: '', substitution: '', result: fmt(maxC), unit: 'MPa' },
      { label: 'Max Tension', formula: '', substitution: '', result: fmt(maxT), unit: 'MPa' },
    ],
  };

  return { maxCompression: maxC, maxTension: maxT, stressAt, neutralAxisAngle, trace };
}

// ─── Formatting helpers ──────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) < 0.005) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSci(n: number): string {
  if (Math.abs(n) < 0.01) return '0.00';
  if (Math.abs(n) >= 1e6) return n.toExponential(3);
  return fmt(n);
}

export { fmt, fmtSci };
