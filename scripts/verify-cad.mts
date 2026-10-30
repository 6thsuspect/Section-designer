import { visibleViewportBounds } from '../src/engine/viewport.ts';
import assert from 'node:assert/strict';
import {
  CAD_COMMANDS,
  findCadCommand,
  cadNumber,
  cadPoint,
  parseCadValue,
  cadPrompt,
  cadCreate,
  cadSectionBoundary,
  arcPoints,
  transformCadSelection,
  cadAllPoints,
  draftInRect,
  stretchCad,
  dimensionGeometry,
} from '../src/engine/cad.ts';
import { computeSectionProperties, computeComponentProps } from '../src/engine/geometry.ts';
import { exportJSON, validateAndImportJSON, exportDXF } from '../src/engine/exporters.ts';
import type { Point, SectionProject } from '../src/engine/types.ts';
const p: SectionProject = {
  id: 'cad-test',
  name: 'CAD test',
  description: '',
  components: [],
  materials: [],
  units: 'mm',
  revision: 1,
  createdAt: '',
  updatedAt: '',
};
const near = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-8),
    `${actual} != ${expected}`,
  );
const equalPoint = (actual: Point, expected: Point) => {
  near(actual.x, expected.x);
  near(actual.y, expected.y);
};
for (const command of CAD_COMMANDS) {
  assert.equal(findCadCommand(command.name.toLowerCase()), command);
  for (const alias of command.aliases)
    assert.equal(findCadCommand(alias.toLowerCase()), command);
}
assert.equal(findCadCommand('HATCH'), undefined);
assert.equal(findCadCommand('not-a-command'), undefined);
near(cadNumber('1m', 'mm'), 1000);
near(cadNumber('2in', 'cm'), 5.08);
near(cadNumber('-1.2e2', 'mm'), -120);
assert.throws(() => cadNumber('NaN', 'mm'));
assert.throws(() => cadNumber('1e99', 'mm'));
assert.throws(() => cadNumber('4mm', 'mm', false));
equalPoint(cadPoint('100,-50,0', undefined, 'mm'), { x: 100, y: -50 });
equalPoint(cadPoint('@50,20', { x: -10, y: -30 }, 'mm'), { x: 40, y: -10 });
equalPoint(cadPoint('@100<45', { x: 0, y: 0 }, 'mm'), {
  x: Math.sqrt(5000),
  y: Math.sqrt(5000),
});
equalPoint(cadPoint('@1m,2cm', { x: 10, y: 10 }, 'mm'), { x: 1010, y: 30 });
for (const input of ['1', '1,2,3', 'Infinity,0', '@1,0', '1,2,0,4', '3<30'])
  assert.throws(() => cadPoint(input, undefined, 'mm'));
const rec = findCadCommand('REC')!;
assert.equal(cadPrompt({ command: rec, values: [] }), 'Specify first corner:');
assert.equal(cadPrompt({ command: rec, values: [{ x: 0, y: 0 }] }), 'Specify opposite corner:');
assert.throws(() => parseCadValue({ command: findCadCommand('POL')!, values: [] }, '2', 'mm'));
assert.throws(() =>
  parseCadValue({ command: findCadCommand('C')!, values: [{ x: 0, y: 0 }] }, '-2', 'mm'),
);
let project = cadCreate(p, 'RECTANGLE', [
  { x: 100, y: 50 },
  { x: 0, y: 0 },
]);
assert.equal(p.components.length, 0, 'creation must be immutable');
assert.equal(project.components[0].type, 'rectangle');
near(computeSectionProperties(project.components).props.area, 5000);
const originalId = project.components[0].id;
const moved = transformCadSelection(project, [originalId], 'MOVE', [
  { x: 0, y: 0 },
  { x: -500, y: 300 },
]);
equalPoint(moved.components[0].position, { x: -450, y: 325 });
equalPoint(project.components[0].position, { x: 50, y: 25 });
const copy = transformCadSelection(project, [originalId], 'COPY', [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
]);
assert.equal(copy.components.length, 2);
assert.notEqual(copy.components[1].id, originalId);
const rotated = transformCadSelection(project, [originalId], 'ROTATE', [{ x: 0, y: 0 }, 90]);
equalPoint(rotated.components[0].position, { x: -25, y: 50 });
near(rotated.components[0].rotation, 90);
const scaled = transformCadSelection(project, [originalId], 'SCALE', [{ x: 0, y: 0 }, 2]);
near(computeSectionProperties(scaled.components).props.area, 20000);
const mirrored = transformCadSelection(project, [originalId], 'MIRROR', [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
]);
assert.equal(mirrored.components.length, 2);
near(computeComponentProps(mirrored.components[1]).cx, -50);
assert.throws(() =>
  transformCadSelection(project, [originalId], 'MIRROR', [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]),
);
assert.throws(() =>
  transformCadSelection(
    { ...project, components: [{ ...project.components[0], locked: true }] },
    [originalId],
    'MOVE',
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  ),
);
const circle = cadCreate(p, 'CIRCLE', [{ x: 10, y: 10 }, 20]);
near(computeSectionProperties(circle.components).props.area, Math.PI * 400);
const scaleCircle = transformCadSelection(circle, [circle.components[0].id], 'SCALE', [
  { x: 0, y: 0 },
  2,
]);
assert.equal(scaleCircle.components[0].type, 'circle');
near(scaleCircle.components[0].geometry.radius!, 40);
const ellipse = cadCreate(p, 'ELLIPSE', [{ x: 0, y: 0 }, 20, 10]);
near(computeSectionProperties(ellipse.components).props.area, Math.PI * 200);
const poly = cadCreate(p, 'POLYGON', [4, { x: 0, y: 0 }, 10]);
near(computeSectionProperties(poly.components).props.area, 200);
const arc = arcPoints({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
equalPoint(arc[0], { x: 1, y: 0 });
equalPoint(arc.at(-1)!, { x: -1, y: 0 });
near(Math.max(...arc.map((p) => p.y)), 1);
const clockwise = arcPoints({ x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 });
near(Math.min(...clockwise.map((p) => p.y)), -1);
assert.throws(() => arcPoints({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }));
project = cadCreate(project, 'LINE', [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
]);
project = cadCreate(project, 'PLINE', [
  { x: 1, y: 1 },
  { x: 2, y: 2 },
]);
project = cadCreate(project, 'POINT', [{ x: -1000000, y: 1000000 }]);
project = cadCreate(project, 'ARC', [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]);
near(computeSectionProperties(project.components).props.area, 5000);
assert.equal(project.drawingEntities?.length, 4);
const draftMoved = transformCadSelection(project, [project.drawingEntities![0].id], 'MOVE', [
  { x: 0, y: 0 },
  { x: 10, y: -20 },
]);
equalPoint(
  draftMoved.drawingEntities!.find((e) => e.id === project.drawingEntities![0].id)!.points[0],
  { x: 10, y: -20 },
);
const closed = cadCreate(
  p,
  'PLINE',
  [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 0, y: 5 },
  ],
  true,
);
assert.equal(closed.drawingEntities![0].closed, true);
near(
  computeSectionProperties(cadSectionBoundary(p, closed.drawingEntities![0].points).components)
    .props.area,
  12.5,
);
assert.throws(() =>
  cadCreate(
    p,
    'PLINE',
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ],
    true,
  ),
);
assert.throws(() =>
  cadCreate(p, 'RECTANGLE', [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ]),
);
assert.throws(
  () =>
    cadCreate(
      p,
      'PLINE',
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 8, y: 0 },
      ],
      true,
    ),
  /cross/,
);
assert.throws(() => transformCadSelection(project, [originalId], 'SCALE', [{ x: 0, y: 0 }, 0]));
const box = {
  ...project.components[0],
  type: 'box' as const,
  geometry: { width: 100, height: 100, wallThickness: 10 },
};
const mirroredBox = transformCadSelection({ ...p, components: [box] }, [box.id], 'MIRROR', [
  { x: 0, y: 0 },
  { x: 0, y: 1 },
]);
near(computeComponentProps(mirroredBox.components[1]).area, 3600);
assert.ok(cadAllPoints(project).some((p) => p.x === -1000000));
const roundtrip = validateAndImportJSON(exportJSON(project));
assert.ok(roundtrip.success);
assert.deepEqual(roundtrip.project?.drawingEntities, project.drawingEntities);
const invalid = validateAndImportJSON(
  JSON.stringify({
    ...project,
    drawingEntities: [{ id: 'bad', kind: 'line', points: [] }],
  }),
);
assert.equal(invalid.success, false);
assert.ok(
  exportDXF(project, computeSectionProperties(project.components).props).includes('DRAFT'),
);
console.log(
  'CAD engine checks passed: registry, parsing, sequential prompts, native shapes, draft paths, transforms, holes, validation, units, JSON and DXF.',
);

const draft = {
  id: 'open',
  kind: 'line' as const,
  points: [
    { x: -10, y: 0 },
    { x: 10, y: 0 },
  ],
};
assert.equal(draftInRect(draft, { x0: -1, y0: -1, x1: 1, y1: 1 }), false);
assert.equal(draftInRect(draft, { x0: -1, y0: -1, x1: 1, y1: 1 }, true), true);
assert.equal(draftInRect(draft, { x0: -11, y0: -1, x1: 11, y1: 1 }), true);

const view = { x: -400, y: -400, w: 800, h: 800 };
assert.deepEqual(visibleViewportBounds(view, 1200, 600), {
  x: -800,
  y: -400,
  w: 1600,
  h: 800,
});
assert.deepEqual(visibleViewportBounds(view, 600, 1200), {
  x: -400,
  y: -800,
  w: 800,
  h: 1600,
});
assert.deepEqual(visibleViewportBounds(view, 800, 800), view);
assert.deepEqual(visibleViewportBounds(view, 0, 0), view);
assert.deepEqual(visibleViewportBounds({ x: 1000, y: -250, w: 200, h: 100 }, 1200, 600), {
  x: 1000,
  y: -250,
  w: 200,
  h: 100,
});
assert.deepEqual(view, { x: -400, y: -400, w: 800, h: 800 });
console.log(
  'Full-canvas grid bounds checks passed (wide, tall, square, resized and panned viewports).',
);

assert.equal(findCadCommand('s')?.name, 'STRETCH');
assert.equal(findCadCommand('sc')?.name, 'SCALE');
assert.equal(findCadCommand('dim')?.name, 'DIM');
assert.equal(findCadCommand('dal')?.name, 'DIMALIGNED');
const stretchRect = cadCreate(p, 'RECTANGLE', [
  { x: 0, y: 0 },
  { x: 100, y: 50 },
]);
const stretchedRect = stretchCad(stretchRect, [
  { x: 90, y: -10 },
  { x: 110, y: 60 },
  { x: 0, y: 0 },
  { x: 50, y: 0 },
]);
near(computeSectionProperties(stretchedRect.components).props.area, 7500);
near(computeSectionProperties(stretchRect.components).props.area, 5000);
assert.equal(stretchedRect.components[0].id, stretchRect.components[0].id);
const stretchedLine = stretchCad(
  cadCreate(p, 'LINE', [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ]),
  [
    { x: 99, y: -1 },
    { x: 101, y: 1 },
    { x: 0, y: 0 },
    { x: 20, y: 10 },
  ],
);
equalPoint(stretchedLine.drawingEntities![0].points[1], { x: 120, y: 10 });
assert.throws(
  () =>
    stretchCad(stretchRect, [
      { x: 999, y: 999 },
      { x: 1000, y: 1000 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]),
  /No unlocked/,
);
assert.throws(
  () =>
    stretchCad(circle, [
      { x: 0, y: 0 },
      { x: 31, y: 31 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]),
  /Partial STRETCH/,
);
const dimHorizontal = cadCreate(p, 'DIM', [
  { x: 0, y: 0 },
  { x: 30, y: 40 },
  { x: 15, y: 100 },
]);
const dimVertical = cadCreate(p, 'DIM', [
  { x: 0, y: 0 },
  { x: 30, y: 40 },
  { x: 100, y: 20 },
]);
const dimAligned = cadCreate(p, 'DIMALIGNED', [
  { x: 0, y: 0 },
  { x: 30, y: 40 },
  { x: 0, y: 100 },
]);
near(dimensionGeometry(dimHorizontal.drawingEntities![0]).measurement, 30);
near(dimensionGeometry(dimVertical.drawingEntities![0]).measurement, 40);
near(dimensionGeometry(dimAligned.drawingEntities![0]).measurement, 50);
assert.equal(dimAligned.components.length, 0);
assert.throws(
  () =>
    cadCreate(p, 'DIM', [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ]),
  /distinct/,
);
const dimRotated = transformCadSelection(
  dimHorizontal,
  [dimHorizontal.drawingEntities![0].id],
  'ROTATE',
  [{ x: 0, y: 0 }, 90],
);
near(dimensionGeometry(dimRotated.drawingEntities![0]).measurement, 30);
const dimScaled = transformCadSelection(
  dimAligned,
  [dimAligned.drawingEntities![0].id],
  'SCALE',
  [{ x: 0, y: 0 }, 2],
);
near(dimensionGeometry(dimScaled.drawingEntities![0]).measurement, 100);
assert.ok(validateAndImportJSON(exportJSON(dimAligned)).success);
assert.deepEqual(
  validateAndImportJSON(exportJSON(dimHorizontal)).project?.drawingEntities,
  dimHorizontal.drawingEntities,
);
assert.ok(exportDXF(dimAligned, computeSectionProperties([]).props).includes('DIMENSIONS'));
assert.equal(
  validateAndImportJSON(
    exportJSON({
      ...dimHorizontal,
      drawingEntities: [
        { ...dimHorizontal.drawingEntities![0], dimensionAxis: { x: 0, y: 0 } },
      ],
    }),
  ).success,
  false,
);
console.log('STRETCH, SCALE/SC and linear/aligned dimension checks passed.');

// Native closed paths share one canonical vertex list; no extra section/draft duplicate.
const squarePoints = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
const nativePoly = cadCreate(p, 'PLINE', squarePoints, true);
assert.equal(nativePoly.components.length, 0);
assert.equal(nativePoly.drawingEntities!.length, 1);
assert.equal(nativePoly.drawingEntities![0].closed, true);
assert.equal(nativePoly.drawingEntities![0].points.length, 4);
const { drawingEntityPoints: displayPoints } = await import('../src/engine/cad.ts');
assert.deepEqual(displayPoints(nativePoly.drawingEntities![0]), [
  ...squarePoints,
  squarePoints[0],
]);
assert.equal(
  validateAndImportJSON(exportJSON(nativePoly)).project!.drawingEntities![0].closed,
  true,
);
assert.match(
  exportDXF(nativePoly, computeSectionProperties(nativePoly.components).props),
  /0\nPOLYLINE\n8\nDRAFT\n66\n1\n70\n1\n/,
);
const { inStretchArea, validateStretchPolygon } =
  await import('../src/engine/cadStretchArea.ts');
const area = {
  kind: 'polygon' as const,
  points: [
    { x: 9, y: -1 },
    { x: 12, y: 0 },
    { x: 12, y: 12 },
    { x: 9, y: 11 },
  ],
};
validateStretchPolygon(area.points);
assert.ok(inStretchArea({ x: 9, y: 0 }, area), 'polygon boundary is included');
assert.throws(() =>
  validateStretchPolygon([
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    { x: 0, y: 2 },
    { x: 2, y: 0 },
  ]),
);
for (const displacement of [
  { x: 5, y: 0 },
  { x: 0, y: 5 },
  { x: 5, y: 5 },
]) {
  const result = stretchCad(nativePoly, [{ x: 0, y: 0 }, displacement], area);
  assert.deepEqual(
    result.drawingEntities![0].points,
    squarePoints.map((q) =>
      q.x === 10 ? { x: q.x + displacement.x, y: q.y + displacement.y } : q,
    ),
  );
  assert.equal(result.drawingEntities![0].id, nativePoly.drawingEntities![0].id);
  assert.equal(result.drawingEntities![0].closed, true);
}
assert.deepEqual(
  nativePoly.drawingEntities![0].points,
  squarePoints,
  'preview/operations leave source untouched',
);
const rectPolyStretch = stretchCad(
  cadCreate(p, 'RECTANGLE', [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ]),
  [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ],
  area,
);
near(computeSectionProperties(rectPolyStretch.components).props.area, 150);
const { executeCadExtended } = await import('../src/engine/cadExtended.ts');
const outward = executeCadExtended(nativePoly, [nativePoly.drawingEntities![0].id], 'OFFSET', [
  2,
  { x: 20, y: 5 },
]);
assert.equal(outward.drawingEntities!.length, 2);
assert.equal(outward.drawingEntities![1].closed, true);
assert.deepEqual(outward.drawingEntities![1].points, [
  { x: -2, y: -2 },
  { x: 12, y: -2 },
  { x: 12, y: 12 },
  { x: -2, y: 12 },
]);
assert.throws(() =>
  executeCadExtended(nativePoly, [nativePoly.drawingEntities![0].id], 'OFFSET', [
    6,
    { x: 5, y: 5 },
  ]),
);
const trimmedPoly = executeCadExtended(
  nativePoly,
  [nativePoly.drawingEntities![0].id],
  'TRIM',
  [
    { x: 5, y: -1 },
    { x: 5, y: 11 },
    { x: 9, y: 5 },
  ],
);
assert.equal(trimmedPoly.drawingEntities!.length, 1);
assert.equal(trimmedPoly.drawingEntities![0].id, nativePoly.drawingEntities![0].id);
assert.equal(trimmedPoly.drawingEntities![0].closed, false);
assert.deepEqual(trimmedPoly.drawingEntities![0].points, [
  { x: 5, y: 10 },
  { x: 0, y: 10 },
  { x: 0, y: 0 },
  { x: 5, y: 0 },
]);
const exploded = executeCadExtended(
  nativePoly,
  [nativePoly.drawingEntities![0].id],
  'EXPLODE',
  [],
);
assert.equal(exploded.drawingEntities!.length, 4, 'EXPLODE includes the closing edge');
assert.ok(
  draftInRect(nativePoly.drawingEntities![0], { x0: -1, y0: 4, x1: 1, y1: 6 }, true),
  'closing edge participates in crossing selection',
);
console.log(
  'Native closed-polyline storage, polygon STRETCH vertex masks, immutable previews, offset/trim, JSON/DXF closure and editing checks passed.',
);
const diamond = {
  kind: 'polygon' as const,
  points: [
    { x: 0, y: 5 },
    { x: 5, y: 0 },
    { x: 10, y: 5 },
    { x: 5, y: 10 },
  ],
};
assert.equal(
  inStretchArea({ x: 1, y: 1 }, diamond),
  false,
  'crossing polygon is not its bounding box',
);
assert.equal(inStretchArea({ x: 5, y: 1 }, diamond), true);
const entirePoly = stretchCad(nativePoly, [
  { x: -1, y: -1 },
  { x: 11, y: 11 },
  { x: 0, y: 0 },
  { x: 7, y: -3 },
]);
assert.deepEqual(
  entirePoly.drawingEntities![0].points,
  squarePoints.map((q) => ({ x: q.x + 7, y: q.y - 3 })),
);
const stretchedOutline = computeComponentProps(rectPolyStretch.components[0]).outline;
near(Math.min(...stretchedOutline.map((q) => q.x)), 0);
near(Math.max(...stretchedOutline.map((q) => q.x)), 15);
const movedClosed = transformCadSelection(
  nativePoly,
  [nativePoly.drawingEntities![0].id],
  'MOVE',
  [
    { x: 0, y: 0 },
    { x: 7, y: -3 },
  ],
);
assert.equal(movedClosed.drawingEntities![0].closed, true);
assert.deepEqual(movedClosed.drawingEntities![0].points, entirePoly.drawingEntities![0].points);
assert.equal(
  validateAndImportJSON(
    exportJSON({
      ...nativePoly,
      drawingEntities: [
        {
          ...nativePoly.drawingEntities![0],
          closed: 'yes' as unknown as boolean,
        },
      ],
    }),
  ).success,
  false,
);
