import assert from 'node:assert/strict';
import { importMidasMCT } from '../src/engine/midasMctImporter';
import { exportMidasMCT } from '../src/engine/midasMct';
import { computeSectionProperties } from '../src/engine/geometry';
import type { SectionProject } from '../src/engine/types';
const base: SectionProject = {
  id: 'test',
  name: 'Hollow section',
  sectionNumber: 42,
  units: 'mm',
  description: '',
  components: [
    {
      id: 'box',
      name: 'Box',
      type: 'box',
      geometry: { width: 100, height: 200, wallThickness: 10 },
      position: { x: 30, y: -80 },
      rotation: 0,
      operation: 'add',
      visible: true,
      locked: false,
      materialId: '',
    },
  ],
  materials: [],
  createdAt: '',
  updatedAt: '',
  revision: 1,
};
const text = exportMidasMCT(base);
const result = importMidasMCT(text);
assert.ok(result.success, result.error);
assert.equal(result.project!.sectionNumber, 42);
assert.equal(result.project!.name, base.name);
assert.equal(result.project!.units, 'mm');
assert.equal(result.project!.components.length, 1);
assert.equal(result.project!.components[0].geometry.rings!.length, 2);
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-8, `${a} != ${b}`);
const props = computeSectionProperties(result.project!.components).props;
const expected = computeSectionProperties(base.components).props;
for (const key of ['area', 'Ix', 'Iy', 'Ixy'] as const) near(props[key], expected[key]);
near(props.centroidX, 0);
near(props.centroidY, 0);
assert.ok(importMidasMCT(exportMidasMCT(result.project!)).success);
for (const unit of ['mm', 'cm', 'm', 'inch', 'ft'] as const) {
  const imported = importMidasMCT(exportMidasMCT({ ...base, units: unit }));
  assert.equal(imported.project!.units, unit);
  near(computeSectionProperties(imported.project!.components).props.area, expected.area);
}
const section = text.slice(text.indexOf('\r\n SECT=') + 2).replace('*ENDDATA', '');
const multiple = `*UNIT\nN, CM, KJ, C\n*SECT-PSCVALUE\n${section}\n${section.replace('SECT=42', 'SECT=71').replace('Hollow section', 'Second section')}\n*ENDDATA`;
assert.equal(importMidasMCT(multiple).sections.length, 2);
assert.equal(importMidasMCT(multiple, 'Section.mct', 71).project!.name, 'Second section');
assert.equal(importMidasMCT(multiple, 'Section.mct', 71).project!.units, 'cm');
assert.equal(importMidasMCT(multiple, 'Section.mct', 999).success, false);
assert.equal(importMidasMCT(multiple.replace('SECT=71', 'SECT=42')).success, false);
const partlyUnsupported = multiple.replace('SECT=42, VALUE', 'SECT=42, TAPERED');
assert.equal(importMidasMCT(partlyUnsupported).project!.sectionNumber, 71);
assert.ok(importMidasMCT(partlyUnsupported).sections[0].error);
assert.equal(importMidasMCT(partlyUnsupported, 'Section.mct', 42).success, false);
const noUnit = text.replace(/\*UNIT\r\n[^\r]+\r\n/, '');
assert.ok(importMidasMCT(noUnit).warnings!.some((w) => w.includes('millimetres assumed')));
assert.equal(importMidasMCT(noUnit, 'Section.mct', undefined, 'ft').project!.units, 'ft');
assert.equal(importMidasMCT(text.replace('N, MM', 'N, KM')).success, false);
assert.ok(importMidasMCT('\uFEFF' + text.replace(/\r\n/g, '\n')).success);
assert.ok(importMidasMCT(text.toLowerCase()).success);
assert.equal(importMidasMCT('not an mct file').success, false);
assert.equal(importMidasMCT(text.replaceAll('OPOLY=', 'VERTEX=')).success, false);
assert.equal(importMidasMCT(text.replace('SECT=42', 'SECT=-1')).success, false);
assert.equal(importMidasMCT(text.replaceAll('OPOLY=', 'OPOLY=NaN, ')).success, false);
assert.equal(importMidasMCT(text.replaceAll('OPOLY=', 'OPOLY=1, ')).success, false);
const header =
  '*SECT-PSCVALUE\nSECT=1, VALUE, Shape, CC, 0, 0, 0, 0, 0, 0, YES, NO, GEN, YES, YES\n1,0,0,0,0,0\n1,1,1,1,0,0,1,0,1,1\n-1,1,1,-1,1,1,-1,-1\n';
const polygon = (points: string) => header + 'OPOLY=' + points;
assert.equal(importMidasMCT(polygon('0,0,10,10,0,10,10,0')).success, false);
assert.equal(importMidasMCT(polygon('0,0,1,0,2,0')).success, false);
assert.ok(importMidasMCT(polygon('0D0,0, 1D1,0, 10,10, 0,10, 0,0,')).success);
assert.ok(importMidasMCT(polygon('0,0,10,0,10,10,0,10\nIPOLY=2,2,4,2,4,4,2,4')).success);
for (const hole of ['20,20,22,20,22,22,20,22', '0,0,2,0,2,2,0,2', '9,2,12,2,12,4,9,4']) {
  assert.equal(importMidasMCT(polygon(`0,0,10,0,10,10,0,10\nIPOLY=${hole}`)).success, false);
}
assert.equal(
  importMidasMCT(polygon('0,0,10,0,10,10,0,10\nIPOLY=2,2,6,2,6,6,2,6\nIPOLY=3,3,4,3,4,4,3,4'))
    .success,
  false,
);
console.log(
  'MIDAS import checks passed: boundaries/holes, properties, round trips, units, multiple sections, malformed and unsupported definitions.',
);
