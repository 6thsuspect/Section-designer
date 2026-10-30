import type { SectionProject } from './types';
import { cadSectionBoundary } from './cad';
import { cadRegion, synchronizeCadRegion } from './cadRegion';
import { uniqueCadVertices } from './cadPath';
import { componentRegion } from './combine';

/** Use the existing Combine model, with provenance but no duplicate path geometry. */
export function prepareCadRegionCombine(
  project: SectionProject,
  ids: string[],
): SectionProject {
  const selected = (project.drawingEntities ?? []).filter((e) => ids.includes(e.id));
  if (!selected.length) return project;
  const converted = selected.map((entity) => {
    if (!cadRegion(entity))
      throw new Error(
        'Only valid closed filled CAD regions can be combined; finish or close open paths first.',
      );
    const component = cadSectionBoundary(
      { ...project, components: [] },
      uniqueCadVertices(entity.points),
    ).components[0];
    return {
      ...component,
      id: entity.id,
      name: `Closed Polyline ${entity.id.slice(0, 8)}`,
      cadPathKind: 'polyline' as const,
    };
  });
  return {
    ...project,
    components: [...project.components, ...converted],
    drawingEntities: project.drawingEntities?.filter((e) => !ids.includes(e.id)),
  };
}

/** After Uncombine, CAD source plates return to editable paths at their latest coordinates. */
export function restoreCadRegions(project: SectionProject): SectionProject {
  const sources = project.components.filter((c) => c.cadPathKind && !c.combinedFrom);
  if (!sources.length) return project;
  const restored = sources.map((component) => {
    const polygons = componentRegion(component);
    if (polygons.length !== 1 || polygons[0].length !== 1)
      throw new Error('A CAD polyline source must retain one simple closed boundary.');
    const entity = synchronizeCadRegion({
      id: component.id,
      kind: 'polyline',
      closed: true,
      points: polygons[0][0],
    });
    if (!entity.region) throw new Error('Cannot restore an invalid CAD region.');
    if (project.drawingEntities?.some((e) => e.id === entity.id))
      throw new Error('Cannot restore duplicate CAD region IDs.');
    return entity;
  });
  return {
    ...project,
    components: project.components.filter((c) => !sources.includes(c)),
    drawingEntities: [...(project.drawingEntities ?? []), ...restored],
  };
}
