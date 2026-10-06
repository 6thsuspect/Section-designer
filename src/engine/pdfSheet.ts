/**
 * Single-page technical PDF sheet — pure layout & formatting helpers.
 *
 * Page (A4 portrait, mm):
 *   ┌──────────────────────────────────────────┐
 *   │ Section Name                             │  ← only header text
 *   │ ┌──────────────────────────────────────┐ │
 *   │ │             Section figure           │ │  ← thin border
 *   │ └──────────────────────────────────────┘ │
 *   │ ┌──────────────────────────────────────┐ │
 *   │ │  Section properties (2 columns)      │ │  ← thin border
 *   │ └──────────────────────────────────────┘ │
 *   │                                    Date  │  ← only footer text
 *   └──────────────────────────────────────────┘
 *
 * The properties box takes the height its rows need and the figure box fills
 * the remaining height; the section is scaled to fit and centred inside its
 * frame, so wide, tall and square sections all give a balanced page.
 */
import type { SectionProperties } from './types';

export interface Box { x: number; y: number; w: number; h: number }

export interface SheetLayout {
  pageW: number;
  pageH: number;
  margin: number;
  /** Baseline of the section name (top-left). */
  titleY: number;
  /** Baseline of the date (bottom-right). */
  dateY: number;
  figure: Box;
  properties: Box;
  /** Drawing area inside the figure box (after padding + dimension room). */
  drawing: Box;
  /** Model → paper scale (mm on paper per model unit). */
  scale: number;
  /** Properties table metrics. */
  rowH: number;
  rowsPerColumn: number;
}

export const SHEET = {
  pageW: 210,
  pageH: 297,
  margin: 18,
  titleSize: 13,
  dateSize: 8,
  gap: 7,
  /** Border line weight (mm). */
  border: 0.25,
  figurePad: 8,
  /** Extra room for the overall-dimension lines (below / right of drawing). */
  dimRoom: 10,
  propsPadX: 5,
  propsPadY: 5,
  /** Extra top room inside the properties box (no title is printed). */
  propsHeadingH: 0,
  minRowH: 4.6,
  rowH: 5.0,
  minFigureH: 70,
} as const;

/**
 * Compute the sheet layout for a section of model size `sectionW × sectionH`
 * whose property table needs `rowsPerColumn` row slots in its taller column.
 */
export function computeSheetLayout(sectionW: number, sectionH: number, rowsPerColumnIn: number): SheetLayout {
  const { pageW, pageH, margin, gap } = SHEET;
  const titleY = margin + 2;
  const dateY = pageH - margin + 4;
  const contentTop = titleY + 6;
  const contentBottom = dateY - 7;
  const contentW = pageW - 2 * margin;
  const available = contentBottom - contentTop;

  const rowsPerColumn = Math.max(1, Math.ceil(rowsPerColumnIn));
  const propsFixed = 2 * SHEET.propsPadY + SHEET.propsHeadingH;

  // Properties take the rows they need (comfortable row height, tightened
  // only when the figure would drop below its minimum). The figure box fills
  // the rest, so the frames always span title → date with fixed margins and
  // the section is centred inside its frame.
  let rowH: number = SHEET.rowH;
  let propsH = propsFixed + rowsPerColumn * rowH;
  if (available - gap - propsH < SHEET.minFigureH) {
    rowH = Math.max(SHEET.minRowH, (available - gap - SHEET.minFigureH - propsFixed) / rowsPerColumn);
    propsH = propsFixed + rowsPerColumn * rowH;
  }
  const figureH = Math.max(SHEET.minFigureH, available - gap - propsH);
  const top = contentTop;

  const figure: Box = { x: margin, y: top, w: contentW, h: figureH };
  const properties: Box = { x: margin, y: top + figureH + gap, w: contentW, h: propsH };

  // Drawing area (leave dimension room at the bottom and the right).
  const drawing: Box = {
    x: figure.x + SHEET.figurePad,
    y: figure.y + SHEET.figurePad,
    w: figure.w - 2 * SHEET.figurePad - SHEET.dimRoom,
    h: figure.h - 2 * SHEET.figurePad - SHEET.dimRoom,
  };
  const scale = sectionW > 0 && sectionH > 0
    ? Math.min(drawing.w / sectionW, drawing.h / sectionH)
    : 1;

  return { pageW, pageH, margin, titleY, dateY, figure, properties, drawing, scale, rowH, rowsPerColumn };
}

/** Number split for typesetting: mantissa text plus optional power of ten. */
export interface EngNumber { mantissa: string; exponent: number | null }

/**
 * Technical number format: fixed notation for ordinary magnitudes, otherwise
 * `m × 10^e` with a 4-significant-figure mantissa (e.g. 1.235 × 10⁷).
 */
export function formatEngineering(v: number, preferPowers = false): EngNumber {
  if (!Number.isFinite(v)) return { mantissa: '—', exponent: null };
  const a = Math.abs(v);
  if (a < 1e-12) return { mantissa: '0', exponent: null };
  // preferPowers: moduli / second moments use m × 10^e from 10³ up, so a
  // column of mm³ / mm⁴ values is typeset consistently.
  if (a >= (preferPowers ? 1e3 : 1e5) || a < 1e-3) {
    let e = Math.floor(Math.log10(a));
    let m = v / 10 ** e;
    // Rounding can push |m| to 10.000 → renormalise.
    if (Math.abs(Number(m.toFixed(3))) >= 10) { e += 1; m = v / 10 ** e; }
    return { mantissa: m.toFixed(3), exponent: e };
  }
  const decimals = a >= 1000 ? 1 : a >= 100 ? 2 : 3;
  return { mantissa: v.toFixed(decimals), exponent: null };
}

/** A property row: symbol with optional subscript, description, value, unit + power. */
export interface PropertyRow {
  /** Main symbol letter(s). `greek` renders via the Symbol font (e.g. 'a' → α). */
  symbol: string;
  greek?: boolean;
  sub?: string;
  description: string;
  value: number;
  /** Unit base, e.g. 'mm' or '°'. */
  unit: string;
  /** Unit power (2, 3, 4) or undefined. */
  power?: number;
}

export interface PropertyGroup { title: string; rows: PropertyRow[] }

/** The property set printed on the sheet, grouped (application X ≡ Y, Y ≡ Z). */
export function sheetPropertyGroups(
  p: SectionProperties,
  unit: string,
  /** Material envelope (matches the figure's overall dimensions). */
  envelope?: { width: number; height: number },
): PropertyGroup[] {
  return [
    {
      title: 'Geometry',
      rows: [
        { symbol: 'A', description: 'Area', value: p.area, unit, power: 2 },
        { symbol: 'y', sub: 'c', description: 'Centroid, Y', value: p.centroidX, unit },
        { symbol: 'z', sub: 'c', description: 'Centroid, Z', value: p.centroidY, unit },
        { symbol: 'b', description: 'Overall width', value: envelope?.width ?? p.xMax - p.xMin, unit },
        { symbol: 'h', description: 'Overall height', value: envelope?.height ?? p.yMax - p.yMin, unit },
      ],
    },
    {
      title: 'Second moments of area',
      rows: [
        { symbol: 'I', sub: 'y', description: 'About centroidal Y', value: p.Ix, unit, power: 4 },
        { symbol: 'I', sub: 'z', description: 'About centroidal Z', value: p.Iy, unit, power: 4 },
        { symbol: 'I', sub: 'yz', description: 'Product of inertia', value: p.Ixy, unit, power: 4 },
        { symbol: 'I', sub: 'u', description: 'Principal, major', value: p.Iu, unit, power: 4 },
        { symbol: 'I', sub: 'v', description: 'Principal, minor', value: p.Iv, unit, power: 4 },
        { symbol: 'a', greek: true, description: 'Principal axis angle', value: p.principalAngle, unit: '°' },
        { symbol: 'I', sub: 't', description: 'Torsion constant', value: p.It, unit, power: 4 },
      ],
    },
    {
      title: 'Radii of gyration',
      rows: [
        { symbol: 'i', sub: 'y', description: 'About Y', value: p.rx, unit },
        { symbol: 'i', sub: 'z', description: 'About Z', value: p.ry, unit },
        { symbol: 'i', sub: 'u', description: 'About U', value: p.iu, unit },
        { symbol: 'i', sub: 'v', description: 'About V', value: p.iv, unit },
      ],
    },
    {
      title: 'Elastic section moduli',
      rows: [
        { symbol: 'W', sub: 'y,top', description: 'About Y, top fibre', value: p.Zx_top, unit, power: 3 },
        { symbol: 'W', sub: 'y,bot', description: 'About Y, bottom fibre', value: p.Zx_bottom, unit, power: 3 },
        { symbol: 'W', sub: 'z,left', description: 'About Z, left fibre', value: p.Zy_left, unit, power: 3 },
        { symbol: 'W', sub: 'z,right', description: 'About Z, right fibre', value: p.Zy_right, unit, power: 3 },
        { symbol: 'W', sub: 'u', description: 'About U (min.)', value: Math.min(p.WuP, p.WuM), unit, power: 3 },
        { symbol: 'W', sub: 'v', description: 'About V (min.)', value: Math.min(p.WvP, p.WvM), unit, power: 3 },
      ],
    },
    {
      title: 'Plastic section moduli',
      rows: [
        { symbol: 'W', sub: 'pl,u', description: 'About U', value: p.Wplu, unit, power: 3 },
        { symbol: 'W', sub: 'pl,v', description: 'About V', value: p.Wplv, unit, power: 3 },
      ],
    },
    {
      title: 'Extreme fibres (from centroid)',
      rows: [
        { symbol: 'z', sub: 'top', description: 'To top edge', value: p.yMax, unit },
        { symbol: 'z', sub: 'bot', description: 'To bottom edge', value: Math.abs(p.yMin), unit },
        { symbol: 'y', sub: 'left', description: 'To left edge', value: Math.abs(p.xMin), unit },
        { symbol: 'y', sub: 'right', description: 'To right edge', value: p.xMax, unit },
      ],
    },
  ];
}

/** Flattened table lines: a group heading occupies one row slot. */
export type SheetLine = { kind: 'heading'; title: string } | { kind: 'row'; row: PropertyRow };

export function sheetLines(groups: PropertyGroup[]): SheetLine[] {
  const out: SheetLine[] = [];
  for (const g of groups) {
    out.push({ kind: 'heading', title: g.title });
    for (const row of g.rows) out.push({ kind: 'row', row });
  }
  return out;
}

/**
 * Split lines into two balanced columns, never leaving a heading orphaned at
 * the bottom of the first column and preferring to break between groups.
 */
export function splitColumns(lines: SheetLine[]): [SheetLine[], SheetLine[]] {
  const half = Math.ceil(lines.length / 2);
  // Candidate break points: before any heading. Pick the one nearest half.
  let best = half;
  let bestScore = Infinity;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].kind !== 'heading') continue;
    const score = Math.abs(i - half);
    if (score < bestScore) { bestScore = score; best = i; }
  }
  // Fall back to the exact half if group breaks are badly unbalanced.
  if (bestScore > Math.max(3, lines.length * 0.15)) {
    best = half;
    if (lines[best - 1]?.kind === 'heading') best -= 1;
  }
  return [lines.slice(0, best), lines.slice(best)];
}

/** Date printed bottom-right, e.g. "7 October 2026". */
export function sheetDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
