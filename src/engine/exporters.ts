import type { SectionProject, SectionProperties, CalcTrace, SectionFileFormat, SectionComponent, Point } from './types';
import type { Worksheet, Fill, Style } from 'exceljs';
import { fmt, fmtSci, computeComponentProps } from './geometry';

// ─── Constants ────────────────────────────────────────────────────────────

const SCHEMA_VERSION = '1.0.0';
const APP_NAME = 'Section Designer';
const APP_VERSION = '1.1.0';

// ─── JSON Export/Import ───────────────────────────────────────────────────

export function createSectionFile(project: SectionProject): SectionFileFormat {
  return {
    schemaVersion: SCHEMA_VERSION,
    application: APP_NAME,
    applicationVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    project,
  };
}

export function exportJSON(project: SectionProject): string {
  const fileData = createSectionFile(project);
  return JSON.stringify(fileData, null, 2);
}

export function downloadJSON(project: SectionProject): void {
  try {
    const data = exportJSON(project);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.section.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('JSON export failed:', e);
    alert('Failed to export JSON. Please try again.');
  }
}

export interface ImportResult {
  success: boolean;
  project?: SectionProject;
  error?: string;
  warnings?: string[];
}

export function validateAndImportJSON(jsonString: string): ImportResult {
  try {
    const data = JSON.parse(jsonString);
    const warnings: string[] = [];

    // Check if it's the new format with schema
    if (data.schemaVersion && data.project) {
      const file = data as SectionFileFormat;

      // Version check
      const [major] = file.schemaVersion.split('.').map(Number);
      const [currentMajor] = SCHEMA_VERSION.split('.').map(Number);

      if (major > currentMajor) {
        return {
          success: false,
          error: `This file was created with a newer version (${file.schemaVersion}). Please update the application.`,
        };
      }

      if (file.schemaVersion !== SCHEMA_VERSION) {
        warnings.push(`File version ${file.schemaVersion} differs from current ${SCHEMA_VERSION}. Some features may not work correctly.`);
      }

      // Validate project structure
      const project = file.project;
      if (!project.id || !project.name || !Array.isArray(project.components)) {
        return { success: false, error: 'Invalid project structure in file.' };
      }

      // Validate components
      for (const comp of project.components) {
        if (!comp.id || !comp.type || !comp.geometry) {
          return { success: false, error: `Invalid component structure: ${comp.name || 'unknown'}` };
        }
      }

      return { success: true, project, warnings: warnings.length > 0 ? warnings : undefined };
    }

    // Legacy format (direct project)
    if (data.components && Array.isArray(data.components)) {
      warnings.push('This is a legacy file format. Consider re-exporting in the new format.');
      return { success: true, project: data as SectionProject, warnings };
    }

    return { success: false, error: 'Unrecognized file format.' };
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}` };
  }
}

// ─── CSV Export ───────────────────────────────────────────────────────────

export function exportCSV(props: SectionProperties, project: SectionProject): string {
  const lines: string[] = [];
  lines.push('Property,Value,Unit');
  lines.push(`Section Name,"${project.name}",`);
  lines.push(`Units,,${project.units}`);
  lines.push(`Area,${props.area},${project.units}²`);
  lines.push(`Centroid X,${props.centroidX},${project.units}`);
  lines.push(`Centroid Y,${props.centroidY},${project.units}`);
  lines.push(`Ix,${props.Ix},${project.units}⁴`);
  lines.push(`Iy,${props.Iy},${project.units}⁴`);
  lines.push(`Ixy,${props.Ixy},${project.units}⁴`);
  lines.push(`rx,${props.rx},${project.units}`);
  lines.push(`ry,${props.ry},${project.units}`);
  lines.push(`Zx (top),${props.Zx_top},${project.units}³`);
  lines.push(`Zx (bottom),${props.Zx_bottom},${project.units}³`);
  lines.push(`Zy (left),${props.Zy_left},${project.units}³`);
  lines.push(`Zy (right),${props.Zy_right},${project.units}³`);
  lines.push(`Imax,${props.Imax},${project.units}⁴`);
  lines.push(`Imin,${props.Imin},${project.units}⁴`);
  lines.push(`Principal Angle,${props.principalAngle},degrees`);
  // Extended properties (Y-Z user axes / U-V principal axes)
  lines.push(`It (St. Venant),${props.It},${project.units}⁴`);
  lines.push(`Iu,${props.Iu},${project.units}⁴`);
  lines.push(`Iv,${props.Iv},${project.units}⁴`);
  lines.push(`iu,${props.iu},${project.units}`);
  lines.push(`iv,${props.iv},${project.units}`);
  lines.push(`Wu (+),${props.WuP},${project.units}³`);
  lines.push(`Wu (-),${props.WuM},${project.units}³`);
  lines.push(`Wv (+),${props.WvP},${project.units}³`);
  lines.push(`Wv (-),${props.WvM},${project.units}³`);
  lines.push(`Wpl,u,${props.Wplu},${project.units}³`);
  lines.push(`Wpl,v,${props.Wplv},${project.units}³`);
  lines.push(`au (+),${props.auP},${project.units}`);
  lines.push(`au (-),${props.auM},${project.units}`);
  lines.push(`av (+),${props.avP},${project.units}`);
  lines.push(`av (-),${props.avM},${project.units}`);
  lines.push(`yP,${props.yP},${project.units}`);
  lines.push(`zP,${props.zP},${project.units}`);
  lines.push(`uP,${props.uP},${project.units}`);
  lines.push(`vP,${props.vP},${project.units}`);
  return lines.join('\n');
}

export function downloadCSV(props: SectionProperties, project: SectionProject): void {
  try {
    const data = exportCSV(props, project);
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_properties.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('CSV export failed:', e);
    alert('Failed to export CSV. Please try again.');
  }
}

// ─── DXF Export ───────────────────────────────────────────────────────────
// R12-compatible ASCII DXF so the file opens correctly (with visible,
// correctly-zoomed geometry) in AutoCAD and AutoCAD-compatible viewers:
//   • explicit $ACADVER (AC1009) so entities are never misread
//   • $EXTMIN/$EXTMAX so "zoom extents" shows the section immediately
//   • POLYLINE/VERTEX (R12 entities) instead of LWPOLYLINE (R14+), which
//     strict viewers drop from version-less files — the cause of the
//     previously empty drawings
//   • LTYPE table for the CENTER/DASHDOT linetypes referenced by layers

type DXFColor = number;

const DXF_LAYERS: { name: string; color: DXFColor; linetype: string }[] = [
  { name: 'SECTION', color: 7, linetype: 'CONTINUOUS' },
  { name: 'CUTOUT', color: 1, linetype: 'CONTINUOUS' },
  { name: 'DIMENSIONS', color: 3, linetype: 'CONTINUOUS' },
  { name: 'TEXT', color: 5, linetype: 'CONTINUOUS' },
  { name: 'CENTERLINE', color: 6, linetype: 'CENTER' },
  { name: 'AXIS', color: 2, linetype: 'DASHDOT' },
];

function dxfPair(code: number | string, value: number | string): string {
  return `${code}\n${value}\n`;
}

function generateDXFHeader(minX: number, minY: number, maxX: number, maxY: number): string {
  let s = '';
  s += dxfPair(0, 'SECTION') + dxfPair(2, 'HEADER');
  s += dxfPair(9, '$ACADVER') + dxfPair(1, 'AC1009');
  s += dxfPair(9, '$INSBASE') + dxfPair(10, '0.0') + dxfPair(20, '0.0') + dxfPair(30, '0.0');
  s += dxfPair(9, '$EXTMIN') + dxfPair(10, (minX - 1).toFixed(4)) + dxfPair(20, (minY - 1).toFixed(4)) + dxfPair(30, '0.0');
  s += dxfPair(9, '$EXTMAX') + dxfPair(10, (maxX + 1).toFixed(4)) + dxfPair(20, (maxY + 1).toFixed(4)) + dxfPair(30, '0.0');
  s += dxfPair(0, 'ENDSEC');

  s += dxfPair(0, 'SECTION') + dxfPair(2, 'TABLES');

  // Linetype table
  s += dxfPair(0, 'TABLE') + dxfPair(2, 'LTYPE') + dxfPair(70, 3);
  s += dxfPair(0, 'LTYPE') + dxfPair(2, 'CONTINUOUS') + dxfPair(70, 64) + dxfPair(3, 'Solid line') + dxfPair(72, 65) + dxfPair(73, 0) + dxfPair(40, '0.0');
  s += dxfPair(0, 'LTYPE') + dxfPair(2, 'CENTER') + dxfPair(70, 64) + dxfPair(3, 'Center __ _ __ _ __') + dxfPair(72, 65) + dxfPair(73, 4) + dxfPair(40, '2.0')
    + dxfPair(49, '1.25') + dxfPair(49, '-0.25') + dxfPair(49, '0.25') + dxfPair(49, '-0.25');
  s += dxfPair(0, 'LTYPE') + dxfPair(2, 'DASHDOT') + dxfPair(70, 64) + dxfPair(3, 'Dash dot _ . _ . _') + dxfPair(72, 65) + dxfPair(73, 4) + dxfPair(40, '0.9')
    + dxfPair(49, '0.5') + dxfPair(49, '-0.2') + dxfPair(49, '0.0') + dxfPair(49, '-0.2');
  s += dxfPair(0, 'ENDTAB');

  // Layer table
  s += dxfPair(0, 'TABLE') + dxfPair(2, 'LAYER') + dxfPair(70, DXF_LAYERS.length);
  for (const layer of DXF_LAYERS) {
    s += dxfPair(0, 'LAYER') + dxfPair(2, layer.name) + dxfPair(70, 0) + dxfPair(62, layer.color) + dxfPair(6, layer.linetype);
  }
  s += dxfPair(0, 'ENDTAB');

  s += dxfPair(0, 'ENDSEC');
  s += dxfPair(0, 'SECTION') + dxfPair(2, 'ENTITIES');
  return s;
}

/** Closed/open outline as a POLYLINE (R12) with VERTEX entries. */
function generateDXFPolyline(points: Point[], layer: string, closed: boolean = true): string {
  const cleanPoints = points.filter((p, index) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (index === 0) return true;
    const prev = points[index - 1];
    return p.x !== prev.x || p.y !== prev.y;
  });

  if (cleanPoints.length < 2) return '';

  let dxf = dxfPair(0, 'POLYLINE') + dxfPair(8, layer) + dxfPair(66, 1) + dxfPair(70, closed ? 1 : 0)
    + dxfPair(10, '0.0') + dxfPair(20, '0.0') + dxfPair(30, '0.0');
  for (const p of cleanPoints) {
    dxf += dxfPair(0, 'VERTEX') + dxfPair(8, layer)
      + dxfPair(10, p.x.toFixed(6)) + dxfPair(20, p.y.toFixed(6)) + dxfPair(30, '0.0');
  }
  dxf += dxfPair(0, 'SEQEND') + dxfPair(8, layer);
  return dxf;
}

function generateDXFText(text: string, x: number, y: number, height: number, layer: string): string {
  return dxfPair(0, 'TEXT') + dxfPair(8, layer)
    + dxfPair(10, x.toFixed(4)) + dxfPair(20, y.toFixed(4)) + dxfPair(30, '0.0')
    + dxfPair(40, height.toFixed(4))
    + dxfPair(1, text);
}

function generateDXFLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return dxfPair(0, 'LINE') + dxfPair(8, layer)
    + dxfPair(10, x1.toFixed(4)) + dxfPair(20, y1.toFixed(4)) + dxfPair(30, '0.0')
    + dxfPair(11, x2.toFixed(4)) + dxfPair(21, y2.toFixed(4)) + dxfPair(31, '0.0');
}

function generateDXFFooter(): string {
  return dxfPair(0, 'ENDSEC') + dxfPair(0, 'EOF');
}

export function exportDXF(project: SectionProject, props: SectionProperties): string {
  const visibleComps = project.components.filter(c => c.visible);
  const outlines = visibleComps
    .map(c => computeComponentProps(c).outline.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .filter(o => o.length >= 2);

  // Overall extents (components preferred, section bounds as fallback)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const outline of outlines) {
    for (const p of outline) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = props.xMin; maxX = props.xMax; minY = props.yMin; maxY = props.yMax;
  }

  const sectionWidth = Math.max(Math.abs(maxX - minX), 1e-6);
  const sectionHeight = Math.max(Math.abs(maxY - minY), 1e-6);
  const maxDimension = Math.max(sectionWidth, sectionHeight);
  const textHeight = Math.max(maxDimension * 0.03, 1);

  // Pad header extents so dimension lines/text fall inside the zoom-extents window
  const extentPad = Math.max(maxDimension * 0.25, 2);
  let dxf = generateDXFHeader(minX - extentPad, minY - extentPad, maxX + extentPad, maxY + extentPad);

  // Draw each component
  visibleComps.forEach((comp, i) => {
    const outline = outlines[i];
    if (outline && outline.length >= 2) {
      const layer = comp.operation === 'subtract' ? 'CUTOUT' : 'SECTION';
      dxf += generateDXFPolyline(outline, layer, true);

      // Add component label
      const compProps = computeComponentProps(comp);
      dxf += generateDXFText(comp.name, compProps.cx, compProps.cy, textHeight, 'TEXT');
    }
  });

  // Guard: fully degenerate geometry still produces a valid (empty) DXF
  if (visibleComps.length === 0) {
    dxf += generateDXFText(`${project.name} (no visible components)`, 0, 0, Math.max(textHeight, 1), 'TEXT');
  }

  // Draw centroid marker
  const markerSize = textHeight * 2;
  dxf += generateDXFLine(
    props.centroidX - markerSize, props.centroidY,
    props.centroidX + markerSize, props.centroidY,
    'CENTERLINE'
  );
  dxf += generateDXFLine(
    props.centroidX, props.centroidY - markerSize,
    props.centroidX, props.centroidY + markerSize,
    'CENTERLINE'
  );

  // Draw centroid axes
  const axisLen = Math.max(sectionWidth, sectionHeight) * 0.3;
  dxf += generateDXFLine(
    props.centroidX - axisLen, props.centroidY,
    props.centroidX + axisLen, props.centroidY,
    'AXIS'
  );
  dxf += generateDXFLine(
    props.centroidX, props.centroidY - axisLen,
    props.centroidX, props.centroidY + axisLen,
    'AXIS'
  );

  // Add axis labels
  dxf += generateDXFText('X', props.centroidX + axisLen + textHeight, props.centroidY, textHeight, 'TEXT');
  dxf += generateDXFText('Y', props.centroidX, props.centroidY + axisLen + textHeight, textHeight, 'TEXT');

  // Add section name
  dxf += generateDXFText(
    project.name,
    props.centroidX,
    maxY + textHeight * 3,
    textHeight * 1.5,
    'TEXT'
  );

  // Add overall dimensions
  const dimOffset = textHeight * 2;

  // Width dimension
  dxf += generateDXFLine(
    minX, minY - dimOffset,
    maxX, minY - dimOffset,
    'DIMENSIONS'
  );
  dxf += generateDXFText(
    `${sectionWidth.toFixed(1)} ${project.units}`,
    (minX + maxX) / 2,
    minY - dimOffset - textHeight,
    textHeight * 0.8,
    'DIMENSIONS'
  );

  // Height dimension
  dxf += generateDXFLine(
    maxX + dimOffset, minY,
    maxX + dimOffset, maxY,
    'DIMENSIONS'
  );
  dxf += generateDXFText(
    `${sectionHeight.toFixed(1)} ${project.units}`,
    maxX + dimOffset + textHeight,
    (minY + maxY) / 2,
    textHeight * 0.8,
    'DIMENSIONS'
  );

  dxf += generateDXFFooter();
  return dxf;
}

export function downloadDXF(project: SectionProject, props: SectionProperties): void {
  try {
    const data = exportDXF(project, props);
    const blob = new Blob([data], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('DXF export failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    alert(`DXF export failed:\n${message}`);
  }
}

// ─── Excel Export (interactive, formula-driven) ───────────────────────────
//
// The workbook is fully formula-linked: the Input Geometry sheet holds the
// editable vertex coordinates; the Component Calculations sheet computes each
// component's area/centroid/inertias with native shoelace formulas; the
// Section Properties sheet assembles the composite properties with parallel-
// axis formulas; the Principal Coordinates sheet transforms vertices into the
// principal frame for the U/V moduli. Editing any X/Y input recalculates the
// whole chain in Excel — no web app required.
//
// Known limitation (documented in the Notes sheet): the plastic moduli
// (Wpl,u, Wpl,v) and the equal-area axis positions (yP, zP, uP, vP) require a
// numeric root-solve / integration that cannot be expressed with practical
// native Excel formulas for arbitrary polygons, so those six values are
// exported as computed by the application and clearly annotated.

type XCell = { formula: string; result?: number } | number | string | null;

export async function exportExcel(project: SectionProject, props: SectionProperties): Promise<void> {
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = APP_NAME;
    workbook.created = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;

    const unit = project.units;
    const visibleComps = project.components.filter(c => c.visible);

    // Input-cell style (amber fill) so inputs are visually distinct
    const inputFill: Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    const headerFills: Record<string, Fill> = {
      props: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } },
      calc: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } },
      geo: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } },
      principal: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } },
    };
    const whiteFont = { bold: true, color: { argb: 'FFFFFFFF' } as const };

    const setCell = (ws: Worksheet, row: number, col: number, value: XCell, style?: Partial<Style>) => {
      const cell = ws.getRow(row).getCell(col);
      if (value !== null && typeof value === 'object') {
        cell.value = value.result !== undefined ? { formula: value.formula, result: value.result } : { formula: value.formula };
      } else {
        cell.value = value;
      }
      if (style) Object.assign(cell, style);
      return cell;
    };

    const styleHeaderRow = (ws: Worksheet, row: number, fill: Fill, cols: number) => {
      for (let c = 1; c <= cols; c++) {
        const cell = ws.getRow(row).getCell(c);
        cell.font = whiteFont;
        cell.fill = fill;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    };

    // Column letters helper
    const colName = (n: number): string => {
      let s = '';
      while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };

    // ─── Sheet order: properties reference calculations reference inputs ───
    // (create in dependency-friendly order but place Section Properties first)
    const propsSheet = workbook.addWorksheet('Section Properties');
    const calcSheet = workbook.addWorksheet('Component Calculations');
    const geoSheet = workbook.addWorksheet('Input Geometry');
    const principalSheet = workbook.addWorksheet('Principal Coordinates');
    const notesSheet = workbook.addWorksheet('Notes');

    // ─── Input Geometry sheet ──────────────────────────────────────────────
    // A CompID | B Component | C Type | D Op | E Pt | F X | G Y |
    // H Xnext | I Ynext | J cross | K (x+xn)·c/6 | L (y+yn)·c/6 |
    // M Ix-term | N Iy-term | O Ixy-term
    const GEO_HDR_ROW = 3;
    const geoHeaders = ['Comp ID', 'Component', 'Type', 'Op (+1/−1)', 'Pt', `X (${unit})`, `Y (${unit})`,
      'X next (auto)', 'Y next (auto)', 'cross (auto)', 'Ax-term (auto)', 'Ay-term (auto)',
      'Ix-term (auto)', 'Iy-term (auto)', 'Ixy-term (auto)'];
    geoHeaders.forEach((h, i) => { geoSheet.getRow(GEO_HDR_ROW).getCell(i + 1).value = h; });
    styleHeaderRow(geoSheet, GEO_HDR_ROW, headerFills.geo, geoHeaders.length);

    setCell(geoSheet, 1, 1, `${project.name} — Input Geometry`);
    geoSheet.getRow(1).getCell(1).font = { bold: true, size: 13 };
    setCell(geoSheet, 2, 1, 'Edit the shaded X / Y (and Op) cells only — every other column is formula-driven.');
    geoSheet.getRow(2).getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };

    // Vertex ranges per component
    const compRanges: { first: number; last: number }[] = [];
    let geoRow = GEO_HDR_ROW + 1;
    visibleComps.forEach((comp, ci) => {
      const outline = computeComponentProps(comp).outline;
      const pts = outline.length >= 3 ? outline : [];
      const first = geoRow;
      pts.forEach((p, pi) => {
        const r = geoRow;
        const nextRow = pi === pts.length - 1 ? first : geoRow + 1; // wrap within component
        setCell(geoSheet, r, 1, `PL-${String(ci + 1).padStart(2, '0')}`);
        setCell(geoSheet, r, 2, comp.name);
        setCell(geoSheet, r, 3, comp.type);
        const opCell = setCell(geoSheet, r, 4, comp.operation === 'subtract' ? -1 : 1);
        opCell.fill = inputFill;
        setCell(geoSheet, r, 5, pi + 1);
        const xCell = setCell(geoSheet, r, 6, Number(p.x.toFixed(6)));
        const yCell = setCell(geoSheet, r, 7, Number(p.y.toFixed(6)));
        xCell.fill = inputFill;
        yCell.fill = inputFill;
        xCell.numFmt = '0.000';
        yCell.numFmt = '0.000';
        setCell(geoSheet, r, 8, { formula: `F${nextRow}` });
        setCell(geoSheet, r, 9, { formula: `G${nextRow}` });
        setCell(geoSheet, r, 10, { formula: `F${r}*I${r}-H${r}*G${r}` });
        setCell(geoSheet, r, 11, { formula: `(F${r}+H${r})*J${r}/6` });
        setCell(geoSheet, r, 12, { formula: `(G${r}+I${r})*J${r}/6` });
        setCell(geoSheet, r, 13, { formula: `J${r}*(G${r}^2+G${r}*I${r}+I${r}^2)/12` });
        setCell(geoSheet, r, 14, { formula: `J${r}*(F${r}^2+F${r}*H${r}+H${r}^2)/12` });
        setCell(geoSheet, r, 15, { formula: `J${r}*(F${r}*I${r}+2*F${r}*G${r}+2*H${r}*I${r}+H${r}*G${r})/24` });
        geoRow++;
      });
      compRanges.push({ first, last: Math.max(first, geoRow - 1) });
    });

    const geoFirst = GEO_HDR_ROW + 1;
    const geoLast = geoRow - 1;
    geoSheet.views = [{ state: 'frozen', ySplit: GEO_HDR_ROW }];
    const geoWidths = [9, 18, 14, 10, 5, 13, 13, 12, 12, 12, 12, 12, 14, 14, 14];
    geoWidths.forEach((w, i) => { geoSheet.getColumn(i + 1).width = w; });

    // ─── Component Calculations sheet ──────────────────────────────────────
    // A ID | B Name | C Type | D Op | E First | F Last | G S(signed) | H A |
    // I x̄ | J ȳ | K Ixc | L Iyc | M Ixyc | N Ip | O It | P ∫x | Q ∫y |
    // R Ix contrib | S Iy contrib | T Ixy contrib
    const CALC_HDR_ROW = 3;
    const calcHeaders = ['Plate ID', 'Plate Title', 'Type', 'Op', 'First row', 'Last row',
      'Signed area', `Area (${unit}²)`, `x̄ (${unit})`, `ȳ (${unit})`,
      `Ixc (${unit}⁴)`, `Iyc (${unit}⁴)`, `Ixyc (${unit}⁴)`, `Ip (${unit}⁴)`, `It ≈ (${unit}⁴)`,
      `∫x·dA (${unit}³)`, `∫y·dA (${unit}³)`,
      `Ix contribution`, `Iy contribution`, `Ixy contribution`];
    calcHeaders.forEach((h, i) => { calcSheet.getRow(CALC_HDR_ROW).getCell(i + 1).value = h; });
    styleHeaderRow(calcSheet, CALC_HDR_ROW, headerFills.calc, calcHeaders.length);

    setCell(calcSheet, 1, 1, `${project.name} — Component Calculations (shoelace formulas + parallel axis theorem)`);
    calcSheet.getRow(1).getCell(1).font = { bold: true, size: 13 };

    const calcFirst = CALC_HDR_ROW + 1;
    visibleComps.forEach((comp, ci) => {
      const r = calcFirst + ci;
      const range = compRanges[ci];
      const a = range.first, b = range.last;
      setCell(calcSheet, r, 1, `PL-${String(ci + 1).padStart(2, '0')}`);
      setCell(calcSheet, r, 2, comp.name);
      setCell(calcSheet, r, 3, comp.type);
      setCell(calcSheet, r, 4, { formula: `'Input Geometry'!D${a}` });
      setCell(calcSheet, r, 5, a);
      setCell(calcSheet, r, 6, b);
      if (range.last >= range.first) {
        setCell(calcSheet, r, 7, { formula: `0.5*SUM('Input Geometry'!J${a}:J${b})` });
        setCell(calcSheet, r, 8, { formula: `ABS(G${r})`, result: undefined });
        // K/L columns already include the ÷6, so x̄ = ΣK / S and ȳ = ΣL / S
        setCell(calcSheet, r, 9, { formula: `IFERROR(SUM('Input Geometry'!K${a}:K${b})/G${r},0)` });
        setCell(calcSheet, r, 10, { formula: `IFERROR(SUM('Input Geometry'!L${a}:L${b})/G${r},0)` });
        setCell(calcSheet, r, 11, { formula: `SUM('Input Geometry'!M${a}:M${b})-G${r}*J${r}^2` });
        setCell(calcSheet, r, 12, { formula: `SUM('Input Geometry'!N${a}:N${b})-G${r}*I${r}^2` });
        setCell(calcSheet, r, 13, { formula: `SUM('Input Geometry'!O${a}:O${b})-G${r}*I${r}*J${r}` });
        setCell(calcSheet, r, 14, { formula: `K${r}+L${r}` });
        setCell(calcSheet, r, 15, { formula: `IFERROR(ABS(G${r})^4/(40*MAX(N${r},0.000000001)),0)` });
        setCell(calcSheet, r, 16, { formula: `G${r}*I${r}` });
        setCell(calcSheet, r, 17, { formula: `G${r}*J${r}` });
        // Contributions reference the TOTALS row (computed below); no circularity:
        // totals only depend on columns G..Q.
        const totalRowCalc = calcFirst + visibleComps.length + 1;
        setCell(calcSheet, r, 18, { formula: `K${r}+G${r}*(J${r}-$D$${totalRowCalc})^2` });
        setCell(calcSheet, r, 19, { formula: `L${r}+G${r}*(I${r}-$C$${totalRowCalc})^2` });
        setCell(calcSheet, r, 20, { formula: `M${r}+G${r}*(I${r}-$C$${totalRowCalc})*(J${r}-$D$${totalRowCalc})` });
      } else {
        for (let c = 7; c <= 20; c++) setCell(calcSheet, r, c, 0);
      }
      // number formats
      calcSheet.getRow(r).getCell(8).numFmt = '0.000';
      calcSheet.getRow(r).getCell(9).numFmt = '0.000';
      calcSheet.getRow(r).getCell(10).numFmt = '0.000';
      for (let c = 11; c <= 20; c++) calcSheet.getRow(r).getCell(c).numFmt = '0.000E+00';
    });

    // Totals block
    const nComps = visibleComps.length;
    const calcDataLast = calcFirst + Math.max(nComps - 1, 0);
    const totalLabelRow = calcFirst + nComps;
    const totalRow = calcFirst + nComps + 1;
    setCell(calcSheet, totalLabelRow, 1, 'TOTALS (sums include the +1/−1 operation column)');
    calcSheet.getRow(totalLabelRow).getCell(1).font = { bold: true };
    const rng = (col: number) => {
      if (nComps === 0) return '0';
      const L = colName(col);
      return `${L}${calcFirst}:${L}${calcDataLast}`;
    };
    // TOTALS row layout: C = X̄, D = Ȳ, E = A_tot, F..J = Ix, Iy, Ixy, It, (∫x,∫y)
    setCell(calcSheet, totalRow, 3, { formula: `IFERROR(SUMPRODUCT(${rng(4)},${rng(16)})/SUMPRODUCT(${rng(4)},${rng(7)}),0)` }); // C: X̄
    setCell(calcSheet, totalRow, 4, { formula: `IFERROR(SUMPRODUCT(${rng(4)},${rng(17)})/SUMPRODUCT(${rng(4)},${rng(7)}),0)` }); // D: Ȳ
    setCell(calcSheet, totalRow, 5, { formula: `SUMPRODUCT(${rng(4)},${rng(7)})` });                                            // E: A
    setCell(calcSheet, totalRow, 6, { formula: `SUMPRODUCT(${rng(4)},${rng(18)})` });                                           // F: Ix
    setCell(calcSheet, totalRow, 7, { formula: `SUMPRODUCT(${rng(4)},${rng(19)})` });                                           // G: Iy
    setCell(calcSheet, totalRow, 8, { formula: `SUMPRODUCT(${rng(4)},${rng(20)})` });                                           // H: Ixy
    setCell(calcSheet, totalRow, 9, { formula: `SUMPRODUCT(${rng(4)},${rng(15)})` });                                           // I: It
    const totalLabels: [number, string][] = [
      [3, `X̄ (${unit})`], [4, `Ȳ (${unit})`], [5, `Area (${unit}²)`],
      [6, `Ix (${unit}⁴)`], [7, `Iy (${unit}⁴)`], [8, `Ixy (${unit}⁴)`], [9, `It (${unit}⁴)`],
    ];
    // put labels one row above each column for readability
    totalLabels.forEach(([c, label]) => {
      setCell(calcSheet, totalRow + 2, c, label);
    });
    for (let c = 3; c <= 9; c++) {
      calcSheet.getRow(totalRow).getCell(c).font = { bold: true };
      calcSheet.getRow(totalRow).getCell(c).numFmt = c >= 6 ? '0.000E+00' : '0.000';
      calcSheet.getRow(totalRow).getCell(c).border = { top: { style: 'thin' } };
    }
    calcSheet.views = [{ state: 'frozen', ySplit: CALC_HDR_ROW }];
    [10, 20, 12, 8, 10, 10, 14, 14, 12, 12, 14, 14, 14, 14, 14, 14, 14, 18, 18, 18].forEach((w, i) => {
      calcSheet.getColumn(i + 1).width = w;
    });

    // Handy references to totals cells
    const TC = `'Component Calculations'!$C$${totalRow}`;   // X̄
    const TD = `'Component Calculations'!$D$${totalRow}`;   // Ȳ
    const TE = `'Component Calculations'!$E$${totalRow}`;   // A
    const TF = `'Component Calculations'!$F$${totalRow}`;   // Ix
    const TG = `'Component Calculations'!$G$${totalRow}`;   // Iy
    const TH = `'Component Calculations'!$H$${totalRow}`;   // Ixy
    const TI = `'Component Calculations'!$I$${totalRow}`;   // It

    // ─── Principal Coordinates sheet ───────────────────────────────────────
    // Mirrors the input vertex table; u/v formulas use Section Properties α, X̄, Ȳ
    const PRIN_HDR_ROW = 3;
    const prinHeaders = ['Comp ID', 'Component', 'Pt', `X (${unit})`, `Y (${unit})`,
      `u (${unit})`, `v (${unit})`];
    prinHeaders.forEach((h, i) => { principalSheet.getRow(PRIN_HDR_ROW).getCell(i + 1).value = h; });
    styleHeaderRow(principalSheet, PRIN_HDR_ROW, headerFills.principal, prinHeaders.length);

    setCell(principalSheet, 1, 1, 'Principal-axis coordinates (auto — do not edit). u/v are the section vertices in the principal U-V frame.');
    principalSheet.getRow(1).getCell(1).font = { italic: true, color: { argb: 'FF64748B' } };

    // Section Properties cell addresses (defined below) — plan layout here:
    // Row layout built by property list; we reserve:
    //   α → C10, X̄ → C11, Ȳ → C12 (value column of the property list below)
    const ALPHA = `'Section Properties'!$C$10`;
    const XBAR = `'Section Properties'!$C$11`;
    const YBAR = `'Section Properties'!$C$12`;

    let prinRow = PRIN_HDR_ROW + 1;
    const prinFirst = prinRow;
    visibleComps.forEach((comp, ci) => {
      const outline = computeComponentProps(comp).outline;
      const pts = outline.length >= 3 ? outline : [];
      pts.forEach((p, pi) => {
        const geoR = compRanges[ci].first + pi;
        setCell(principalSheet, prinRow, 1, `PL-${String(ci + 1).padStart(2, '0')}`);
        setCell(principalSheet, prinRow, 2, comp.name);
        setCell(principalSheet, prinRow, 3, pi + 1);
        setCell(principalSheet, prinRow, 4, { formula: `'Input Geometry'!F${geoR}` });
        setCell(principalSheet, prinRow, 5, { formula: `'Input Geometry'!G${geoR}` });
        setCell(principalSheet, prinRow, 6, { formula: `(D${prinRow}-${XBAR})*COS(RADIANS(${ALPHA}))+(E${prinRow}-${YBAR})*SIN(RADIANS(${ALPHA}))` });
        setCell(principalSheet, prinRow, 7, { formula: `-(D${prinRow}-${XBAR})*SIN(RADIANS(${ALPHA}))+(E${prinRow}-${YBAR})*COS(RADIANS(${ALPHA}))` });
        for (let c = 4; c <= 7; c++) principalSheet.getRow(prinRow).getCell(c).numFmt = '0.000';
        prinRow++;
      });
    });
    const prinLast = prinRow - 1;
    const uRange = prinLast >= prinFirst ? `F${prinFirst}:F${prinLast}` : null;
    const vRange = prinLast >= prinFirst ? `G${prinFirst}:G${prinLast}` : null;
    const prinExtremesRow = prinLast + 2;
    setCell(principalSheet, prinExtremesRow, 5, 'u max / u min / v max / v min:');
    principalSheet.getRow(prinExtremesRow).getCell(5).font = { bold: true };
    setCell(principalSheet, prinExtremesRow, 6, { formula: uRange ? `MAX(${uRange})` : '0' });   // F: uMax
    setCell(principalSheet, prinExtremesRow + 1, 6, { formula: uRange ? `MIN(${uRange})` : '0' }); // F: uMin
    setCell(principalSheet, prinExtremesRow, 7, { formula: vRange ? `MAX(${vRange})` : '0' });   // G: vMax
    setCell(principalSheet, prinExtremesRow + 1, 7, { formula: vRange ? `MIN(${vRange})` : '0' }); // G: vMin
    const UMAX = `'Principal Coordinates'!$F$${prinExtremesRow}`;
    const UMIN = `'Principal Coordinates'!$F$${prinExtremesRow + 1}`;
    const VMAX = `'Principal Coordinates'!$G$${prinExtremesRow}`;
    const VMIN = `'Principal Coordinates'!$G$${prinExtremesRow + 1}`;
    principalSheet.views = [{ state: 'frozen', ySplit: PRIN_HDR_ROW }];
    [9, 18, 6, 13, 13, 13, 13].forEach((w, i) => { principalSheet.getColumn(i + 1).width = w; });

    // ─── Section Properties sheet ──────────────────────────────────────────
    setCell(propsSheet, 1, 1, `${project.name} — Section Properties`);
    propsSheet.getRow(1).getCell(1).font = { bold: true, size: 14 };
    const meta: [string, string | number][] = [
      ['Application', APP_NAME],
      ['Exported', new Date().toLocaleString()],
      ['Units', unit],
      ['Revision', project.revision],
      ['Components', visibleComps.length],
    ];
    meta.forEach(([k, v], i) => {
      setCell(propsSheet, 2 + i, 1, k);
      setCell(propsSheet, 2 + i, 2, v);
      propsSheet.getRow(2 + i).getCell(1).font = { bold: true };
    });

    const PROP_HDR_ROW = 8;
    const propHeaders = ['Symbol', 'Property', 'Value', 'Unit', 'Formula / Note'];
    propHeaders.forEach((h, i) => { propsSheet.getRow(PROP_HDR_ROW).getCell(i + 1).value = h; });
    styleHeaderRow(propsSheet, PROP_HDR_ROW, headerFills.props, propHeaders.length);

    let pr = PROP_HDR_ROW + 1;
    // Keep reserved rows in sync with ALPHA/XBAR/YBAR addresses above (D10/D11/D12)
    const addProp = (symbol: string, name: string, value: XCell, unitStr: string, note: string, numFmt = 'General') => {
      setCell(propsSheet, pr, 1, symbol);
      setCell(propsSheet, pr, 2, name);
      const c = setCell(propsSheet, pr, 3, value);
      c.numFmt = numFmt;
      setCell(propsSheet, pr, 4, unitStr);
      setCell(propsSheet, pr, 5, note);
      pr++;
    };

    // Reserved rows 9..12: α (D10), X̄ (D11), Ȳ (D12) — write them as part of the list
    // (property row 9 = A, 10 = α, 11 = yM/X̄, 12 = zM/Ȳ)
    addProp('A', 'Cross-sectional area', { formula: TE }, `${unit}²`, 'Σ(±Ai) from Component Calculations', '0.000');
    addProp('α', 'Angle between Y-Z and U-V axes', { formula: `DEGREES(0.5*ATAN2(${TF}-${TG},-2*${TH}))`, result: props.principalAngle }, '°', '½·ATAN2(Ix−Iy, −2Ixy) — rotation from Y to U');
    // Force D11/D12 to be exactly the X̄/Ȳ rows: they are rows 11 and 12.
    addProp('yM', 'Distance to centroid along Y', { formula: TC, result: props.centroidX }, unit, 'Composite centroid (X̄)', '0.000');
    addProp('zM', 'Distance to centroid along Z', { formula: TD, result: props.centroidY }, unit, 'Composite centroid (Ȳ)', '0.000');
    addProp('Iy', 'Moment of inertia about axis ∥ Y', { formula: TF }, `${unit}⁴`, 'Σ(±(Ici + Ai·dyi²))', '0.000E+00');
    addProp('Iz', 'Moment of inertia about axis ∥ Z', { formula: TG }, `${unit}⁴`, 'Σ(±(Ici + Ai·dxi²))', '0.000E+00');
    addProp('Iyz', 'Product of inertia (user coordinates)', { formula: TH }, `${unit}⁴`, 'Σ(±(Ixyi + Ai·dxi·dyi))', '0.000E+00');
    addProp('Iu', 'Moment of inertia about U axis', { formula: `(${TF}+${TG})/2+SQRT(((${TF}-${TG})/2)^2+${TH}^2)`, result: props.Iu }, `${unit}⁴`, 'Major principal moment', '0.000E+00');
    addProp('Iv', 'Moment of inertia about V axis', { formula: `(${TF}+${TG})/2-SQRT(((${TF}-${TG})/2)^2+${TH}^2)`, result: props.Iv }, `${unit}⁴`, 'Minor principal moment', '0.000E+00');
    addProp('It', 'Torsional moment of inertia (St. Venant)', { formula: TI }, `${unit}⁴`, '≈Ai⁴/(40·Ipi) per component (see Notes)', '0.000E+00');
    addProp('iy', 'Radius of gyration about axis ∥ Y', { formula: `IFERROR(SQRT(${TF}/${TE}),0)`, result: props.rx }, unit, '√(Iy/A)', '0.000');
    addProp('iz', 'Radius of gyration about axis ∥ Z', { formula: `IFERROR(SQRT(${TG}/${TE}),0)`, result: props.ry }, unit, '√(Iz/A)', '0.000');
    addProp('iu', 'Radius of gyration about U axis', { formula: `IFERROR(SQRT(((${TF}+${TG})/2+SQRT(((${TF}-${TG})/2)^2+${TH}^2))/${TE}),0)`, result: props.iu }, unit, '√(Iu/A)', '0.000');
    addProp('iv', 'Radius of gyration about V axis', { formula: `IFERROR(SQRT(((${TF}+${TG})/2-SQRT(((${TF}-${TG})/2)^2+${TH}^2))/${TE}),0)`, result: props.iv }, unit, '√(Iv/A)', '0.000');
    addProp('Wu+', 'Elastic modulus about U (+ve extreme)', { formula: `IFERROR(((${TF}+${TG})/2+SQRT(((${TF}-${TG})/2)^2+${TH}^2))/${VMAX},0)`, result: props.WuP }, `${unit}³`, 'Iu / v max', '0.000E+00');
    addProp('Wu-', 'Elastic modulus about U (−ve extreme)', { formula: `IFERROR(((${TF}+${TG})/2+SQRT(((${TF}-${TG})/2)^2+${TH}^2))/ABS(${VMIN}),0)`, result: props.WuM }, `${unit}³`, 'Iu / |v min|', '0.000E+00');
    addProp('Wv+', 'Elastic modulus about V (+ve extreme)', { formula: `IFERROR(((${TF}+${TG})/2-SQRT(((${TF}-${TG})/2)^2+${TH}^2))/${UMAX},0)`, result: props.WvP }, `${unit}³`, 'Iv / u max', '0.000E+00');
    addProp('Wv-', 'Elastic modulus about V (−ve extreme)', { formula: `IFERROR(((${TF}+${TG})/2-SQRT(((${TF}-${TG})/2)^2+${TH}^2))/ABS(${UMIN}),0)`, result: props.WvM }, `${unit}³`, 'Iv / |u min|', '0.000E+00');
    addProp('Wpl,u', 'Plastic modulus about U axis', props.Wplu, `${unit}³`, 'Numeric solve in Section Designer — not formula-linked (see Notes)', '0.000E+00');
    addProp('Wpl,v', 'Plastic modulus about V axis', props.Wplv, `${unit}³`, 'Numeric solve in Section Designer — not formula-linked (see Notes)', '0.000E+00');
    addProp('au+', 'Centroid to compression-zone edge, +U', { formula: UMAX, result: props.auP }, unit, 'u extreme (+)', '0.000');
    addProp('au-', 'Centroid to compression-zone edge, −U', { formula: `ABS(${UMIN})`, result: props.auM }, unit, 'u extreme (−)', '0.000');
    addProp('av+', 'Centroid to compression-zone edge, +V', { formula: VMAX, result: props.avP }, unit, 'v extreme (+)', '0.000');
    addProp('av-', 'Centroid to compression-zone edge, −V', { formula: `ABS(${VMIN})`, result: props.avM }, unit, 'v extreme (−)', '0.000');
    addProp('yP', 'Equal-area axis along Y', props.yP, unit, 'Numeric solve in Section Designer — not formula-linked (see Notes)', '0.000');
    addProp('zP', 'Equal-area axis along Z', props.zP, unit, 'Numeric solve in Section Designer — not formula-linked (see Notes)', '0.000');
    addProp('uP', 'Equal-area axis along U', props.uP, unit, 'Numeric solve in Section Designer — not formula-linked (see Notes)', '0.000');
    addProp('vP', 'Equal-area axis along V', props.vP, unit, 'Numeric solve in Section Designer — not formula-linked (see Notes)', '0.000');

    propsSheet.views = [{ state: 'frozen', ySplit: PROP_HDR_ROW }];
    [10, 38, 20, 10, 52].forEach((w, i) => { propsSheet.getColumn(i + 1).width = w; });

    // Static summary (unchanged legacy quick-reference block, far right)
    const legacy = [
      ['Centroid X̄', props.centroidX, unit],
      ['Centroid Ȳ', props.centroidY, unit],
      ['Ix', props.Ix, `${unit}⁴`],
      ['Iy', props.Iy, `${unit}⁴`],
      ['Ixy', props.Ixy, `${unit}⁴`],
      ['rx', props.rx, unit],
      ['ry', props.ry, unit],
      ['Zx (top)', props.Zx_top, `${unit}³`],
      ['Zx (bottom)', props.Zx_bottom, `${unit}³`],
      ['Zy (left)', props.Zy_left, `${unit}³`],
      ['Zy (right)', props.Zy_right, `${unit}³`],
      ['Imax', props.Imax, `${unit}⁴`],
      ['Imin', props.Imin, `${unit}⁴`],
      ['Principal Angle θ', props.principalAngle, '°'],
      ['y max', props.yMax, unit],
      ['y min', props.yMin, unit],
      ['x max', props.xMax, unit],
      ['x min', props.xMin, unit],
    ];
    setCell(propsSheet, PROP_HDR_ROW, 7, 'App-computed reference values (static)');
    propsSheet.getRow(PROP_HDR_ROW).getCell(7).font = whiteFont;
    propsSheet.getRow(PROP_HDR_ROW).getCell(7).fill = headerFills.props;
    setCell(propsSheet, PROP_HDR_ROW, 8, 'Value');
    propsSheet.getRow(PROP_HDR_ROW).getCell(8).font = whiteFont;
    propsSheet.getRow(PROP_HDR_ROW).getCell(8).fill = headerFills.props;
    legacy.forEach(([k, v, u], i) => {
      setCell(propsSheet, PROP_HDR_ROW + 1 + i, 7, k as string);
      setCell(propsSheet, PROP_HDR_ROW + 1 + i, 8, v as number);
      setCell(propsSheet, PROP_HDR_ROW + 1 + i, 9, u as string);
    });

    // ─── Notes sheet ───────────────────────────────────────────────────────
    notesSheet.columns = [{ header: 'Notes', key: 'note', width: 110 }];
    const notes = [
      'SECTION DESIGNER — INTERACTIVE CALCULATION WORKBOOK',
      '',
      `Application: ${APP_NAME} ${APP_VERSION}    Exported: ${new Date().toLocaleString()}`,
      `Section: ${project.name}    Units: ${unit}    Revision: ${project.revision}`,
      '',
      'HOW TO USE',
      '──────────────────────────────────────────────────────────────────────────',
      '1. Open the "Input Geometry" sheet and edit the shaded X / Y cells',
      '   (and the +1/−1 operation column: +1 = add material, −1 = hole/cutout).',
      '2. Excel recalculates automatically: vertex cross-terms → component',
      '   areas/centroids/inertias → composite section properties.',
      '3. Read the results on the "Section Properties" sheet. No web app needed.',
      '   Amber-shaded cells are inputs; all other cells are formulas.',
      '',
      'FORMULAS USED (per component, shoelace / coordinate integration)',
      '──────────────────────────────────────────────────────────────────────────',
      '  Signed area      S  = ½·Σ(xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)        (vertices wrap)',
      '  Area             A  = |S|',
      '  Centroid         x̄  = Σ(xᵢ+xᵢ₊₁)·cᵢ / (6S),  ȳ likewise',
      '  Inertias (orig.) Ix = Σcᵢ·(yᵢ²+yᵢ·yᵢ₊₁+yᵢ₊₁²)/12, etc.',
      '  Centroidal       Ixc = Ix − S·ȳ²,  Iyc = Iy − S·x̄², Ixyc = Ixy − S·x̄·ȳ',
      '  Composite        X̄ = Σ(±Sᵢx̄ᵢ)/Σ(±Aᵢ); Ix = Σ(±(Ixc + Sᵢ·dy²)) — parallel axis',
      '  Principal        Iu,Iv = (Ix±Iy)/2 ± √(((Ix−Iy)/2)² + Ixy²)',
      '  Angle            α = ½·ATAN2(Ix−Iy, −2·Ixy)   [Excel ATAN2(x,y) argument order]',
      '  Elastic modulus  Wu± = Iu / v∓extreme ;  Wv± = Iv / u∓extreme',
      '  Radii            iy = √(Iy/A), iu = √(Iu/A), ...',
      '',
      'AXIS CONVENTION',
      '──────────────────────────────────────────────────────────────────────────',
      '  Y = horizontal axis (application X), Z = vertical axis (application Y).',
      '  U-V are the principal axes; α is the CCW angle from Y to U.',
      '  Coordinates are global (include component position and rotation).',
      '',
      'DOCUMENTED LIMITATIONS',
      '──────────────────────────────────────────────────────────────────────────',
      '  • Wpl,u, Wpl,v, yP, zP, uP, vP: the plastic neutral axis / equal-area axis',
      '    requires a numeric root-solve of a piecewise area function that cannot be',
      '    expressed with practical native Excel formulas for arbitrary polygons.',
      '    These six values are exported as computed by Section Designer and are',
      '    NOT formula-linked. All other properties recalculate live in Excel.',
      `  • It (St. Venant) uses the solid-section approximation J ≈ A⁴/(40·Ip) per`,
      '    component (exact to ~1% for circles; conservative for open/thin shapes).',
      '  • Curved outlines (circles, ellipses) are exported as inscribed polygons;',
      '    refining the vertex coordinates refines their properties.',
      '',
      '© 2025 Arvind Singh Rawat. All Rights Reserved.',
    ];
    notes.forEach(note => notesSheet.addRow({ note }));
    notesSheet.getRow(1).font = { bold: true, size: 14 };

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_')}_calculations.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Excel export failed:', e);
    alert('Failed to export Excel. Please try again.');
  }
}

// ─── PDF Export ───────────────────────────────────────────────────────────

/** Rasterize /logo.svg to a PNG data URL for the PDF header (graceful fallback). */
async function loadLogoDataUrl(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch('/logo.svg');
    if (!res.ok) return null;
    const svgText = await res.text();
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, size, size);
          resolve({ dataUrl: canvas.toDataURL('image/png'), w: size, h: size });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;
    });
  } catch {
    return null;
  }
}

export async function exportPDF(
  props: SectionProperties,
  project: SectionProject,
  trace: CalcTrace | null,
  stressResult: { maxCompression: number; maxTension: number; neutralAxisAngle: number } | null,
): Promise<void> {
  try {
    const { default: jsPDF } = await import('jspdf');
    const { autoTable } = await import('jspdf-autotable');
    const logo = await loadLogoDataUrl();

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // jspdf-autotable adds lastAutoTable at runtime, but its declaration
    // is not always visible on the jsPDF type in strict TypeScript builds.
    const getLastTableY = (fallback: number): number => {
      const tableState = (doc as {
        lastAutoTable?: { finalY?: number };
      }).lastAutoTable;

      return typeof tableState?.finalY === 'number'
        ? tableState.finalY
        : fallback;
    };
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 15;

    const unit = project.units;
    const visibleComps = project.components.filter(c => c.visible);

    // ─── Cover / Header ───
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 45, 'F');
    if (logo) {
      try {
        doc.addImage(logo.dataUrl, 'PNG', 12, 8, 13, 13);
      } catch {
        // logo rendering is best-effort
      }
    }
    const titleX = logo ? 30 : 15;
    doc.setTextColor(241, 245, 249);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Section Designer', titleX, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Section Analysis & Property Report', titleX, 25);
    doc.setFontSize(8);
    doc.text(`Section: ${project.name}`, titleX, 33);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 15, 18, { align: 'right' });
    doc.text(`Units: ${unit}   ·   Revision: ${project.revision}`, pageW - 15, 25, { align: 'right' });
    if (project.description) {
      doc.setTextColor(148, 163, 184);
      const lines = doc.splitTextToSize(project.description, pageW - titleX - 70);
      doc.text(lines.slice(0, 2), titleX, 39);
    }

    y = 55;

    // ─── Section Drawing ───
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Section Geometry', 15, y);
    y += 5;

    // Calculate bounds for drawing
    const drawWidth = pageW - 30;
    const drawHeight = 70;
    const sectionW = props.xMax - props.xMin;
    const sectionH = props.yMax - props.yMin;

    if (sectionW > 0 && sectionH > 0) {
      const scale = Math.min(drawWidth / sectionW, drawHeight / sectionH) * 0.7;
      const offsetX = 15 + drawWidth / 2;
      const offsetY = y + drawHeight / 2;

      // Draw components
      for (let i = 0; i < visibleComps.length; i++) {
        const comp = visibleComps[i];
        const compProps = computeComponentProps(comp);
        const outline = compProps.outline;

        if (outline.length >= 3) {
          // Draw polygon
          doc.setDrawColor(59, 130, 246);
          doc.setFillColor(comp.operation === 'subtract' ? 255 : 230, comp.operation === 'subtract' ? 230 : 240, comp.operation === 'subtract' ? 230 : 250);

          const points = outline.map(p => [
            offsetX + (p.x - props.centroidX) * scale,
            offsetY - (p.y - props.centroidY) * scale,
          ]) as [number, number][];

          doc.setLineWidth(0.3);
          // Draw as path
          doc.lines(
            points.slice(1).map((p, idx) => [p[0] - points[idx][0], p[1] - points[idx][1]]),
            points[0][0],
            points[0][1],
            [1, 1],
            'FD',
            true
          );

          // Add plate label
          doc.setFontSize(6);
          doc.setTextColor(100, 100, 100);
          const labelX = offsetX + (compProps.cx - props.centroidX) * scale;
          const labelY = offsetY - (compProps.cy - props.centroidY) * scale;
          doc.text(`PL-${String(i + 1).padStart(2, '0')}`, labelX, labelY, { align: 'center' });
        }
      }

      // Draw centroid marker
      doc.setDrawColor(251, 191, 36);
      doc.setLineWidth(0.5);
      const markerSize = 3;
      doc.circle(offsetX, offsetY, markerSize, 'S');
      doc.line(offsetX - markerSize * 1.5, offsetY, offsetX + markerSize * 1.5, offsetY);
      doc.line(offsetX, offsetY - markerSize * 1.5, offsetX, offsetY + markerSize * 1.5);

      doc.setFontSize(7);
      doc.setTextColor(251, 191, 36);
      doc.text('C.G.', offsetX + markerSize * 2, offsetY + 1);

      // Principal axes (U = major, V = minor) — same α as the property tables
      if (Math.abs(props.Ixy) > 0.01) {
        const rad = (props.principalAngle * Math.PI) / 180;
        const cu = Math.cos(rad), su = Math.sin(rad);
        const axisLen = 18;
        // U axis
        doc.setDrawColor(245, 158, 11);
        doc.setLineWidth(0.4);
        doc.line(offsetX - axisLen * cu, offsetY + axisLen * su, offsetX + axisLen * cu, offsetY - axisLen * su);
        // V axis (perpendicular)
        doc.setDrawColor(249, 115, 22);
        doc.setLineWidth(0.4);
        doc.line(offsetX - axisLen * -su, offsetY - axisLen * cu, offsetX + axisLen * -su, offsetY + axisLen * cu);
        doc.setFontSize(6);
        doc.setTextColor(245, 158, 11);
        doc.text('U', offsetX + axisLen * cu + 2, offsetY - axisLen * su);
        doc.setTextColor(249, 115, 22);
        doc.text('V', offsetX - axisLen * su - 2, offsetY - axisLen * cu + 2);
      }

      // Draw axes
      doc.setDrawColor(100, 100, 100);
      doc.setLineWidth(0.2);
      const axisLen = 15;
      doc.line(offsetX, offsetY, offsetX + axisLen, offsetY);
      doc.line(offsetX, offsetY, offsetX, offsetY - axisLen);
      doc.setFontSize(6);
      doc.setTextColor(100, 100, 100);
      doc.text('X', offsetX + axisLen + 2, offsetY);
      doc.text('Y', offsetX - 3, offsetY - axisLen - 1);

      // Add overall dimensions
      doc.setFontSize(7);
      doc.setTextColor(59, 130, 246);
      doc.text(`W = ${sectionW.toFixed(1)} ${unit}`, offsetX, offsetY + drawHeight / 2 - 5, { align: 'center' });
      doc.text(`H = ${sectionH.toFixed(1)} ${unit}`, offsetX + drawWidth / 2 - 10, offsetY, { align: 'left' });
    }

    y += drawHeight + 10;

    // ─── Component Table ───
    if (visibleComps.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Components', 15, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [['ID', 'Name', 'Type', 'X', 'Y', 'Operation']],
        body: visibleComps.map((c, i) => [
          `PL-${String(i + 1).padStart(2, '0')}`,
          c.name,
          c.type,
          fmt(c.position.x),
          fmt(c.position.y),
          c.operation,
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
        margin: { left: 15, right: 15 },
      });

      y = getLastTableY(y + 20);
      y += 8;
    }

    // New page if needed
    if (y > pageH - 60) {
      doc.addPage();
      y = 20;
    }

    // ─── Input Geometry (vertex coordinate tables) ───
    if (visibleComps.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Input Geometry — Vertex Coordinates', 15, y);
      y += 2;

      for (let i = 0; i < visibleComps.length; i++) {
        const comp = visibleComps[i];
        const outline = computeComponentProps(comp).outline;
        if (outline.length < 3) continue;

        autoTable(doc, {
          startY: y,
          head: [[`PL-${String(i + 1).padStart(2, '0')} — ${comp.name} (${comp.type}, ${comp.operation})`, `X (${unit})`, `Y (${unit})`]],
          body: outline.map((p, pi) => [String(pi + 1), p.x.toFixed(2), p.y.toFixed(2)]),
          styles: { fontSize: 6.5, cellPadding: 1 },
          headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255] },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
          margin: { left: 15, right: 15 },
          pageBreak: 'auto',
        });
        y = getLastTableY(y + 10);
        y += 4;
        if (y > pageH - 50) {
          doc.addPage();
          y = 20;
        }
      }
      y += 4;
    }

    // New page if needed
    if (y > pageH - 60) {
      doc.addPage();
      y = 20;
    }

    // ─── Section Properties Table (complete list) ───
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Section Properties', 15, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Symbol', 'Property', 'Value', 'Unit']],
      body: [
        ['A', 'Cross-sectional area', fmt(props.area), `${unit}²`],
        ['α', 'Angle between Y-Z and U-V axes', fmt(props.principalAngle), '°'],
        ['yM', 'Distance to centroid along Y', fmt(props.centroidX), unit],
        ['zM', 'Distance to centroid along Z', fmt(props.centroidY), unit],
        ['Iy', 'Moment of inertia about axis ∥ Y', fmtSci(props.Ix), `${unit}⁴`],
        ['Iz', 'Moment of inertia about axis ∥ Z', fmtSci(props.Iy), `${unit}⁴`],
        ['Iyz', 'Product of inertia (user coordinates)', fmtSci(props.Ixy), `${unit}⁴`],
        ['Iu', 'Moment of inertia about U axis', fmtSci(props.Iu), `${unit}⁴`],
        ['Iv', 'Moment of inertia about V axis', fmtSci(props.Iv), `${unit}⁴`],
        ['It', 'Torsional moment of inertia (St. Venant)', fmtSci(props.It), `${unit}⁴`],
        ['iy', 'Radius of gyration about axis ∥ Y', fmt(props.rx), unit],
        ['iz', 'Radius of gyration about axis ∥ Z', fmt(props.ry), unit],
        ['iu', 'Radius of gyration about U axis', fmt(props.iu), unit],
        ['iv', 'Radius of gyration about V axis', fmt(props.iv), unit],
        ['Wu+', 'Elastic modulus about U (+ve extreme)', fmtSci(props.WuP), `${unit}³`],
        ['Wu-', 'Elastic modulus about U (−ve extreme)', fmtSci(props.WuM), `${unit}³`],
        ['Wv+', 'Elastic modulus about V (+ve extreme)', fmtSci(props.WvP), `${unit}³`],
        ['Wv-', 'Elastic modulus about V (−ve extreme)', fmtSci(props.WvM), `${unit}³`],
        ['Wpl,u', 'Plastic modulus about U axis', fmtSci(props.Wplu), `${unit}³`],
        ['Wpl,v', 'Plastic modulus about V axis', fmtSci(props.Wplv), `${unit}³`],
        ['au+', 'Centroid to compression-zone edge, +U', fmt(props.auP), unit],
        ['au-', 'Centroid to compression-zone edge, −U', fmt(props.auM), unit],
        ['av+', 'Centroid to compression-zone edge, +V', fmt(props.avP), unit],
        ['av-', 'Centroid to compression-zone edge, −V', fmt(props.avM), unit],
        ['yP', 'Equal-area axis along Y', fmt(props.yP), unit],
        ['zP', 'Equal-area axis along Z', fmt(props.zP), unit],
        ['uP', 'Equal-area axis along U', fmt(props.uP), unit],
        ['vP', 'Equal-area axis along V', fmt(props.vP), unit],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255] },
      columnStyles: { 2: { halign: 'right' } },
      margin: { left: 15, right: 15 },
    });

    y = getLastTableY(y + 50);
    y += 8;

    // ─── Additional properties (application x/y notation) ───
    if (y > pageH - 80) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Additional Properties (application x/y notation)', 15, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      head: [['Property', 'Value', 'Unit']],
      body: [
        ['Centroid X̄', fmt(props.centroidX), unit],
        ['Centroid Ȳ', fmt(props.centroidY), unit],
        ['Moment of Inertia Ix', fmtSci(props.Ix), `${unit}⁴`],
        ['Moment of Inertia Iy', fmtSci(props.Iy), `${unit}⁴`],
        ['Product of Inertia Ixy', fmtSci(props.Ixy), `${unit}⁴`],
        ['Radius of Gyration rx', fmt(props.rx), unit],
        ['Radius of Gyration ry', fmt(props.ry), unit],
        ['Section Modulus Zx (top)', fmtSci(props.Zx_top), `${unit}³`],
        ['Section Modulus Zx (bottom)', fmtSci(props.Zx_bottom), `${unit}³`],
        ['Section Modulus Zy (left)', fmtSci(props.Zy_left), `${unit}³`],
        ['Section Modulus Zy (right)', fmtSci(props.Zy_right), `${unit}³`],
        ['Extreme Fiber y max', fmt(props.yMax), unit],
        ['Extreme Fiber y min', fmt(props.yMin), unit],
        ['Extreme Fiber x max', fmt(props.xMax), unit],
        ['Extreme Fiber x min', fmt(props.xMin), unit],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 15, right: 15 },
    });

    y = getLastTableY(y + 30);
    y += 8;

    // New page if needed
    if (y > pageH - 60) {
      doc.addPage();
      y = 20;
    }

    // ─── Calculation Trace ───
    if (trace && trace.steps.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Calculation Summary', 15, y);
      y += 2;

      autoTable(doc, {
        startY: y,
        head: [['Step', 'Formula', 'Result', 'Unit']],
        body: trace.steps.slice(0, 15).map(s => [s.label, s.formula, s.result, s.unit]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [139, 92, 246], textColor: [255, 255, 255] },
        margin: { left: 15, right: 15 },
      });
    }

    // ─── Stress Results ───
    if (stressResult) {
      if (y > pageH - 60) {
        doc.addPage();
        y = 20;
      }
      y = getLastTableY(y + 30);
      y += 8;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Stress Analysis Results', 15, y);
      y += 2;
      autoTable(doc, {
        startY: y,
        head: [['Result', 'Value', 'Unit']],
        body: [
          ['Max Compression', fmt(stressResult.maxCompression), 'MPa'],
          ['Max Tension', fmt(stressResult.maxTension), 'MPa'],
          ['Neutral Axis Angle', fmt(stressResult.neutralAxisAngle), '°'],
        ],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255] },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 15, right: 15 },
      });
    }

    // ─── Footer on all pages ───
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Section Designer — ${project.name}`, 15, pageH - 8);
      doc.text(`Page ${i} of ${pageCount}`, pageW - 15, pageH - 8, { align: 'right' });
      doc.text('© 2025 Arvind Singh Rawat', pageW / 2, pageH - 8, { align: 'center' });
    }

    doc.save(`${project.name.replace(/\s+/g, '_')}_report.pdf`);
  } catch (error) {
    console.error('PDF export failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    alert(`PDF export failed:\n${message}`);
  }
}
