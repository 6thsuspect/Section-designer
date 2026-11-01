import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import type { StoreState } from '../src/store/useStore';
import type { CadApi } from '../src/components/CadCommands';
import type { SectionProject } from '../src/engine/types';
import { cadSectionBoundary } from '../src/engine/cad';
import { sameComponentMaterial } from '../src/engine/combine';

async function main() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  Object.defineProperties(globalThis, {
    window: { value: dom.window, configurable: true },
    document: { value: dom.window.document, configurable: true },
    navigator: { value: dom.window.navigator, configurable: true },
    HTMLElement: { value: dom.window.HTMLElement },
    localStorage: { value: dom.window.localStorage },
    IS_REACT_ACT_ENVIRONMENT: { value: true, writable: true },
  });
  const { createRoot } = await import('react-dom/client');
  const { useStore } = await import('../src/store/useStore');
  const { useCad } = await import('../src/components/CadCommands');
  let latest: { store: StoreState; cad: CadApi };
  function Harness() {
    const store = useStore();
    const [view, setView] = React.useState({ x: -400, y: -400, w: 800, h: 800 });
    const [grid, setGrid] = React.useState(false);
    const [osnap, setOsnap] = React.useState(false);
    const cad = useCad({
      enabled: true,
      store,
      view,
      setView,
      grid,
      setGrid,
      osnap,
      setOsnap,
      save: () => {},
      open: () => {},
    });
    latest = { store, cad };
    return null;
  }
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(<Harness />));
  const empty: SectionProject = {
    ...latest!.store.project,
    components: [],
    drawingEntities: [],
    alignCGToOrigin: false,
  };
  const plate = (id: string, x0: number, y0: number, x1: number, y1: number) => ({
    ...cadSectionBoundary(empty, [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]).components[0],
    id,
    name: id,
  });
  const components = [
    plate('top', -50, 80, 50, 90),
    plate('web', -5, 0, 5, 80),
    plate('bottom', -40, -10, 40, 0),
  ];
  await act(async () => latest!.store.setProject({ ...empty, components }));
  await act(async () =>
    assert.equal(latest!.store.combineShapes(['top', 'web', 'bottom']), null),
  );
  const before = structuredClone(latest!.store.project);
  const groupId = before.components[0].id;
  const submit = async (text: string) => {
    await act(async () => latest!.cad.submit(text));
  };
  const step = async (name: 'undo' | 'redo') => {
    await act(async () => {
      latest!.store[name]();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  };
  for (const text of ['S', '-60,79', '60,100', '0,0']) await submit(text);
  await act(async () => latest!.cad.setHover({ x: 0, y: 20 }));
  assert.ok(latest!.cad.stretchPreview, latest!.cad.stretchError);
  assert.deepEqual(latest!.store.project, before, 'group/source preview is non-destructive');
  assert.equal(
    latest!.cad.stretchOutline.length,
    0,
    'confirmed selection boundary stays hidden',
  );
  assert.ok(
    latest!.cad.stretchVertices.some((p) => p.x === -5 && p.y === 80),
    'internal web vertices are highlighted',
  );
  await submit('@0,20');
  const after = structuredClone(latest!.store.project);
  assert.notDeepEqual(after.components[0].combinedFrom, before.components[0].combinedFrom);
  assert.deepEqual(
    after.components[0].combinedFrom!.map((c) => c.id),
    ['top', 'web', 'bottom'],
  );
  await step('undo');
  assert.deepEqual(
    latest!.store.project.components,
    before.components,
    'Undo restores group and every source coordinate together',
  );
  await step('redo');
  assert.deepEqual(
    latest!.store.project.components,
    after.components,
    'Redo restores the entire modified hierarchy',
  );
  await act(async () => assert.equal(latest!.store.uncombineShape(groupId), null));
  assert.deepEqual(latest!.store.project.components, after.components[0].combinedFrom);
  assert.deepEqual(latest!.store.selectedIds, ['top', 'web', 'bottom']);
  await step('undo');
  assert.deepEqual(
    latest!.store.project.components,
    after.components,
    'Uncombine itself is reversible',
  );
  await step('redo');
  await act(async () => latest!.store.selectComponent('top'));
  for (const text of ['MOVE', '0,0', '10,0']) await submit(text);
  const individuallyEdited = structuredClone(latest!.store.project.components);
  assert.equal(
    individuallyEdited.find((c) => c.id === 'top')!.position.x,
    after.components[0].combinedFrom!.find((c) => c.id === 'top')!.position.x + 10,
  );
  await act(async () =>
    assert.equal(latest!.store.combineShapes(['top', 'web', 'bottom']), null),
  );
  const regroup = structuredClone(latest!.store.project.components[0]);
  assert.deepEqual(
    regroup.combinedFrom,
    individuallyEdited,
    'regroup uses latest independent plate edits',
  );
  await act(async () => assert.equal(latest!.store.uncombineShape(regroup.id), null));
  latest!.store.project.components.forEach((c, i) =>
    assert.ok(sameComponentMaterial(c, individuallyEdited[i])),
  );
  // Cancel a subsequent grouped stretch without mutating either representation.
  await act(async () =>
    assert.equal(latest!.store.combineShapes(['top', 'web', 'bottom']), null),
  );
  const beforeCancel = structuredClone(latest!.store.project.components);
  for (const text of ['S', '-70,79', '80,130', '0,0']) await submit(text);
  await act(async () => latest!.cad.setHover({ x: 5, y: 5 }));
  await act(async () => latest!.cad.escape());
  assert.deepEqual(latest!.store.project.components, beforeCancel);
  await act(async () => root.unmount());
  console.log(
    'Grouped STRETCH controller/store checks passed: preview, selection graphics, atomic Undo/Redo, uncombine/edit/regroup and cancellation.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
