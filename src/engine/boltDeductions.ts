import type { BoltDeductionConfig, Point, SectionComponent } from './types';

export const DEFAULT_BOLT_DEDUCTIONS: BoltDeductionConfig = {
  enabled: true,
  diameter: 20,
  count: 1,
  spacing: 60,
  grouped: true,
};

export interface ResolvedDeductionLayout {
  count: number;
  edgeDistance: number;
  /** Length count − 1; spacing of hole i+2 from hole i+1. */
  spacings: number[];
}

const MAX_DEDUCTIONS = 100;

function rotateOffset(offset: Point, degrees: number): Point {
  const angle = degrees * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: offset.x * cos - offset.y * sin,
    y: offset.x * sin + offset.y * cos,
  };
}

export function normalizedDeductionCount(config: BoltDeductionConfig): number {
  return Math.max(1, Math.min(MAX_DEDUCTIONS, Math.floor(config.count || 1)));
}

/**
 * Plate thickness is the smaller rectangle dimension; deductions are spaced
 * along the longer (plate length) local axis, measured sequentially from the
 * plate start edge, following plate position and rotation while grouped.
 */
export function plateDeductionAxis(plate: SectionComponent): { thickness: number; length: number; alongX: boolean } {
  const width = Math.max(0, plate.geometry.width ?? 0);
  const height = Math.max(0, plate.geometry.height ?? 0);
  const alongX = width > height;
  return { thickness: alongX ? height : width, length: alongX ? width : height, alongX };
}

/**
 * Resolve the sequential layout. Projects created before individual spacing
 * existed (no edgeDistance/spacings) are migrated from the former symmetric
 * equal-spacing pattern, so their holes keep the same positions.
 */
export function resolveDeductionLayout(config: BoltDeductionConfig, plateLength: number): ResolvedDeductionLayout {
  const count = normalizedDeductionCount(config);
  const fallback = Math.max(0, config.spacing ?? 0);
  const spacings = Array.from({ length: count - 1 }, (_, i) => {
    const value = config.spacings?.[i];
    return Number.isFinite(value) ? Math.max(0, value as number) : (config.spacings?.length ? config.spacings[config.spacings.length - 1] : fallback);
  });
  const edgeDistance = Number.isFinite(config.edgeDistance)
    ? Math.max(0, config.edgeDistance as number)
    : plateLength / 2 - ((count - 1) * fallback) / 2;
  return { count, edgeDistance, spacings };
}

/** Distances of every hole centre from the plate start edge, in sequence. */
export function deductionEdgeOffsets(layout: ResolvedDeductionLayout): number[] {
  const offsets = [layout.edgeDistance];
  for (const spacing of layout.spacings) offsets.push(offsets[offsets.length - 1] + spacing);
  return offsets;
}

export function deductionCenters(plate: SectionComponent): Point[] {
  const config = plate.geometry.boltDeductions;
  if (plate.type !== 'rectangle' || !config?.enabled) return [];
  const { alongX, length } = plateDeductionAxis(plate);
  const offsets = deductionEdgeOffsets(resolveDeductionLayout(config, length));
  return offsets.map(fromEdge => {
    const along = fromEdge - length / 2; // plate-local, measured from centre
    const offset = rotateOffset(alongX ? { x: along, y: 0 } : { x: 0, y: along }, plate.rotation);
    return { x: plate.position.x + offset.x, y: plate.position.y + offset.y };
  });
}

/**
 * Change the spacing between hole `index` and hole `index + 1` (0-based gap).
 * - `chain`: later holes keep their spacings and shift with the edited hole.
 * - `independent`: only hole `index + 1` moves; the following gap absorbs the
 *   change so every other hole keeps its absolute position.
 */
export function withSpacing(
  config: BoltDeductionConfig,
  plateLength: number,
  gapIndex: number,
  value: number,
  mode: 'chain' | 'independent',
): BoltDeductionConfig {
  const layout = resolveDeductionLayout(config, plateLength);
  const spacings = [...layout.spacings];
  const next = Math.max(0, value);
  if (mode === 'independent' && gapIndex + 1 < spacings.length) {
    const delta = next - spacings[gapIndex];
    spacings[gapIndex + 1] = Math.max(0, spacings[gapIndex + 1] - delta);
  }
  spacings[gapIndex] = next;
  return { ...config, edgeDistance: layout.edgeDistance, spacings };
}

/** Change the first-hole edge distance (chain moves all; independent moves hole 1 only). */
export function withEdgeDistance(
  config: BoltDeductionConfig,
  plateLength: number,
  value: number,
  mode: 'chain' | 'independent',
): BoltDeductionConfig {
  const layout = resolveDeductionLayout(config, plateLength);
  const spacings = [...layout.spacings];
  const next = Math.max(0, value);
  if (mode === 'independent' && spacings.length > 0) {
    spacings[0] = Math.max(0, spacings[0] - (next - layout.edgeDistance));
  }
  return { ...config, edgeDistance: next, spacings };
}

/** Change the hole count, appending holes at the last (or default) spacing. */
export function withCount(config: BoltDeductionConfig, plateLength: number, count: number): BoltDeductionConfig {
  const layout = resolveDeductionLayout(config, plateLength);
  const nextCount = normalizedDeductionCount({ ...config, count });
  const spacings = layout.spacings.slice(0, nextCount - 1);
  const fill = layout.spacings[layout.spacings.length - 1] ?? Math.max(0, config.spacing);
  while (spacings.length < nextCount - 1) spacings.push(fill);
  return { ...config, count: nextCount, edgeDistance: layout.edgeDistance, spacings };
}

function deductionId(plateId: string, index: number): string {
  return `${plateId}:bolt-deduction:${index + 1}`;
}

function deductionGeometry(plate: SectionComponent) {
  const { thickness, alongX } = plateDeductionAxis(plate);
  const diameter = Math.max(0, plate.geometry.boltDeductions?.diameter ?? 0);
  return alongX ? { width: diameter, height: thickness } : { width: thickness, height: diameter };
}

function managedDeduction(
  plate: SectionComponent,
  center: Point,
  index: number,
  existing?: SectionComponent,
): SectionComponent {
  return {
    ...(existing ?? {}),
    id: existing?.id ?? deductionId(plate.id, index),
    name: `${plate.name} — Bolt Deduction ${index + 1}`,
    type: 'rectangle',
    // Width across the plate = plate thickness; depth along it = bolt diameter.
    geometry: deductionGeometry(plate),
    position: center,
    rotation: plate.rotation,
    operation: 'subtract',
    materialId: plate.materialId,
    visible: plate.visible && plate.operation === 'add',
    locked: true,
    parentId: plate.id,
    associationKind: 'bolt-deduction',
    generatedIndex: index,
    managedByParent: true,
  };
}

function detachedDeduction(component: SectionComponent): SectionComponent {
  if (!component.managedByParent && !component.locked) return component;
  return { ...component, managedByParent: false, locked: false };
}

/**
 * Synchronize grouped deduction rectangles with their parent plates. Ungrouped
 * deductions remain associated but their geometry is deliberately left alone,
 * allowing each shape to be edited independently. Regrouping snaps them back
 * to the current parent pattern.
 */
export function synchronizeBoltDeductions(components: SectionComponent[]): SectionComponent[] {
  // Remove legacy circular bolt holes/configuration from earlier project data.
  const legacyCleaned = components
    .filter(component => (component as SectionComponent & { generatedKind?: string }).generatedKind !== 'bolt-hole')
    .map(component => {
      const geometry = component.geometry as typeof component.geometry & { boltHoles?: unknown };
      if (!('boltHoles' in geometry)) return component;
      const { boltHoles: _removed, ...rest } = geometry;
      void _removed;
      return { ...component, geometry: rest };
    });

  const parents = new Map(legacyCleaned
    .filter(component => component.type === 'rectangle' && component.associationKind !== 'bolt-deduction')
    .map(component => [component.id, component]));
  const childrenByParent = new Map<string, SectionComponent[]>();
  for (const component of legacyCleaned) {
    if (component.associationKind === 'bolt-deduction' && component.parentId) {
      const children = childrenByParent.get(component.parentId) ?? [];
      children.push(component);
      childrenByParent.set(component.parentId, children);
    }
  }
  for (const children of childrenByParent.values()) {
    children.sort((a, b) => (a.generatedIndex ?? 0) - (b.generatedIndex ?? 0));
  }

  const result: SectionComponent[] = [];
  for (const component of legacyCleaned) {
    if (component.associationKind === 'bolt-deduction') continue;
    result.push(component);
    const config = component.geometry.boltDeductions;
    const existing = childrenByParent.get(component.id) ?? [];
    const grouped = config?.grouped ?? true;
    if (!grouped) {
      // Ungrouped: separate, freely editable shapes. Never regenerate them.
      result.push(...existing.map(detachedDeduction));
      continue;
    }
    if (component.type !== 'rectangle' || !config?.enabled) continue;
    deductionCenters(component).forEach((center, index) => {
      result.push(managedDeduction(component, center, index, existing[index]));
    });
  }

  // Grouped deductions are deleted with their parent. Ungrouped deductions are
  // independent shapes, so retain them and release the stale association.
  for (const [parentId, children] of childrenByParent) {
    if (parents.has(parentId)) continue;
    result.push(...children.filter(child => !child.managedByParent).map(child => ({
      ...detachedDeduction(child),
      parentId: undefined,
      associationKind: undefined,
      generatedIndex: undefined,
    })));
  }

  return result;
}

export interface DeductionFitIssue { hole: number; message: string }

export function deductionPatternIssues(plate: SectionComponent): DeductionFitIssue[] {
  const config = plate.geometry.boltDeductions;
  if (plate.type !== 'rectangle' || !config?.enabled) return [];
  const { length } = plateDeductionAxis(plate);
  const layout = resolveDeductionLayout(config, length);
  const offsets = deductionEdgeOffsets(layout);
  const radius = config.diameter / 2;
  const issues: DeductionFitIssue[] = [];
  if (config.diameter <= 0) issues.push({ hole: 0, message: 'Diameter must be positive.' });
  offsets.forEach((offset, index) => {
    if (offset - radius < -1e-9) issues.push({ hole: index + 1, message: `Hole ${index + 1} extends beyond the start edge.` });
    if (offset + radius > length + 1e-9) issues.push({ hole: index + 1, message: `Hole ${index + 1} extends beyond the end edge.` });
    if (index > 0 && layout.spacings[index - 1] < config.diameter - 1e-9) {
      issues.push({ hole: index + 1, message: `Hole ${index + 1} overlaps hole ${index} (spacing < diameter).` });
    }
  });
  return issues;
}

export function deductionPatternFitsPlate(plate: SectionComponent): boolean {
  return deductionPatternIssues(plate).length === 0;
}
