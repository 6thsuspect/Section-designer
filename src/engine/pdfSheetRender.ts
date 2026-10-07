/**
 * Renders the single-page technical sheet onto a jsPDF document.
 * Monochrome, thin borders, no decorative elements: section name top-left,
 * date bottom-right, a bordered figure and a bordered property table.
 */
import type { jsPDF } from 'jspdf';
import type { Point, SectionProject, SectionProperties } from './types';
import { computeComponentProps } from './geometry';
import { componentRenderRings } from './combine';
import {
  SHEET,
  computeSheetLayout,
  formatEngineering,
  sheetDate,
  sheetLines,
  sheetPropertyGroups,
  splitColumns,
  type PropertyRow,
  type SheetLine,
} from './pdfSheet';

// Greyscale palette (RGB 0–255)
const INK = 20;        // primary text / geometry outline
const SOFT = 85;       // secondary text
const RULE = 200;      // hairlines
const FILL = 232;      // section material fill

/** Paper-space rings for every visible component (combined → true rings). */
function sectionRings(project: SectionProject): { material: Point[][][]; holes: Point[][] } {
  const material: Point[][][] = [];
  const holes: Point[][] = [];
  for (const c of project.components) {
    if (!c.visible) continue;
    const rings = componentRenderRings(c) ?? [computeComponentProps(c).outline];
    const valid = rings.filter(r => r.length >= 3);
    if (valid.length === 0) continue;
    if (c.operation === 'subtract') holes.push(...valid);
    else material.push(valid);
  }
  return { material, holes };
}

function bbox(rings: Point[][]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rings) for (const p of r) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

function tracePath(doc: jsPDF, rings: Point[][]) {
  for (const ring of rings) {
    ring.forEach((p, i) => (i === 0 ? doc.moveTo(p.x, p.y) : doc.lineTo(p.x, p.y)));
    doc.close();
  }
}

function arrow(doc: jsPDF, tip: Point, dx: number, dy: number, len = 1.6, half = 0.45) {
  const bx = tip.x - dx * len, by = tip.y - dy * len;
  doc.triangle(tip.x, tip.y, bx - dy * half, by + dx * half, bx + dy * half, by - dx * half, 'F');
}

function fmtDim(v: number): string {
  return Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(3);
}

/** Draw the full single-page sheet. Returns the layout (useful for tests). */
export function renderSectionSheet(doc: jsPDF, props: SectionProperties, project: SectionProject, date = new Date()) {
  const unit = project.units;
  const { material, holes } = sectionRings(project);
  // Fit the drawing to everything drawn (holes may poke out of the material),
  // but dimension the material envelope only.
  const box = bbox([...material.flat(), ...holes]);
  const env = bbox(material.flat()) ?? box;
  const sectionW = box ? box.maxX - box.minX : 0;
  const sectionH = box ? box.maxY - box.minY : 0;

  const envelope = bbox(material.flat());
  const lines = sheetLines(sheetPropertyGroups(props, unit,
    envelope ? { width: envelope.maxX - envelope.minX, height: envelope.maxY - envelope.minY } : undefined));
  const [colA, colB] = splitColumns(lines);
  const L = computeSheetLayout(sectionW, sectionH, Math.max(colA.length, colB.length));

  doc.setLineCap('butt');
  doc.setLineJoin('miter');

  // ─── Section name (top-left) ───
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(SHEET.titleSize);
  doc.setTextColor(INK);
  doc.text(project.name || 'Untitled section', L.margin, L.titleY);

  // ─── Date (bottom-right) ───
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(SHEET.dateSize);
  doc.setTextColor(SOFT);
  doc.text(sheetDate(date), L.pageW - L.margin, L.dateY, { align: 'right' });

  // ─── Figure box ───
  doc.setDrawColor(INK);
  doc.setLineWidth(SHEET.border);
  doc.rect(L.figure.x, L.figure.y, L.figure.w, L.figure.h, 'S');

  if (box && sectionW > 0 && sectionH > 0) {
    const s = L.scale;
    const cx = L.drawing.x + L.drawing.w / 2;
    const cy = L.drawing.y + L.drawing.h / 2;
    const midX = (box.minX + box.maxX) / 2;
    const midY = (box.minY + box.maxY) / 2;
    const P = (p: Point): Point => ({ x: cx + (p.x - midX) * s, y: cy - (p.y - midY) * s });

    // Material (each component; even-odd keeps combined-section voids open)
    doc.setFillColor(FILL, FILL, FILL);
    doc.setDrawColor(INK);
    doc.setLineWidth(0.3);
    for (const rings of material) {
      tracePath(doc, rings.map(r => r.map(P)));
      doc.fillStrokeEvenOdd();
    }
    // Subtracted shapes / holes: paper-white with outline
    doc.setFillColor(255, 255, 255);
    for (const ring of holes) {
      tracePath(doc, [ring.map(P)]);
      doc.fillStroke();
    }

    // Centroid
    const g = P({ x: props.centroidX, y: props.centroidY });
    const r = 1.3;
    doc.setDrawColor(INK);
    doc.setLineWidth(0.2);
    doc.circle(g.x, g.y, r, 'S');
    doc.line(g.x - 2.6 * r, g.y, g.x + 2.6 * r, g.y);
    doc.line(g.x, g.y - 2.6 * r, g.x, g.y + 2.6 * r);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(INK);
    doc.text('CG', g.x + 1.6 * r, g.y - 1.6 * r);

    // Principal axes (only when they differ from Y/Z)
    if (Math.abs(props.principalAngle) > 0.05 && Math.abs(Math.abs(props.principalAngle) - 90) > 0.05) {
      const a = (props.principalAngle * Math.PI) / 180;
      const ux = Math.cos(a), uy = -Math.sin(a); // paper Y is down
      // Axes are clipped to the section's extent (+1.5 mm) so they never cross
      // the dimension lines or leave the frame.
      const c0 = P({ x: box.minX, y: box.maxY });
      const c1 = P({ x: box.maxX, y: box.minY });
      const lim = { x0: c0.x - 1.5, x1: c1.x + 1.5, y0: c0.y - 1.5, y1: c1.y + 1.5 };
      const reach = (dx: number, dy: number) => {
        let t = Infinity;
        if (dx > 1e-9) t = Math.min(t, (lim.x1 - g.x) / dx);
        if (dx < -1e-9) t = Math.min(t, (lim.x0 - g.x) / dx);
        if (dy > 1e-9) t = Math.min(t, (lim.y1 - g.y) / dy);
        if (dy < -1e-9) t = Math.min(t, (lim.y0 - g.y) / dy);
        return Math.max(0, t);
      };
      doc.setDrawColor(SOFT);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([1.6, 0.8, 0.3, 0.8], 0);
      const axes: Array<[string, number, number]> = [['u', ux, uy], ['v', -uy, ux]];
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(SOFT);
      for (const [label, dx, dy] of axes) {
        const tp = reach(dx, dy), tn = reach(-dx, -dy);
        doc.line(g.x - dx * tn, g.y - dy * tn, g.x + dx * tp, g.y + dy * tp);
        doc.text(label, g.x + dx * (tp + 1.2), g.y + dy * (tp + 1.2), { align: 'center', baseline: 'middle' });
      }
      doc.setLineDashPattern([], 0);
    }

    // Overall dimensions: width below, height to the right
    const e = env ?? box;
    const envW = e.maxX - e.minX;
    const envH = e.maxY - e.minY;
    const tl = P({ x: e.minX, y: e.maxY });
    const br = P({ x: e.maxX, y: e.minY });
    // Dimension lines sit just outside everything drawn.
    const outerBottom = P({ x: 0, y: box.minY }).y;
    const outerRight = P({ x: box.maxX, y: 0 }).x;
    const off = 4.5;
    const ext = 1.2;
    doc.setDrawColor(INK);
    doc.setFillColor(INK, INK, INK);
    doc.setLineWidth(0.15);
    // width
    const yd = outerBottom + off;
    doc.line(tl.x, br.y + 0.8, tl.x, yd + ext);
    doc.line(br.x, br.y + 0.8, br.x, yd + ext);
    doc.line(tl.x, yd, br.x, yd);
    arrow(doc, { x: tl.x, y: yd }, -1, 0);
    arrow(doc, { x: br.x, y: yd }, 1, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(INK);
    // Text on the outer side of the dimension line (never over the section).
    doc.text(fmtDim(envW), (tl.x + br.x) / 2, yd + 3.4, { align: 'center' });
    // height
    const xd = outerRight + off;
    doc.line(br.x + 0.8, tl.y, xd + ext, tl.y);
    doc.line(br.x + 0.8, br.y, xd + ext, br.y);
    doc.line(xd, tl.y, xd, br.y);
    arrow(doc, { x: xd, y: tl.y }, 0, -1);
    arrow(doc, { x: xd, y: br.y }, 0, 1);
    // Rotated text: centre manually (jsPDF's align ignores the rotation).
    const hText = fmtDim(envH);
    doc.text(hText, xd + 3.4, (tl.y + br.y) / 2 + doc.getTextWidth(hText) / 2, { angle: 90 });

    // Units note (bottom-left, inside the figure frame)
    doc.setFontSize(6.5);
    doc.setTextColor(SOFT);
    doc.text(`Dimensions in ${unit}`, L.figure.x + 3, L.figure.y + L.figure.h - 3);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(SOFT);
    doc.text('No section geometry', L.figure.x + L.figure.w / 2, L.figure.y + L.figure.h / 2, { align: 'center' });
  }

  // ─── Properties box ───
  const B = L.properties;
  doc.setDrawColor(INK);
  doc.setLineWidth(SHEET.border);
  doc.rect(B.x, B.y, B.w, B.h, 'S');
  // column divider
  const midX = B.x + B.w / 2;
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.15);
  doc.line(midX, B.y + SHEET.propsPadY - 1, midX, B.y + B.h - SHEET.propsPadY + 1);

  const colW = B.w / 2 - 2 * SHEET.propsPadX;
  const colX = [B.x + SHEET.propsPadX, midX + SHEET.propsPadX];
  const top = B.y + SHEET.propsPadY + SHEET.propsHeadingH;
  [colA, colB].forEach((col, ci) => drawColumn(doc, col, colX[ci], top, colW, L.rowH));

  return L;
}

function drawColumn(doc: jsPDF, lines: SheetLine[], x: number, top: number, w: number, rowH: number) {
  lines.forEach((line, i) => {
    const yMid = top + i * rowH + rowH / 2;
    const base = yMid + 1.05; // text baseline (≈ cap-height centring at ~7.5 pt)
    if (line.kind === 'heading') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(INK);
      doc.text(line.title.toUpperCase(), x, base + 0.6, { charSpace: 0.15 });
      doc.setDrawColor(RULE);
      doc.setLineWidth(0.12);
      doc.line(x, top + (i + 1) * rowH - 0.2, x + w, top + (i + 1) * rowH - 0.2);
      return;
    }
    drawRow(doc, line.row, x, base, w);
  });
}

function drawRow(doc: jsPDF, row: PropertyRow, x: number, base: number, w: number) {
  const valueRight = x + w - 13;
  const unitX = x + w - 11.5;

  // Symbol (italic) + subscript
  if (row.greek) doc.setFont('symbol', 'normal');
  else doc.setFont('times', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(INK);
  doc.text(row.symbol, x, base);
  if (row.sub) {
    const sw = doc.getTextWidth(row.symbol);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.text(row.sub, x + sw + 0.3, base + 0.9);
  }

  // Description
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  doc.text(row.description, x + 15, base);

  // Value (right-aligned; m × 10^e with a raised exponent)
  const v = formatEngineering(row.value, (row.power ?? 0) >= 3);
  doc.setTextColor(INK);
  doc.setFontSize(8);
  if (v.exponent === null) {
    doc.text(v.mantissa, valueRight, base, { align: 'right' });
  } else {
    const head = `${v.mantissa} × 10`;
    const exp = String(v.exponent);
    const wHead = doc.getTextWidth(head);
    doc.setFontSize(5.8);
    const wExp = doc.getTextWidth(exp);
    const start = valueRight - wHead - wExp - 0.2;
    doc.setFontSize(8);
    doc.text(head, start, base);
    doc.setFontSize(5.8);
    doc.text(exp, start + wHead + 0.2, base - 1.5);
  }

  // Unit with raised power
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(SOFT);
  doc.text(row.unit, unitX, base);
  if (row.power) {
    const uw = doc.getTextWidth(row.unit);
    doc.setFontSize(5.5);
    doc.text(String(row.power), unitX + uw + 0.2, base - 1.4);
  }
}

