// ─── Core Engineering Types ────────────────────────────────────────────────
export type UnitSystem = 'SI' | 'Imperial';
export type LengthUnit = 'mm' | 'cm' | 'm' | 'inch' | 'ft';
export type ForceUnit = 'N' | 'kN' | 'kip';
export type StressUnit = 'MPa' | 'ksi';

export type ComponentType =
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'polygon'
  | 'custom-shape'
  | 'i-section'
  | 't-section'
  | 'l-section'
  | 'channel'
  | 'box'
  | 'hollow-circle'
  | 'hollow-rectangle'
  | 'ellipse';

export type BooleanOperation = 'add' | 'subtract';

export interface Point {
  x: number;
  y: number;
}

export interface Material {
  id: string;
  name: string;
  E: number;       // Modulus of elasticity (MPa)
  density: number;  // kg/m³
  grade: string;
  color: string;
}

export interface ComponentGeometry {
  // Rectangle
  width?: number;
  height?: number;
  // Circle / Hollow circle
  radius?: number;
  outerRadius?: number;
  innerRadius?: number;
  // Triangle
  vertices?: [Point, Point, Point];
  // Polygon
  points?: Point[];
  // I-Section
  flangeWidth?: number;
  flangeThickness?: number;
  webHeight?: number;
  webThickness?: number;
  bottomFlangeWidth?: number;
  bottomFlangeThickness?: number;
  // T-Section (uses flangeWidth, flangeThickness, webHeight, webThickness)
  // L-Section
  legWidth?: number;
  legHeight?: number;
  thickness?: number;
  // Channel (uses flangeWidth, flangeThickness, webHeight, webThickness)
  // Box (uses width, height, thickness)
  wallThickness?: number;
  // Ellipse
  majorAxis?: number;
  minorAxis?: number;
  // Hollow rectangle
  innerWidth?: number;
  innerHeight?: number;
}

export interface SectionComponent {
  id: string;
  name: string;
  type: ComponentType;
  geometry: ComponentGeometry;
  position: Point;
  rotation: number; // degrees
  operation: BooleanOperation;
  materialId: string;
  visible: boolean;
  locked: boolean;
}

export interface SectionProperties {
  area: number;
  centroidX: number;
  centroidY: number;
  Ix: number;    // about centroidal x
  Iy: number;    // about centroidal y
  Ixy: number;   // product of inertia
  rx: number;    // radius of gyration x
  ry: number;    // radius of gyration y
  Zx_top: number;
  Zx_bottom: number;
  Zy_left: number;
  Zy_right: number;
  Imax: number;
  Imin: number;
  principalAngle: number; // degrees
  yMax: number;
  yMin: number;
  xMax: number;
  xMin: number;

  // ─── Extended properties (Y-Z user axes / U-V principal axes) ──────────
  // Axis convention: application X (horizontal) ≡ engineering Y,
  //                  application Y (vertical)   ≡ engineering Z.
  // U-V are the principal axes; α is the angle from Y to U (CCW, degrees).
  It: number;              // St. Venant torsional constant
  Iu: number;              // moment of inertia about U axis (= Imax)
  Iv: number;              // moment of inertia about V axis (= Imin)
  iu: number;              // radius of gyration about U
  iv: number;              // radius of gyration about V
  uMax: number;            // extreme fibre coordinate along +U (from centroid)
  uMin: number;            // extreme fibre coordinate along −U
  vMax: number;            // extreme fibre coordinate along +V
  vMin: number;            // extreme fibre coordinate along −V
  WuP: number;             // elastic modulus about U (+ve extreme fibre)
  WuM: number;             // elastic modulus about U (−ve extreme fibre)
  WvP: number;             // elastic modulus about V (+ve extreme fibre)
  WvM: number;             // elastic modulus about V (−ve extreme fibre)
  Wplu: number;            // plastic modulus about U axis
  Wplv: number;            // plastic modulus about V axis
  auP: number;             // centroid → edge distance along +U
  auM: number;             // centroid → edge distance along −U
  avP: number;             // centroid → edge distance along +V
  avM: number;             // centroid → edge distance along −V
  yP: number;              // equal-area axis position along Y (from centroid)
  zP: number;              // equal-area axis position along Z (from centroid)
  uP: number;              // equal-area axis position along U (from centroid)
  vP: number;              // equal-area axis position along V (from centroid)
}

export interface StressInput {
  P: number;   // Axial force (N)
  Mx: number;  // Moment about x-axis (N·mm)
  My: number;  // Moment about y-axis (N·mm)
}

export interface StressResult {
  maxCompression: number;
  maxTension: number;
  stressAtPoint: (x: number, y: number) => number;
  neutralAxisAngle: number;
  neutralAxisIntercept: number;
}

export interface CalcStep {
  label: string;
  formula: string;
  substitution: string;
  result: string;
  unit: string;
}

export interface CalcTrace {
  title: string;
  steps: CalcStep[];
  children?: CalcTrace[];
}

export interface SectionProject {
  id: string;
  name: string;
  description: string;
  units: LengthUnit;
  components: SectionComponent[];
  materials: Material[];
  loads?: StressInput;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

// File format with schema version for import/export
export interface SectionFileFormat {
  schemaVersion: string;
  application: string;
  applicationVersion: string;
  exportedAt: string;
  project: SectionProject;
}

export interface QAMessage {
  level: 'error' | 'warning' | 'info';
  category: 'geometry' | 'calculation' | 'engineering';
  message: string;
  componentId?: string;
}

// Indian standard steel section
export interface StandardSection {
  designation: string;
  type: string;
  mass: number;    // kg/m
  area: number;    // mm²
  depth: number;   // mm
  width: number;   // mm
  tw: number;      // web thickness mm
  tf: number;      // flange thickness mm
  Ix: number;      // mm⁴
  Iy: number;      // mm⁴
  Zx: number;      // mm³
  Zy: number;      // mm³
  rx: number;      // mm
  ry: number;      // mm
}
