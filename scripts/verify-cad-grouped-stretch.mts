import assert from 'node:assert/strict';
import {
  cadCreate,
  cadSectionBoundary,
  stretchCad,
  transformCadSelection,
} from '../src/engine/cad.ts';
import {
  combineComponents,
  uncombineComponent,
  componentRegion,
  sameComponentMaterial,
  rebuildCombinedComponent,
} from '../src/engine/combine.ts';
import { computeSectionProperties } from '../src/engine/geometry.ts';
import { exportJSON, validateAndImportJSON, exportDXF } from '../src/engine/exporters.ts';
import { importDXF } from '../src/engine/dxfImporter.ts';
import type { Point, SectionComponent, SectionProject } from '../src/engine/types.ts';

const empty: SectionProject = {
  id: 'plate-test',
  name: 'Plate test',
  description: '',
  units: 'mm',
  revision: 1,
  createdAt: '',
  updatedAt: '',
  components: [],
  materials: [],
  alignCGToOrigin: false,
};
const plate = (id: string, points: Point[]): SectionComponent => ({
  ...cadSectionBoundary(empty, points).components[0],
  id,
  name: id,
});
const rectangle = (id: string, x0: number, y0: number, x1: number, y1: number) =>
  plate(id, [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ]);
const flange = rectangle('top', -50, 80, 50, 90);
const web = rectangle('web', -5, 0, 5, 80);
const bottom = rectangle('bottom', -40, -10, 40, 0);
const section = { ...empty, components: [flange, web, bottom] };
const combine = (components: SectionComponent[], id = 'group') => {
  const result = combineComponents(
    components,
    components.map((c) => c.id),
    id,
  );
  assert.ok(result.ok, !result.ok ? result.error : '');
  return result.components;
};
const uncombine = (components: SectionComponent[], id = 'group') => {
  const result = uncombineComponent(components, id);
  assert.ok(result.ok, !result.ok ? result.error : '');
  return result.components;
};
const stretch = (project: SectionProject, a: Point, b: Point, delta: Point) =>
  stretchCad(project, [a, b, { x: 0, y: 0 }, delta]);
const grouped = { ...empty, components: combine(section.components) };
const sourceJSON = JSON.stringify(grouped);
const points = (c: SectionComponent) => componentRegion(c).flat(2);
const has = (c: SectionComponent, p: Point) =>
  points(c).some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-7);
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const compareMembers = (a: SectionComponent[], b: SectionComponent[]) => {
  assert.deepEqual(
    a.map((c) => c.id),
    b.map((c) => c.id),
  );
  a.forEach((c, i) => assert.ok(sameComponentMaterial(c, b[i]), `member ${c.id} differs`));
};

// The same vertex mask produces the same plates grouped or ungrouped.
for (const [a, b, delta] of [
  [
    { x: 30, y: 75 },
    { x: 55, y: 95 },
    { x: 20, y: 0 },
  ], // extend flange only
  [
    { x: -60, y: 79 },
    { x: 60, y: 100 },
    { x: 0, y: 20 },
  ], // raise flange and web end
  [
    { x: -10, y: 79 },
    { x: 10, y: 81 },
    { x: 0, y: 5 },
  ], // T-junction inside long flange edge
  [
    { x: -10, y: -1 },
    { x: 10, y: 81 },
    { x: 2, y: 0 },
  ], // shear web, preserving both flange joints
  [
    { x: -60, y: -20 },
    { x: 60, y: 100 },
    { x: 13, y: -7 },
  ], // fully enclosed move
] as [Point, Point, Point][]) {
  const individual = stretch(section, a, b, delta);
  const result = stretch(grouped, a, b, delta);
  assert.equal(result.components[0].id, 'group');
  assert.equal(result.components[0].combinedFrom!.length, 3);
  const restored = uncombine(result.components);
  compareMembers(restored, individual.components);
  compareMembers(restored, result.components[0].combinedFrom!);
  assert.ok(
    sameComponentMaterial(result.components[0], combine(restored)[0]),
    'group is derived from its latest plates',
  );
  near(
    computeSectionProperties(result.components).props.area,
    computeSectionProperties(individual.components).props.area,
  );
}
assert.equal(
  JSON.stringify(grouped),
  sourceJSON,
  'previews/operations never mutate the original snapshot',
);
const raised = stretch(grouped, { x: -60, y: 79 }, { x: 60, y: 100 }, { x: 0, y: 20 });
const raisedMembers = uncombine(raised.components);
assert.ok(has(raisedMembers[0], { x: -50, y: 100 }));
assert.ok(has(raisedMembers[1], { x: -5, y: 100 }));
assert.ok(has(raisedMembers[2], { x: -40, y: -10 }), 'bottom flange stays fixed');
assert.equal(Math.max(...points(raisedMembers[1]).map((p) => p.y)), 100);
const junction = stretch(grouped, { x: -10, y: 79 }, { x: 10, y: 81 }, { x: 0, y: 5 });
const junctionMembers = uncombine(junction.components);
for (const p of [
  { x: -5, y: 85 },
  { x: 5, y: 85 },
]) {
  assert.ok(
    has(junctionMembers[0], p) && has(junctionMembers[1], p),
    'T-junction is shared exactly by flange and web',
  );
}
assert.ok(has(junctionMembers[0], { x: -50, y: 80 }), 'unselected flange edge stays fixed');

// Independent editing and regrouping use the very same source IDs and geometry.
const edited = stretch(
  { ...empty, components: raisedMembers },
  { x: 40, y: 95 },
  { x: 55, y: 115 },
  { x: 10, y: 0 },
);
const regrouped = combine(edited.components, 'regroup');
compareMembers(uncombine(regrouped, 'regroup'), edited.components);
assert.ok(has(uncombine(regrouped, 'regroup')[0], { x: 60, y: 100 }));
const roundtrip = validateAndImportJSON(exportJSON({ ...empty, components: regrouped }));
assert.ok(roundtrip.success);
compareMembers(uncombine(roundtrip.project!.components, 'regroup'), edited.components);

// Nested groups remain nested; no source IDs are flattened, duplicated or lost.
const nested = {
  ...empty,
  components: combine([...combine([flange, web], 'upper'), bottom], 'outer'),
};
const nestedResult = stretch(nested, { x: -60, y: 79 }, { x: 60, y: 100 }, { x: 0, y: 20 });
const firstLevel = uncombine(nestedResult.components, 'outer');
assert.equal(firstLevel[0].id, 'upper');
assert.equal(firstLevel[0].combinedFrom!.length, 2);
compareMembers(uncombine(firstLevel, 'upper'), raisedMembers);

// Parent moves/rotations, including legacy groups, are materialized before stretching/uncombining.
for (const legacy of [false, true]) {
  const parent = structuredClone(grouped.components[0]);
  if (legacy) delete parent.combinedSourceFrame;
  parent.position = { x: parent.position.x + 200, y: parent.position.y + 100 };
  parent.rotation = 90;
  const posed = { ...empty, components: [parent] };
  const posedSources = uncombine(posed.components);
  assert.ok(sameComponentMaterial(parent, combine(posedSources)[0]));
  const result = stretch(posed, { x: 190, y: -100 }, { x: 400, y: 300 }, { x: 0, y: 8 });
  assert.ok(
    sameComponentMaterial(result.components[0], combine(uncombine(result.components))[0]),
  );
}

// Existing transforms keep grouped source snapshots synchronized (copy IDs must be new).
for (const [name, values] of [
  [
    'MOVE',
    [
      { x: 0, y: 0 },
      { x: 100, y: -20 },
    ],
  ],
  [
    'COPY',
    [
      { x: 0, y: 0 },
      { x: 100, y: -20 },
    ],
  ],
  ['ROTATE', [{ x: 0, y: 0 }, 30]],
  ['SCALE', [{ x: 0, y: 0 }, 2]],
  [
    'MIRROR',
    [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ],
  ],
] as const) {
  const result = transformCadSelection(raised, ['group'], name, [...values]);
  const copied = name === 'COPY' || name === 'MIRROR';
  assert.equal(result.components.length, copied ? 2 : 1);
  const parent = result.components.at(-1)!;
  const restored = uncombine(result.components, parent.id).filter((c) => c.id !== 'group');
  assert.equal(restored.length, 3);
  assert.equal(new Set(restored.map((c) => c.id)).size, 3);
  if (copied) assert.ok(restored.every((c) => !['top', 'web', 'bottom'].includes(c.id)));
  else
    assert.deepEqual(
      restored.map((c) => c.id),
      ['top', 'web', 'bottom'],
    );
  assert.ok(sameComponentMaterial(parent, combine(restored)[0]));
}

// Inclined coordinate plates and imported DXF use the same path, not a special geometry engine.
const inclined = plate('inclined', [
  { x: -5, y: 0 },
  { x: 5, y: 0 },
  { x: 35, y: 80 },
  { x: 25, y: 80 },
]);
const inclinedProject = { ...empty, components: [flange, inclined, bottom] };
const inclinedResult = stretch(
  { ...empty, components: combine(inclinedProject.components) },
  { x: -60, y: 79 },
  { x: 60, y: 100 },
  { x: 5, y: 20 },
);
compareMembers(
  uncombine(inclinedResult.components),
  stretch(inclinedProject, { x: -60, y: 79 }, { x: 60, y: 100 }, { x: 5, y: 20 }).components,
);
const imported = importDXF(
  exportDXF(section, computeSectionProperties(section.components).props),
);
assert.ok(imported.success, imported.error);
assert.equal(imported.project!.components.length, 3);
const importedGroup = { ...empty, components: combine(imported.project!.components) };
const importedStretch = stretch(
  importedGroup,
  { x: -60, y: 79 },
  { x: 60, y: 100 },
  { x: 0, y: 20 },
);
assert.ok(sameComponentMaterial(importedStretch.components[0], raised.components[0]));

// Multi-ring custom geometry retains a real void, not a disconnected keyhole bridge.
const boxPlates = [
  rectangle('left', -50, -50, -40, 50),
  rectangle('right', 40, -50, 50, 50),
  rectangle('upper', -40, 40, 40, 50),
  rectangle('lower', -40, -50, 40, -40),
];
const box = { ...empty, components: combine(boxPlates) };
const expandedBox = stretch(box, { x: 39, y: -60 }, { x: 60, y: 60 }, { x: 20, y: 0 });
assert.equal(componentRegion(expandedBox.components[0])[0].length, 2);
compareMembers(
  uncombine(expandedBox.components),
  stretch(
    { ...empty, components: boxPlates },
    { x: 39, y: -60 },
    { x: 60, y: 60 },
    { x: 20, y: 0 },
  ).components,
);
const standaloneBox = {
  ...empty,
  components: [
    { ...box.components[0], combinedFrom: undefined, combinedSourceFrame: undefined },
  ],
};
const stretchedBox = stretch(
  standaloneBox,
  { x: 39, y: -60 },
  { x: 60, y: 60 },
  { x: 20, y: 0 },
);
assert.ok(sameComponentMaterial(stretchedBox.components[0], expandedBox.components[0]));

// Invalid, collapsed, locked-junction and independently edited groups fail atomically.
assert.throws(() => stretch(grouped, { x: -10, y: 79 }, { x: 10, y: 100 }, { x: 0, y: -100 }));
const locked = { ...empty, components: [{ ...flange, locked: true }, web, bottom] };
assert.throws(
  () => stretch(locked, { x: -10, y: 79 }, { x: 10, y: 81 }, { x: 0, y: 5 }),
  /locked/,
);
const independentlyEdited = structuredClone(grouped);
independentlyEdited.components[0].geometry.points =
  independentlyEdited.components[0].geometry.points!.map((p) => ({ x: p.x * 2, y: p.y }));
independentlyEdited.components[0].geometry.rings =
  independentlyEdited.components[0].geometry.rings!.map((r) =>
    r.map((p) => ({ x: p.x * 2, y: p.y })),
  );
assert.throws(
  () => stretch(independentlyEdited, { x: -200, y: 79 }, { x: 200, y: 100 }, { x: 0, y: 10 }),
  /independent edits/,
);
assert.equal(JSON.stringify(grouped), sourceJSON);

// Existing basic LINE/PLINE creation and immutable draft stretching still work.
const line = cadCreate(empty, 'LINE', [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
]);
assert.deepEqual(
  stretch(line, { x: 9, y: -1 }, { x: 11, y: 1 }, { x: 2, y: 3 }).drawingEntities![0].points,
  [
    { x: 0, y: 0 },
    { x: 12, y: 3 },
  ],
);
assert.ok(rebuildCombinedComponent(raised.components[0], raisedMembers).combinedSourceFrame);

// Native rectangular plates use different local centers; arbitrary group poses
// must still share exactly the same world-space junction vertices.
const nativeParts = [
  cadCreate(empty, 'RECTANGLE', [
    { x: -50, y: 80 },
    { x: 50, y: 90 },
  ]).components[0],
  cadCreate(empty, 'RECTANGLE', [
    { x: -5, y: 0 },
    { x: 5, y: 80 },
  ]).components[0],
  cadCreate(empty, 'RECTANGLE', [
    { x: -40, y: -10 },
    { x: 40, y: 0 },
  ]).components[0],
];
const nativeParent = combine(nativeParts)[0];
nativeParent.rotation = 30;
const nativePosedStretch = stretch(
  { ...empty, components: [nativeParent] },
  { x: -100, y: -100 },
  { x: 100, y: 150 },
  { x: 20, y: 5 },
);
assert.ok(
  sameComponentMaterial(
    nativePosedStretch.components[0],
    combine(uncombine(nativePosedStretch.components))[0],
  ),
);

for (const name of ['ROTATE', 'MIRROR'] as const) {
  const values =
    name === 'ROTATE'
      ? [{ x: 13, y: 17 }, 27]
      : [
          { x: 13, y: 17 },
          { x: 29, y: 74 },
        ];
  const transformed = transformCadSelection(nestedResult, ['outer'], name, values);
  const parent = transformed.components.at(-1)!;
  const sourceMembers = uncombine(transformed.components, parent.id).filter(
    (c) => c.id !== 'outer',
  );
  assert.ok(sameComponentMaterial(parent, combine(sourceMembers)[0]));
  const child = sourceMembers.find((c) => c.combinedFrom)!;
  assert.ok(sameComponentMaterial(child, combine(uncombine([child], child.id))[0]));
}

console.log(
  'Grouped/custom STRETCH checks passed: source IDs, T-junctions, uncombine/edit/regroup, nested/legacy/posed groups, transforms, inclined/DXF plates, holes and atomic validation.',
);
