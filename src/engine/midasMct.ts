import * as polygonClippingModule from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import type { Point, SectionProject, SectionComponent } from './types';
import { componentRegion, signedArea, keyholeAll } from './combine';
import { computeSectionProperties } from './geometry';

const clip = (polygonClippingModule as unknown as { default?: typeof polygonClippingModule }).default ?? polygonClippingModule;

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error('The section contains invalid coordinates or properties.');
  return String(Number(value.toPrecision(12)));
}

/** General, non-tapered VALUE section. Coordinates and stiffness use project length units. */
export function exportMidasMCT(project: SectionProject): string {
  const visible = project.components.filter(c => c.visible);
  const regions = (operation: 'add' | 'subtract'): Polygon[] => visible
    .filter(c => c.operation === operation)
    .flatMap(c => componentRegion(c))
    .map(rings => rings.map(ring => {
      if (ring.length < 3 || ring.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
        throw new Error('Every boundary must have at least three finite points.');
      }
      return [...ring.map(p => [p.x, p.y] as [number, number]), [ring[0].x, ring[0].y] as [number, number]];
    }));
  const additions = regions('add');
  if (!additions.length) throw new Error('There is no visible additive section to export.');
  let material: MultiPolygon = clip.union(additions[0], ...additions.slice(1));
  const cuts = regions('subtract');
  if (cuts.length) material = clip.difference(material, ...cuts);
  if (!material.length) throw new Error('The cut-outs remove the entire section.');
  // One VALUE/GEN section has one outer polygon; never silently drop other islands.
  if (material.length !== 1) throw new Error('MIDAS MCT export requires one connected material region. Connect the separate pieces before exporting.');
  const rings: Point[][] = material[0].map((ring, i) => {
    const points = ring.slice(0, -1).map(([x, y]) => ({ x, y }));
    return (signedArea(points) > 0) === (i === 0) ? points : points.reverse();
  });
  const component: SectionComponent = {
    id: 'midas-boundary', name: project.name, type: 'custom-shape',
    geometry: { points: keyholeAll(rings), rings },
    position: { x: 0, y: 0 }, rotation: 0, operation: 'add',
    visible: true, locked: false, materialId: '',
  };
  const { props: p } = computeSectionProperties([component]);
  if (!(p.area > 0)) throw new Error('The section must have positive area.');
  const perimeter = (ring: Point[]) => ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + Math.hypot(b.x - a.x, b.y - a.y);
  }, 0);
  const name = project.name.replace(/[,;\r\n\t*=]/g, ' ').trim().slice(0, 40) || 'Section';
  const unit = { mm: 'MM', cm: 'CM', m: 'M', inch: 'IN', ft: 'FT' }[project.units];
  const row = (values: number[]) => `       ${values.map(number).join(', ')}`;
  const outer = rings[0];
  const xs = outer.map(pt => pt.x - p.centroidX);
  const ys = outer.map(pt => pt.y - p.centroidY);
  const yp = Math.max(...xs), ym = -Math.min(...xs);
  const zp = Math.max(...ys), zm = -Math.min(...ys);
  const lines = [
    '; Section Designer — non-tapered general boundary section',
    '; App X = MIDAS local Y; App Y = MIDAS local Z. Coordinates are centroid-relative.',
    '; Only visible components are included; overlaps are unioned and cut-outs subtracted.',
    '; Curves are polygonized (256 segments per full circle).',
    '; REVIEW IN MIDAS: ASy, ASz, Qyb and Qzb are zero placeholders (not calculated).',
    '; Ixx is the app torsion estimate, NOT a MIDAS/FE torsion solution. Recalculate before design.',
    '*UNIT',
    `   N, ${unit}, KJ, C`,
    '*SECT-PSCVALUE',
    ` SECT=1, VALUE, ${name}, CC, 0, 0, 0, 0, 0, 0, YES, NO, GEN, YES, YES`,
    row([p.area, 0, 0, p.It, p.Ix, p.Iy]),
    row([yp, ym, zp, zm, 0, 0, perimeter(rings[0]), rings.slice(1).reduce((s, r) => s + perimeter(r), 0), ym, zm]),
    row([-ym, yp, yp, -ym, zp, zp, -zm, -zm]),
  ];
  rings.forEach((ring, index) => {
    for (let start = 0; start < ring.length; start += 4) {
      const prefix = start === 0 ? `       ${index === 0 ? 'OPOLY' : 'IPOLY'}=` : '             ';
      lines.push(prefix + ring.slice(start, start + 4).flatMap(pt => [number(pt.x - p.centroidX), number(pt.y - p.centroidY)]).join(', '));
    }
  });
  lines.push('*ENDDATA');
  return lines.join('\r\n') + '\r\n';
}
