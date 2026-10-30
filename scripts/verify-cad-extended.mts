import assert from 'node:assert/strict';
import {
  executeCadExtended as run,
  fitCadSpline,
  intersectCadLines,
} from '../src/engine/cadExtended.ts';
import { CAD_EXTENDED_COMMANDS } from '../src/engine/cadExtendedCatalog.ts';
import {
  cadCreate,
  cadPoint,
  clipCadConstruction,
  draftInRect,
  findCadCommand,
  parseCadValue,
  transformCadSelection,
  type DrawingEntity,
} from '../src/engine/cad.ts';
import { computeSectionProperties } from '../src/engine/geometry.ts';
import { exportDXF, exportJSON, validateAndImportJSON } from '../src/engine/exporters.ts';
import type { Point, SectionProject } from '../src/engine/types.ts';
const empty: SectionProject = {
  id: 'extended',
  name: 'Extended CAD',
  description: '',
  components: [],
  materials: [],
  units: 'mm',
  revision: 1,
  createdAt: '',
  updatedAt: '',
};
const line = (id: string, a: Point, b: Point): DrawingEntity => ({
  id,
  kind: 'line',
  points: [a, b],
});
const origin = { x: 0, y: 0 },
  end = { x: 10, y: 0 };
const base = { ...empty, drawingEntities: [line('a', origin, end)] };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const point = (a: Point, b: Point) => {
  near(a.x, b.x);
  near(a.y, b.y);
};
const covered = new Set<string>();
const execute: typeof run = (...args) => {
  covered.add(args[2]);
  return run(...args);
};
for (const c of CAD_EXTENDED_COMMANDS) {
  assert.equal(findCadCommand(c.name), c);
  c.aliases.forEach((a) => assert.equal(findCadCommand(a.toLowerCase()), c));
}
point(cadPoint('#10,-20', undefined, 'mm'), { x: 10, y: -20 });
assert.equal(parseCadValue({ command: findCadCommand('ARRAY')!, values: [] }, '1', 'mm'), 1);
assert.throws(() => parseCadValue({ command: findCadCommand('ARRAY')!, values: [] }, '2.5', 'mm'));
const xline = execute(empty, [], 'XLINE', [origin, { x: 1, y: 0 }]);
assert.deepEqual(
  clipCadConstruction(xline.drawingEntities![0], { x0: -1000, y0: -100, x1: 1000, y1: 100 }),
  [
    { x: -1000, y: 0 },
    { x: 1000, y: 0 },
  ],
);
assert.ok(draftInRect(xline.drawingEntities![0], { x0: 999, y0: -1, x1: 1000, y1: 1 }, true));
const ray = execute(empty, [], 'RAY', [origin, { x: 1, y: 0 }]);
assert.equal(
  clipCadConstruction(ray.drawingEntities![0], { x0: -10, y0: -1, x1: -1, y1: 1 }),
  null,
);
assert.throws(() => run(empty, [], 'RAY', [origin, origin]));
const diameter = execute(empty, [], 'CIRCLED', [origin, 20]);
near(diameter.components[0].geometry.radius!, 10);
const two = execute(empty, [], 'CIRCLE2P', [origin, end]);
point(two.components[0].position, { x: 5, y: 0 });
near(two.components[0].geometry.radius!, 5);
const three = execute(empty, [], 'CIRCLE3P', [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]);
point(three.components[0].position, origin);
near(three.components[0].geometry.radius!, 1);
assert.throws(() => run(empty, [], 'CIRCLE3P', [origin, end, { x: 20, y: 0 }]));
const fit = [origin, { x: 10, y: 10 }, { x: 20, y: 0 }];
const spline = execute(empty, [], 'SPLINE', fit);
point(spline.drawingEntities![0].points[24], fit[1]);
point(fitCadSpline(fit, true).at(-1)!, origin);
assert.throws(() => run(empty, [], 'SPLINE', [origin, origin]));
const donut = execute(empty, [], 'DONUT', [10, 20, origin]);
near(computeSectionProperties(donut.components).props.area, 75 * Math.PI);
assert.throws(() => run(empty, [], 'DONUT', [20, 10, origin]));
const text = execute(empty, [], 'TEXT', [origin, 5, 30, '"Sample text"']);
assert.equal(text.drawingEntities![0].text, 'Sample text');
const mtext = execute(empty, [], 'MTEXT', [origin, 5, 0, '"First\\nSecond"']);
assert.equal(mtext.drawingEntities![0].text, 'First\nSecond');
const scaledText = transformCadSelection(text, [text.drawingEntities![0].id], 'SCALE', [origin, 2]);
near(scaledText.drawingEntities![0].textHeight!, 10);
assert.ok(validateAndImportJSON(exportJSON(text)).success);
assert.ok(exportDXF(text, computeSectionProperties([]).props).includes('Sample text'));
const offset = execute(base, ['a'], 'OFFSET', [2, { x: 0, y: 5 }]);
assert.equal(offset.drawingEntities!.length, 2);
point(offset.drawingEntities![1].points[0], { x: 0, y: 2 });
const offsetCircle = run(diameter, [diameter.components[0].id], 'OFFSET', [2, origin]);
near(offsetCircle.components[1].geometry.radius!, 8);
assert.throws(() => run(diameter, [diameter.components[0].id], 'OFFSET', [11, origin]));
const trimmed = execute(base, ['a'], 'TRIM', [{ x: 4, y: -1 }, { x: 4, y: 1 }, origin]);
point(trimmed.drawingEntities![0].points[0], { x: 4, y: 0 });
const extended = execute(base, ['a'], 'EXTEND', [{ x: 20, y: -1 }, { x: 20, y: 1 }, end]);
point(extended.drawingEntities![0].points[1], { x: 20, y: 0 });
assert.throws(() => run(base, ['a'], 'EXTEND', [{ x: 20, y: -1 }, { x: 20, y: 1 }, origin]));
assert.throws(() => intersectCadLines(origin, end, { x: 0, y: 1 }, { x: 10, y: 1 }));
const corners = {
  ...empty,
  drawingEntities: [line('a', end, origin), line('b', origin, { x: 0, y: 10 })],
};
const fillet = execute(corners, ['a', 'b'], 'FILLET', [2, end, { x: 0, y: 10 }]);
assert.equal(fillet.drawingEntities!.length, 3);
point(fillet.drawingEntities![0].points[1], { x: 2, y: 0 });
point(fillet.drawingEntities![1].points[1], { x: 0, y: 2 });
assert.equal(fillet.drawingEntities![2].kind, 'arc');
assert.ok(
  fillet.drawingEntities![2].points.every((p) => Math.abs(Math.hypot(p.x - 2, p.y - 2) - 2) < 1e-7),
);
assert.throws(() => run(corners, ['a', 'b'], 'FILLET', [50, end, { x: 0, y: 10 }]));
const chamfer = execute(corners, ['a', 'b'], 'CHAMFER', [2, 3, end, { x: 0, y: 10 }]);
point(chamfer.drawingEntities![2].points[0], { x: 2, y: 0 });
point(chamfer.drawingEntities![2].points[1], { x: 0, y: 3 });
const chain = {
  ...empty,
  drawingEntities: [line('a', origin, { x: 1, y: 0 }), line('b', { x: 2, y: 0 }, { x: 1, y: 0 })],
};
const joined = execute(chain, ['a', 'b'], 'JOIN', []);
assert.equal(joined.drawingEntities!.length, 1);
assert.equal(joined.drawingEntities![0].points.length, 3);
const exploded = execute(joined, [joined.drawingEntities![0].id], 'EXPLODE', []);
assert.equal(exploded.drawingEntities!.length, 2);
assert.ok(exploded.drawingEntities!.every((e) => e.kind === 'line'));
const broken = execute(base, ['a'], 'BREAK', [
  { x: 2, y: 0 },
  { x: 8, y: 0 },
]);
assert.equal(broken.drawingEntities!.length, 2);
point(broken.drawingEntities![0].points[1], { x: 2, y: 0 });
point(broken.drawingEntities![1].points[0], { x: 8, y: 0 });
assert.throws(() =>
  run(base, ['a'], 'BREAK', [
    { x: 2, y: 1 },
    { x: 8, y: 0 },
  ]),
);
const lengthened = execute(base, ['a'], 'LENGTHEN', [20, end]);
point(lengthened.drawingEntities![0].points[1], { x: 20, y: 0 });
const array = execute(base, ['a'], 'ARRAY', [2, 3, 20, 30]);
assert.equal(array.drawingEntities!.length, 6);
assert.ok(array.drawingEntities!.some((e) => e.points[0].x === 40 && e.points[0].y === 30));
const polar = execute(base, ['a'], 'ARRAYPOLAR', [4, origin, 360]);
assert.equal(polar.drawingEntities!.length, 4);
assert.ok(
  polar.drawingEntities!.some(
    (e) => Math.abs(e.points[1].x) < 1e-7 && Math.abs(e.points[1].y - 10) < 1e-7,
  ),
);
assert.throws(() => run(base, ['a'], 'ARRAY', [1000, 2, 20, 30]));
const duplicate = {
  ...base,
  drawingEntities: [...base.drawingEntities, line('copy', end, origin)],
};
const cleaned = execute(duplicate, ['a', 'copy'], 'OVERKILL', []);
assert.equal(cleaned.drawingEntities!.length, 1);
assert.deepEqual(
  base.drawingEntities![0].points,
  [origin, end],
  'all operations must leave their source snapshot unchanged',
);
for (const command of CAD_EXTENDED_COMMANDS)
  assert.ok(covered.has(command.name), `No successful execution test for ${command.name}`);
console.log(
  `Native CADCraft-style checks passed: ${covered.size} command implementations, geometry, validation, construction clipping, text persistence and exports.`,
);
