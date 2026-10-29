import assert from 'node:assert/strict';
import { MIDAS_MCT_REFERENCE_HEADER } from '../src/engine/midasMctReference.ts';
import { exportMidasMCT } from '../src/engine/midasMct.ts';
import type { SectionComponent, SectionProject } from '../src/engine/types.ts';
const rect = (x = 0, operation: 'add' | 'subtract' = 'add'): SectionComponent => ({
  id: String(x), name: 'plate', type: 'rectangle', geometry: { width: 100, height: 200 },
  position: { x, y: 0 }, rotation: 0, operation, materialId: '', visible: true, locked: false,
});
const project = (components: SectionComponent[]): SectionProject => ({
  id: 'test', name: 'Test, section\n*INJECT', description: '', units: 'mm', components,
  materials: [], revision: 1, createdAt: '', updatedAt: '',
});
const stiffness = (text: string) => text.split('\r\n').find((s, i, a) => a[i - 1]?.startsWith(' SECT='))!.trim().split(',').map(Number);
const basic = exportMidasMCT(project([rect()]));
assert.ok(basic.includes(MIDAS_MCT_REFERENCE_HEADER.replace(/\n/g, '\r\n') + '\r\n SECT=1, VALUE,'));
assert.equal(basic.split('*SECT-PSCVALUE').length - 1, 1);
assert.ok(/^       OPOLY=/m.test(basic));
assert.ok(!/^       IPOLY=/m.test(basic));
assert.ok(!basic.includes('\n*INJECT'));
assert.ok(basic.includes('N, MM, KJ, C'));
const [area, , , , iyy, izz] = stiffness(basic);
assert.equal(area, 20000);
assert.ok(Math.abs(iyy - 100 * 200 ** 3 / 12) < 0.001);
assert.ok(Math.abs(izz - 200 * 100 ** 3 / 12) < 0.001);
const overlap = exportMidasMCT(project([rect(), rect(50)]));
assert.equal(stiffness(overlap)[0], 30000);
const hole = { ...rect(0, 'subtract'), geometry: { width: 20, height: 40 } };
const hollow = exportMidasMCT(project([rect(), hole]));
assert.ok(/^       IPOLY=/m.test(hollow));
assert.equal(stiffness(hollow)[0], 19200);
assert.equal(exportMidasMCT(project([rect(), { ...rect(400), visible: false }])), basic);
assert.throws(() => exportMidasMCT(project([rect(), rect(400)])), /connected/);
assert.throws(() => exportMidasMCT(project([])), /no visible/);
assert.throws(() => exportMidasMCT(project([rect(), rect(0, 'subtract')])), /entire/);
const translated = exportMidasMCT(project([{ ...rect(), position: { x: 1000, y: -2000 } }]));
assert.equal(translated, basic);
const box = exportMidasMCT(project([{ ...rect(), type: 'box', geometry: { width: 100, height: 200, wallThickness: 10 } }]));
assert.ok(/^       IPOLY=/m.test(box));
assert.equal(stiffness(box)[0], 5600);
console.log('MIDAS export checks passed (format, units, stiffness, holes, union, visibility, translation, validation).');
