import assert from 'node:assert/strict';
import { cadCreate, stretchCad, transformCadSelection } from '../src/engine/cad.ts';
import {
  cadRegion,
  synchronizeCadRegions,
  triangulateCadRegion,
  polygonRegionArea,
} from '../src/engine/cadRegion.ts';
import { cadPathPoints } from '../src/engine/cadPath.ts';
import { executeCadExtended } from '../src/engine/cadExtended.ts';
import { prepareCadRegionCombine, restoreCadRegions } from '../src/engine/cadRegionGrouping.ts';
import { combineComponents, uncombineComponent } from '../src/engine/combine.ts';
import { exportJSON, validateAndImportJSON, exportDXF } from '../src/engine/exporters.ts';
import { importDXF } from '../src/engine/dxfImporter.ts';
import { computeSectionProperties } from '../src/engine/geometry.ts';
import type { Point, SectionProject } from '../src/engine/types.ts';
const empty: SectionProject = {
  id: 'regions',
  name: 'Region tests',
  description: '',
  createdAt: '',
  updatedAt: '',
  units: 'mm',
  revision: 1,
  components: [],
  materials: [],
  alignCGToOrigin: false,
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)), `${a} != ${b}`);
const shapes: [Point[], number][] = [
  [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ],
    50,
  ],
  [
    [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 5 },
    ],
    12.5,
  ],
  [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 8, y: 4 },
      { x: 2, y: 4 },
    ],
    32,
  ],
  [
    [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 6 },
      { x: 0, y: 6 },
    ],
    20,
  ],
];
for (const [vertices, area] of shapes)
  for (const points of [vertices, [...vertices].reverse()])
    for (const name of ['LINE', 'PLINE']) {
      const project = cadCreate(empty, name, [...points, points[0]], true);
      assert.equal(
        project.components.length,
        0,
        'a CAD region does not silently add structural stiffness',
      );
      assert.equal(project.drawingEntities!.length, 1);
      const entity = project.drawingEntities![0];
      assert.equal(entity.kind, 'polyline');
      assert.equal(entity.closed, true);
      assert.equal(entity.points.length, points.length, 'closing vertex is not stored twice');
      assert.equal(entity.region!.fill, 'solid');
      near(entity.region!.area, area);
      assert.deepEqual(cadPathPoints(entity), [...points, points[0]]);
      const triangles = triangulateCadRegion(entity.points);
      near(
        triangles.reduce((sum, triangle) => sum + polygonRegionArea(triangle), 0),
        area,
      );
      const dxf = exportDXF(project, computeSectionProperties(project.components).props);
      assert.equal((dxf.match(/0\nSOLID\n/g) ?? []).length, points.length - 2);
      assert.match(dxf, /0\nPOLYLINE\n8\nDRAFT\n66\n1\n70\n1\n/);
      const imported = importDXF(dxf);
      assert.ok(imported.success, imported.error);
      assert.equal(
        imported.project!.components.length,
        1,
        'SOLID triangles do not create duplicate geometry',
      );
      near(computeSectionProperties(imported.project!.components).props.area, area);
      assert.ok(!imported.warnings?.some((w) => w.includes('SOLID')));
      const saved = validateAndImportJSON(exportJSON(project));
      assert.ok(saved.success);
      near(saved.project!.drawingEntities![0].region!.area, area);
    }
const square = cadCreate(empty, 'PLINE', shapes[0][0], true);
const original = JSON.stringify(square);
const id = square.drawingEntities![0].id;
const stretched = stretchCad(square, [
  { x: 9, y: -1 },
  { x: 11, y: 6 },
  { x: 0, y: 0 },
  { x: 10, y: 0 },
]);
near(stretched.drawingEntities![0].region!.area, 100);
assert.equal(stretched.drawingEntities![0].id, id);
assert.equal(JSON.stringify(square), original, 'filled-region previews remain non-destructive');
for (const [name, values, area] of [
  [
    'MOVE',
    [
      { x: 0, y: 0 },
      { x: 7, y: 3 },
    ],
    50,
  ],
  [
    'COPY',
    [
      { x: 0, y: 0 },
      { x: 7, y: 3 },
    ],
    50,
  ],
  ['ROTATE', [{ x: 0, y: 0 }, 37], 50],
  [
    'MIRROR',
    [
      { x: 2, y: 3 },
      { x: 5, y: 17 },
    ],
    50,
  ],
  ['SCALE', [{ x: 0, y: 0 }, 3], 450],
] as const) {
  const result = transformCadSelection(square, [id], name, [...values]);
  near(result.drawingEntities!.at(-1)!.region!.area, area);
}
const offset = executeCadExtended(square, [id], 'OFFSET', [1, { x: 12, y: 2 }]);
near(offset.drawingEntities![1].region!.area, 84);
const trimmed = executeCadExtended(square, [id], 'TRIM', [
  { x: 5, y: -1 },
  { x: 5, y: 6 },
  { x: 9, y: 2 },
]);
assert.equal(trimmed.drawingEntities![0].closed, false);
assert.equal(
  trimmed.drawingEntities![0].region,
  undefined,
  'an opened boundary loses its fill and area cache',
);
const exploded = executeCadExtended(square, [id], 'EXPLODE', []);
assert.ok(exploded.drawingEntities!.every((e) => !e.region));
const joined = executeCadExtended(
  exploded,
  exploded.drawingEntities!.map((e) => e.id),
  'JOIN',
  [],
);
near(joined.drawingEntities![0].region!.area, 50);

// Open paths have no region, regardless of stale/imported area metadata.
const open = cadCreate(empty, 'LINE', shapes[0][0]);
assert.equal(open.drawingEntities![0].region, undefined);
const stale = {
  ...square,
  drawingEntities: [
    { ...square.drawingEntities![0], region: { fill: 'solid' as const, area: 999 } },
  ],
};
near(validateAndImportJSON(exportJSON(stale)).project!.drawingEntities![0].region!.area, 50);
const invalid = [
  { x: 0, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 3 },
  { x: 4, y: 0 },
];
for (const name of ['LINE', 'PLINE'])
  assert.throws(() => cadCreate(empty, name, invalid, true), /cross/);
const bad = { ...square.drawingEntities![0], points: invalid };
assert.equal(cadRegion(bad), null);
assert.equal(
  synchronizeCadRegions({ ...empty, drawingEntities: [bad] }).drawingEntities![0].region,
  undefined,
);
const invalidDXF = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n70\n1\n90\n4\n${invalid.map((p) => `10\n${p.x}\n20\n${p.y}\n`).join('')}0\nENDSEC\n0\nEOF\n`;
assert.equal(
  importDXF(invalidDXF).success,
  false,
  'invalid imported loops must not become filled sections',
);
const large = cadCreate(
  empty,
  'PLINE',
  shapes[0][0].map((p) => ({ x: p.x + 1e9, y: p.y - 1e9 })),
  true,
);
near(large.drawingEntities![0].region!.area, 50);
const collinear = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 0, y: 5 },
];
near(
  triangulateCadRegion(collinear).reduce((sum, t) => sum + polygonRegionArea(t), 0),
  50,
);

// Existing Combine/Uncombine stores source provenance, not a duplicate drawing.
const two = cadCreate(
  square,
  'LINE',
  shapes[0][0].map((p) => ({ x: p.x + 10, y: p.y })),
  true,
);
const ids = two.drawingEntities!.map((e) => e.id);
const prepared = prepareCadRegionCombine(two, ids);
assert.equal(prepared.drawingEntities!.length, 0);
assert.deepEqual(
  prepared.components.map((c) => c.id),
  ids,
);
const combined = combineComponents(prepared.components, ids, 'filled-group');
assert.ok(combined.ok, !combined.ok ? combined.error : '');
const groupedStretch = stretchCad({ ...prepared, components: combined.components }, [
  { x: -1, y: 4 },
  { x: 21, y: 6 },
  { x: 0, y: 0 },
  { x: 0, y: 5 },
]);
const ungrouped = uncombineComponent(groupedStretch.components, 'filled-group');
assert.ok(ungrouped.ok);
const restored = restoreCadRegions({ ...groupedStretch, components: ungrouped.components });
assert.equal(restored.components.length, 0);
assert.deepEqual(
  restored.drawingEntities!.map((e) => e.id),
  ids,
);
assert.ok(restored.drawingEntities!.every((e) => e.region?.area === 100 && e.closed));
const edited = stretchCad(restored, [
  { x: 19, y: -1 },
  { x: 21, y: 11 },
  { x: 0, y: 0 },
  { x: 5, y: 0 },
]);
near(edited.drawingEntities!.find((e) => e.id === ids[1])!.region!.area, 150);
const rePrepared = prepareCadRegionCombine(edited, ids);
const regroup = combineComponents(rePrepared.components, ids, 'again');
assert.ok(regroup.ok);
near(computeSectionProperties(regroup.components).props.area, 250);

// Compound sections export their true outer/void rings, not self-touching bridges.
const walls = [
  [-4, -4, -3, 4],
  [3, -4, 4, 4],
  [-3, 3, 3, 4],
  [-3, -4, 3, -3],
].map(
  ([x0, y0, x1, y1]) =>
    cadCreate(empty, 'RECTANGLE', [
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ]).components[0],
);
const box = combineComponents(
  walls,
  walls.map((c) => c.id),
  'box',
);
assert.ok(box.ok);
const boxProject = { ...empty, components: box.components };
const boxImport = importDXF(
  exportDXF(boxProject, computeSectionProperties(box.components).props),
);
assert.ok(boxImport.success, boxImport.error);
near(computeSectionProperties(boxImport.project!.components).props.area, 28);
// Legacy files with keyhole bridges still represent valid void-bearing material.
const legacyPoints =
  computeSectionProperties(box.components).props.area > 0
    ? box.components[0].geometry.points!.map((p) => ({
        x: p.x + box.components[0].position.x,
        y: p.y + box.components[0].position.y,
      }))
    : [];
const legacyDXF = `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n70\n1\n90\n${legacyPoints.length}\n${legacyPoints.map((p) => `10\n${p.x}\n20\n${p.y}\n`).join('')}0\nENDSEC\n0\nEOF\n`;
const legacyImport = importDXF(legacyDXF);
assert.ok(legacyImport.success, legacyImport.error);
near(computeSectionProperties(legacyImport.project!.components).props.area, 28);
for (const count of [8, 16, 32]) {
  const polygon = Array.from({ length: count }, (_, i) => ({
    x: (i % 2 ? 3 : 10) * Math.cos((i * 2 * Math.PI) / count),
    y: (i % 2 ? 3 : 10) * Math.sin((i * 2 * Math.PI) / count),
  }));
  near(
    triangulateCadRegion(polygon).reduce((sum, t) => sum + polygonRegionArea(t), 0),
    polygonRegionArea(polygon),
  );
}

for (const name of ['MOVE', 'COPY', 'ROTATE', 'MIRROR', 'SCALE'] as const) {
  const values =
    name === 'ROTATE'
      ? [{ x: 0, y: 0 }, 30]
      : name === 'SCALE'
        ? [{ x: 0, y: 0 }, 2]
        : [
            { x: 0, y: 0 },
            { x: 0, y: 20 },
          ];
  const transformed = transformCadSelection(groupedStretch, ['filled-group'], name, values);
  const parent = transformed.components.at(-1)!;
  const outcome = uncombineComponent(transformed.components, parent.id);
  assert.ok(outcome.ok);
  const restoredRegions = restoreCadRegions({ ...transformed, components: outcome.components });
  assert.equal(restoredRegions.drawingEntities!.length, 2);
  restoredRegions.drawingEntities!.forEach((e) =>
    near(e.region!.area, name === 'SCALE' ? 400 : 100),
  );
}

console.log(
  'Filled CAD region checks passed: both windings, simple/concave polygons, area updates, editing, JOIN, invalid loops, JSON, R12 SOLID/DXF and combine/stretch/uncombine/regroup.',
);
