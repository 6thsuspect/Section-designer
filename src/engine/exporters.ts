import type { SectionProject, SectionProperties, CalcTrace, SectionFileFormat, SectionComponent, Point } from './types';
import { fmt, fmtSci, computeComponentProps } from './geometry';

// ─── Constants ────────────────────────────────────────────────────────────

const SCHEMA_VERSION = '1.0.0';
const APP_NAME = 'Section Designer';
const APP_VERSION = '1.0.0';

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

function generateDXFHeader(): string {
  return `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
6
0
LAYER
2
SECTION
70
0
62
7
6
CONTINUOUS
0
LAYER
2
CUTOUT
70
0
62
1
6
CONTINUOUS
0
LAYER
2
DIMENSIONS
70
0
62
3
6
CONTINUOUS
0
LAYER
2
TEXT
70
0
62
5
6
CONTINUOUS
0
LAYER
2
CENTERLINE
70
0
62
1
6
CENTER
0
LAYER
2
AXIS
70
0
62
2
6
DASHDOT
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;
}

function generateDXFPolyline(points: Point[], layer: string, closed: boolean = true): string {
  const cleanPoints = points.filter((p, index) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (index === 0) return true;
    const prev = points[index - 1];
    return p.x !== prev.x || p.y !== prev.y;
  });

  if (cleanPoints.length < 2) return '';

  let dxf = `0
LWPOLYLINE
8
${layer}
90
${cleanPoints.length}
70
${closed ? 1 : 0}
`;
  for (const p of cleanPoints) {
    dxf += `10
${p.x.toFixed(6)}
20
${p.y.toFixed(6)}
`;
  }
  return dxf;
}

function generateDXFText(text: string, x: number, y: number, height: number, layer: string): string {
  return `0
TEXT
8
${layer}
10
${x.toFixed(4)}
20
${y.toFixed(4)}
40
${height.toFixed(4)}
1
${text}
`;
}

function generateDXFLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return `0
LINE
8
${layer}
10
${x1.toFixed(4)}
20
${y1.toFixed(4)}
11
${x2.toFixed(4)}
21
${y2.toFixed(4)}
`;
}

function generateDXFFooter(): string {
  return `0
ENDSEC
0
EOF
`;
}

export function exportDXF(project: SectionProject, props: SectionProperties): string {
  let dxf = generateDXFHeader();
  
  const sectionWidth = Math.abs(props.xMax - props.xMin);
  const sectionHeight = Math.abs(props.yMax - props.yMin);
  const maxDimension = Math.max(sectionWidth, sectionHeight);
  const textHeight = Math.max(maxDimension * 0.03, 1);
  
  // Draw each component
  for (const comp of project.components.filter(c => c.visible)) {
    const compProps = computeComponentProps(comp);
    if (compProps.outline.length >= 2) {
      const layer = comp.operation === 'subtract' ? 'CUTOUT' : 'SECTION';
      dxf += generateDXFPolyline(compProps.outline, layer, true);
      
      // Add component label
      dxf += generateDXFText(
        comp.name,
        compProps.cx,
        compProps.cy,
        textHeight,
        'TEXT'
      );
    }
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
  
  // Draw axes
  const axisLen = Math.max(props.xMax - props.xMin, props.yMax - props.yMin) * 0.3;
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
    props.centroidY + props.yMax + textHeight * 3,
    textHeight * 1.5,
    'TEXT'
  );
  
  // Add overall dimensions
  const dimOffset = textHeight * 2;
  
  // Width dimension
  dxf += generateDXFLine(
    props.xMin, props.yMin - dimOffset,
    props.xMax, props.yMin - dimOffset,
    'DIMENSIONS'
  );
  dxf += generateDXFText(
    `${(props.xMax - props.xMin).toFixed(1)} ${project.units}`,
    (props.xMin + props.xMax) / 2,
    props.yMin - dimOffset - textHeight,
    textHeight * 0.8,
    'DIMENSIONS'
  );
  
  // Height dimension
  dxf += generateDXFLine(
    props.xMax + dimOffset, props.yMin,
    props.xMax + dimOffset, props.yMax,
    'DIMENSIONS'
  );
  dxf += generateDXFText(
    `${(props.yMax - props.yMin).toFixed(1)} ${project.units}`,
    props.xMax + dimOffset + textHeight,
    (props.yMin + props.yMax) / 2,
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

// ─── Excel Export ─────────────────────────────────────────────────────────

export async function exportExcel(project: SectionProject, props: SectionProperties): Promise<void> {
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = APP_NAME;
    workbook.created = new Date();
    
    const unit = project.units;
    const visibleComps = project.components.filter(c => c.visible);
    
    // ─── Sheet 1: Section Summary ───
    const summarySheet = workbook.addWorksheet('Section Summary');
    summarySheet.columns = [
      { header: 'Property', key: 'prop', width: 25 },
      { header: 'Value', key: 'value', width: 20 },
      { header: 'Unit', key: 'unit', width: 15 },
    ];
    
    const summaryData = [
      { prop: 'Section Name', value: project.name, unit: '' },
      { prop: 'Units', value: unit, unit: '' },
      { prop: 'Number of Components', value: visibleComps.length, unit: '' },
      { prop: '', value: '', unit: '' },
      { prop: 'SECTION PROPERTIES', value: '', unit: '' },
      { prop: 'Area (A)', value: props.area, unit: `${unit}²` },
      { prop: 'Centroid X̄', value: props.centroidX, unit: unit },
      { prop: 'Centroid Ȳ', value: props.centroidY, unit: unit },
      { prop: 'Moment of Inertia Ix', value: props.Ix, unit: `${unit}⁴` },
      { prop: 'Moment of Inertia Iy', value: props.Iy, unit: `${unit}⁴` },
      { prop: 'Product of Inertia Ixy', value: props.Ixy, unit: `${unit}⁴` },
      { prop: 'Radius of Gyration rx', value: props.rx, unit: unit },
      { prop: 'Radius of Gyration ry', value: props.ry, unit: unit },
      { prop: 'Section Modulus Zx (top)', value: props.Zx_top, unit: `${unit}³` },
      { prop: 'Section Modulus Zx (bottom)', value: props.Zx_bottom, unit: `${unit}³` },
      { prop: 'Section Modulus Zy (left)', value: props.Zy_left, unit: `${unit}³` },
      { prop: 'Section Modulus Zy (right)', value: props.Zy_right, unit: `${unit}³` },
      { prop: 'Principal Moment Imax', value: props.Imax, unit: `${unit}⁴` },
      { prop: 'Principal Moment Imin', value: props.Imin, unit: `${unit}⁴` },
      { prop: 'Principal Angle θ', value: props.principalAngle, unit: '°' },
      { prop: 'Extreme Fiber y_max', value: props.yMax, unit: unit },
      { prop: 'Extreme Fiber y_min', value: props.yMin, unit: unit },
      { prop: 'Extreme Fiber x_max', value: props.xMax, unit: unit },
      { prop: 'Extreme Fiber x_min', value: props.xMin, unit: unit },
    ];
    
    summarySheet.addRows(summaryData);
    
    // Style header
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // ─── Sheet 2: Geometry Input ───
    const geoSheet = workbook.addWorksheet('Geometry Input');
    geoSheet.columns = [
      { header: 'Plate ID', key: 'id', width: 15 },
      { header: 'Plate Title', key: 'title', width: 20 },
      { header: 'Type', key: 'type', width: 15 },
      { header: `X (${unit})`, key: 'x', width: 12 },
      { header: `Y (${unit})`, key: 'y', width: 12 },
      { header: `Width (${unit})`, key: 'width', width: 15 },
      { header: `Height (${unit})`, key: 'height', width: 15 },
      { header: 'Rotation (°)', key: 'rotation', width: 12 },
      { header: 'Operation', key: 'operation', width: 12 },
    ];
    
    visibleComps.forEach((comp, i) => {
      const g = comp.geometry;
      geoSheet.addRow({
        id: `PL-${String(i + 1).padStart(2, '0')}`,
        title: comp.name,
        type: comp.type,
        x: comp.position.x,
        y: comp.position.y,
        width: g.width ?? g.flangeWidth ?? g.radius ?? g.majorAxis ?? '-',
        height: g.height ?? g.webHeight ?? g.radius ?? g.minorAxis ?? '-',
        rotation: comp.rotation,
        operation: comp.operation,
      });
    });
    
    geoSheet.getRow(1).font = { bold: true };
    geoSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
    geoSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // ─── Sheet 3: Plate Calculations ───
    const calcSheet = workbook.addWorksheet('Plate Calculations');
    calcSheet.columns = [
      { header: 'Plate ID', key: 'id', width: 12 },
      { header: 'Plate Title', key: 'title', width: 18 },
      { header: `Area (${unit}²)`, key: 'area', width: 15 },
      { header: `Cx (${unit})`, key: 'cx', width: 12 },
      { header: `Cy (${unit})`, key: 'cy', width: 12 },
      { header: `Ix_local (${unit}⁴)`, key: 'ix_local', width: 18 },
      { header: `Iy_local (${unit}⁴)`, key: 'iy_local', width: 18 },
      { header: `dx (${unit})`, key: 'dx', width: 12 },
      { header: `dy (${unit})`, key: 'dy', width: 12 },
      { header: `A×dx² (${unit}⁴)`, key: 'adx2', width: 15 },
      { header: `A×dy² (${unit}⁴)`, key: 'ady2', width: 15 },
      { header: `Ix_contrib (${unit}⁴)`, key: 'ix_contrib', width: 18 },
      { header: `Iy_contrib (${unit}⁴)`, key: 'iy_contrib', width: 18 },
    ];
    
    visibleComps.forEach((comp, i) => {
      const p = computeComponentProps(comp);
      const sign = comp.operation === 'subtract' ? -1 : 1;
      const dx = p.cx - props.centroidX;
      const dy = p.cy - props.centroidY;
      
      calcSheet.addRow({
        id: `PL-${String(i + 1).padStart(2, '0')}`,
        title: comp.name,
        area: sign * p.area,
        cx: p.cx,
        cy: p.cy,
        ix_local: p.Ix_local,
        iy_local: p.Iy_local,
        dx: dx,
        dy: dy,
        adx2: p.area * dx * dx,
        ady2: p.area * dy * dy,
        ix_contrib: sign * (p.Ix_local + p.area * dy * dy),
        iy_contrib: sign * (p.Iy_local + p.area * dx * dx),
      });
    });
    
    // Add totals row
    const lastRow = visibleComps.length + 2;
    calcSheet.addRow({});
    const totalRow = calcSheet.addRow({
      id: 'TOTAL',
      title: '',
      area: { formula: `SUM(C2:C${lastRow - 1})` },
      cx: '',
      cy: '',
      ix_local: '',
      iy_local: '',
      dx: '',
      dy: '',
      adx2: '',
      ady2: '',
      ix_contrib: { formula: `SUM(L2:L${lastRow - 1})` },
      iy_contrib: { formula: `SUM(M2:M${lastRow - 1})` },
    });
    totalRow.font = { bold: true };
    
    calcSheet.getRow(1).font = { bold: true };
    calcSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
    calcSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // ─── Sheet 4: Section Properties (with formulas) ───
    const propsSheet = workbook.addWorksheet('Section Properties');
    propsSheet.columns = [
      { header: 'Property', key: 'prop', width: 30 },
      { header: 'Formula', key: 'formula', width: 35 },
      { header: 'Value', key: 'value', width: 20 },
      { header: 'Unit', key: 'unit', width: 15 },
    ];
    
    const propsData = [
      { prop: 'Total Area (A)', formula: "='Plate Calculations'!C" + (lastRow + 1), value: props.area, unit: `${unit}²` },
      { prop: 'Centroid X̄', formula: 'Σ(Ai·xi) / Σ(Ai)', value: props.centroidX, unit: unit },
      { prop: 'Centroid Ȳ', formula: 'Σ(Ai·yi) / Σ(Ai)', value: props.centroidY, unit: unit },
      { prop: 'Moment of Inertia Ix', formula: "='Plate Calculations'!L" + (lastRow + 1), value: props.Ix, unit: `${unit}⁴` },
      { prop: 'Moment of Inertia Iy', formula: "='Plate Calculations'!M" + (lastRow + 1), value: props.Iy, unit: `${unit}⁴` },
      { prop: 'Product of Inertia Ixy', formula: 'Σ(Ixyi + Ai·dxi·dyi)', value: props.Ixy, unit: `${unit}⁴` },
      { prop: 'Radius of Gyration rx', formula: '√(Ix / A)', value: props.rx, unit: unit },
      { prop: 'Radius of Gyration ry', formula: '√(Iy / A)', value: props.ry, unit: unit },
      { prop: 'Section Modulus Zx (top)', formula: 'Ix / y_max', value: props.Zx_top, unit: `${unit}³` },
      { prop: 'Section Modulus Zx (bottom)', formula: 'Ix / |y_min|', value: props.Zx_bottom, unit: `${unit}³` },
      { prop: 'Principal Imax', formula: '(Ix+Iy)/2 + √[((Ix-Iy)/2)² + Ixy²]', value: props.Imax, unit: `${unit}⁴` },
      { prop: 'Principal Imin', formula: '(Ix+Iy)/2 - √[((Ix-Iy)/2)² + Ixy²]', value: props.Imin, unit: `${unit}⁴` },
      { prop: 'Principal Angle θ', formula: '½·atan2(-2Ixy, Ix-Iy)', value: props.principalAngle, unit: '°' },
    ];
    
    propsSheet.addRows(propsData);
    propsSheet.getRow(1).font = { bold: true };
    propsSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };
    propsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // ─── Sheet 5: Calculation Notes ───
    const notesSheet = workbook.addWorksheet('Calculation Notes');
    notesSheet.columns = [{ header: 'Notes', key: 'note', width: 80 }];
    
    const notes = [
      'SECTION DESIGNER - CALCULATION NOTES',
      '',
      '═══════════════════════════════════════════════════════════════════',
      'APPLICATION INFORMATION',
      '═══════════════════════════════════════════════════════════════════',
      `Application: ${APP_NAME}`,
      `Version: ${APP_VERSION}`,
      `Export Date: ${new Date().toLocaleString()}`,
      '',
      '═══════════════════════════════════════════════════════════════════',
      'COORDINATE SYSTEM',
      '═══════════════════════════════════════════════════════════════════',
      'Origin: As defined by user (default at 0,0)',
      'X-axis: Positive to the right',
      'Y-axis: Positive upward',
      'Rotation: Counter-clockwise positive',
      '',
      '═══════════════════════════════════════════════════════════════════',
      'SIGN CONVENTIONS',
      '═══════════════════════════════════════════════════════════════════',
      'Add operation (+): Positive contribution to area and properties',
      'Subtract operation (-): Negative contribution (holes/cutouts)',
      '',
      '═══════════════════════════════════════════════════════════════════',
      'FORMULAS USED',
      '═══════════════════════════════════════════════════════════════════',
      '',
      'CENTROID:',
      '  X̄ = Σ(Ai × xi) / Σ(Ai)',
      '  Ȳ = Σ(Ai × yi) / Σ(Ai)',
      '',
      'MOMENT OF INERTIA (Parallel Axis Theorem):',
      '  Ix = Σ(Ix_local + A × dy²)',
      '  Iy = Σ(Iy_local + A × dx²)',
      '  where dx = xi - X̄, dy = yi - Ȳ',
      '',
      'PRODUCT OF INERTIA:',
      '  Ixy = Σ(Ixy_local + A × dx × dy)',
      '',
      'RADIUS OF GYRATION:',
      '  rx = √(Ix / A)',
      '  ry = √(Iy / A)',
      '',
      'SECTION MODULUS:',
      '  Zx = Ix / y_extreme',
      '  Zy = Iy / x_extreme',
      '',
      'PRINCIPAL MOMENTS:',
      '  Imax = (Ix + Iy)/2 + √[((Ix - Iy)/2)² + Ixy²]',
      '  Imin = (Ix + Iy)/2 - √[((Ix - Iy)/2)² + Ixy²]',
      '  θ = ½ × atan2(-2×Ixy, Ix - Iy)',
      '',
      '═══════════════════════════════════════════════════════════════════',
      'UNITS',
      '═══════════════════════════════════════════════════════════════════',
      `Length: ${unit}`,
      `Area: ${unit}²`,
      `Moment of Inertia: ${unit}⁴`,
      `Section Modulus: ${unit}³`,
      '',
      '═══════════════════════════════════════════════════════════════════',
      '© 2025 Arvind Singh Rawat. All Rights Reserved.',
      '═══════════════════════════════════════════════════════════════════',
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

export async function exportPDF(
  props: SectionProperties,
  project: SectionProject,
  trace: CalcTrace | null,
  stressResult: { maxCompression: number; maxTension: number; neutralAxisAngle: number } | null,
): Promise<void> {
  try {
    const { default: jsPDF } = await import('jspdf');
    const { autoTable } = await import('jspdf-autotable');

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

    // ─── Cover Header ───
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 45, 'F');
    doc.setTextColor(241, 245, 249);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Section Designer', 15, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Section Analysis & Property Report', 15, 28);
    doc.setFontSize(8);
    doc.text(`Section: ${project.name}`, 15, 36);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 15, 36, { align: 'right' });

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

    // ─── Section Properties Table ───
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Section Properties', 15, y);
    y += 2;
    
    autoTable(doc, {
      startY: y,
      head: [['Property', 'Value', 'Unit']],
      body: [
        ['Area (A)', fmt(props.area), `${unit}²`],
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
        ['Principal Moment Imax', fmtSci(props.Imax), `${unit}⁴`],
        ['Principal Moment Imin', fmtSci(props.Imin), `${unit}⁴`],
        ['Principal Angle θ', fmt(props.principalAngle), '°'],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255] },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: 15, right: 15 },
    });

    y = getLastTableY(y + 50);
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
